import { v, ConvexError } from "convex/values";
import { AgentMail } from "@agentmail/convex";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./lib/requireUser";
import { rateLimiter } from "./lib/rateLimits";
import { extractUrls } from "./lib/urls";
import { extractEmail, sanitizeEmailReply } from "./lib/sanitizeEmailReply";
import { awardDailyActive, awardPoints } from "./points";
import { weekKey } from "./lib/weekKey";
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

const SUBJECT_RE = /\[#([a-z0-9-]+)\]/i;

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
      await ctx.db.patch(existing._id, { cadence });
      return { updated: true, channel: channel.name, cadence };
    }
    await ctx.db.insert("digest_subscriptions", { userId: user._id, channelId: channel._id, cadence });
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
  const wk = weekKey(Date.now());
  const top = await ctx.db.query("leaderboard_weekly").withIndex("by_week_points", (q) => q.eq("weekKey", wk)).order("desc").take(3);
  const topLines: string[] = [];
  for (const [i, t] of top.entries()) {
    const u = await ctx.db.get(t.userId);
    if (u) topLines.push(`${i + 1}. ${u.handle ? "@" + u.handle : u.displayName ?? "member"} — ${t.points} pts`);
  }
  const body = [
    `#${channel.name} — ${msgs.length} new message${msgs.length === 1 ? "" : "s"}`,
    "",
    ...msgs.map((m) => `${m.authorDisplay.name}: ${m.content.replace(/\s+/g, " ").slice(0, 300)}`),
    "",
    topLines.length ? `This week's top members:\n${topLines.join("\n")}` : "",
    "",
    `Reply to this email to post in #${channel.name} as ${user.displayName ?? user.handle ?? "you"}. Your reply appears in Discord and on the site.`,
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
      await agentmail.sendMessage(ctx, inboxId(), {
        to: user.email,
        subject: `[#${channel.slug}] ${digest.count} new in #${channel.name} — techfriend community`,
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
    const slugMatch = subject.match(SUBJECT_RE);
    if (!fromEmail || !slugMatch) {
      console.log("email ignored: no sender/channel", { fromEmail, subject });
      return { ok: false, reason: "unroutable" };
    }
    const user = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", fromEmail)).first();
    if (!user) return { ok: false, reason: "unknown sender" };
    if (user.role === "banned") return { ok: false, reason: "banned" };
    const channel = await ctx.db.query("channels").withIndex("by_slug", (q) => q.eq("slug", slugMatch[1].toLowerCase())).unique();
    if (!channel) return { ok: false, reason: "unknown channel" };
    const subscribed = (await ctx.db.query("digest_subscriptions").withIndex("by_user", (q) => q.eq("userId", user._id)).collect())
      .some((s) => s.channelId === channel._id);
    if (!subscribed) return { ok: false, reason: "not subscribed" };

    const text = sanitizeEmailReply(String(message.text ?? ""));
    if (!text) return { ok: false, reason: "empty" };
    const { ok } = await rateLimiter.limit(ctx, "emailReply", { key: user._id });
    if (!ok) return { ok: false, reason: "rate limited" };

    const messageId: string = String(message.message_id ?? message.id ?? "");
    const dedupe = `mail:${messageId || `${fromEmail}:${message.timestamp ?? Date.now()}`}`;
    const already = await ctx.db.query("points_events").withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", dedupe)).unique();
    if (already) return { ok: false, reason: "duplicate" };

    const now = Date.now();
    const urls = extractUrls(text);
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
    await awardPoints(ctx, { userId: user._id, kind: "email_reply", dedupeKey: dedupe, at: now });
    await awardDailyActive(ctx, user._id, now);
    if (urls.length) await enqueueLinks(ctx, { urls, messageId: msgId, channelId: channel._id, userId: user._id, at: now });

    const threadId = String(message.thread_id ?? "");
    if (threadId) {
      const t = await ctx.db.query("digest_threads").withIndex("by_thread", (q) => q.eq("agentmailThreadId", threadId)).unique();
      if (!t) await ctx.db.insert("digest_threads", { userId: user._id, channelId: channel._id, agentmailThreadId: threadId, lastDigestAt: now });
    }
    return { ok: true, messageId: msgId as Id<"messages"> };
  },
});
