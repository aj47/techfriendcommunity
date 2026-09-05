// Renders the link-preview cards to PNGs from sample data, without a
// deployment. The card layout is pure — convex/og/card.ts turns data into SVG
// and convex/og/render.ts rasterizes it — so both run here exactly as they do
// in production, which makes this the place to check a design change or a
// nasty string (emoji, CJK, a 2000-character message) before deploying.
//
//   npx tsx scripts/preview-og.ts [outDir]
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { cardSvg } from "../convex/og/card";
import { renderPng } from "../convex/og/render";
import type { CardData } from "../convex/og/data";

const out = process.argv[2] ?? "og-preview";
const now = Date.parse("2026-09-03T19:00:00Z");
const min = 60_000;

const room = (name: string, isThread = false) => ({ name, isThread });

const RECAP =
  "## Highlights\n- Someone shipped a Convex component that mirrors a chat server into a public feed\n" +
  "- Long debate about whether Convex components should own their own schema\n" +
  "- Three people volunteered to test the AgentMail digest before Friday\n";

const SAMPLES: Record<string, CardData> = {
  home: {
    kind: "home",
    version: "x",
    recap: { date: "2026-09-03", channel: "general", text: RECAP, messages: 412, people: 37 },
    messages: [
      {
        author: "kestrel",
        channel: room("general"),
        content: "the new card renders straight out of convex, no vercel function in the middle",
        createdAt: now - 4 * min,
      },
      {
        author: "毛玉",
        channel: room("build-log", true),
        content: "🎉 shipped it — https://www.techfriendcommunity.com/channels/build-log?ref=share",
        createdAt: now - 26 * min,
      },
    ],
    stats: { channels: 14, messages: 128_402, members: 863 },
  },
  "home-no-recap": {
    kind: "home",
    version: "x",
    messages: [{ author: "ana", channel: room("general"), content: "morning", createdAt: now - min }],
    stats: { channels: 14, messages: 128_402, members: 863 },
  },
  live: {
    kind: "live",
    version: "x",
    messages: [
      {
        author: "someone-with-a-really-long-handle-here",
        channel: room("help"),
        content:
          "I have a question about the retention sweep: if channels.messageCount is a lifetime counter and the sweep deletes rows older than the window, does the channel rail end up promising more history than the archive actually has? asking because the number looked off to me this morning",
        createdAt: now - 40_000,
      },
      { author: "bo", channel: room("random"), content: "😂😂😂", createdAt: now - 3 * min },
      {
        author: "ムギ",
        channel: room("shipping fast", true),
        content: "<@1234567890> take a look at <#987654> when you get a sec — the ||spoiler|| bit is fixed",
        createdAt: now - 55 * min,
      },
    ],
    stats: { channels: 14, messages: 128_402, members: 863 },
  },
  channel: {
    kind: "channel",
    version: "x",
    channel: {
      name: "general",
      topic: "Anything and everything techfren. Be kind, keep it on topic, and put long code in a thread.",
      messageCount: 84_213,
      isThread: false,
    },
    messages: [{ author: "kestrel", channel: null, content: "the og cards are live", createdAt: now - 8 * min }],
  },
  "channel-thread": {
    kind: "channel",
    version: "x",
    channel: { name: "Dynamic OG cards, from Convex", topic: null, messageCount: 47, isThread: true },
    messages: [
      { author: "kestrel", channel: null, content: "resvg in wasm, 120ms a card", createdAt: now - 2 * min },
      { author: "ana", channel: null, content: "no external render service at all?", createdAt: now - 9 * min },
    ],
  },
  "channel-missing": { kind: "channel", version: "x", missing: true },
  leaderboard: {
    kind: "leaderboard",
    version: "x",
    leaders: [
      { rank: 1, name: "kestrel", points: 12_480 },
      { rank: 2, name: "a-very-long-discord-display-name-indeed", points: 9_120 },
      { rank: 3, name: "毛玉", points: 4_005 },
    ],
  },
  resources: {
    kind: "resources",
    version: "x",
    resources: [
      { title: "Convex components: schema ownership and why it matters for hackathon speed", site: "stack.convex.dev" },
      { title: "Reactive queries: keeping a page live without polling", site: "docs.convex.dev" },
      { title: "AgentMail", site: "agentmail.to" },
    ],
  },
  search: {
    kind: "search",
    version: "x",
    query: "convex components schema",
    results: 21,
    messages: [
      {
        author: "ana",
        channel: null,
        content: "components own their schema, that's the whole point of the boundary",
        createdAt: now - 3 * 3600_000,
      },
    ],
  },
  site: { kind: "site", version: "x", stats: { channels: 14, messages: 128_402, members: 863 } },
};

mkdirSync(out, { recursive: true });
for (const [name, data] of Object.entries(SAMPLES)) {
  const t0 = Date.now();
  const png = await renderPng(cardSvg(data, now));
  writeFileSync(join(out, `${name}.png`), png);
  console.log(`${name.padEnd(16)} ${String(png.length).padStart(7)} bytes  ${Date.now() - t0}ms`);
}
console.log(`\n${Object.keys(SAMPLES).length} cards in ${out}/`);
