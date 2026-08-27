import { v, ConvexError } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { optionalUser, publicUser, requireUser } from "./lib/requireUser";
import { weekKey } from "./lib/weekKey";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const u = await optionalUser(ctx);
    if (!u) return null;
    const subs = await ctx.db
      .query("digest_subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", u._id))
      .collect();
    const wk = weekKey(Date.now());
    const weekly = await ctx.db
      .query("leaderboard_weekly")
      .withIndex("by_week_user", (q) => q.eq("weekKey", wk).eq("userId", u._id))
      .unique();
    return {
      ...publicUser(u),
      pointsThisWeek: weekly?.points ?? 0,
      discordLinked: !!u.discordUserId,
      subscriptionCount: subs.length,
      needsHandle: !u.handle,
    };
  },
});

export const updateProfile = mutation({
  args: { handle: v.string(), displayName: v.optional(v.string()) },
  handler: async (ctx, { handle, displayName }) => {
    const user = await requireUser(ctx);
    const clean = handle.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
    if (clean.length < 2) throw new ConvexError({ code: "invalid", message: "Handle must be 2-32 chars (letters, numbers, _ -)." });
    const taken = await ctx.db.query("users").withIndex("by_handle", (q) => q.eq("handle", clean)).unique();
    if (taken && taken._id !== user._id) throw new ConvexError({ code: "taken", message: `@${clean} is taken.` });
    await ctx.db.patch(user._id, {
      handle: clean,
      displayName: (displayName?.trim() || user.displayName || user.name || clean).slice(0, 64),
      avatarUrl: user.avatarUrl ?? user.image,
      role: user.role ?? "member",
      pointsAllTime: user.pointsAllTime ?? 0,
    });
    return { handle: clean };
  },
});

// Find or create the mirrored user for a Discord author. Points earned in
// Discord accrue here until the person claims the account via `!link`.
export async function ensureShadowUser(
  ctx: MutationCtx,
  args: { discordUserId: string; name: string; avatarUrl?: string },
): Promise<Id<"users">> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_discordUserId", (q) => q.eq("discordUserId", args.discordUserId))
    .unique();
  if (existing) {
    if (existing.isShadow && (existing.displayName !== args.name || existing.avatarUrl !== args.avatarUrl)) {
      await ctx.db.patch(existing._id, { displayName: args.name, avatarUrl: args.avatarUrl });
    }
    return existing._id;
  }
  return await ctx.db.insert("users", {
    discordUserId: args.discordUserId,
    displayName: args.name,
    avatarUrl: args.avatarUrl,
    isShadow: true,
    role: "member",
    pointsAllTime: 0,
  });
}

// Claim a Discord identity with a code from Settings. Merges any shadow user's
// messages and points into the signed-in account.
export async function linkDiscordByCode(
  ctx: MutationCtx,
  args: { code: string; discordUserId: string; name: string; avatarUrl?: string },
): Promise<{ ok: boolean; reason?: string }> {
  const code = await ctx.db.query("link_codes").withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase())).unique();
  if (!code) return { ok: false, reason: "unknown code" };
  await ctx.db.delete(code._id);
  if (code.expiresAt < Date.now()) return { ok: false, reason: "expired" };
  const target = await ctx.db.get(code.userId);
  if (!target) return { ok: false, reason: "no user" };

  const shadow = await ctx.db
    .query("users")
    .withIndex("by_discordUserId", (q) => q.eq("discordUserId", args.discordUserId))
    .unique();
  if (shadow && shadow._id !== target._id) {
    if (!shadow.isShadow) return { ok: false, reason: "already linked to another account" };
    for await (const m of ctx.db.query("messages").withIndex("by_author", (q) => q.eq("authorUserId", shadow._id))) {
      await ctx.db.patch(m._id, { authorUserId: target._id });
    }
    for await (const e of ctx.db.query("points_events").withIndex("by_user_time", (q) => q.eq("userId", shadow._id))) {
      await ctx.db.patch(e._id, { userId: target._id });
    }
    for await (const w of ctx.db.query("leaderboard_weekly").withIndex("by_week_user")) {
      if (w.userId !== shadow._id) continue;
      const mine = await ctx.db
        .query("leaderboard_weekly")
        .withIndex("by_week_user", (q) => q.eq("weekKey", w.weekKey).eq("userId", target._id))
        .unique();
      if (mine) { await ctx.db.patch(mine._id, { points: mine.points + w.points }); await ctx.db.delete(w._id); }
      else await ctx.db.patch(w._id, { userId: target._id });
    }
    await ctx.db.patch(target._id, { pointsAllTime: (target.pointsAllTime ?? 0) + (shadow.pointsAllTime ?? 0) });
    await ctx.db.delete(shadow._id);
  }
  await ctx.db.patch(target._id, {
    discordUserId: args.discordUserId,
    avatarUrl: target.avatarUrl ?? args.avatarUrl,
  });
  return { ok: true };
}

export const createLinkCode = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    await ctx.db.insert("link_codes", { code, userId: user._id, expiresAt: Date.now() + 15 * 60 * 1000 });
    return { code, expiresInMinutes: 15 };
  },
});
