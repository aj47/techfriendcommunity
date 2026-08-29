import { v } from "convex/values";
import { internalMutation, internalQuery, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { slugify } from "./lib/slug";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const channels = (await ctx.db.query("channels").collect()).filter((c) => !c.isThread);
    channels.sort((a, b) => a.position - b.position);
    return channels.map((c) => ({
      id: c._id,
      slug: c.slug,
      name: c.name,
      topic: c.topic ?? null,
      lastMessageAt: c.lastMessageAt ?? null,
      messageCount: c.messageCount,
    }));
  },
});

export const bySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const c = await ctx.db.query("channels").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!c) return null;
    let parent = null;
    if (c.isThread && c.parentChannelId) {
      const p = await ctx.db.get(c.parentChannelId);
      if (p) parent = { slug: p.slug, name: p.name };
    }
    return {
      id: c._id, slug: c.slug, name: c.name, topic: c.topic ?? null, messageCount: c.messageCount,
      isThread: c.isThread ?? false, parent,
    };
  },
});

// Resolves the webhook a message should actually post through: threads have
// no webhook of their own, so this walks to the parent's and returns the
// thread's Discord id for the `?thread_id=` query param.
export const webhookFor = internalQuery({
  args: { channelId: v.id("channels") },
  handler: async (ctx, { channelId }) => {
    const channel = await ctx.db.get(channelId);
    if (!channel) return null;
    const secretChannelId = channel.isThread && channel.parentChannelId ? channel.parentChannelId : channelId;
    const secret = await ctx.db.query("channelSecrets").withIndex("by_channelId", (q) => q.eq("channelId", secretChannelId)).unique();
    if (!secret) return null;
    return { webhookUrl: secret.webhookUrl, threadDiscordId: channel.isThread ? channel.discordChannelId : null };
  },
});

export type ChannelSyncInput = {
  id: string;
  name: string;
  topic?: string | null;
  position: number;
  webhookUrl?: string | null;
  parentId?: string | null;
  isThread?: boolean;
};

// Upsert channel metadata (and webhook secrets) reported by the bridge on
// startup. Threads created from a message share that message's Discord id
// (a Discord API guarantee), so syncing one links it to that message here —
// the message doesn't need its own event to know it grew a thread.
export async function syncChannels(ctx: MutationCtx, channels: ChannelSyncInput[]) {
  let created = 0, updated = 0;
  for (const input of channels) {
    const existing = await ctx.db
      .query("channels")
      .withIndex("by_discordChannelId", (q) => q.eq("discordChannelId", input.id))
      .unique();
    const topic = input.topic ?? undefined;
    const isThread = !!input.isThread;
    let parentChannelId: Id<"channels"> | undefined;
    if (isThread && input.parentId) {
      const parent = await ctx.db
        .query("channels")
        .withIndex("by_discordChannelId", (q) => q.eq("discordChannelId", input.parentId!))
        .unique();
      parentChannelId = parent?._id;
    }
    let channelId: Id<"channels">;
    if (existing) {
      await ctx.db.patch(existing._id, { name: input.name, topic, position: input.position, isThread, parentChannelId });
      channelId = existing._id;
      updated++;
    } else {
      let slug = slugify(input.name);
      const clash = await ctx.db.query("channels").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
      if (clash) slug = `${slug}-${input.id.slice(-4)}`;
      channelId = await ctx.db.insert("channels", {
        discordChannelId: input.id, slug, name: input.name, topic, position: input.position, messageCount: 0,
        isThread, parentChannelId,
      });
      created++;
    }
    if (isThread) {
      const originMessage = await ctx.db
        .query("messages")
        .withIndex("by_discordMessageId", (q) => q.eq("discordMessageId", input.id))
        .unique();
      if (originMessage && originMessage.threadChannelId !== channelId) {
        await ctx.db.patch(originMessage._id, { threadChannelId: channelId });
      }
    }
    if (input.webhookUrl) {
      const secret = await ctx.db.query("channelSecrets").withIndex("by_channelId", (q) => q.eq("channelId", channelId)).unique();
      if (secret) {
        if (secret.webhookUrl !== input.webhookUrl) await ctx.db.patch(secret._id, { webhookUrl: input.webhookUrl });
      } else {
        await ctx.db.insert("channelSecrets", { channelId, webhookUrl: input.webhookUrl });
      }
    }
  }
  return { created, updated };
}

export const sync = internalMutation({
  args: { channels: v.array(v.any()) },
  handler: (ctx, { channels }) => syncChannels(ctx, channels as ChannelSyncInput[]),
});
