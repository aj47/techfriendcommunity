// The content behind the dynamic link-preview cards.
//
// Every unfurl of a page — and every render of the HTML, which has to stamp the
// card's version into og:image — runs one of these. They are deliberately
// small: a handful of indexed reads, no fan-out over messages, and no user
// context (a card is public by definition, so nothing here may touch anything
// a signed-out visitor can't already see).
import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "../_generated/server";

export const kindValidator = v.union(
  v.literal("home"),
  v.literal("live"),
  v.literal("channel"),
  v.literal("leaderboard"),
  v.literal("resources"),
  v.literal("search"),
  v.literal("site"),
);

export type CardKind =
  | "home"
  | "live"
  | "channel"
  | "leaderboard"
  | "resources"
  | "search"
  | "site";

export type CardMessage = {
  author: string;
  // Named channel only where the card shows more than one; threads are flagged
  // because a thread is not a "#channel" and must not be printed as one.
  channel: { name: string; isThread: boolean } | null;
  content: string;
  createdAt: number;
};

export type CardData = {
  kind: CardKind;
  version: string;
  // Present on the kinds that show them; the card renderer decides what to use.
  channel?: { name: string; topic: string | null; messageCount: number; isThread: boolean };
  messages?: CardMessage[];
  recap?: { date: string; channel: string; text: string; messages: number; people: number };
  leaders?: { rank: number; name: string; alias?: string | null; points: number }[];
  resources?: { title: string; site: string }[];
  query?: string;
  results?: number;
  stats?: { channels: number; messages: number; members: number };
  missing?: boolean;
};

async function latestMessages(ctx: QueryCtx, limit: number): Promise<CardMessage[]> {
  const rows = await ctx.db
    .query("messages")
    .withIndex("by_createdAt")
    .order("desc")
    .filter((q) => q.eq(q.field("hiddenAt"), undefined))
    .take(limit);
  const names = new Map<string, { name: string; isThread: boolean } | null>();
  const out: CardMessage[] = [];
  for (const m of rows) {
    if (!names.has(m.channelId)) {
      const c = await ctx.db.get(m.channelId);
      names.set(m.channelId, c ? { name: c.name, isThread: c.isThread ?? false } : null);
    }
    out.push({
      author: m.authorDisplay.name,
      channel: names.get(m.channelId) ?? null,
      content: m.content,
      createdAt: m.createdAt,
    });
  }
  return out;
}

async function stats(ctx: QueryCtx) {
  const channels = await ctx.db.query("channels").collect();
  const rooms = channels.filter((c) => !c.isThread);
  return {
    channels: rooms.length,
    messages: channels.reduce((n, c) => n + c.messageCount, 0),
    // The mirror is the only member count that means anything here: it is the
    // people the bot has actually scored, not every row in `users` (which
    // includes shadow authors created for a single bridged message).
    members: (await ctx.db.query("leaderboard_mirror").collect()).length,
  };
}

// The newest timestamp a card of this kind can be showing. It becomes the `v`
// on og:image, which is the only thing that makes an unfurler — all of which
// cache by URL, some for days — fetch the card again after the content moves.
async function freshness(ctx: QueryCtx, kind: CardKind, slug?: string): Promise<number> {
  if (kind === "leaderboard") {
    const row = await ctx.db.query("leaderboard_mirror").withIndex("by_updatedAt").order("desc").first();
    return row?.updatedAt ?? 0;
  }
  if (kind === "resources") {
    const row = await ctx.db.query("link_resources").withIndex("by_createdAt").order("desc").first();
    return row?.createdAt ?? 0;
  }
  if (kind === "channel") {
    const c = slug
      ? await ctx.db.query("channels").withIndex("by_slug", (q) => q.eq("slug", slug)).unique()
      : null;
    return c?.lastMessageAt ?? c?._creationTime ?? 0;
  }
  const newest = await ctx.db
    .query("messages")
    .withIndex("by_createdAt")
    .order("desc")
    .filter((q) => q.eq(q.field("hiddenAt"), undefined))
    .first();
  return newest?.createdAt ?? 0;
}

// Seconds, base36: short enough not to bloat every og:image URL, precise
// enough that two messages a minute apart are two different cards.
function token(at: number): string {
  return Math.floor(at / 1000).toString(36);
}

