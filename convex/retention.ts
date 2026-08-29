import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// Message retention. The site mirrors a busy Discord: a one-time backfill put
// ~250k rows in `messages`, and the bridge adds more every day. Document
// storage, four B-tree indexes and the `search_content` text index all scale
// with that row count and none of them shrink on their own, so the oldest
// messages are swept on a daily cron.
//
// What survives a sweep: `channel_summaries` holds one aggregated row per
// channel per day and is never pruned, so the community's history stays
// readable after the raw messages behind it are gone. Only the verbatim
// message log is bounded here.
//
// What a sweep deliberately does NOT touch: `channels.messageCount`. That
// counter reports total activity in a channel for its whole life, not how many
// rows are currently retained — decrementing it would misreport the channel's
// history, and would add a write per batch for no reader's benefit.

const DEFAULT_RETENTION_DAYS = 90;

// Deletes per transaction. Every delete also updates four indexes plus the
// text search index, so this stays well clear of Convex's per-transaction
// write limit while keeping the number of chained mutations modest.
const BATCH = 500;

// Upper bound on batches chained from a single cron run (~500k rows). Purely a
// runaway guard: whatever is left is picked up by the next day's run.
const MAX_BATCHES = 1000;

// Returns null when the deployment is misconfigured. A bad value must never be
// read as "retain nothing" — the sweep refuses and keeps everything instead.
function retentionDays(): number | null {
  const raw = process.env.MESSAGE_RETENTION_DAYS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_RETENTION_DAYS;
  const days = Number(raw);
  if (!Number.isFinite(days) || days <= 0) return null;
  return days;
}

export const enforceRetention = internalMutation({
  args: { batch: v.optional(v.number()), deleted: v.optional(v.number()) },
  handler: async (ctx, { batch = 0, deleted = 0 }) => {
    const days = retentionDays();
    if (days === null) {
      console.warn(
        "retention: MESSAGE_RETENTION_DAYS is not a positive number, skipping sweep",
        process.env.MESSAGE_RETENTION_DAYS,
      );
      return { deleted, done: true, skipped: true };
    }

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    // `.take()` is correct here precisely because the rows it returns are then
    // deleted: each call re-reads the oldest surviving messages, which is
    // exactly the next batch. Do NOT copy this into a sweep that leaves rows
    // in place — there, repeated `.take()` re-reads the same page forever and
    // silently touches only the first N rows.
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .take(BATCH);

    for (const row of rows) await ctx.db.delete(row._id);
    const total = deleted + rows.length;

    // A short batch means the table is drained past the cutoff.
    if (rows.length < BATCH) {
      if (total > 0) console.log("retention: sweep complete", { deleted: total, days });
      return { deleted: total, done: true };
    }

    if (batch + 1 >= MAX_BATCHES) {
      console.warn("retention: hit MAX_BATCHES, resuming on the next run", { deleted: total });
      return { deleted: total, done: false };
    }

    await ctx.scheduler.runAfter(0, internal.retention.enforceRetention, {
      batch: batch + 1,
      deleted: total,
    });
    return { deleted: total, done: false };
  },
});
