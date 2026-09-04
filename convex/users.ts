import { v, ConvexError } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { optionalUser, publicUser, requireUser } from "./lib/requireUser";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const u = await optionalUser(ctx);
    if (!u) return null;
    const subs = await ctx.db
      .query("digest_subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", u._id))
      .collect();
    // Points are the Discord bot's, looked up by the linked Discord account.
    const mirrored = u.discordUserId
      ? await ctx.db
          .query("leaderboard_mirror")
          .withIndex("by_discordUserId", (q) => q.eq("discordUserId", u.discordUserId!))
          .unique()
      : null;
    return {
      ...publicUser(u),
      pointsAllTime: mirrored?.points ?? 0,
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
  });
}

// Attach a Discord identity to an account. If a shadow user already holds that
// Discord id (from mirrored history), its messages are reassigned to the
// claiming account in the background — an active, long-backfilled member can
// easily have more messages than a single mutation's read/write budget (4096),
// so this can't be done as one synchronous loop.
//
// Two callers, both of which have already proven ownership of the Discord
// account: the `!link CODE` flow below, and a Discord OAuth sign-in (see
// convex/auth.ts). The OAuth path has already written `discordUserId` onto
// `target` by the time this runs, so holders are read with `collect()` rather
// than `unique()` — target and shadow can both carry the id for that instant.
export async function attachDiscordIdentity(
  ctx: MutationCtx,
  args: { userId: Id<"users">; discordUserId: string; name?: string; avatarUrl?: string },
): Promise<{ ok: boolean; reason?: string }> {
  const target = await ctx.db.get(args.userId);
  if (!target) return { ok: false, reason: "no user" };

  const holders = await ctx.db
    .query("users")
    .withIndex("by_discordUserId", (q) => q.eq("discordUserId", args.discordUserId))
    .collect();
  for (const holder of holders) {
    if (holder._id === target._id) continue;
    if (!holder.isShadow) {
      // A real, separately-authenticated account already claimed this Discord
      // id. Sign-in still succeeds, but it doesn't get to take the link over;
      // undo the write OAuth made so `by_discordUserId` stays single-valued.
      if (target.discordUserId === args.discordUserId) {
        await ctx.db.patch(target._id, { discordUserId: undefined });
      }
      return { ok: false, reason: "already linked to another account" };
    }
    // Clear the shadow's identity now so it stops being found by
    // by_discordUserId (new messages from this Discord id will attach to
    // `target` immediately via ensureShadowUser); the row itself is deleted
    // once every message has been moved off it.
    await ctx.db.patch(holder._id, { discordUserId: undefined });
    await ctx.scheduler.runAfter(0, internal.users.reassignShadowMessages, {
      shadowId: holder._id,
      targetId: target._id,
    });
  }

  await ctx.db.patch(target._id, {
    discordUserId: args.discordUserId,
    displayName: target.displayName ?? args.name ?? target.name,
    avatarUrl: target.avatarUrl ?? args.avatarUrl ?? target.image,
    role: target.role ?? "member",
  });
  return { ok: true };
}

// Claim a Discord identity with a code from Settings, for accounts that signed
// in some other way. A Discord sign-in links itself and never comes through here.
export async function linkDiscordByCode(
  ctx: MutationCtx,
  args: { code: string; discordUserId: string; name: string; avatarUrl?: string },
): Promise<{ ok: boolean; reason?: string }> {
  const code = await ctx.db.query("link_codes").withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase())).unique();
  if (!code) return { ok: false, reason: "unknown code" };
  await ctx.db.delete(code._id);
  if (code.expiresAt < Date.now()) return { ok: false, reason: "expired" };
  const result = await attachDiscordIdentity(ctx, {
    userId: code.userId,
    discordUserId: args.discordUserId,
    name: args.name,
    avatarUrl: args.avatarUrl,
  });
  if (result.ok) await adoptDiscordAuthAccount(ctx, code.userId, args.discordUserId);
  return result;
}

// Convex Auth resolves an OAuth sign-in by looking up (provider,
// providerAccountId) in authAccounts. A code-claimed identity lives only on the
// user row, so without this the person's later "Continue with Discord" wouldn't
// find the account that already owns their identity: it would make a fresh user,
// attachDiscordIdentity would rightly refuse to move the link, and they would
// land in an empty account instead of their own.
//
// The snowflake is as trustworthy here as it is from OAuth — it only got this
// far because they typed the code into Discord from the account in question.
//
// Only for the code path. On a Discord sign-in this row is Convex Auth's to
// create, and it does so right after the linking callback runs; inserting one
// here first would collide on the unique providerAndAccountId index.
async function adoptDiscordAuthAccount(ctx: MutationCtx, userId: Id<"users">, discordUserId: string) {
  const existing = await ctx.db
    .query("authAccounts")
    .withIndex("providerAndAccountId", (q) =>
      q.eq("provider", "discord").eq("providerAccountId", discordUserId),
    )
    .unique();
  if (existing) {
    if (existing.userId !== userId) await ctx.db.patch(existing._id, { userId });
    return;
  }
  await ctx.db.insert("authAccounts", { userId, provider: "discord", providerAccountId: discordUserId });
}

export const reassignShadowMessages = internalMutation({
  args: { shadowId: v.id("users"), targetId: v.id("users"), cursor: v.optional(v.string()) },
  handler: async (ctx, { shadowId, targetId, cursor }) => {
    const page = await ctx.db
      .query("messages")
      .withIndex("by_author", (q) => q.eq("authorUserId", shadowId))
      .paginate({ cursor: cursor ?? null, numItems: 200 });
    for (const m of page.page) {
      await ctx.db.patch(m._id, { authorUserId: targetId });
    }
    if (page.isDone) {
      const shadow = await ctx.db.get(shadowId);
      if (shadow) await ctx.db.delete(shadowId);
    } else {
      await ctx.scheduler.runAfter(0, internal.users.reassignShadowMessages, {
        shadowId, targetId, cursor: page.continueCursor,
      });
    }
  },
});

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
