import { v } from "convex/values";
import { internalMutation, internalQuery, query, type MutationCtx } from "./_generated/server";
import { slugify } from "./lib/slug";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const channels = await ctx.db.query("channels").collect();
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
    return { id: c._id, slug: c.slug, name: c.name, topic: c.topic ?? null, messageCount: c.messageCount };
  },
});

export const webhookFor = internalQuery({
  args: { channelId: v.id("channels") },
  handler: async (ctx, { channelId }) => {
    const s = await ctx.db.query("channelSecrets").withIndex("by_channelId", (q) => q.eq("channelId", channelId)).unique();
    return s?.webhookUrl ?? null;
  },
});

export type ChannelSyncInput = {
  id: string;
  name: string;
  topic?: string | null;
  position: number;
  webhookUrl?: string | null;
};

// Upsert channel metadata (and webhook secrets) reported by the bridge on startup.
export async function syncChannels(ctx: MutationCtx, channels: ChannelSyncInput[]) {
  let created = 0, updated = 0;
  for (const input of channels) {
    const existing = await ctx.db
      .query("channels")
      .withIndex("by_discordChannelId", (q) => q.eq("discordChannelId", input.id))
      .unique();
    const topic = input.topic ?? undefined;
    let channelId;
    if (existing) {
      await ctx.db.patch(existing._id, { name: input.name, topic, position: input.position });
      channelId = existing._id;
      updated++;
    } else {
      let slug = slugify(input.name);
      const clash = await ctx.db.query("channels").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
      if (clash) slug = `${slug}-${input.id.slice(-4)}`;
      channelId = await ctx.db.insert("channels", {
        discordChannelId: input.id, slug, name: input.name, topic, position: input.position, messageCount: 0,
      });
      created++;
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
