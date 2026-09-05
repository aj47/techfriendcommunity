import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./lib/requireUser";
import { rateLimiter } from "./lib/rateLimits";
import { extractUrls } from "./lib/urls";
import { ensureShadowUser, linkDiscordByCode } from "./users";
import { syncChannels, type ChannelSyncInput } from "./channels";
import { syncMirror } from "./points";
import { syncSummaries } from "./summaries";
import { enqueueLinks } from "./links";

const MAX_LEN = 2000;

// Both query and mutation contexts reach these helpers; all they need is a db
// they can read through.
type QueryLike = { db: any };

// Discord writes a mention as the raw snowflake — "<@123…>", "<#123…>" — and
// that is what the mirror stores. Names are resolved here rather than on the
// client because only the server can index into users and channels, and rather
// than at ingest because a display name changes after a message is written.
//
// Anyone who has posted in a mirrored channel has a row (ingest creates shadow
// users), so most mentions resolve; the rest are drawn as a neutral chip. The
// id comes back as a map key, but the caller already has it — it is sitting in
// the message text it just received — so this exposes nothing new.
const MENTION_RE = /<@!?(\d+)>|<#(\d+)>/g;

async function mentionsIn(ctx: QueryLike, content: string): Promise<Record<string, string>> {
  const users = new Set<string>();
  const channels = new Set<string>();
  for (const m of content.matchAll(MENTION_RE)) {
    if (m[1]) users.add(m[1]);
    else if (m[2]) channels.add(m[2]);
  }
  const out: Record<string, string> = {};
  for (const id of users) {
    const u = await ctx.db
      .query("users")
      .withIndex("by_discordUserId", (q: any) => q.eq("discordUserId", id))
      .unique();
    const name = u?.displayName ?? u?.handle ?? u?.name;
    if (name) out[id] = name;
  }
  // Snowflakes are unique across kinds, so users and channels share one map.
  for (const id of channels) {
    const c = await ctx.db
      .query("channels")
      .withIndex("by_discordChannelId", (q: any) => q.eq("discordChannelId", id))
      .unique();
    if (c) out[id] = c.name;
  }
  return out;
}

async function view(ctx: QueryLike, m: Doc<"messages">) {
  let replyTo: { id: Id<"messages">; author: string; snippet: string } | null = null;
  if (m.replyToMessageId) {
    const target = await ctx.db.get(m.replyToMessageId);
    if (target) replyTo = { id: target._id, author: target.authorDisplay.name, snippet: target.content.slice(0, 140) };
  }
  let thread: { slug: string; name: string; messageCount: number } | null = null;
  if (m.threadChannelId) {
    const t = await ctx.db.get(m.threadChannelId);
    if (t) thread = { slug: t.slug, name: t.name, messageCount: t.messageCount };
  }
  return {
    id: m._id,
    channelId: m.channelId,
    author: m.authorDisplay,
    authorUserId: m.authorUserId ?? null,
    content: m.content,
    source: m.source,
    status: m.status,
    createdAt: m.createdAt,
    editedAt: m.editedAt ?? null,
    urls: m.urls,
    // The reply preview is rendered from the same map, so resolve across both.
    mentions: await mentionsIn(ctx, replyTo ? `${m.content} ${replyTo.snippet}` : m.content),
    replyTo,
    thread,
  };
}

async function viewAll(ctx: QueryLike, rows: Doc<"messages">[]) {
  const out = [];
  for (const m of rows) out.push(await view(ctx, m));
  return out;
}

export const list = query({
  args: { channelId: v.id("channels"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { channelId, paginationOpts }) => {
    const page = await ctx.db
      .query("messages")
      .withIndex("by_channel_time", (q) => q.eq("channelId", channelId))
      .order("desc")
      .filter((q) => q.eq(q.field("hiddenAt"), undefined))
      .paginate(paginationOpts);
    return { ...page, page: await viewAll(ctx, page.page) };
  },
});

export const recent = query({
  args: { slug: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { slug, limit }) => {
    const channel = await ctx.db.query("channels").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!channel) return null;
    const n = Math.min(Math.max(limit ?? 30, 1), 50);
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_channel_time", (q) => q.eq("channelId", channel._id))
      .order("desc")
      .filter((q) => q.eq(q.field("hiddenAt"), undefined))
      .take(n);
    const kept = rows.reverse();
    return { channel: { slug: channel.slug, name: channel.name }, messages: await viewAll(ctx, kept) };
  },
});

// Newest messages across every mirrored channel — the home page feed.
export const latestAcross = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const n = Math.min(Math.max(limit ?? 25, 1), 50);
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_createdAt")
      .order("desc")
      .filter((q) => q.eq(q.field("hiddenAt"), undefined))
      .take(n);
    const channels = new Map<string, { slug: string; name: string } | null>();
    const out = [];
    for (const m of rows) {
      if (!channels.has(m.channelId)) {
        const c = await ctx.db.get(m.channelId);
        channels.set(m.channelId, c ? { slug: c.slug, name: c.name } : null);
      }
      out.push({ ...(await view(ctx, m)), channel: channels.get(m.channelId) ?? null });
    }
    return out;
  },
});

