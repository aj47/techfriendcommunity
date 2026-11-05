import { v, ConvexError } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isCrawlableResource, normalizeUrl } from "./lib/urls";
import { fetchPageMeta } from "./lib/pageMeta";
import { optionalUser, requireUser } from "./lib/requireUser";
import { rateLimiter } from "./lib/rateLimits";

// One field for the search index to cover. Searching only `summary` missed
// every link whose topic lives in its title, its tags, or its domain — which is
// most of the ways people actually look for a link they half-remember.
function searchTextFor(r: {
  url: string; title?: string; summary?: string; siteName?: string; tags?: string[];
}): string {
  let host = "";
  try {
    host = new URL(r.url).hostname.replace(/^www\./, "");
  } catch {
    // Stored URLs are normalized on write, so this should not happen; building
    // search text is never worth throwing over if one ever isn't.
  }
  return [r.title, r.summary, r.siteName, host, (r.tags ?? []).join(" "), r.url]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .slice(0, 4000);
}

// Reddit's hot score, in its own units: the vote count's order of magnitude
// plus the post's age measured in 45000-second steps, from reddit's epoch. The
// shape is what matters — a link needs ten times the votes to hold its place
// against something half a day newer — so one upvote on a fresh link outranks
// a stale link with a handful, and nothing ever needs re-scoring on a timer.
const HOT_EPOCH_MS = 1_134_028_003_000;
const HOT_WINDOW_MS = 45_000_000;

export function hotRankOf(upvotes: number, createdAt: number): number {
  return Math.log10(Math.max(upvotes, 1)) + (createdAt - HOT_EPOCH_MS) / HOT_WINDOW_MS;
}

function view(r: {
  _id: Id<"link_resources">; url: string; title?: string; summary?: string; siteName?: string;
  tags: string[]; crawlStatus: "pending" | "done" | "failed"; createdAt: number;
  channelId?: Id<"channels">; upvotes?: number;
}) {
  return {
    id: r._id, url: r.url, title: r.title ?? null, summary: r.summary ?? null,
    siteName: r.siteName ?? null, tags: r.tags,
    crawlStatus: r.crawlStatus, createdAt: r.createdAt,
    // A row the vote backfill hasn't reached reads as zero rather than as a
    // hole the UI has to special-case.
    upvotes: r.upvotes ?? 0,
  };
}

// Record URLs shared in a message as pending resources and schedule enrichment.
export async function enqueueLinks(
  ctx: MutationCtx,
  args: { urls: string[]; messageId: Id<"messages">; channelId: Id<"channels">; userId?: Id<"users">; at: number },
) {
  let added = 0;
  for (const raw of args.urls) {
    if (!isCrawlableResource(raw)) continue;
    const url = normalizeUrl(raw);
    if (!url) continue;
    const existing = await ctx.db.query("link_resources").withIndex("by_url", (q) => q.eq("url", url)).unique();
    if (existing) continue;
    const resourceId = await ctx.db.insert("link_resources", {
      url, tags: [], sharedByUserId: args.userId, messageId: args.messageId, channelId: args.channelId,
      crawlStatus: "pending", createdAt: args.at, searchText: searchTextFor({ url }),
      upvotes: 0, hotRank: hotRankOf(0, args.at),
    });
    await ctx.scheduler.runAfter(0, internal.links.enrich, { resourceId });
    added++;
  }
  return added;
}

export const sortValidator = v.union(v.literal("hot"), v.literal("new"), v.literal("top"));

// `sort` defaults to "new" so the callers that mean "the latest links" — the
// recap pane and its tease — keep reading exactly as they did. The Resources
// page asks for "hot".
export const list = query({
  args: { limit: v.optional(v.number()), sort: v.optional(sortValidator) },
  handler: async (ctx, { limit, sort = "new" }) => {
    const index = sort === "hot" ? "by_hotRank" : sort === "top" ? "by_upvotes" : "by_createdAt";
    const rows = await ctx.db.query("link_resources").withIndex(index).order("desc").take(Math.min(limit ?? 50, 200));
    return rows.map(view);
  },
});

