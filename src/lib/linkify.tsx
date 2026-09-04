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
//   <@123> / <@!123>  a mention. <#123> is a channel; <@&123> a role.
//   <:name:123>       a custom emoji, <a:name:123> an animated one.
// Both are raw snowflakes in the mirrored text — unreadable anywhere but in
// Discord's own client, which is exactly what this file exists to fix.
const TOKEN =
  /\[([^\]\n]{1,300})\]\(\s*<?(https?:\/\/[^\s<>)]+)>?\s*\)|<t:(-?\d{1,14})(?::([tTdDfFR]))?>|(<?)((?:https?:\/\/|www\.)[^\s<>]+)(>?)|<(@[!&]?|#)(\d{5,25})>|<(a?):([A-Za-z0-9_]{1,32}):(\d{5,25})>/gi;

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

// A chip, not a link: clicking a name in a mirrored message has nowhere useful
// to go, and the point is only that "@ada" reads as a person where
// "<@1370407888509599804>" reads as a database error.
function mention(label: string, key: string) {
  return (
    <span key={key} className="rounded bg-emerald-500/10 px-1 py-px font-medium text-emerald-300">
      {label}
    </span>
  );
}

// `keyPrefix` only has to be unique among siblings, so callers pass whatever
// they already key that block by (message id, line index).
//
// `names` maps a snowflake to a display name (resolved in convex/messages.ts).
// Without it a mention still renders — as "@someone" — so a caller with no map,
// like the bot's own summaries, loses the name and nothing else.
export function linkify(text: string, keyPrefix = "lk", names?: Record<string, string>): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let n = 0;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(text); m; m = TOKEN.exec(text)) {
    const [whole, mdLabel, mdUrl, tsSeconds, tsStyle, open, bare, close, mentionKind, mentionId, emojiAnimated, emojiName, emojiId] = m;
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
    } else if (mentionId) {
      const name = names?.[mentionId];
      const label =
        mentionKind === "#"
          ? `#${name ?? "channel"}`
          : mentionKind === "@&"
            ? `@${name ?? "role"}`
            : `@${name ?? "someone"}`;
      node = mention(label, `${keyPrefix}-${n++}`);
    } else if (emojiId) {
      // Discord serves every custom emoji from one predictable path, animated
      // ones as gifs. Sized to the line, so a message that is six emoji stays a
      // message rather than becoming a poster.
      node = (
        <img
          key={`${keyPrefix}-${n++}`}
          src={`https://cdn.discordapp.com/emojis/${emojiId}.${emojiAnimated ? "gif" : "png"}?size=48`}
          alt={`:${emojiName}:`}
          title={`:${emojiName}:`}
          loading="lazy"
          className="inline-block h-5 w-5 align-text-bottom"
        />
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

// `url` is what gets loaded; `href` is where "open the original" goes when the
// two differ — a GIF-host page embeds through /gif but should still open as the
// page someone actually linked.
export type Media = { url: string; kind: "image" | "video"; href?: string };

const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?=$|[?#])/i;
const VIDEO_EXT = /\.(?:mp4|webm|mov|m4v|ogv)(?=$|[?#])/i;

// GIF-host pages are not files, whatever their path ends in: tenor.com/bf62P.gif
// 301s to an HTML page, so the extension rule above was handing <img> a
// document and drawing a broken icon. /gif resolves the page to the media it
// shows (convex/gif.ts) and redirects there.
//
// Klipy is deliberately absent. It sits behind a bot challenge that answers 403
// to anything without a browser, so nothing server-side can resolve it, and a
// link is a better answer than an image that will never load.
const GIF_PAGE_HOSTS = ["tenor.com", "giphy.com", "gfycat.com"];
// media.tenor.com/…, media1.giphy.com/…, i.giphy.com/… are the files themselves
// and load directly. The subdomain is the only reliable tell: the extension is
// not, because tenor.com/bf62P.gif — the form Discord's picker actually
// produces — ends in .gif and is still an HTML page.
const GIF_MEDIA_HOST = /^(?:media\d*|i|c)\./;

function gifPageEmbed(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (GIF_MEDIA_HOST.test(host)) return null;
    const match = GIF_PAGE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    return match ? `/gif?u=${encodeURIComponent(url)}` : null;
  } catch {
    return null;
  }
}
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
//
// `rest` is that same body with the embedded URLs taken out. Views that render
// the text as plain characters rather than links need it: a caption plus a
// hundred characters of signed CDN URL is not a sentence anyone can read.
export function mediaOf(text: string): { media: Media[]; only: boolean; rest: string } {
  const media: Media[] = [];
  const seen = new Set<string>();
  let rest = "";
  let cursor = 0;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(text); m; m = TOKEN.exec(text)) {
    const bare = m[6];
    if (!bare || (m[5] === "<" && m[7] === ">")) continue;
    const url = trimTrailing(bare);
    const href = /^www\./i.test(url) ? `https://${url}` : url;
    const gif = gifPageEmbed(href);
    const kind = gif ? "image" : VIDEO_EXT.test(url) ? "video" : IMAGE_EXT.test(url) ? "image" : null;
    if (!kind) continue;
    const start = m.index + m[5].length;
    rest += text.slice(cursor, start);
    cursor = start + url.length;
    TOKEN.lastIndex = cursor;
    if (seen.has(href) || media.length >= MEDIA_LIMIT) continue;
    seen.add(href);
    // A GIF page loads through the redirect but still opens as the page.
    media.push(gif ? { url: gif, kind, href } : { url: href, kind });
  }
  rest += text.slice(cursor);
  const trimmed = rest.trim();
  return { media, only: media.length > 0 && trimmed === "", rest: trimmed };
}