export const search = query({
  args: { query: v.string(), channelId: v.optional(v.id("channels")), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const q = args.query.trim();
    if (!q) return [];
    const rows = await ctx.db
      .query("messages")
      .withSearchIndex("search_content", (s) => {
        const base = s.search("content", q);
        return args.channelId ? base.eq("channelId", args.channelId) : base;
      })
      .filter((q) => q.eq(q.field("hiddenAt"), undefined))
      .take(Math.min(args.limit ?? 20, 50));
    const out = [];
    for (const m of rows) {
      const c = await ctx.db.get(m.channelId);
      out.push({ ...(await view(ctx, m)), channel: c ? { slug: c.slug, name: c.name } : null });
    }
    return out;
  },
});

async function bumpChannel(ctx: MutationCtx, channelId: Id<"channels">, at: number) {
  const c = await ctx.db.get(channelId);
  if (!c) return;
  await ctx.db.patch(channelId, {
    messageCount: c.messageCount + 1,
    lastMessageAt: Math.max(c.lastMessageAt ?? 0, at),
  });
}

// Post from the web.
export const post = mutation({
  args: {
    slug: v.string(),
    content: v.string(),
    replyToMessageId: v.optional(v.id("messages")),
  },
  handler: async (ctx, { slug, content, replyToMessageId }) => {
    const user = await requireUser(ctx);
    if (!user.handle) throw new ConvexError({ code: "profile", message: "Pick a handle in Settings before posting." });
    const channel = await ctx.db.query("channels").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!channel) throw new ConvexError({ code: "not_found", message: `No channel "${slug}".` });
    const text = content.trim();
    if (!text) throw new ConvexError({ code: "invalid", message: "Message is empty." });
    if (text.length > MAX_LEN) throw new ConvexError({ code: "invalid", message: `Message is over ${MAX_LEN} characters.` });
    await rateLimiter.limit(ctx, "postMessage", { key: user._id, throws: true });

    // Silently drop a stale/foreign reply target rather than fail the post —
    // the message is still meaningful on its own.
    let replyTo: Doc<"messages"> | null = null;
    if (replyToMessageId) {
      const target = await ctx.db.get(replyToMessageId);
      if (target && target.channelId === channel._id) replyTo = target;
    }

    const now = Date.now();
    const urls = extractUrls(text);
    const messageId = await ctx.db.insert("messages", {
      channelId: channel._id,
      authorUserId: user._id,
      authorDisplay: { name: user.displayName ?? user.handle, avatarUrl: user.avatarUrl ?? user.image },
      content: text,
      source: "web",
      urls,
      status: "pending",
      replyToMessageId: replyTo?._id,
      createdAt: now,
    });
    await bumpChannel(ctx, channel._id, now);
    await ctx.scheduler.runAfter(0, internal.discordOut.post, { messageId, attempt: 0 });
    if (urls.length) await enqueueLinks(ctx, { urls, messageId, channelId: channel._id, userId: user._id, at: now });
    return { messageId };
  },
});

export const getForDelivery = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get(messageId);
    if (!message) return null;
    const channel = await ctx.db.get(message.channelId);
    const secretChannelId = channel?.isThread && channel.parentChannelId ? channel.parentChannelId : message.channelId;
    const secret = await ctx.db.query("channelSecrets").withIndex("by_channelId", (q) => q.eq("channelId", secretChannelId)).unique();
    let replyTo: { author: string; snippet: string } | null = null;
    if (message.replyToMessageId) {
      const target = await ctx.db.get(message.replyToMessageId);
      if (target) replyTo = { author: target.authorDisplay.name, snippet: target.content.slice(0, 100) };
    }
    return {
      message,
      webhookUrl: secret?.webhookUrl ?? null,
      threadDiscordId: channel?.isThread ? channel.discordChannelId : null,
      replyTo,
    };
  },
});

export const markSynced = internalMutation({
  args: { messageId: v.id("messages"), discordMessageId: v.string() },
  handler: async (ctx, { messageId, discordMessageId }) => {
    await ctx.db.patch(messageId, { status: "synced", discordMessageId });
  },
});

export const markFailed = internalMutation({
  args: { messageId: v.id("messages"), reason: v.string() },
  handler: async (ctx, { messageId }) => {
    await ctx.db.patch(messageId, { status: "failed" });
  },
});

