import { v } from "convex/values";
import { query, type MutationCtx } from "./_generated/server";

// Daily summaries are written by the Discord bot's summarizer, not here. The
// bot posts each one into a Discord thread — threads are outside what the
// bridge mirrors — so the bridge pushes the rows straight from the bot's
// channel_summaries table and this module renders them read-only.

export type SummaryRow = {
  discordChannelId: string;
  channelName: string;
  date: string;
  summaryText: string;
  messageCount: number;
  activeUsers: number;
  createdAt: number;
};

// Long enough for the bot's longest summaries, short enough that a runaway
// push can't put an unbounded document in the table.
const MAX_SUMMARY_LEN = 20000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Upsert by (channel, date). Unlike the leaderboard this is not a wholesale
// replace: summaries for past days stay valid, and a push only ever carries
// the last few days.
export async function syncSummaries(ctx: MutationCtx, rows: SummaryRow[]) {
  let written = 0;
  let skipped = 0;
  for (const row of rows ?? []) {
    const date = String(row?.date ?? "");
    const summaryText = String(row?.summaryText ?? "").trim().slice(0, MAX_SUMMARY_LEN);
    if (!DATE_RE.test(date) || !summaryText) {
      skipped++;
      continue;
    }
    // Resolve through the channels table rather than trusting the pushed id:
    // a channel the site doesn't mirror must not get its summary published.
    const channel = await ctx.db
      .query("channels")
      .withIndex("by_discordChannelId", (q) => q.eq("discordChannelId", String(row.discordChannelId)))
      .unique();
    if (!channel) {
      skipped++;
      continue;
    }
    const doc = {
      channelId: channel._id,
      channelName: row.channelName || channel.name,
      date,
      summaryText,
      messageCount: Number(row.messageCount) || 0,
      activeUsers: Number(row.activeUsers) || 0,
      createdAt: Number(row.createdAt) || Date.now(),
    };
    const existing = await ctx.db
      .query("channel_summaries")
      .withIndex("by_channel_date", (q) => q.eq("channelId", channel._id).eq("date", date))
      .unique();
    if (existing) {
      // A re-summarized day overwrites; an identical repush writes nothing.
      if (existing.summaryText !== doc.summaryText || existing.messageCount !== doc.messageCount) {
        await ctx.db.patch(existing._id, doc);
        written++;
      }
    } else {
      await ctx.db.insert("channel_summaries", doc);
      written++;
    }
  }
  return { written, skipped };
}

async function withSlug(
  ctx: { db: { get: (id: any) => Promise<any> } },
  row: { channelId: any; channelName: string; date: string; summaryText: string; messageCount: number; activeUsers: number; createdAt: number },
) {
  const channel = await ctx.db.get(row.channelId);
  return {
    channelSlug: channel?.slug ?? null,
    channelName: channel?.name ?? row.channelName,
    date: row.date,
    summaryText: row.summaryText,
    messageCount: row.messageCount,
    activeUsers: row.activeUsers,
    createdAt: row.createdAt,
  };
}

// The most recent day that has any summaries, with every channel summarized
// that day — busiest first, since that's the one worth reading.
export const latest = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const n = Math.min(Math.max(limit ?? 6, 1), 20);
    // Dates are zero-padded YYYY-MM-DD, so string order is date order.
    const newest = await ctx.db.query("channel_summaries").withIndex("by_date").order("desc").first();
    if (!newest) return null;
    const sameDay = await ctx.db
      .query("channel_summaries")
      .withIndex("by_date", (q) => q.eq("date", newest.date))
      .collect();
    sameDay.sort((a, b) => b.messageCount - a.messageCount);
    const entries = [];
    for (const row of sameDay.slice(0, n)) entries.push(await withSlug(ctx, row));
    return { date: newest.date, entries };
  },
});

// Recent summaries for one channel, newest first — the channel page's history.
export const forChannel = query({
  args: { slug: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { slug, limit }) => {
    const channel = await ctx.db.query("channels").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!channel) return [];
    const rows = await ctx.db
      .query("channel_summaries")
      .withIndex("by_channel_date", (q) => q.eq("channelId", channel._id))
      .order("desc")
      .take(Math.min(Math.max(limit ?? 7, 1), 30));
    return rows.map((r) => ({
      channelSlug: channel.slug,
      channelName: channel.name,
      date: r.date,
      summaryText: r.summaryText,
      messageCount: r.messageCount,
      activeUsers: r.activeUsers,
      createdAt: r.createdAt,
    }));
  },
});
