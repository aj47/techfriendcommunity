import { v } from "convex/values";
import { internalMutation, query, type MutationCtx } from "./_generated/server";
import { publicUser } from "./lib/requireUser";

// This app does not score anything.
//
// The techfren Discord bot owns the community's only points system: an
// LLM-judged daily award written to its own user_points table. The bridge
// pushes that table here as `leaderboard.sync` and the web app renders it
// read-only. There is deliberately no awardPoints() — if you find yourself
// wanting one, the award belongs in the bot, not here.

// Replace the mirror with the bot's current standings. Called from the
// ingest handler. Rows are always upserted; whether absent rows get pruned
// depends on `complete` — see below.
export type MirrorRow = { discordUserId: string; name: string; points: number };

export async function syncMirror(ctx: MutationCtx, rows: MirrorRow[], complete?: boolean) {
  // A push with no rows is far more likely a hiccup (a transient empty/failed
  // leaderboard read, a bad manual probe — this has happened) than a real
  // "zero members" leaderboard. Since a complete push prunes anything absent
  // from `rows`, treating empty as authoritative would wipe the whole mirror
  // on one bad push. Ignore it and wait for the next sync instead. Belt and
  // braces alongside the bot's own guard against sending one.
  if (rows.length === 0) {
    console.warn("leaderboard.sync: ignoring empty push (would have wiped the mirror)");
    return { synced: 0, pruned: false as const };
  }

  const now = Date.now();
  const seen = new Set<string>();
  for (const row of rows) {
    seen.add(row.discordUserId);
    const existing = await ctx.db
      .query("leaderboard_mirror")
      .withIndex("by_discordUserId", (q) => q.eq("discordUserId", row.discordUserId))
      .unique();
    if (existing) {
      if (existing.points !== row.points || existing.name !== row.name) {
        await ctx.db.patch(existing._id, { name: row.name, points: row.points, updatedAt: now });
      }
    } else {
      await ctx.db.insert("leaderboard_mirror", { ...row, updatedAt: now });
    }
  }

  // `complete` is false when the bot's own read was truncated (hit its row
  // cap) — a row missing from this batch may just be missing from the batch,
  // not actually gone. Only prune on a push the bot vouches for as the full
  // set. Absent `complete` (an un-upgraded bot) is treated as complete.
  if (complete === false) {
    return { synced: rows.length, pruned: false as const };
  }
  let prunedCount = 0;
  for (const stale of await ctx.db.query("leaderboard_mirror").collect()) {
    if (!seen.has(stale.discordUserId)) {
      await ctx.db.delete(stale._id);
      prunedCount++;
    }
  }
  return { synced: rows.length, pruned: true as const, prunedCount };
}

// The community leaderboard, exactly as the Discord bot scores it. Where a
// member has claimed their account via `!link`, their web profile is attached
// so the row renders with their handle and avatar.
export const leaderboard = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const n = Math.min(Math.max(limit ?? 20, 1), 100);
    const rows = await ctx.db
      .query("leaderboard_mirror")
      .withIndex("by_points")
      .order("desc")
      .take(n);

    const out = [];
    for (const [i, row] of rows.entries()) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_discordUserId", (q) => q.eq("discordUserId", row.discordUserId))
        .unique();
      out.push({
        rank: i + 1,
        points: row.points,
        name: row.name,
        user: user ? publicUser(user) : null,
      });
    }
    return out;
  },
});

// A single member's standing, for the nav counter and settings page.
export const pointsForDiscordUser = query({
  args: { discordUserId: v.optional(v.string()) },
  handler: async (ctx, { discordUserId }) => {
    if (!discordUserId) return null;
    const row = await ctx.db
      .query("leaderboard_mirror")
      .withIndex("by_discordUserId", (q) => q.eq("discordUserId", discordUserId))
      .unique();
    return row?.points ?? null;
  },
});

// When the mirror was last pushed by the bot, so the UI can say so.
export const lastSyncedAt = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("leaderboard_mirror").first();
    return row?.updatedAt ?? null;
  },
});

// One-shot cleanup of the retired scoring tables. Run it once after this
// deploy (`npx convex run points:purgeLegacy`), then drop points_events,
// leaderboard_weekly and users.pointsAllTime from the schema in a follow-up
// deploy. Safe to re-run; it batches so a large ledger needs several calls.
export const purgeLegacy = internalMutation({
  args: { batch: v.optional(v.number()) },
  handler: async (ctx, { batch }) => {
    const n = Math.min(Math.max(batch ?? 500, 1), 4000);
    let events = 0;
    for (const row of await ctx.db.query("points_events").take(n)) {
      await ctx.db.delete(row._id);
      events++;
    }
    let weekly = 0;
    for (const row of await ctx.db.query("leaderboard_weekly").take(n)) {
      await ctx.db.delete(row._id);
      weekly++;
    }
    let users = 0;
    for (const u of await ctx.db.query("users").take(n)) {
      if (u.pointsAllTime !== undefined) {
        await ctx.db.patch(u._id, { pointsAllTime: undefined });
        users++;
      }
    }
    const done = events === 0 && weekly === 0 && users === 0;
    return { events, weekly, users, done };
  },
});