// ---- Bridge ingest -------------------------------------------------------
// Event contract (sent by bridge.py in techfren-discord-bot):
//   message.create {id, channelId, authorId, authorName, authorAvatar?, isBot, webhookId?, content, createdAt, replyToId?, attachmentUrls?}
//   message.edit   {id, content, editedAt}
//   message.delete {id}
//   reaction.add   {messageId, emoji, userId}
//   channel.sync   {channels: [{id, name, topic?, position, webhookUrl?, parentId?, isThread?}]}
//   link.code      {code, discordUserId, name, avatar?}
//   leaderboard.sync {rows: [{discordUserId, name, points, lifetimePoints?}], complete?: boolean}
//   summary.sync   {rows: [{discordChannelId, channelName, date, summaryText, messageCount, activeUsers, createdAt}]}

type IngestEvent = Record<string, any> & { type: string };

export const ingest = internalMutation({
  args: { events: v.array(v.any()) },
  handler: async (ctx, { events }) => {
    const counts: Record<string, number> = {};
    const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
    for (const ev of events as IngestEvent[]) {
      try {
        switch (ev.type) {
          case "channel.sync": {
            await syncChannels(ctx, ev.channels as ChannelSyncInput[]);
            bump("channel.sync");
            break;
          }
          case "message.create": {
            const existing = await ctx.db.query("messages").withIndex("by_discordMessageId", (q) => q.eq("discordMessageId", ev.id)).unique();
            if (existing) {
              // Echo of a message we posted via webhook (or a replay).
              if (existing.status !== "synced") await ctx.db.patch(existing._id, { status: "synced" });
              bump("echo");
              break;
            }
            const channel = await ctx.db.query("channels").withIndex("by_discordChannelId", (q) => q.eq("discordChannelId", ev.channelId)).unique();
            if (!channel) { bump("unknown_channel"); break; }
            const content: string = [ev.content ?? "", ...(ev.attachmentUrls ?? [])].filter(Boolean).join("\n");
            if (!content) { bump("empty"); break; }
            const at: number = ev.createdAt ?? Date.now();
            // Webhook posts from other integrations get a synthetic author id.
            const discordUserId = ev.webhookId ? `webhook:${ev.webhookId}` : String(ev.authorId);
            const userId = await ensureShadowUser(ctx, { discordUserId, name: ev.authorName ?? "member", avatarUrl: ev.authorAvatar ?? undefined });
            const urls = extractUrls(content);
            let replyToMessageId;
            if (ev.replyToId) {
              const target = await ctx.db.query("messages").withIndex("by_discordMessageId", (q) => q.eq("discordMessageId", String(ev.replyToId))).unique();
              replyToMessageId = target?._id;
            }
            const messageId = await ctx.db.insert("messages", {
              channelId: channel._id,
              authorUserId: userId,
              authorDisplay: { name: ev.authorName ?? "member", avatarUrl: ev.authorAvatar ?? undefined },
              content,
              source: "discord",
              discordMessageId: String(ev.id),
              replyToDiscordMessageId: ev.replyToId ? String(ev.replyToId) : undefined,
              replyToMessageId,
              urls,
              status: "synced",
              createdAt: at,
            });
            await bumpChannel(ctx, channel._id, at);
            if (!ev.isBot && !ev.webhookId && urls.length && !ev.skipLinks) {
              await enqueueLinks(ctx, { urls, messageId, channelId: channel._id, userId, at });
            }
            bump("message.create");
            break;
          }
          case "message.edit": {
            const m = await ctx.db.query("messages").withIndex("by_discordMessageId", (q) => q.eq("discordMessageId", String(ev.id))).unique();
            if (!m) { bump("edit_unknown"); break; }
            const content = String(ev.content ?? m.content);
            await ctx.db.patch(m._id, { content, editedAt: ev.editedAt ?? Date.now(), urls: extractUrls(content) });
            bump("message.edit");
            break;
          }
          case "message.delete": {
            const m = await ctx.db.query("messages").withIndex("by_discordMessageId", (q) => q.eq("discordMessageId", String(ev.id))).unique();
            if (m && !m.hiddenAt) await ctx.db.patch(m._id, { hiddenAt: Date.now() });
            bump("message.delete");
            break;
          }
          case "reaction.add": {
            // Reactions are scored by the Discord bot, not here. Kept as a
            // no-op so the bridge's event stream stays stable.
            bump("reaction.add");
            break;
          }
          case "summary.sync": {
            const r = await syncSummaries(ctx, ev.rows ?? []);
            bump("summary.sync");
            if (r.skipped) bump("summary.skipped");
            break;
          }
          case "leaderboard.sync": {
            await syncMirror(ctx, ev.rows ?? [], ev.complete);
            bump("leaderboard.sync");
            break;
          }
          case "link.code": {
            const r = await linkDiscordByCode(ctx, { code: String(ev.code), discordUserId: String(ev.discordUserId), name: ev.name ?? "member", avatarUrl: ev.avatar ?? undefined });
            bump(r.ok ? "link.ok" : `link.fail:${r.reason}`);
            break;
          }
          default:
            bump(`unknown:${ev.type}`);
        }
      } catch (e) {
        bump(`error:${ev.type}`);
        console.error("ingest event failed", ev.type, e);
      }
    }
    return counts;
  },
});
