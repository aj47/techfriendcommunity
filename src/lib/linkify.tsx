import type { ReactNode } from "react";
import { fmtTime, timeAgo } from "./format";

// People paste bare URLs into Discord all day, and the bot's summaries quote
// them back. Turning them into React elements — never an HTML string — keeps
// this injection-proof by construction: an href comes from a matched
// http(s)/www token, and every label is rendered as text.
//
// Matches, in order:
//   [label](url)      a markdown link. The bot wraps the target in the <>
//                     Discord uses to suppress a preview, so they're optional
//                     here — without that, `[source](<url>)` failed to match
//                     and leaked its own markdown into the page.
//   <t:1788286014:t>  a Discord timestamp. Only Discord's client renders these;
//                     everywhere else they are unreadable machine text.
//   <url> / url       a bare URL, optionally inside those same brackets.
const TOKEN =
  /\[([^\]\n]{1,300})\]\(\s*<?(https?:\/\/[^\s<>)]+)>?\s*\)|<t:(-?\d{1,14})(?::([tTdDfFR]))?>|(<?)((?:https?:\/\/|www\.)[^\s<>]+)(>?)/gi;

// Trailing punctuation is nearly always the sentence's, not the link's. A
// closing bracket only counts as trailing when it is unbalanced, so
// en.wikipedia.org/wiki/Foo_(bar) survives intact.
function trimTrailing(url: string): string {
  let out = url;
  for (;;) {
    const last = out[out.length - 1];
    if (!last) break;
    if (".,;:!?'\"*_".includes(last)) {
      out = out.slice(0, -1);
      continue;
    }
    const open = last === ")" ? "(" : last === "]" ? "[" : last === "}" ? "{" : null;
    if (open) {
      const opens = out.split(open).length - 1;
      const closes = out.split(last).length - 1;
      if (closes > opens) {
        out = out.slice(0, -1);
        continue;
      }
    }
    break;
  }
  return out;
}

const LINK_CLASS =
  "text-emerald-400 underline decoration-emerald-400/40 underline-offset-2 hover:decoration-emerald-400 break-words";

function anchor(href: string, label: string, key: string) {
  return (
    <a
      key={key}
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className={LINK_CLASS}
      onClick={(e) => e.stopPropagation()}
    >
      {label}
    </a>
  );
}

// Discord's timestamp styles, rendered in the reader's own locale and zone —
// which is the whole point of the token. Anything outside a plausible range is
// refused so a stray <t:...> stays literal text rather than becoming "1970".
const IN_RANGE = { min: Date.UTC(1990, 0, 1), max: Date.UTC(2100, 0, 1) };

function discordTime(seconds: number, style: string): { label: string; ms: number } | null {
  const ms = seconds * 1000;
  if (!Number.isFinite(ms) || ms < IN_RANGE.min || ms > IN_RANGE.max) return null;
  const d = new Date(ms);
  switch (style) {
    case "t":
      return { label: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }), ms };
    case "T":
      return { label: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }), ms };
    case "d":
      return { label: d.toLocaleDateString(undefined, { dateStyle: "short" }), ms };
    case "D":
      return { label: d.toLocaleDateString(undefined, { dateStyle: "long" }), ms };
    case "F":
      return { label: d.toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" }), ms };
    case "R":
    case "r":
      return { label: timeAgo(ms), ms };
    default:
      return { label: d.toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" }), ms };
  }
}

// `keyPrefix` only has to be unique among siblings, so callers pass whatever
// they already key that block by (message id, line index).
export function linkify(text: string, keyPrefix = "lk"): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let n = 0;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(text); m; m = TOKEN.exec(text)) {
    const [whole, mdLabel, mdUrl, tsSeconds, tsStyle, open, bare, close] = m;
    let node: ReactNode;
    // Where the plain text before this token ends, and where the token ends.
    let textEnd = m.index;
    let end = m.index + whole.length;

    if (mdUrl) {
      node = anchor(trimTrailing(mdUrl), mdLabel, `${keyPrefix}-${n++}`);
    } else if (tsSeconds) {
      const t = discordTime(Number(tsSeconds), tsStyle ?? "f");
      if (!t) continue;
      node = (
        <time
          key={`${keyPrefix}-${n++}`}
          dateTime={new Date(t.ms).toISOString()}
          title={fmtTime(t.ms)}
          className="whitespace-nowrap text-zinc-500"
        >
          {t.label}
        </time>
      );
    } else {
      const url = trimTrailing(bare);
      // A lone "www." or "https://" isn't a link worth making clickable.
      if (url.length < 8 || !/[a-z0-9]\.[a-z]{2,}/i.test(url)) continue;
      const href = /^www\./i.test(url) ? `https://${url}` : url;
      node = anchor(href, url, `${keyPrefix}-${n++}`);
      // Discord's <url> embed-suppression brackets are swallowed only when
      // they actually wrap the URL; a stray "<" stays part of the text.
      const wrapped = open === "<" && close === ">";
      if (!wrapped) textEnd = m.index + open.length;
      end = wrapped ? m.index + whole.length : m.index + open.length + url.length;
    }

    if (textEnd > cursor) nodes.push(text.slice(cursor, textEnd));
    nodes.push(node);
    cursor = end;
    TOKEN.lastIndex = end;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes.length ? nodes : [text];
}

export type Media = { url: string; kind: "image" | "video" };

const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?=$|[?#])/i;
const VIDEO_EXT = /\.(?:mp4|webm|mov|m4v|ogv)(?=$|[?#])/i;
// A wall of screenshots would bury the conversation it belongs to.
const MEDIA_LIMIT = 4;

// Which URLs in a message body should render as the file itself.
//
// Only bare URLs embed: Discord's <url> form exists precisely to suppress the
// preview, and a markdown-labelled link is something someone chose to present
// as words — the bot's summaries are made of those, and they shouldn't sprout
// screenshots. `only` reports that the body is nothing but its media, which is
// how a Discord upload arrives; with the file on screen, printing its CDN URL
// above it is pure noise.
export function mediaOf(text: string): { media: Media[]; only: boolean } {
  const media: Media[] = [];
  const seen = new Set<string>();
  let rest = "";
  let cursor = 0;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(text); m; m = TOKEN.exec(text)) {
    const bare = m[6];
    if (!bare || (m[5] === "<" && m[7] === ">")) continue;
    const url = trimTrailing(bare);
    const kind = VIDEO_EXT.test(url) ? "video" : IMAGE_EXT.test(url) ? "image" : null;
    if (!kind) continue;
    const start = m.index + m[5].length;
    rest += text.slice(cursor, start);
    cursor = start + url.length;
    TOKEN.lastIndex = cursor;
    const href = /^www\./i.test(url) ? `https://${url}` : url;
    if (seen.has(href) || media.length >= MEDIA_LIMIT) continue;
    seen.add(href);
    media.push({ url: href, kind });
  }
  rest += text.slice(cursor);
  return { media, only: media.length > 0 && rest.trim() === "" };
}
