import { v } from "convex/values";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { type Doc } from "./_generated/dataModel";
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
export type MirrorRow = {
  discordUserId: string;
  name: string;
  points: number;
  // Absent from an un-upgraded bot; the balance is then the best floor there is.
  lifetimePoints?: number;
};

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
    // Nothing may lower a lifetime total. A bot that doesn't send one yet, or a
    // truncated push, must not reset what the mirror already knows — so take
    // the highest of what arrived, what is stored, and the balance itself.
    const existing = await ctx.db
      .query("leaderboard_mirror")
      .withIndex("by_discordUserId", (q) => q.eq("discordUserId", row.discordUserId))
      .unique();
    const lifetimePoints = Math.max(
      row.lifetimePoints ?? 0,
      existing?.lifetimePoints ?? 0,
      row.points,
    );
    if (existing) {
      if (
        existing.points !== row.points ||
        existing.name !== row.name ||
        existing.lifetimePoints !== lifetimePoints
      ) {
        await ctx.db.patch(existing._id, {
          name: row.name,
          points: row.points,
          lifetimePoints,
          updatedAt: now,
        });
      }
    } else {
      await ctx.db.insert("leaderboard_mirror", {
        discordUserId: row.discordUserId,
        name: row.name,
        points: row.points,
        lifetimePoints,
        updatedAt: now,
      });
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

// Standings rank on what a member has earned all-time, never on what is left in
// their wallet. Ranking on the balance demotes whoever spends points, and since
// only a fifth of the points ever awarded have been spent, that is precisely the
// behaviour the economy does not need rewarded. The balance travels alongside so
// the board can show both.
export type Standing = {
  rank: number;
  name: string;
  discordUserId: string;
  points: number;
  lifetimePoints: number;
  spent: number;
  user: Doc<"users"> | null;
};

type RankedRow = {
  row: Doc<"leaderboard_mirror">;
  lifetimePoints: number;
  spent: number;
};

// Ties break on the balance, then on the name, so the order is stable rather
// than whatever the table happens to return first.
function byAllTime(a: RankedRow, b: RankedRow) {
  return (
    b.lifetimePoints - a.lifetimePoints ||
    b.row.points - a.row.points ||
    a.row.name.localeCompare(b.row.name)
  );
}

async function rankRows(ctx: QueryCtx) {
  const rows = await ctx.db.query("leaderboard_mirror").collect();
  return rows
    .map((row) => {
      const lifetimePoints = Math.max(row.lifetimePoints ?? 0, row.points);
      return { row, lifetimePoints, spent: lifetimePoints - row.points };
    })
    .sort(byAllTime);
}

async function standingsFrom(ctx: QueryCtx, ranked: RankedRow[]) {
  const out: Standing[] = [];
  for (const [i, entry] of ranked.entries()) {
    const user = await ctx.db
      .query("users")
      .withIndex("by_discordUserId", (q) => q.eq("discordUserId", entry.row.discordUserId))
      .unique();
    out.push({
      rank: i + 1,
      name: entry.row.name,
      discordUserId: entry.row.discordUserId,
      points: entry.row.points,
      lifetimePoints: entry.lifetimePoints,
      spent: entry.spent,
      user: user ?? null,
    });
  }
  return out;
}

// The top `n` members by all-time points. Shared with the share card so the
// card and the page can never disagree about who is on top.
export async function topStandings(ctx: QueryCtx, n: number): Promise<Standing[]> {
  return standingsFrom(ctx, (await rankRows(ctx)).slice(0, n));
}

// The community leaderboard, exactly as the Discord bot scores it. Where a
// member has claimed their account via `!link`, their web profile is attached
// so the row renders with their handle and avatar.
export const leaderboard = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const n = Math.min(Math.max(limit ?? 20, 1), 100);
    const ranked = await topStandings(ctx, n);

    return ranked.map((s) => ({
      rank: s.rank,
      points: s.points,
      lifetimePoints: s.lifetimePoints,
      spent: s.spent,
      name: s.name,
      user: s.user ? publicUser(s.user) : null,
    }));
  },
});

// Who has actually spent their points. The board above rewards earning; this
// one is the other half of the economy, and it is the number that tells the
// community its points are worth something.
export const topSpenders = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const n = Math.min(Math.max(limit ?? 10, 1), 100);
    const spenders = (await rankRows(ctx))
      .filter((entry) => entry.spent > 0)
      .sort((a, b) => b.spent - a.spent || byAllTime(a, b))
      .slice(0, n);

    const ranked = await standingsFrom(ctx, spenders);
    return ranked.map((s) => ({
      rank: s.rank,
      points: s.points,
      lifetimePoints: s.lifetimePoints,
      spent: s.spent,
      name: s.name,
      user: s.user ? publicUser(s.user) : null,
    }));
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
//
// This must read the *newest* updatedAt. An unindexed `.first()` returns the
// oldest row by creation time, and since syncMirror only patches rows whose
// points or name actually changed, that row's updatedAt can be weeks stale —
// so the footer misreported the sync time exactly when the mirror was healthy.
export const lastSyncedAt = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("leaderboard_mirror")
      .withIndex("by_updatedAt")
      .order("desc")
      .first();
    return row?.updatedAt ?? null;
  },
});