// Which of the links on screen this member has already upvoted. One query for
// the whole page rather than a per-row lookup, and empty (not an error) when
// nobody is signed in, so the list renders the same for a visitor.
export const myUpvotes = query({
  args: {},
  handler: async (ctx) => {
    const user = await optionalUser(ctx);
    if (!user) return [];
    const votes = await ctx.db
      .query("link_votes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(1000);
    return votes.map((v) => v.resourceId);
  },
});

// Upvote, or take it back. The vote row's existence is the state, so this is
// idempotent per member: clicking twice leaves no vote and no drift in the
// count, and two clients racing resolve under Convex's transaction rather than
// both incrementing.
export const toggleUpvote = mutation({
  args: { resourceId: v.id("link_resources") },
  handler: async (ctx, { resourceId }) => {
    const user = await requireUser(ctx);
    const r = await ctx.db.get(resourceId);
    if (!r) throw new ConvexError({ code: "invalid", message: "That link is no longer here." });
    await rateLimiter.limit(ctx, "voteLink", { key: user._id, throws: true });
    const existing = await ctx.db
      .query("link_votes")
      .withIndex("by_resource_user", (q) => q.eq("resourceId", resourceId).eq("userId", user._id))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    } else {
      await ctx.db.insert("link_votes", { resourceId, userId: user._id, createdAt: Date.now() });
    }
    // Clamped at zero: a row whose stored count predates the backfill would
    // otherwise be able to go negative on the first un-vote.
    const upvotes = Math.max(0, (r.upvotes ?? 0) + (existing ? -1 : 1));
    await ctx.db.patch(resourceId, { upvotes, hotRank: hotRankOf(upvotes, r.createdAt) });
    return { upvotes, upvoted: !existing };
  },
});

export const byUrl = query({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    const n = normalizeUrl(url);
    if (!n) return null;
    const r = await ctx.db.query("link_resources").withIndex("by_url", (q) => q.eq("url", n)).unique();
    return r ? view(r) : null;
  },
});

// Searches every shared link, not just the crawled ones: a link whose crawl is
// pending or failed is still findable by its title or domain, and the UI shows
// its status. This is what the Resources filter box calls.
export const search = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { query: q, limit }) => {
    if (!q.trim()) return [];
    const rows = await ctx.db
      .query("link_resources")
      .withSearchIndex("search_text", (s) => s.search("searchText", q))
      .take(Math.min(limit ?? 20, 50));
    return rows.map(view);
  },
});

// Signed-in users can add a page by hand. Rate-limited because each call makes
// this deployment fetch a URL someone else chose.
export const requestSummary = mutation({
  args: { url: v.string() },
  handler: async (ctx, { url: raw }) => {
    const user = await requireUser(ctx);
    const url = normalizeUrl(raw);
    if (!url) throw new ConvexError({ code: "invalid", message: "That doesn't look like an http(s) URL." });
    // The same rule the Discord ingest applies. Without it, the summarize-link
    // tool was the one way a reaction GIF could still become a "resource".
    if (!isCrawlableResource(url)) {
      throw new ConvexError({
        code: "invalid",
        message: "That's an image, a clip or a GIF — resources are pages worth reading.",
      });
    }
    const existing = await ctx.db.query("link_resources").withIndex("by_url", (q) => q.eq("url", url)).unique();
    if (existing) {
      if (existing.crawlStatus === "failed") {
        await rateLimiter.limit(ctx, "summarizeLink", { key: user._id, throws: true });
        await ctx.db.patch(existing._id, { crawlStatus: "pending", failReason: undefined });
        await ctx.scheduler.runAfter(0, internal.links.enrich, { resourceId: existing._id });
      }
      return { resourceId: existing._id, status: existing.crawlStatus === "failed" ? "pending" : existing.crawlStatus };
    }
    await rateLimiter.limit(ctx, "summarizeLink", { key: user._id, throws: true });
    const now = Date.now();
    const resourceId = await ctx.db.insert("link_resources", {
      url, tags: [], sharedByUserId: user._id, crawlStatus: "pending", createdAt: now,
      searchText: searchTextFor({ url }),
      upvotes: 0, hotRank: hotRankOf(0, now),
    });
    await ctx.scheduler.runAfter(0, internal.links.enrich, { resourceId });
    return { resourceId, status: "pending" as const };
  },
});

export const get = internalQuery({
  args: { resourceId: v.id("link_resources") },
  handler: (ctx, { resourceId }) => ctx.db.get(resourceId),
});

export const finish = internalMutation({
  args: {
    resourceId: v.id("link_resources"),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    siteName: v.optional(v.string()),
  },
  handler: async (ctx, { resourceId, title, summary, siteName }) => {
    const r = await ctx.db.get(resourceId);
    if (!r) return;
    // Tags came from the crawl's LLM pass and nothing writes them now. The
    // rows that have them keep them, including in their search text.
    const next = {
      title: title?.slice(0, 200), summary: summary?.slice(0, 1500), siteName: siteName?.slice(0, 100),
      tags: r.tags,
    };
    await ctx.db.patch(resourceId, {
      ...next, crawlStatus: "done", failReason: undefined,
      searchText: searchTextFor({ url: r.url, ...next }),
    });
  },
});

