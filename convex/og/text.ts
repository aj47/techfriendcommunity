// Text measurement, wrapping and cleanup for the dynamic link-preview cards.
//
// resvg rasterizes an SVG; it will not lay text out for us and there is no
// canvas in the Convex runtime to measure with. So the card measures against
// the advance widths of the exact font subsets it renders with, generated
// alongside them by scripts/gen-og-runtime.mjs. Kerning is ignored, which
// rounds every measurement slightly long — the safe direction for a card whose
// text must not run off the edge.
import { fontWidths } from "../ogRuntime.generated";

export type Face = "regular" | "medium" | "semibold" | "display";

const FONT_FILE: Record<Face, string> = {
  regular: "Inter-Regular",
  medium: "Inter-Medium",
  semibold: "Inter-SemiBold",
  display: "InterDisplay-SemiBold",
};

// The family/weight pair each face is asked for in the SVG. resvg matches these
// against the name tables of the buffers it was given, so they have to name a
// font that is actually in fontsBase64 — a miss renders as blank, not as a
// fallback face.
const FONT_ATTRS: Record<Face, string> = {
  regular: `font-family="Inter" font-weight="400"`,
  medium: `font-family="Inter" font-weight="500"`,
  semibold: `font-family="Inter" font-weight="600"`,
  display: `font-family="Inter Display" font-weight="600"`,
};

