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
