import { v, ConvexError } from "convex/values";
import { AgentMail } from "@agentmail/convex";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./lib/requireUser";
import { rateLimiter } from "./lib/rateLimits";
import { extractUrls, isGifUrl } from "./lib/urls";
import { extractEmail, sanitizeEmailReply } from "./lib/sanitizeEmailReply";
import { newReplyToken, parseSubjectTag, subjectTag, tokensMatch } from "./lib/replyToken";
import { enqueueLinks } from "./links";

// The app's inbox. Digests go out from it; replies come back to it.
export const agentmail: AgentMail = new AgentMail(components.agentmail, {
  onMessageReceived: internal.email.onMessageReceived,
});

function inboxId(): string {
  const id = process.env.AGENTMAIL_INBOX_ID;
  if (!id) throw new Error("AGENTMAIL_INBOX_ID is not set");
  return id;
}

// ---- subscriptions ----------------------------------------------------------

export const mySubscriptions = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx).catch(() => null);
    if (!user) return [];
    const subs = await ctx.db.query("digest_subscriptions").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
    const out = [];
    for (const s of subs) {
      const c = await ctx.db.get(s.channelId);
      if (c) out.push({ id: s._id, slug: c.slug, name: c.name, cadence: s.cadence, lastSentAt: s.lastSentAt ?? null });
    }
    return { email: user.email ?? null, subscriptions: out };
  },
});

export const subscribe = mutation({
  args: { slug: v.string(), cadence: v.union(v.literal("daily"), v.literal("weekly")) },
  handler: async (ctx, { slug, cadence }) => {
    const user = await requireUser(ctx);
    if (!user.email) throw new ConvexError({ code: "no_email", message: "Sign in with an email address to get digests." });
    const channel = await ctx.db.query("channels").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!channel) throw new ConvexError({ code: "not_found", message: `No channel "${slug}".` });
    const existing = (await ctx.db.query("digest_subscriptions").withIndex("by_user", (q) => q.eq("userId", user._id)).collect())
      .find((s) => s.channelId === channel._id);
    if (existing) {
      await ctx.db.patch(existing._id, { cadence, replyToken: existing.replyToken ?? newReplyToken() });
      return { updated: true, channel: channel.name, cadence };
    }
    await ctx.db.insert("digest_subscriptions", {
      userId: user._id,
      channelId: channel._id,
      cadence,
      replyToken: newReplyToken(),
    });
    return { updated: false, channel: channel.name, cadence };
  },
});

export const unsubscribe = mutation({
  args: { subscriptionId: v.id("digest_subscriptions") },
  handler: async (ctx, { subscriptionId }) => {
    const user = await requireUser(ctx);
    const sub = await ctx.db.get(subscriptionId);
    if (sub && sub.userId === user._id) await ctx.db.delete(subscriptionId);
  },
});

// ---- outbound digests (cron) ------------------------------------------------

async function buildDigest(ctx: MutationCtx, user: Doc<"users">, channel: Doc<"channels">, since: number) {
  const rows = await ctx.db
    .query("messages")
    .withIndex("by_channel_time", (q) => q.eq("channelId", channel._id).gt("createdAt", since))
    .order("desc")
    .take(40);
  const msgs = rows.filter((m) => !m.hiddenAt).reverse();
  if (msgs.length === 0) return null;
  // Standings come from the Discord bot's leaderboard, mirrored here.
  const top = await ctx.db.query("leaderboard_mirror").withIndex("by_points").order("desc").take(3);
  const topLines = top.map((t, i) => `${i + 1}. ${t.name} — ${t.points} pts`);
  const body = [
    `#${channel.name} — ${msgs.length} new message${msgs.length === 1 ? "" : "s"}`,
    "",
    ...msgs.map((m) => `${m.authorDisplay.name}: ${m.content.replace(/\s+/g, " ").slice(0, 300)}`),
    "",
    topLines.length ? `This week's top members:\n${topLines.join("\n")}` : "",
    "",
    `Reply to this email to post in #${channel.name} as ${user.displayName ?? user.handle ?? "you"}. Your reply appears in Discord and on the site.`,
    `Leave the subject line alone — it carries your private reply key. Anyone who can read this email can post as you, so don't forward it.`,
    `Manage digests: ${process.env.SITE_URL ?? ""}/settings`,
  ].join("\n");
  return { count: msgs.length, body };
}

export const sendDigests = internalMutation({
  args: { cadence: v.union(v.literal("daily"), v.literal("weekly")) },
  handler: async (ctx, { cadence }) => {
    const subs = (await ctx.db.query("digest_subscriptions").collect()).filter((s) => s.cadence === cadence);
    let sent = 0, skipped = 0;
    const now = Date.now();
    for (const sub of subs) {
      const user = await ctx.db.get(sub.userId);
      const channel = await ctx.db.get(sub.channelId);
      if (!user?.email || !channel || user.role === "banned") { skipped++; continue; }
      const since = sub.lastSentAt ?? now - (cadence === "daily" ? 1 : 7) * 86_400_000;
      const digest = await buildDigest(ctx, user, channel, since);
      if (!digest) { skipped++; continue; }
      // Older subscriptions predate reply keys; mint one on the way out so the
      // first digest a member receives after this ships is already replyable.
      const replyToken = sub.replyToken ?? newReplyToken();
      if (!sub.replyToken) await ctx.db.patch(sub._id, { replyToken });
      await agentmail.sendMessage(ctx, inboxId(), {
        to: user.email,
        subject: `${subjectTag(channel.slug, replyToken)} ${digest.count} new in #${channel.name} — techfriend community`,
        text: digest.body,
        labels: ["digest", channel.slug],
      });
      await ctx.db.patch(sub._id, { lastSentAt: now });
      sent++;
    }
    return { sent, skipped };
  },
});