export function faceAttrs(face: Face): string {
  return FONT_ATTRS[face];
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Codepoints the subsets cover. Anything else — emoji above all — has no glyph
// and resvg draws nothing for it, so it is dropped rather than left to punch a
// hole in a line the layout already measured.
function supported(cp: number): boolean {
  return (
    (cp >= 0x20 && cp <= 0x7e) ||
    (cp >= 0xa0 && cp <= 0xff) ||
    (cp >= 0x2010 && cp <= 0x2027) ||
    (cp >= 0x2030 && cp <= 0x2044) ||
    cp === 0x20ac ||
    cp === 0x2122 ||
    (cp >= 0x2190 && cp <= 0x2193) ||
    cp === 0x2713 ||
    cp === 0x25cf
  );
}

export function measure(text: string, face: Face, size: number, tracking = 0): number {
  const table = fontWidths[FONT_FILE[face]] ?? {};
  const fallback = table["110"] ?? 550; // "n"
  let units = 0;
  let glyphs = 0;
  for (const ch of text) {
    units += table[String(ch.codePointAt(0))] ?? fallback;
    glyphs++;
  }
  return (units * size) / 1000 + tracking * Math.max(0, glyphs - 1);
}

/** One line, ellipsized in the middle of a word if that is where it runs out. */
export function fit(text: string, face: Face, size: number, maxWidth: number, tracking = 0): string {
  if (measure(text, face, size, tracking) <= maxWidth) return text;
  const chars = [...text];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measure(chars.slice(0, mid).join("") + "…", face, size, tracking) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return chars.slice(0, lo).join("").trimEnd() + "…";
}

/**
 * Greedy word wrap to `maxLines`; the last line is ellipsized when there is
 * more text than fits. A single word wider than the line (a pasted path, say)
 * is broken by character rather than allowed to run past the edge.
 */
export function wrap(
  text: string,
  face: Face,
  size: number,
  maxWidth: number,
  maxLines: number,
  tracking = 0,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  const lastLine = (rest: string) => [...lines, fit(rest, face, size, maxWidth, tracking)];
  const wide = (s: string) => measure(s, face, size, tracking) > maxWidth;
  let line = "";

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = line ? `${line} ${word}` : word;
    if (!wide(candidate)) {
      line = candidate;
      continue;
    }
    if (lines.length + 1 === maxLines) return lastLine([line, ...words.slice(i)].filter(Boolean).join(" "));
    if (line) {
      lines.push(line);
      line = "";
    }
    if (!wide(word)) {
      line = word;
      continue;
    }
    const chars = [...word];
    let chunk = "";
    for (let j = 0; j < chars.length; j++) {
      if (chunk && wide(chunk + chars[j])) {
        if (lines.length + 1 === maxLines) {
          const tail = words.slice(i + 1);
          return lastLine([chunk + chars.slice(j).join(""), ...tail].join(" "));
        }
        lines.push(chunk);
        chunk = chars[j];
      } else chunk += chars[j];
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

// Discord's wire format leaks into mirrored content: raw mention ids, custom
// emoji, markdown. The bot bridges `message.content` verbatim, so the card
// cleans it up the way a reader would see it in Discord itself.
export function sanitize(raw: string): string {
  let s = raw
    .replace(/<a?:([a-zA-Z0-9_]+):\d+>/g, ":$1:") // custom emoji → its name
    .replace(/<@[!&]?\d+>/g, "@someone") // mention ids are meaningless here
    .replace(/<#\d+>/g, "#channel")
    .replace(/<t:\d+(?::[a-zA-Z])?>/g, "") // Discord timestamps
    .replace(/\|\|/g, "") // spoiler bars
    .replace(/```[a-zA-Z]*\n?/g, " ") // fenced code, kept as its text
    .replace(/[*_~`]/g, "")
    .replace(/^\s*>\s?/gm, "");

  // A bare link fills a line with characters nobody reads. Keep the host, and
  // enough of the path to tell two links on the same site apart.
  s = s.replace(/https?:\/\/\S+/g, (url) => {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");
      const path = u.pathname.replace(/\/+$/, "");
      return path && path !== "/" ? `${host}${path.length > 24 ? `${path.slice(0, 24)}…` : path}` : host;
    } catch {
      return url;
    }
  });

  let out = "";
  for (const ch of s.replace(/\s+/g, " ")) {
    const cp = ch.codePointAt(0) ?? 0;
    if (supported(cp)) out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?=$|[?#])/i;
const VIDEO_EXT = /\.(?:mp4|webm|mov|m4v|ogv)(?=$|[?#])/i;
// The emoji and pictographic blocks, which is what is left of a message when
// sanitize() drops everything the subset can't draw.
const PICTOGRAPHIC = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/u;

/**
 * What a message says, as one line of card text. A message the card cannot
 * print — media on its own, emoji, a script the subset has no glyphs for — is
 * named rather than dropped, the same way the web app's own feed names it.
 */
export function messageLine(raw: string): string {
  const media = [...raw.matchAll(/https?:\/\/\S+/g)].map((m) => m[0]);
  const only = media.length > 0 && raw.replace(/https?:\/\/\S+/g, "").trim() === "";
  if (only) {
    const kinds = new Set(media.map((u) => (VIDEO_EXT.test(u) ? "video" : IMAGE_EXT.test(u) ? "image" : "link")));
    if (!kinds.has("link")) {
      if (kinds.size > 1) return "shared media";
      return kinds.has("video") ? "shared a video" : "shared an image";
    }
  }
  const clean = sanitize(raw);
  if (clean) return clean;
  // Nothing renderable left. Emoji is the overwhelmingly common reason.
  return PICTOGRAPHIC.test(raw) ? "sent an emoji" : "sent a message";
}

/** A display name the card can actually draw, or an honest stand-in. */
export function displayName(raw: string, max = 320, face: Face = "semibold", size = 25): string {
  const clean = sanitize(raw);
  return clean ? fit(clean, face, size, max) : "a member";
}

export function timeAgo(ts: number, now: number): string {
  const s = Math.max(0, (now - ts) / 1000);
  if (s < 60) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24;
  if (d < 7) return `${Math.floor(d)}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

/**
 * The bot's daily recaps are markdown — headings, bullet lists, blank lines —
 * and a card is one flowing line of text. Flattening to "Highlights · Someone
 * shipped a thing · …" keeps the structure legible where a naive whitespace
 * collapse would leave "## Highlights - Someone…" on the card.
 */
export function flattenMarkdown(raw: string): string {
  const parts = raw
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s*/, "")
        .replace(/^\s*[-*•]\s+/, "")
        .replace(/^\s*\d+[.)]\s+/, "")
        .trim(),
    )
    .filter(Boolean);
  return parts.join(" · ");
}

/** "1 member", "2 members" — a card that says "1 members" looks broken. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${num(n)} ${n === 1 ? one : many}`;
}

/** 1240 → "1,240". Intl is not worth trusting here; the subset has no oddities. */
export function num(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Initial for the avatar disc, for authors whose Discord avatar we can't fetch. */
export function initial(name: string): string {
  for (const ch of name) {
    const cp = ch.codePointAt(0) ?? 0;
    if (supported(cp) && /[A-Za-z0-9]/.test(ch)) return ch.toUpperCase();
  }
  return "•";
}
