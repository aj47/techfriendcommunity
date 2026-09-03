// GET /og/<card>.png — the link-preview card for a route, rendered on demand
// from whatever the community said most recently.
//
// This is the only endpoint an unfurler ever fetches, and it is fetched by
// robots with short patience and no retry: it answers in one render (~150ms
// warm) and, if anything at all goes wrong, redirects to the static card in
// public/og.png rather than handing back a broken image.
import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { cardSvg } from "./card";
import { renderPng } from "./render";
import { parseCardPath } from "./routes";

export const ogImage = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const route = parseCardPath(url);
  try {
    const data = await ctx.runQuery(internal.og.data.card, {
      kind: route.kind,
      slug: route.slug,
      query: route.query,
    });
    const png = await renderPng(cardSvg(data, Date.now()));
    return new Response(png as unknown as BodyInit, {
      headers: {
        "content-type": "image/png",
        // A URL carrying ?v= names one version of the content, so it can be
        // cached hard; without it the card is whatever is current, and an hour
        // is short enough to stay honest.
        "cache-control": url.searchParams.has("v")
          ? "public, max-age=604800, s-maxage=604800, immutable"
          : "public, max-age=3600, s-maxage=3600",
        // Some unfurlers keep the card under this name; keep it stable.
        "content-disposition": 'inline; filename="techfriendcommunity.png"',
      },
    });
  } catch (e) {
    console.error("og: card render failed", route.kind, e);
    const origin = (process.env.SITE_URL ?? url.origin).replace(/\/+$/, "");
    return new Response(null, { status: 302, headers: { location: `${origin}/og.png` } });
  }
});
