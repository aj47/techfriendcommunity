import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { v } from "convex/values";
import { normalizeUrl } from "./lib/urls";

// Record URLs shared in a message as pending resources. The Firecrawl
// enrichment action (P4) picks these up; until then they display as "crawling…".
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
    await ctx.db.insert("link_resources", {
      url,
      tags: [],
      sharedByUserId: args.userId,
      messageId: args.messageId,
      channelId: args.channelId,
      crawlStatus: "pending",
      createdAt: args.at,
    });
    added++;
  }
  return added;
}

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db.query("link_resources").withIndex("by_createdAt").order("desc").take(Math.min(limit ?? 50, 200));
    return rows.map((r) => ({
      id: r._id, url: r.url, title: r.title ?? null, summary: r.summary ?? null,
      siteName: r.siteName ?? null, tags: r.tags, crawlStatus: r.crawlStatus, createdAt: r.createdAt,
    }));
  },
});
