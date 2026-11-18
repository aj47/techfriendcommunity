import { v } from "convex/values";
import { httpAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

const names = ["LCP", "INP", "CLS"] as const;
const pages = new Set(["home", "chat", "channel", "resources", "search", "leaderboard", "settings", "signin", "other"]);
const devices = ["mobile", "tablet", "desktop"] as const;
const cohorts = ["visitor", "member"] as const;
const sampleValidator = {
  name: v.union(v.literal("LCP"), v.literal("INP"), v.literal("CLS")),
  value: v.number(),
  page: v.string(),
  device: v.union(v.literal("mobile"), v.literal("tablet"), v.literal("desktop")),
  cohort: v.union(v.literal("visitor"), v.literal("member")),
};

// The browser sends only three possible metrics and coarse groups. The endpoint
// refuses arbitrary routes or huge values before it reaches a database write.
export const collectVital = httpAction(async (ctx, req) => {
  const origin = req.headers.get("origin");
  if (origin && origin !== "https://www.techfriendcommunity.com") return new Response(null, { status: 403 });
  if (!req.headers.get("content-type")?.startsWith("application/json")) return new Response(null, { status: 415 });
  const body = await req.text();
  if (body.length > 512) return new Response(null, { status: 413 });
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!names.includes(data.name as typeof names[number]) ||
      typeof data.value !== "number" || !Number.isFinite(data.value) || data.value < 0 ||
      data.value > (data.name === "CLS" ? 20 : 120000) ||
      !pages.has(data.page as string) ||
      !devices.includes(data.device as typeof devices[number]) ||
      !cohorts.includes(data.cohort as typeof cohorts[number])) {
    return new Response(null, { status: 400 });
  }
  await ctx.runMutation(internal.vitals.record, {
    name: data.name as "LCP" | "INP" | "CLS",
    value: data.value,
    page: data.page as string,
    device: data.device as typeof devices[number],
    cohort: data.cohort as typeof cohorts[number],
  });
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
});

export const record = internalMutation({
  args: sampleValidator,
  handler: async (ctx, sample) => ctx.db.insert("vital_samples", { ...sample, createdAt: Date.now() }),
});

// Run with `npx convex run vitals:summary` after field samples arrive. The
// capped recent window keeps this diagnostic query cheap at any traffic level.
export const summary = internalQuery({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days = 7 }) => {
    const cutoff = Date.now() - Math.min(Math.max(days, 1), 30) * 86400000;
    const rows = await ctx.db.query("vital_samples")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", cutoff))
      .order("desc").take(1000);
    const groups = new Map<string, number[]>();
    for (const row of rows) {
      const key = `${row.page}/${row.device}/${row.cohort}/${row.name}`;
      const values = groups.get(key) ?? [];
      values.push(row.value);
      groups.set(key, values);
    }
    return {
      samples: rows.length,
      capped: rows.length === 1000,
      groups: [...groups].map(([group, values]) => {
        values.sort((a, b) => a - b);
        return { group, count: values.length, p75: values[Math.ceil(values.length * 0.75) - 1] };
      }).sort((a, b) => a.group.localeCompare(b.group)),
    };
  },
});

export const sweep = internalMutation({
  args: { batch: v.optional(v.number()) },
  handler: async (ctx, { batch = 0 }) => {
    const cutoff = Date.now() - 30 * 86400000;
    const rows = await ctx.db.query("vital_samples")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff)).take(400);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 400 && batch < 100) {
      await ctx.scheduler.runAfter(0, internal.vitals.sweep, { batch: batch + 1 });
    }
    return { deleted: rows.length, done: rows.length < 400 };
  },
});
