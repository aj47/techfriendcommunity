// Checks the two things that can silently break unfurls and icons:
//
//  1. the marker block in the BUILT index.html still matches the regex
//     convex/staticSite.ts uses, and every og:image/twitter tag lives inside
//     it, so a per-route rewrite replaces them rather than leaving a stale copy;
//  2. every root-level asset in the bundle has a route in convex/http.ts. That
//     router has no catch-all, so a bundled-but-unrouted file answers "No
//     matching routes found" — which is exactly how og.png 404'd in production
//     on the first deploy despite being embedded correctly.
import { readFileSync } from "fs";

const html = readFileSync("dist/index.html", "utf8");
const src = readFileSync("convex/staticSite.ts", "utf8");
const routes = readFileSync("convex/http.ts", "utf8");
const assets = readFileSync("convex/staticAssets.generated.ts", "utf8");

// Pull the real regexes out of the server source instead of retyping them.
const blockLiteral = src.match(/const META_BLOCK = (\/.*\/);/)[1];
const META_BLOCK = new RegExp(blockLiteral.slice(1, -1));
const TITLE_TAG = /<title>[\s\S]*?<\/title>/;

const fail = [];
const ok = [];

if (!META_BLOCK.test(html)) fail.push("META_BLOCK does not match the built HTML (markers stripped by the build)");
else ok.push("META_BLOCK matches the built HTML");

// Stand in for renderMeta's output and confirm nothing it emits survives twice.
const rewritten = html.replace(META_BLOCK, "<title>T</title><meta property=\"og:image\" content=\"X\" /><meta name=\"twitter:card\" content=\"summary_large_image\" /><meta name=\"twitter:image\" content=\"X\" />");

for (const [label, re, want] of [
  ["og:image", /property="og:image"/g, 1],
  ["og:image:width", /property="og:image:width"/g, 0],
  ["twitter:card", /name="twitter:card"/g, 1],
  ["twitter:image", /name="twitter:image"/g, 1],
  ["title", /<title>/g, 1],
]) {
  const n = (rewritten.match(re) ?? []).length;
  if (n === want) ok.push(`after rewrite, ${label} appears ${n}x`);
  else fail.push(`after rewrite, ${label} appears ${n}x, expected ${want}`);
}

// The documented fallback: if the markers ever do get stripped, the title
// regex must not find a <title> inside a comment.
const firstTitle = html.match(TITLE_TAG);
if (firstTitle && html.indexOf(firstTitle[0]) > html.indexOf("<!--meta:start-->")) ok.push("fallback TITLE_TAG hits the real title, not a commented one");
else fail.push("fallback TITLE_TAG would match something before the meta block");

// Bundled root assets must each be routed. /index.html is the SPA fallback and
// /assets/* is covered by a pathPrefix route, so both are exempt.
const bundled = [...assets.matchAll(/^  "(\/[^"]+)":/gm)].map((m) => m[1]);
const routed = new Set([...routes.matchAll(/path: "(\/[^"]*)"/g)].map((m) => m[1]));
for (const p of bundled) {
  if (p === "/index.html" || p.startsWith("/assets/")) continue;
  if (routed.has(p)) ok.push(`${p} is bundled and routed`);
  else fail.push(`${p} is in the bundle but has no route in convex/http.ts — it will 404`);
}

// And every icon the head references must actually be bundled.
for (const p of html.matchAll(/(?:href|content)="(\/[^"]+\.(?:png|ico|svg|webmanifest))"/g)) {
  if (bundled.includes(p[1])) ok.push(`head reference ${p[1]} is in the bundle`);
  else fail.push(`head references ${p[1]} but it is not in the bundle`);
}

for (const o of ok) console.log("  ok   " + o);
for (const f of fail) console.log("  FAIL " + f);
console.log(fail.length ? `\n${fail.length} FAILURES` : "\nall checks passed");
process.exit(fail.length ? 1 : 0);
