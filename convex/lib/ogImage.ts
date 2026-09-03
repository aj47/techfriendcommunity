// Reading a page's og:image without spending a Firecrawl credit. Used by link
// enrichment (convex/links.ts) and by the GIF redirect (convex/gif.ts), which
// needs the same trick for a different reason: a Tenor page is not an image.

// Attribute values are not always quoted: Docusaurus and other SSR head helpers
// emit `<meta property=og:image content=https://…/>` bare, and requiring quotes
// silently found nothing on every page they render. The lookahead is what keeps
// an unquoted `og:image:alt` from matching as `og:image`.
const OG_IMAGE_TAG =
  /<meta[^>]+(?:property|name)\s*=\s*["']?(?:og:image(?::secure_url|:url)?|twitter:image(?::src)?)["']?(?=[\s/>])[^>]*>/i;
const CONTENT_ATTR = /content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const UA = "techfriendcommunity-link-preview/1.0 (+https://www.techfriendcommunity.com)";

// Only http(s), and only absolute after resolving against the page: a relative
// or data: og:image would render as a broken card at best.
export function safeImageUrl(raw: string | undefined, base?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return u.href.slice(0, 2000);
  } catch {
    return undefined;
  }
}

export async function fetchOgImage(pageUrl: string): Promise<string | undefined> {
  try {
    const res = await fetch(pageUrl, {
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return undefined;
    if (!(res.headers.get("content-type") ?? "").includes("html")) return undefined;
    // og tags live in <head>, so the first slice of the document is all this
    // needs — and the cap keeps one enormous page from being read in full.
    const html = (await res.text()).slice(0, 300_000);
    const content = html.match(OG_IMAGE_TAG)?.[0].match(CONTENT_ATTR);
    return safeImageUrl(content ? (content[1] ?? content[2] ?? content[3]) : undefined, res.url || pageUrl);
  } catch {
    // A dead host, a redirect loop, a timeout: a missing preview image is not
    // worth failing an enrichment that otherwise succeeded.
    return undefined;
  }
}

