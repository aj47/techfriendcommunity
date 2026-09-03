import type { DatabaseReader } from "../_generated/server";

// Discord sends a mention as the raw snowflake — <@123> for a person, <@!123>
// for the nickname form, <@&123> for a role, <#123> for a channel. Only
// Discord's own client turns those back into names; mirrored anywhere else
// they read as a wall of digits ("<@1462905798702268661> health check").
//
// Everything needed to name them is already here: every Discord author gets a
// users row keyed by discordUserId, the bot's points mirror covers people who
// have been scored but never posted, and every mirrored channel carries its
// Discord id. So the server resolves the ids it can and ships a small map
// alongside each message; the client renders the token from that map
// (src/lib/linkify.tsx) rather than parsing snowflakes itself.
const TOKEN = /<(@!?|@&|#)(\d{15,25})>/g;

export type Mention = { kind: "user" | "channel"; name: string; slug?: string };
// Keyed by "@<id>" / "#<id>" — the nickname form <@!123> collapses onto the
// plain one, so the client looks up either with the same key.
export type Mentions = Record<string, Mention>;

type Ctx = { db: DatabaseReader };

async function lookupUser(ctx: Ctx, id: string): Promise<Mention | null> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_discordUserId", (q) => q.eq("discordUserId", id))
    .first();
  const name = user?.displayName ?? user?.name ?? user?.handle;
  if (name) return { kind: "user", name };
  // Someone the bot has scored but who has never posted in a mirrored channel.
  const scored = await ctx.db
    .query("leaderboard_mirror")
    .withIndex("by_discordUserId", (q) => q.eq("discordUserId", id))
    .first();
  return scored ? { kind: "user", name: scored.name } : null;
}

async function lookupChannel(ctx: Ctx, id: string): Promise<Mention | null> {
  const channel = await ctx.db
    .query("channels")
    .withIndex("by_discordChannelId", (q) => q.eq("discordChannelId", id))
    .first();
  return channel ? { kind: "channel", name: channel.name, slug: channel.slug } : null;
}

// One resolver per query, so a page of messages that mentions the same person
// forty times pays for one lookup. Roles are skipped: nothing mirrored here
// knows a role's name, and the client renders that token as "@role".
export function mentionResolver(ctx: Ctx) {
  const cache = new Map<string, Mention | null>();
  return async function resolve(...texts: (string | null | undefined)[]): Promise<Mentions> {
    const out: Mentions = {};
    for (const text of texts) {
      if (!text) continue;
      for (const [, sigil, id] of text.matchAll(TOKEN)) {
        if (sigil === "@&") continue;
        const key = `${sigil === "#" ? "#" : "@"}${id}`;
        if (key in out) continue;
        if (!cache.has(key)) cache.set(key, await (sigil === "#" ? lookupChannel(ctx, id) : lookupUser(ctx, id)));
        const hit = cache.get(key);
        if (hit) out[key] = hit;
      }
    }
    return out;
  };
}

export type MentionResolver = ReturnType<typeof mentionResolver>;

// The same substitution for text-only surfaces (email digests, WebMCP tool
// output), where a chip has nowhere to render and the id is pure noise.
export function plainMentions(text: string, mentions: Mentions): string {
  return text.replace(TOKEN, (_whole, sigil: string, id: string) => {
    if (sigil === "@&") return "@role";
    const prefix = sigil === "#" ? "#" : "@";
    const hit = mentions[`${prefix}${id}`];
    return hit ? `${prefix}${hit.name}` : sigil === "#" ? "#channel" : "@someone";
  });
}