// Idempotent backfill for rows written before `searchText` existed; without it
// they are invisible to the new index. Threads a cursor on purpose: these rows
// stay in place, so a repeated `.take()` would re-read the same page forever
// and silently backfill only the first N.
export const backfillSearchText = internalMutation({
  args: { cursor: v.optional(v.string()), updated: v.optional(v.number()) },
  handler: async (ctx, { cursor, updated = 0 }) => {
    const page = await ctx.db.query("link_resources").paginate({ cursor: cursor ?? null, numItems: 200 });
    let n = updated;
    for (const r of page.page) {
      const next = searchTextFor(r);
      if (r.searchText !== next) {
        await ctx.db.patch(r._id, { searchText: next });
        n++;
      }
    }
    if (page.isDone) {
      console.log("links: searchText backfill complete", { updated: n });
      return { updated: n, done: true };
    }
    await ctx.scheduler.runAfter(0, internal.links.backfillSearchText, {
      cursor: page.continueCursor, updated: n,
    });
    return { updated: n, done: false };
  },
});

// Rows written before voting existed have no upvotes and no hotRank. An
// unset indexed field sorts before every number in Convex, which on a
// descending "hot" page puts the entire pre-voting archive underneath the
// newest row — so this is what makes the ranking cover the whole table, not a
// cosmetic tidy-up. Cursored for the same reason as the searchText backfill:
// the rows it fixes stay where they are, so a repeated .take() would re-read
// the first page forever.
export const backfillVoteCounts = internalMutation({
  args: { cursor: v.optional(v.string()), updated: v.optional(v.number()) },
  handler: async (
    ctx,
    { cursor, updated = 0 },
  ): Promise<{ updated: number; done: boolean }> => {
    const page = await ctx.db.query("link_resources").paginate({ cursor: cursor ?? null, numItems: 200 });
    let n = updated;
    for (const r of page.page) {
      if (r.upvotes !== undefined && r.hotRank !== undefined) continue;
      const upvotes = r.upvotes ?? 0;
      await ctx.db.patch(r._id, { upvotes, hotRank: hotRankOf(upvotes, r.createdAt) });
      n++;
    }
    if (page.isDone) {
      console.log("links: vote-count backfill complete", { updated: n });
      return { updated: n, done: true };
    }
    await ctx.scheduler.runAfter(0, internal.links.backfillVoteCounts, {
      cursor: page.continueCursor, updated: n,
    });
    return { updated: n, done: false };
  },
});

// Deletes rows that today's rules would never have stored: reaction GIFs and
// raw attachments, which were only ever filtered at ingest, so anything shared
// before a host joined the list is still sitting in the table. Chains a page at
// a time, and re-reads the rule rather than hardcoding hosts, so running it
// again after the next host is added does the right thing.
export const pruneNonResources = internalMutation({
  args: { at: v.optional(v.string()), removed: v.optional(v.number()), seen: v.optional(v.number()) },
  handler: async (
    ctx,
    { at, removed = 0, seen = 0 },
  ): Promise<{ seen: number; removed: number; done: boolean }> => {
    const page = await ctx.db.query("link_resources").paginate({ cursor: at ?? null, numItems: 200 });
    let gone = removed;
    for (const r of page.page) {
      if (isCrawlableResource(r.url)) continue;
      // Votes are children of the link, not of the table: leaving them behind
      // would keep the voter's arrow lit for a row that no longer exists.
      const votes = await ctx.db
        .query("link_votes")
        .withIndex("by_resource_user", (q) => q.eq("resourceId", r._id))
        .collect();
      for (const vote of votes) await ctx.db.delete(vote._id);
      await ctx.db.delete(r._id);
      gone++;
    }
    const n = seen + page.page.length;
    if (page.isDone) {
      console.log("links: non-resource prune complete", { seen: n, removed: gone });
      return { seen: n, removed: gone, done: true };
    }
    await ctx.scheduler.runAfter(0, internal.links.pruneNonResources, { at: page.continueCursor, removed: gone, seen: n });
    return { seen: n, removed: gone, done: false };
  },
});

export const fail = internalMutation({
  args: { resourceId: v.id("link_resources"), reason: v.string() },
  handler: async (ctx, { resourceId, reason }) => {
    await ctx.db.patch(resourceId, { crawlStatus: "failed", failReason: reason.slice(0, 200) });
  },
});

// Read the page's own <head> for a title and description. One request, no
// credits — see lib/pageMeta for why this replaced the crawl.
export const enrich = internalAction({
  args: { resourceId: v.id("link_resources") },
  handler: async (ctx, { resourceId }) => {
    const r = await ctx.runQuery(internal.links.get, { resourceId });
    if (!r || r.crawlStatus !== "pending") return;
    const meta = await fetchPageMeta(r.url);
    if (!meta) {
      await ctx.runMutation(internal.links.fail, { resourceId, reason: "couldn't read that page" });
      return;
    }
    // A page with neither a title nor a description told us nothing, and a row
    // showing its bare URL forever is worse than one marked as unread — the
    // retry path (requestSummary on a failed row) can pick it up later.
    if (!meta.title && !meta.description) {
      await ctx.runMutation(internal.links.fail, { resourceId, reason: "no title or description" });
      return;
    }
    await ctx.runMutation(internal.links.finish, {
      resourceId,
      title: meta.title,
      summary: meta.description,
      siteName: meta.siteName,
    });
  },
});
