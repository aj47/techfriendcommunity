import { v, ConvexError } from "convex/values";
import { FirecrawlClient } from "@firecrawl/firecrawl-convex";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isCrawlableResource, normalizeUrl } from "./lib/urls";
import { fetchOgImage, safeImageUrl } from "./lib/ogImage";
import { requireUser } from "./lib/requireUser";
import { rateLimiter } from "./lib/rateLimits";

const firecrawl = new FirecrawlClient(components.firecrawl);

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

function view(r: {
  _id: Id<"link_resources">; url: string; title?: string; summary?: string; siteName?: string;
  imageUrl?: string; tags: string[]; crawlStatus: "pending" | "done" | "failed"; createdAt: number;
  channelId?: Id<"channels">;
}) {
  return {
    id: r._id, url: r.url, title: r.title ?? null, summary: r.summary ?? null,
    siteName: r.siteName ?? null, imageUrl: r.imageUrl ?? null, tags: r.tags,
    crawlStatus: r.crawlStatus, createdAt: r.createdAt,
  };
}

// og:image, without spending a Firecrawl credit. Firecrawl returns one in its
// metadata for most pages; this is the fallback for the ones it doesn't, and
// the whole story for rows crawled before images were stored at all.
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
    });
    await ctx.scheduler.runAfter(0, internal.links.enrich, { resourceId });
    added++;
  }
  return added;
}

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db.query("link_resources").withIndex("by_createdAt").order("desc").take(Math.min(limit ?? 50, 200));
    return rows.map(view);
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

// Signed-in users can ask for a page to be summarized on demand. Rate-limited
// because each call spends Firecrawl credits.
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
    const resourceId = await ctx.db.insert("link_resources", {
      url, tags: [], sharedByUserId: user._id, crawlStatus: "pending", createdAt: Date.now(),
      searchText: searchTextFor({ url }),
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
    imageUrl: v.optional(v.string()),
    tags: v.array(v.string()),
  },
  handler: async (ctx, { resourceId, title, summary, siteName, imageUrl, tags }) => {
    const r = await ctx.db.get(resourceId);
    if (!r) return;
    const next = {
      title: title?.slice(0, 200), summary: summary?.slice(0, 1500), siteName: siteName?.slice(0, 100),
      tags: tags.slice(0, 6).map((t) => t.toLowerCase().slice(0, 30)),
    };
    await ctx.db.patch(resourceId, {
      ...next, imageUrl: safeImageUrl(imageUrl), crawlStatus: "done", failReason: undefined,
      // searchText deliberately ignores imageUrl: nobody searches for a CDN path.
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

// One-shot backfill for rows crawled before imageUrl existed: reads each page's
// <head> directly rather than re-crawling, so it costs no Firecrawl credits.
// imageAttemptedAt is stamped on every row it touches, so a page that simply
// has no og:image is not retried by the next run.
export const backfillImages = internalAction({
  args: { at: v.optional(v.string()), found: v.optional(v.number()), seen: v.optional(v.number()) },
  // Annotated because the handler schedules itself: without an explicit return
  // type its own type is part of its own inference and TypeScript gives up.
  handler: async (
    ctx,
    { at, found = 0, seen = 0 },
  ): Promise<{ seen: number; found: number; done: boolean }> => {
    const page = await ctx.runQuery(internal.links.pageWithoutImage, { at });
    let f = found;
    for (const row of page.rows) {
      const imageUrl = await fetchOgImage(row.url);
      if (imageUrl) f++;
      await ctx.runMutation(internal.links.setImage, { resourceId: row.id, imageUrl });
    }
    const n = seen + page.rows.length;
    if (page.isDone) {
      console.log("links: image backfill complete", { seen: n, found: f });
      return { seen: n, found: f, done: true };
    }
    await ctx.scheduler.runAfter(0, internal.links.backfillImages, { at: page.next, found: f, seen: n });
    return { seen: n, found: f, done: false };
  },
});

export const pageWithoutImage = internalQuery({
  args: { at: v.optional(v.string()) },
  handler: async (ctx, { at }) => {
    // 25 a time: each row costs one outbound fetch, and an action that tries to
    // pull hundreds of pages before returning is an action that times out.
    const page = await ctx.db.query("link_resources").paginate({ cursor: at ?? null, numItems: 25 });
    return {
      rows: page.page.filter((r) => !r.imageUrl && !r.imageAttemptedAt).map((r) => ({ id: r._id, url: r.url })),
      next: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const setImage = internalMutation({
  args: { resourceId: v.id("link_resources"), imageUrl: v.optional(v.string()) },
  handler: async (ctx, { resourceId, imageUrl }) => {
    await ctx.db.patch(resourceId, { imageUrl: safeImageUrl(imageUrl), imageAttemptedAt: Date.now() });
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

// Firecrawl does the real work: scrape the page and extract a structured summary.
export const enrich = internalAction({
  args: { resourceId: v.id("link_resources") },
  handler: async (ctx, { resourceId }) => {
    const r = await ctx.runQuery(internal.links.get, { resourceId });
    if (!r || r.crawlStatus !== "pending") return;
    try {
      const doc = await firecrawl.scrape(ctx, r.url, {
        formats: [
          "markdown",
          {
            type: "json",
            prompt: "Summarize this page for a developer community. Return JSON with: title (short), summary (one paragraph, 2-4 sentences), siteName, tags (3-5 short lowercase topic tags).",
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                summary: { type: "string" },
                siteName: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
              },
              required: ["title", "summary"],
            },
          },
        ],
        onlyMainContent: true,
        maxAge: 3_600_000,
      });
      const json = (doc.json ?? {}) as { title?: string; summary?: string; siteName?: string; tags?: string[] };
      const meta = (doc.metadata ?? {}) as {
        title?: string; description?: string; ogSiteName?: string; siteName?: string;
        ogImage?: string; "og:image"?: string; image?: string;
      };
      const summary = json.summary ?? meta.description ?? doc.markdown?.replace(/\s+/g, " ").slice(0, 400);
      const scraped = safeImageUrl(meta.ogImage ?? meta["og:image"] ?? meta.image, r.url);
      await ctx.runMutation(internal.links.finish, {
        resourceId,
        title: json.title ?? meta.title,
        summary,
        imageUrl: scraped ?? (await fetchOgImage(r.url)),
        siteName: json.siteName ?? meta.ogSiteName ?? meta.siteName ?? new URL(r.url).hostname,
        tags: Array.isArray(json.tags) ? json.tags.filter((t) => typeof t === "string") : [],
      });
    } catch (e) {
      const status = (e as { data?: { status?: number; message?: string } })?.data?.status;
      const reason = status === 402 ? "Firecrawl credits exhausted" : status === 429 ? "Firecrawl rate limited" : status ? `Firecrawl ${status}` : (e as Error)?.message ?? "crawl failed";
      console.warn("enrich failed", r.url, reason);
      await ctx.runMutation(internal.links.fail, { resourceId, reason });
    }
  },
});
