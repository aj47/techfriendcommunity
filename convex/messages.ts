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
import { enqueueLinks } from "./links";

const MAX_LEN = 2000;

function view(m: Doc<"messages">) {
  return {
    id: m._id,
    channelId: m.channelId,
    author: m.authorDisplay,
    authorUserId: m.authorUserId ?? null,
    content: m.content,
    source: m.source,
    status: m.status,
    agentAssisted: m.agentAssisted,
    createdAt: m.createdAt,
    editedAt: m.editedAt ?? null,
    urls: m.urls,
  };
}

export const list = query({
  args: { channelId: v.id("channels"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { channelId, paginationOpts }) => {
    const page = await ctx.db
      .query("messages")
      .withIndex("by_channel_time", (q) => q.eq("channelId", channelId))
      .order("desc")
      .paginate(paginationOpts);
    return { ...page, page: page.page.filter((m) => !m.hiddenAt).map(view) };
  },
});

export const recent = query({
  args: { slug: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { slug, limit }) => {
    const channel = await ctx.db.query("channels").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!channel) return null;
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_channel_time", (q) => q.eq("channelId", channel._id))
      .order("desc")
      .take(Math.min(Math.max(limit ?? 30, 1), 50) + 10);
    return { channel: { slug: channel.slug, name: channel.name }, messages: rows.filter((m) => !m.hiddenAt).slice(0, limit ?? 30).reverse().map(view) };
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
      .take(Math.min(args.limit ?? 20, 50));
    const out = [];
    for (const m of rows) {
      if (m.hiddenAt) continue;
      const c = await ctx.db.get(m.channelId);
      out.push({ ...view(m), channel: c ? { slug: c.slug, name: c.name } : null });
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

// Post from the web (or via a WebMCP-staged draft the human sent).
export const post = mutation({
  args: { slug: v.string(), content: v.string(), agentAssisted: v.optional(v.boolean()) },
  handler: async (ctx, { slug, content, agentAssisted }) => {
    const user = await requireUser(ctx);
    if (!user.handle) throw new ConvexError({ code: "profile", message: "Pick a handle in Settings before posting." });
    const channel = await ctx.db.query("channels").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!channel) throw new ConvexError({ code: "not_found", message: `No channel "${slug}".` });
    const text = content.trim();
    if (!text) throw new ConvexError({ code: "invalid", message: "Message is empty." });
    if (text.length > MAX_LEN) throw new ConvexError({ code: "invalid", message: `Message is over ${MAX_LEN} characters.` });
    await rateLimiter.limit(ctx, "postMessage", { key: user._id, throws: true });

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
      agentAssisted: !!agentAssisted,
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
    const secret = await ctx.db.query("channelSecrets").withIndex("by_channelId", (q) => q.eq("channelId", message.channelId)).unique();
    return { message, webhookUrl: secret?.webhookUrl ?? null };
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
//   channel.sync   {channels: [{id, name, topic?, position, webhookUrl?}]}
//   link.code      {code, discordUserId, name, avatar?}
//   leaderboard.sync {rows: [{discordUserId, name, points}], complete?: boolean}

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
            const messageId = await ctx.db.insert("messages", {
              channelId: channel._id,
              authorUserId: userId,
              authorDisplay: { name: ev.authorName ?? "member", avatarUrl: ev.authorAvatar ?? undefined },
              content,
              source: "discord",
              discordMessageId: String(ev.id),
              replyToDiscordMessageId: ev.replyToId ? String(ev.replyToId) : undefined,
              urls,
              status: "synced",
              agentAssisted: false,
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
