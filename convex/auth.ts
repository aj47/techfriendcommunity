import Discord, { type DiscordProfile } from "@auth/core/providers/discord";
import GitHub from "@auth/core/providers/github";
import { convexAuth } from "@convex-dev/auth/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { attachDiscordIdentity } from "./users";

function avatarUrl(profile: DiscordProfile): string {
  if (profile.avatar) {
    const format = profile.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${format}`;
  }
  // Discord's own default-avatar arithmetic: post-migration accounts (whose
  // discriminator is "0") index by snowflake, legacy ones by discriminator.
  const index = profile.discriminator === "0"
    ? Number(BigInt(profile.id) >> BigInt(22)) % 6
    : parseInt(profile.discriminator) % 5;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

// Convex Auth strips `id` from a provider's profile (it becomes the account's
// providerAccountId) before writing the rest to the user row, so the snowflake
// is passed a second time under `discordUserId` — the name of the users column
// it belongs in. It therefore lands on the user document as part of the normal
// sign-in write, and is readable in `afterUserCreatedOrUpdated` below, which
// runs in the same mutation.
const discord = Discord({
  profile: (profile: DiscordProfile) => ({
    id: profile.id,
    name: profile.global_name ?? profile.username,
    // Convex Auth writes this profile onto the user row as-is, and the users
    // schema takes an optional string — a null from Discord (an account with
    // no email) would fail validation and sink the whole sign-in.
    email: profile.email ?? undefined,
    image: avatarUrl(profile),
    discordUserId: profile.id,
    // Discord says whether it verified the address. Convex Auth assumes `true`
    // for any OAuth provider unless told otherwise, which would let an
    // unverified Discord email adopt an existing account that shares it.
    emailVerified: profile.verified === true,
  }),
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [GitHub, discord],
  callbacks: {
    // Signing in with Discord *is* the link: the OAuth handshake proves the
    // person owns that Discord account, so their mirrored history and points
    // are claimed here without the `!link CODE` round trip.
    async afterUserCreatedOrUpdated(ctx, { userId, provider, profile }) {
      if (provider.id !== "discord") return;
      const discordUserId = profile.discordUserId;
      if (typeof discordUserId !== "string") return;
      await attachDiscordIdentity(ctx as unknown as MutationCtx, {
        userId: userId as Id<"users">,
        discordUserId,
        name: typeof profile.name === "string" ? profile.name : undefined,
        avatarUrl: typeof profile.image === "string" ? profile.image : undefined,
      });
    },
  },
});
