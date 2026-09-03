const URL_RE = /https?:\/\/[^\s<>()\[\]"']+/gi;
const TRACKING = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "ref", "ref_src",
]);

// Extract unique, normalized http(s) URLs from message text.
export function extractUrls(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.match(URL_RE) ?? []) {
    const cleaned = raw.replace(/[.,;:!?)]+$/, "");
    const normalized = normalizeUrl(cleaned);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING.has(key.toLowerCase())) u.searchParams.delete(key);
    }
    u.hostname = u.hostname.toLowerCase();
    let s = u.toString();
    if (s.endsWith("?")) s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
}

const NON_RESOURCE_HOSTS = new Set([
  "cdn.discordapp.com",
  "media.discordapp.net",
  "images-ext-1.discordapp.net",
  "images-ext-2.discordapp.net",
  "i.imgur.com",
]);

// Hosts that only ever serve a reaction GIF, matched with their subdomains
// (tenor.com/view/..., media.tenor.com/..., c.tenor.com/...). The extension
// rule below never catches these: a Tenor share is a page whose path ends in
// an id, not in ".gif". Resources are meant to be things worth reading.
const GIF_HOSTS = ["tenor.com", "giphy.com", "gfycat.com", "tenor.co"];

const NON_RESOURCE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|mp4|mov|webm|mp3|wav|ogg|zip|rar)$/i;

// Whether a URL is worth crawling/summarizing as a shared "resource" — i.e.
// a link to a page worth reading, not an image, a clip, or a reaction GIF.
// Discord uploads any pasted image or clip to its own CDN, and that URL
// shows up in extractUrls() alongside real links; a raw attachment has no
// content for Firecrawl to summarize and isn't what "resources" means here.
export function isCrawlableResource(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    if (NON_RESOURCE_HOSTS.has(host)) return false;
    if (GIF_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return false;
    if (NON_RESOURCE_EXT.test(u.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}
