// What a shared link knows about itself: title, description, site name — read
// straight out of the page's own <head>.
//
// This replaced Firecrawl. A crawl gave better summaries (an LLM reading the
// whole article, plus topic tags) but every link cost a credit, and the credits
// ran out, which left the resources page filling up with rows titled nothing at
// all. A page's own og: tags are what it wants a link preview to say, they are
// one request, and they are free — so links stay legible without a bill.
//
// Also used by the GIF redirect (convex/gif.ts) via fetchOgImage, which needs
// the image for a different reason: a Tenor page is not an image.

// Attribute values are not always quoted: Docusaurus and other SSR head helpers
// emit `<meta property=og:image content=https://…/>` bare, and requiring quotes
// silently found nothing on every page they render. The lookahead is what keeps
// an unquoted `og:image:alt` from matching as `og:image`.
function metaTag(names: string) {
  return new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']?(?:${names})["']?(?=[\\s/>])[^>]*>`, "i");
}

const OG_IMAGE_TAG = metaTag("og:image(?::secure_url|:url)?|twitter:image(?::src)?");
const OG_TITLE_TAG = metaTag("og:title|twitter:title");
const OG_DESC_TAG = metaTag("og:description|twitter:description|description");
const OG_SITE_TAG = metaTag("og:site_name|application-name");
const CONTENT_ATTR = /content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const TITLE_EL = /<title[^>]*>([\s\S]*?)<\/title>/i;
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

// Head text is HTML, so an apostrophe in a title arrives as &#39; and an
// ampersand as &amp;. Only the five named entities that are mandatory in
// attribute values, plus numeric refs — a full entity table would be a
// dependency for the sake of &hellip;.
function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function clean(raw: string | undefined, max: number): string | undefined {
  if (!raw) return undefined;
  const text = decodeEntities(raw).replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : undefined;
}

function contentOf(html: string, tag: RegExp): string | undefined {
  const m = html.match(tag)?.[0].match(CONTENT_ATTR);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

export type PageMeta = {
  title?: string;
  description?: string;
  siteName?: string;
  imageUrl?: string;
};

// Resolves to null when the page could not be read at all — a dead host, a
// redirect loop, a timeout, a non-HTML response. The caller distinguishes that
// from "read it, it just has no description": one is a failure worth recording
// on the row, the other is an ordinary page.
export async function fetchPageMeta(pageUrl: string): Promise<PageMeta | null> {
  try {
    const res = await fetch(pageUrl, {
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").includes("html")) return null;
    // These tags live in <head>, so the first slice of the document is all this
    // needs — and the cap keeps one enormous page from being read in full.
    const html = (await res.text()).slice(0, 300_000);
    const base = res.url || pageUrl;
    let host: string | undefined;
    try {
      host = new URL(base).hostname.replace(/^www\./, "");
    } catch {
      // Stored URLs are normalized on write, so this should not happen.
    }
    return {
      title: clean(contentOf(html, OG_TITLE_TAG) ?? html.match(TITLE_EL)?.[1], 200),
      description: clean(contentOf(html, OG_DESC_TAG), 1500),
      siteName: clean(contentOf(html, OG_SITE_TAG), 100) ?? host,
      imageUrl: safeImageUrl(contentOf(html, OG_IMAGE_TAG), base),
    };
  } catch {
    return null;
  }
}

export async function fetchOgImage(pageUrl: string): Promise<string | undefined> {
  return (await fetchPageMeta(pageUrl))?.imageUrl;
}
