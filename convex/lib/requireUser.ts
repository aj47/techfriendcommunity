import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

// Returns the signed-in, non-banned user or throws a ConvexError the client can show.
export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError({ code: "unauthenticated", message: "Sign in to do that." });
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError({ code: "unauthenticated", message: "Sign in to do that." });
  if (user.role === "banned") {
    throw new ConvexError({ code: "banned", message: "This account can't post." });
  }
  return user;
}

export async function optionalUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  return userId ? await ctx.db.get(userId) : null;
}

// Fields safe to send to any client. Never leaks discordUserId or email.
export function publicUser(u: Doc<"users">) {
  return {
    id: u._id,
    handle: u.handle ?? null,
    displayName: u.displayName ?? u.name ?? u.handle ?? "member",
    avatarUrl: u.avatarUrl ?? u.image ?? null,
    role: u.role ?? "member",
    pointsAllTime: u.pointsAllTime ?? 0,
    isShadow: u.isShadow ?? false,
  };
}
