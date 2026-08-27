import { v } from "convex/values";
import { internalMutation, query, type MutationCtx } from "./_generated/server";
import { weekKey, dayKey } from "./lib/weekKey";
import type { Id } from "./_generated/dataModel";
import { publicUser } from "./lib/requireUser";

// Point values per event kind. Change here, not at call sites.
export const POINTS: Record<string, number> = {
  discord_message: 1,
  web_message: 2,
  email_reply: 3,
  agent_assist: 1,
  link_shared: 3,
  reaction_received: 1,
  daily_active: 5,
};

// The single entry point for awarding points. Idempotent on dedupeKey, so
// bot replays and webhook echoes never double-award.
export type AwardArgs = {
  userId: Id<"users">;
  kind: string;
  dedupeKey: string;
  at?: number;
  meta?: unknown;
};

// The single entry point for awarding points. Idempotent on dedupeKey, so
// bot replays and webhook echoes never double-award.
export async function awardPoints(ctx: MutationCtx, { userId, kind, dedupeKey, at, meta }: AwardArgs) {
  const points = POINTS[kind];
  if (points === undefined) throw new Error(`Unknown points kind: ${kind}`);
  const existing = await ctx.db
    .query("points_events")
    .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", dedupeKey))
    .unique();
  if (existing) return { awarded: false, points: 0 };

  const ts = at ?? Date.now();
  const wk = weekKey(ts);
  await ctx.db.insert("points_events", {
    userId, kind, points, dedupeKey, weekKey: wk, meta, createdAt: ts,
  });

  const user = await ctx.db.get(userId);
  if (user) {
    await ctx.db.patch(userId, { pointsAllTime: (user.pointsAllTime ?? 0) + points });
  }
  const weekly = await ctx.db
    .query("leaderboard_weekly")
    .withIndex("by_week_user", (q) => q.eq("weekKey", wk).eq("userId", userId))
    .unique();
  if (weekly) {
    await ctx.db.patch(weekly._id, { points: weekly.points + points });
  } else {
    await ctx.db.insert("leaderboard_weekly", { weekKey: wk, userId, points });
  }
  return { awarded: true, points };
}

// Award the once-per-UTC-day activity bonus for any message source.
export async function awardDailyActive(ctx: MutationCtx, userId: Id<"users">, at: number) {
  return awardPoints(ctx, { userId, kind: "daily_active", dedupeKey: `daily:${userId}:${dayKey(at)}`, at });
}

export const award = internalMutation({
  args: {
    userId: v.id("users"),
    kind: v.string(),
    dedupeKey: v.string(),
    at: v.optional(v.number()),
    meta: v.optional(v.any()),
  },
  handler: (ctx, args) => awardPoints(ctx, args),
});

export const leaderboard = query({
  args: {
    period: v.union(v.literal("weekly"), v.literal("alltime")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { period, limit }) => {
    const n = Math.min(Math.max(limit ?? 20, 1), 100);
    if (period === "alltime") {
      const users = await ctx.db
        .query("users")
        .withIndex("by_pointsAllTime")
        .order("desc")
        .take(n);
      return users
        .filter((u) => (u.pointsAllTime ?? 0) > 0)
        .map((u, i) => ({ rank: i + 1, points: u.pointsAllTime ?? 0, user: publicUser(u) }));
    }
    const wk = weekKey(Date.now());
    const rows = await ctx.db
      .query("leaderboard_weekly")
      .withIndex("by_week_points", (q) => q.eq("weekKey", wk))
      .order("desc")
      .take(n);
    const out = [];
    for (const [i, row] of rows.entries()) {
      const u = await ctx.db.get(row.userId);
      if (u) out.push({ rank: i + 1, points: row.points, user: publicUser(u) });
    }
    return out;
  },
});

export const currentWeek = query({
  args: {},
  handler: async () => weekKey(Date.now()),
});