// ---- inbound replies --------------------------------------------------------

export const onMessageReceived = internalMutation({
  args: { message: v.any(), thread: v.any(), eventId: v.string() },
  handler: async (ctx, { message }) => {
    const fromEmail = extractEmail(message.from);
    const subject: string = String(message.subject ?? "");
    const tag = parseSubjectTag(subject);
    if (!tag) {
      console.log("email ignored: no reply key in subject", { subject: subject.slice(0, 120) });
      return { ok: false, reason: "unroutable" };
    }

    // Idempotency before anything metered: AgentMail retries webhooks, and a
    // redelivery must not spend the sender's quota on a message already posted.
    const messageId: string = String(message.message_id ?? message.id ?? "");
    const dedupe = `mail:${messageId || `${fromEmail ?? "unknown"}:${message.timestamp ?? Date.now()}`}`;
    const already = await ctx.db.query("processed_emails").withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", dedupe)).unique();
    if (already) return { ok: false, reason: "duplicate" };

    // The reply key decides who is speaking — never the From: header, which
    // arrives unverified (see lib/replyToken). Looking the subscription up by
    // its key also subsumes the old "is this member subscribed here" check:
    // the key only exists because a subscription does.
    const sub = await ctx.db
      .query("digest_subscriptions")
      .withIndex("by_replyToken", (q) => q.eq("replyToken", tag.token))
      .unique();
    if (!sub?.replyToken || !tokensMatch(sub.replyToken, tag.token)) {
      console.warn("email rejected: unknown reply key", { subject: subject.slice(0, 120) });
      return { ok: false, reason: "bad key" };
    }
    const user = await ctx.db.get(sub.userId);
    const channel = await ctx.db.get(sub.channelId);
    if (!user || !channel) return { ok: false, reason: "stale subscription" };
    // The key names one channel. A tampered slug must not redirect the post.
    if (channel.slug !== tag.slug) return { ok: false, reason: "channel mismatch" };
    if (user.role === "banned") return { ok: false, reason: "banned" };
    // Holding the key already proves access to the mailbox the digest went to.
    // Requiring From: to still be that address stops a key that leaked out of
    // an inbox — a forward, a shared screen — from being replayed elsewhere.
    // A second factor on top of the key, never a substitute for it.
    if (!fromEmail || fromEmail !== (user.email ?? "").toLowerCase()) {
      console.warn("email rejected: sender is not the subscriber", { userId: sub.userId });
      return { ok: false, reason: "sender mismatch" };
    }

    const text = sanitizeEmailReply(String(message.text ?? ""));
    if (!text) return { ok: false, reason: "empty" };

    const urls = extractUrls(text);
    // The bot polices GIFs per member (1 per 5 min, or points to skip the
    // wait), but it only ever sees guild members — a webhook post is invisible
    // to it. Charging the same limit here keeps the route from changing the
    // rules; without it, email is simply the cheap way to flood the channel.
    if (urls.some(isGifUrl)) {
      const gif = await rateLimiter.limit(ctx, "emailGif", { key: sub.userId });
      if (!gif.ok) {
        console.log("email rejected: gif rate limit", { userId: sub.userId });
        return { ok: false, reason: "gif rate limited" };
      }
    }
    const { ok } = await rateLimiter.limit(ctx, "emailReply", { key: user._id });
    if (!ok) return { ok: false, reason: "rate limited" };

    const now = Date.now();
    await ctx.db.insert("processed_emails", { dedupeKey: dedupe, createdAt: now });
    const msgId = await ctx.db.insert("messages", {
      channelId: channel._id,
      authorUserId: user._id,
      authorDisplay: { name: user.displayName ?? user.handle ?? "member", avatarUrl: user.avatarUrl ?? user.image },
      content: text,
      source: "email",
      urls,
      status: "pending",
      agentAssisted: false,
      createdAt: now,
    });
    await ctx.db.patch(channel._id, { messageCount: channel.messageCount + 1, lastMessageAt: now });
    await ctx.scheduler.runAfter(0, internal.discordOut.post, { messageId: msgId, attempt: 0 });
    if (urls.length) await enqueueLinks(ctx, { urls, messageId: msgId, channelId: channel._id, userId: user._id, at: now });

    const threadId = String(message.thread_id ?? "");
    if (threadId) {
      const t = await ctx.db.query("digest_threads").withIndex("by_thread", (q) => q.eq("agentmailThreadId", threadId)).unique();
      if (!t) await ctx.db.insert("digest_threads", { userId: user._id, channelId: channel._id, agentmailThreadId: threadId, lastDigestAt: now });
    }
    return { ok: true, messageId: msgId as Id<"messages"> };
  },
});
