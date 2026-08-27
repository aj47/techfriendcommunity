import { v, ConvexError } from "convex/values";
import { FirecrawlClient } from "@firecrawl/firecrawl-convex";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { normalizeUrl } from "./lib/urls";
import { requireUser } from "./lib/requireUser";
import { rateLimiter } from "./lib/rateLimits";
import { awardPoints } from "./points";

const firecrawl = new FirecrawlClient(components.firecrawl);

function view(r: {
  _id: Id<"link_resources">; url: string; title?: string; summary?: string; siteName?: string;
  tags: string[]; crawlStatus: "pending" | "done" | "failed"; createdAt: number; channelId?: Id<"channels">;
}) {
  return {
    id: r._id, url: r.url, title: r.title ?? null, summary: r.summary ?? null,
    siteName: r.siteName ?? null, tags: r.tags, crawlStatus: r.crawlStatus, createdAt: r.createdAt,
  };
}

// Record URLs shared in a message as pending resources and schedule enrichment.
export async function enqueueLinks(
  ctx: MutationCtx,
  args: { urls: string[]; messageId: Id<"messages">; channelId: Id<"channels">; userId?: Id<"users">; at: number },
) {
  let added = 0;
  for (const raw of args.urls) {
    const url = normalizeUrl(raw);
    if (!url) continue;
    const existing = await ctx.db.query("link_resources").withIndex("by_url", (q) => q.eq("url", url)).unique();
    if (existing) continue;
    const resourceId = await ctx.db.insert("link_resources", {
      url, tags: [], sharedByUserId: args.userId, messageId: args.messageId, channelId: args.channelId,
      crawlStatus: "pending", createdAt: args.at,
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

export const search = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { query: q, limit }) => {
    if (!q.trim()) return [];
    const rows = await ctx.db
      .query("link_resources")
      .withSearchIndex("search_resources", (s) => s.search("summary", q).eq("crawlStatus", "done"))
      .take(Math.min(limit ?? 20, 50));
    return rows.map(view);
  },
});

// Signed-in users (and the summarize-link WebMCP tool) can ask for a page to be
// summarized. Rate-limited because each call spends Firecrawl credits.
export const requestSummary = mutation({
  args: { url: v.string() },
  handler: async (ctx, { url: raw }) => {
    const user = await requireUser(ctx);
    const url = normalizeUrl(raw);
    if (!url) throw new ConvexError({ code: "invalid", message: "That doesn't look like an http(s) URL." });
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
    tags: v.array(v.string()),
  },
  handler: async (ctx, { resourceId, title, summary, siteName, tags }) => {
    const r = await ctx.db.get(resourceId);
    if (!r) return;
    await ctx.db.patch(resourceId, {
      title: title?.slice(0, 200), summary: summary?.slice(0, 1500), siteName: siteName?.slice(0, 100),
      tags: tags.slice(0, 6).map((t) => t.toLowerCase().slice(0, 30)), crawlStatus: "done", failReason: undefined,
    });
    if (r.sharedByUserId) {
      await awardPoints(ctx, { userId: r.sharedByUserId, kind: "link_shared", dedupeKey: `link:${resourceId}`, at: r.createdAt });
    }
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
      const meta = (doc.metadata ?? {}) as { title?: string; description?: string; ogSiteName?: string; siteName?: string };
      const summary = json.summary ?? meta.description ?? doc.markdown?.replace(/\s+/g, " ").slice(0, 400);
      await ctx.runMutation(internal.links.finish, {
        resourceId,
        title: json.title ?? meta.title,
        summary,
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