/**
 * The version stamp for a route's card, for og:image on the server-rendered
 * HTML. Cheap on purpose — it runs on every page view, card or no card.
 */
export const version = internalQuery({
  args: { kind: kindValidator, slug: v.optional(v.string()) },
  handler: async (ctx, { kind, slug }) => token(await freshness(ctx, kind, slug)),
});

export const card = internalQuery({
  args: { kind: kindValidator, slug: v.optional(v.string()), query: v.optional(v.string()) },
  handler: async (ctx, { kind, slug, query }): Promise<CardData> => {
    const base = { kind, version: token(await freshness(ctx, kind, slug)) };

    if (kind === "home") {
      // Newest day that has summaries, busiest channel first — the same recap
      // the landing page leads with.
      const newest = await ctx.db.query("channel_summaries").withIndex("by_date").order("desc").first();
      const sameDay = newest
        ? await ctx.db
            .query("channel_summaries")
            .withIndex("by_date", (q) => q.eq("date", newest.date))
            .collect()
        : [];
      sameDay.sort((a, b) => b.messageCount - a.messageCount);
      const top = sameDay[0];
      return {
        ...base,
        recap: top
          ? {
              date: top.date,
              channel: top.channelName,
              text: top.summaryText,
              messages: sameDay.reduce((n, r) => n + r.messageCount, 0),
              people: sameDay.reduce((n, r) => Math.max(n, r.activeUsers), 0),
            }
          : undefined,
        messages: await latestMessages(ctx, 2),
        stats: await stats(ctx),
      };
    }

    if (kind === "live") {
      return { ...base, messages: await latestMessages(ctx, 3), stats: await stats(ctx) };
    }

    if (kind === "channel") {
      const c = slug
        ? await ctx.db.query("channels").withIndex("by_slug", (q) => q.eq("slug", slug)).unique()
        : null;
      if (!c) return { ...base, missing: true };
      const rows = await ctx.db
        .query("messages")
        .withIndex("by_channel_time", (q) => q.eq("channelId", c._id))
        .order("desc")
        .filter((q) => q.eq(q.field("hiddenAt"), undefined))
        .take(3);
      return {
        ...base,
        channel: {
          name: c.name,
          topic: c.topic ?? null,
          messageCount: c.messageCount,
          isThread: c.isThread ?? false,
        },
        messages: rows.map((m) => ({
          author: m.authorDisplay.name,
          channel: null,
          content: m.content,
          createdAt: m.createdAt,
        })),
      };
    }

    if (kind === "leaderboard") {
      const rows = await ctx.db.query("leaderboard_mirror").withIndex("by_points").order("desc").take(3);
      const leaders = [];
      for (const [i, r] of rows.entries()) {
        // The mirror carries the Discord display name, which can be entirely
        // emoji or a script the card has no glyphs for. Where the member has
        // claimed their web account, their handle is a name we can draw.
        const user = await ctx.db
          .query("users")
          .withIndex("by_discordUserId", (q) => q.eq("discordUserId", r.discordUserId))
          .unique();
        leaders.push({
          rank: i + 1,
          name: r.name,
          alias: user?.handle ?? user?.displayName ?? null,
          points: r.points,
        });
      }
      return { ...base, leaders };
    }

    if (kind === "resources") {
      const rows = await ctx.db.query("link_resources").withIndex("by_createdAt").order("desc").take(4);
      return {
        ...base,
        resources: rows.map((r) => {
          let site = r.siteName ?? "";
          if (!site) {
            try {
              site = new URL(r.url).hostname.replace(/^www\./, "");
            } catch {
              site = r.url;
            }
          }
          return { title: r.title ?? r.url, site };
        }),
      };
    }

    if (kind === "search") {
      const q = (query ?? "").trim();
      if (!q) return { ...base, query: "" };
      // 21 so the card can say "20+" without counting the whole index.
      const hits = await ctx.db
        .query("messages")
        .withSearchIndex("search_content", (s) => s.search("content", q))
        .filter((f) => f.eq(f.field("hiddenAt"), undefined))
        .take(21);
      return { ...base, query: q, results: hits.length, messages: hits.slice(0, 2).map((m) => ({
        author: m.authorDisplay.name,
        channel: null,
        content: m.content,
        createdAt: m.createdAt,
      })) };
    }

    return { ...base, stats: await stats(ctx) };
  },
});
