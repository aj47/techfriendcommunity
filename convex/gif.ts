import { httpAction } from "./_generated/server";
import { fetchOgImage } from "./lib/ogImage";
import { isGifHost } from "./lib/urls";

// A Tenor link is a page, not an image. "tenor.com/bf62P.gif" looks like one —
// it even ends in .gif — but it 301s to an HTML page, so the browser was being
// handed a document where an <img> expected pixels and drew a broken icon.
//
// This resolves the page to the media its og:image points at and redirects
// there, so the chat shows the GIF someone actually posted. It runs per view
// rather than at ingest so it works on every message already mirrored.
//
// Two things keep it from being an open proxy: only allow-listed GIF hosts are
// followed, and it redirects rather than streaming, so nothing is fetched
// through us — the browser goes to the CDN itself.
export const gifRedirect = httpAction(async (_ctx, req) => {
  const target = new URL(req.url).searchParams.get("u");
  if (!target) return new Response("missing u", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (parsed.protocol !== "https:" || !isGifHost(parsed.hostname)) {
    return new Response("host not allowed", { status: 403 });
  }

  const image = await fetchOgImage(parsed.href);
  // 404 rather than a placeholder: the client hides an image that fails, and
  // the message keeps the link, which is what it had before any of this.
  if (!image) return new Response("no media found", { status: 404 });

  return new Response(null, {
    status: 302,
    headers: {
      location: image,
      // A GIF's media URL does not change, so let the browser and the CDN in
      // front of us keep the answer rather than re-scraping on every render.
      "cache-control": "public, max-age=86400",
    },
  });
});
