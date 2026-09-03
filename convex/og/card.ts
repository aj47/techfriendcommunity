// The dynamic link-preview cards, as SVG. convex/og/render.ts rasterizes what
// this returns; nothing here touches the database or the renderer.
//
// The frame is deliberately the same as the static card in assets/brand/og.svg
// — zinc-950 ground, the violet bolt bled off the right edge, the wordmark in
// Inter Display — so a shared channel and a shared home page still read as the
// same site. What changes is the body: the recap, the newest messages, the
// standings, whatever the route is actually about.
import type { CardData, CardMessage } from "./data";
import {
  displayName,
  esc,
  faceAttrs,
  fit,
  flattenMarkdown,
  initial,
  measure,
  messageLine,
  num,
  plural,
  sanitize,
  timeAgo,
  wrap,
  type Face,
} from "./text";

export const CARD_W = 1200;
export const CARD_H = 630;

const M = 72; // margin; everything that must survive a crop lives inside it
const CONTENT_W = CARD_W - M * 2;

const INK = {
  bg: "#09090b",
  bright: "#fafafa",
  body: "#d4d4d8",
  dim: "#a1a1aa",
  faint: "#71717a",
  ghost: "#52525b",
  line: "#27272a",
  accent: "#34d399",
  violet: "#8B3CFF",
};

// Muted discs behind author initials, picked by name so one person keeps one
// colour across cards. No avatar images: they would each cost an outbound
// fetch on a request that has to answer an unfurler in a second or two.
const DISCS = ["#3f2a63", "#1f4a3d", "#2c3a63", "#4a3a1f", "#4a2a3a", "#24404a"];

type Text = {
  x: number;
  y: number;
  face?: Face;
  size: number;
  fill: string;
  tracking?: number;
  anchor?: "start" | "middle" | "end";
  opacity?: number;
};

function text(s: string, t: Text): string {
  const attrs = [
    `x="${t.x}"`,
    `y="${t.y}"`,
    faceAttrs(t.face ?? "regular"),
    `font-size="${t.size}"`,
    `fill="${t.fill}"`,
    t.tracking ? `letter-spacing="${t.tracking}"` : "",
    t.anchor && t.anchor !== "start" ? `text-anchor="${t.anchor}"` : "",
    t.opacity !== undefined ? `opacity="${t.opacity}"` : "",
  ].filter(Boolean);
  return `<text ${attrs.join(" ")}>${esc(s)}</text>`;
}

function block(lines: string[], t: Text & { leading: number }): string {
  return lines.map((line, i) => text(line, { ...t, y: t.y + i * t.leading })).join("");
}

function rule(y: number, x = M, w = CONTENT_W, fill = INK.line): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${fill}"/>`;
}

function disc(cx: number, cy: number, r: number, name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const fill = DISCS[h % DISCS.length];
  const glyph = initial(name);
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>` +
    text(glyph, {
      x: cx,
      y: cy + r * 0.36,
      face: "semibold",
      size: r,
      fill: "#e4e4e7",
      anchor: "middle",
    })
  );
}

// The bolt from the mark, as a path at 1x (48x45 units).
const BOLT =
  "M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z";

function bolt(x: number, y: number, scale: number, fill = "url(#bolt)", opacity = 1): string {
  return `<path transform="translate(${x} ${y}) scale(${scale})" fill="${fill}" opacity="${opacity}" d="${BOLT}"/>`;
}

/**
 * Header: mark, wordmark, and — on the right — how fresh the card is. The
 * route's own name is the body's eyebrow, so putting it up here too just said
 * everything twice.
 */
function header(right: string): string {
  const mark = bolt(M, 40, 0.82);
  const wordX = M + 52;
  const word =
    text("techfriend", { x: wordX, y: 74, face: "display", size: 30, fill: INK.bright, tracking: -0.6 }) +
    text("community", {
      // Measured, not kerned, so nudge it clear of the "d" it sits against.
      x: wordX + measure("techfriend", "display", 30, -0.6) + 1.5,
      y: 74,
      face: "display",
      size: 30,
      fill: INK.accent,
      tracking: -0.6,
    });
  const stamp = right
    ? text(right, { x: CARD_W - M, y: 72, face: "medium", size: 22, fill: INK.ghost, anchor: "end" })
    : "";
  return mark + word + stamp + rule(104);
}

/** Footer: the domain on the left, a freshness or stat line on the right. */
function footer(right: string): string {
  return (
    rule(534) +
    text("techfriendcommunity.com", { x: M, y: 578, face: "medium", size: 23, fill: INK.ghost }) +
    (right
      ? text(right, { x: CARD_W - M, y: 578, face: "medium", size: 23, fill: INK.ghost, anchor: "end" })
      : "")
  );
}

/**
 * One message: coloured initial disc, author, channel, relative time, and a
 * single line of what they said. Returns "" for a message whose text survives
 * neither sanitize() nor the media-only case, so a row is never left blank.
 */
function messageRow(y: number, m: CardMessage, now: number, opts?: { showChannel?: boolean }): string {
  const body = messageLine(m.content);
  const x = M + 52;
  const w = CONTENT_W - 52;
  const author = displayName(m.author);
  const authorW = measure(author, "semibold", 25);
  // "#room" for a channel, "› room" for a thread — a thread is not a channel
  // and printing it with a hash says it is.
  const room = m.channel
    ? `${m.channel.isThread ? "› " : "#"}${fit(sanitize(m.channel.name), "medium", 23, 240)}`
    : "";
  const channel =
    opts?.showChannel && room
      ? text(room, {
          x: x + authorW + 14,
          y,
          face: "medium",
          size: 23,
          fill: INK.accent,
        })
      : "";
  return (
    disc(M + 20, y - 9, 20, m.author) +
    text(author, { x, y, face: "semibold", size: 25, fill: INK.body }) +
    channel +
    text(timeAgo(m.createdAt, now), {
      x: CARD_W - M,
      y,
      face: "medium",
      size: 22,
      fill: INK.ghost,
      anchor: "end",
    }) +
    text(fit(body, "regular", 26, w), { x, y: y + 36, face: "regular", size: 26, fill: INK.dim })
  );
}

// Message rows hang from the bottom of the content band, so one message and
// three both look composed instead of leaving a hole in the middle of the card.
const ROWS_BOTTOM = 450;
const ROW_STEP = 100;

function messageStack(
  rows: CardMessage[],
  now: number,
  opts?: { showChannel?: boolean },
): string {
  const start = ROWS_BOTTOM - (Math.max(1, rows.length) - 1) * ROW_STEP;
  return rows.map((m, i) => messageRow(start + i * ROW_STEP, m, now, opts)).join("");
}

/** How many rows fit under a text block that ends at `bottom`. */
function rowSlots(bottom: number, max = 2, gap = 90): number {
  for (let n = max; n > 0; n--) {
    if (ROWS_BOTTOM - (n - 1) * ROW_STEP >= bottom + gap) return n;
  }
  return 0;
}

function statLine(d: CardData): string {
  const s = d.stats;
  if (!s) return "";
  const parts = [
    plural(s.messages, "message"),
    plural(s.channels, "channel"),
    s.members ? plural(s.members, "member") : "",
  ].filter(Boolean);
  return parts.join("  ·  ");
}

const HEAD_TRACK = -1.4;

function headLines(s: string, size: number, maxLines: number): string[] {
  return wrap(s, "display", size, CONTENT_W, maxLines, HEAD_TRACK);
}

/** Draws pre-wrapped heading lines and reports the baseline it ended on. */
function heading(lines: string[], y: number, size: number): { svg: string; bottom: number; lines: number } {
  const leading = Math.round(size * 1.16);
  return {
    svg: block(lines, {
      x: M,
      y,
      face: "display",
      size,
      fill: INK.bright,
      tracking: HEAD_TRACK,
      leading,
    }),
    bottom: y + (Math.max(1, lines.length) - 1) * leading,
    lines: lines.length,
  };
}

function paragraph(
  s: string,
  y: number,
  maxLines: number,
  size = 26,
  leading = 36,
  fill = INK.dim,
): { svg: string; bottom: number } {
  const lines = wrap(s, "regular", size, CONTENT_W, maxLines).map((line) =>
    // A line that breaks right after a " · " separator ends on a dangling dot.
    line.replace(/\s*·\s*(…?)$/, "$1"),
  );
  return {
    svg: block(lines, { x: M, y, size, fill, leading }),
    bottom: y + (Math.max(1, lines.length) - 1) * leading,
  };
}

function eyebrow(s: string, y = 164): string {
  return text(s.toUpperCase(), { x: M, y, face: "medium", size: 22, fill: INK.accent, tracking: 3.4 });
}

// ── the cards ──────────────────────────────────────────────────────────────

// Bare section headings ("Highlights", "TL;DR") are structure, not content:
// they'd take the most prominent line on the card and say nothing.
const HEADING_ONLY = /^(highlights?|summary|tl;?dr|overview|key points?|topics?|recap)[:.]?$/i;

function recapSegments(text: string): string[] {
  return flattenMarkdown(text)
    .split(" · ")
    .map((s) => sanitize(s))
    .filter((s) => s && !HEADING_ONLY.test(s));
}

function homeBody(d: CardData, now: number): string {
  const r = d.recap;
  if (!r) {
    // No recap yet — a fresh deployment, or the bot hasn't summarized today.
    const head = heading(headLines("Read it, search it, post into it", 56, 2), 250, 56);
    return (
      eyebrow("the techfren discord, on the web") +
      head.svg +
      messageStack((d.messages ?? []).slice(0, rowSlots(head.bottom)), now, { showChannel: true })
    );
  }

  // Lead with what was actually said. Segments fill the headline until they
  // stop fitting in two lines; whatever is left becomes the body copy, so a
  // long recap reads as a headline plus detail rather than one truncated wall.
  const segments = recapSegments(r.text);
  const head: string[] = [];
  for (const seg of segments) {
    const candidate = [...head, seg].join(" · ");
    if (head.length && headLines(candidate, 44, 3).length > 2) break;
    head.push(seg);
  }
  const rest = segments.slice(head.length).join(" · ");

  const day = r.date.slice(5).replace("-", "/");
  const title = heading(headLines(head.join(" · ") || "Today in the techfren Discord", 44, 2), 230, 44);
  // A two-line headline leaves room for one line of detail, a one-line
  // headline for three; the live messages under them get whatever is left.
  const body = rest
    ? paragraph(rest, title.bottom + 52, title.lines >= 2 ? 1 : 3)
    : { svg: "", bottom: title.bottom };
  // The recap is the day's news; a live message says the room is still talking.
  const rows = (d.messages ?? []).slice(0, rowSlots(body.bottom));
  return (
    eyebrow(`daily recap · ${day} · #${sanitize(r.channel)} · ${plural(r.messages, "message")}`) +
    title.svg +
    body.svg +
    messageStack(rows, now, { showChannel: true })
  );
}

function liveBody(d: CardData, now: number): string {
  const rows = (d.messages ?? []).slice(0, 3);
  if (!rows.length) {
    return eyebrow("live chat") + heading(headLines("Nothing mirrored yet", 54, 1), 250, 54).svg;
  }
  return eyebrow("live chat · newest first") + messageStack(rows, now, { showChannel: true });
}

function channelBody(d: CardData, now: number): string {
  if (d.missing || !d.channel) {
    return (
      eyebrow("channel") + heading(headLines("That channel isn't mirrored here", 50, 2), 250, 50).svg
    );
  }
  const c = d.channel;
  const name = c.isThread ? sanitize(c.name) : `#${sanitize(c.name)}`;
  const title = heading(headLines(name, 56, 1), 230, 56);
  const topic = c.topic ? sanitize(c.topic) : "";
  const body = topic ? paragraph(topic, 292, 2) : { svg: "", bottom: title.bottom };
  const rows = (d.messages ?? []).slice(0, rowSlots(body.bottom, 2, topic ? 70 : 90));
  return (
    eyebrow(c.isThread ? "thread" : "channel") + title.svg + body.svg + messageStack(rows, now)
  );
}

function leaderboardBody(d: CardData): string {
  const rows = d.leaders ?? [];
  if (!rows.length) {
    return eyebrow("leaderboard") + heading(headLines("No standings yet", 54, 1), 250, 54).svg;
  }
  const top = Math.max(...rows.map((r) => r.points), 1);
  const medal = ["#fbbf24", "#d4d4d8", "#c2803a"];
  const barX = M + 78;
  const barW = CONTENT_W - 78 - 190;
  return (
    eyebrow("leaderboard · scored in discord") +
    heading(headLines("Community standings", 46, 1), 226, 46).svg +
    rows
      .map((r, i) => {
        const y = 316 + i * 78;
        const w = Math.max(24, Math.round((barW * r.points) / top));
        return (
          text(`${r.rank}`, { x: M + 14, y, face: "display", size: 34, fill: medal[i] ?? INK.faint }) +
          text(displayName(sanitize(r.name) ? r.name : (r.alias ?? r.name), barW - 20, "semibold", 30), {
            x: barX,
            y: y - 6,
            face: "semibold",
            size: 30,
            fill: INK.body,
          }) +
          `<rect x="${barX}" y="${y + 8}" width="${w}" height="6" rx="3" fill="url(#bar)" opacity="0.9"/>` +
          text(num(r.points), {
            x: CARD_W - M,
            y,
            face: "display",
            size: 32,
            fill: INK.accent,
            anchor: "end",
          })
        );
      })
      .join("")
  );
}

function resourcesBody(d: CardData): string {
  const rows = (d.resources ?? []).slice(0, 3);
  if (!rows.length) {
    return eyebrow("resources") + heading(headLines("Nothing shared yet", 54, 1), 250, 54).svg;
  }
  return (
    eyebrow("resources · crawled and summarized") +
    heading(headLines("Links the community shared", 46, 1), 226, 46).svg +
    rows
      .map((r, i) => {
        const y = 320 + i * 76;
        return (
          `<rect x="${M}" y="${y - 26}" width="4" height="34" rx="2" fill="${INK.accent}" opacity="0.7"/>` +
          text(fit(sanitize(r.title), "semibold", 29, CONTENT_W - 26 - 200), {
            x: M + 24,
            y,
            face: "semibold",
            size: 29,
            fill: INK.body,
          }) +
          text(fit(sanitize(r.site), "medium", 22, 190), {
            x: CARD_W - M,
            y,
            face: "medium",
            size: 22,
            fill: INK.faint,
            anchor: "end",
          })
        );
      })
      .join("")
  );
}

function searchBody(d: CardData, now: number): string {
  const q = sanitize(d.query ?? "");
  if (!q) return eyebrow("search") + heading(headLines("Search every message", 54, 1), 250, 54).svg;
  const count =
    d.results === undefined
      ? ""
      : d.results > 20
        ? "20+ matches"
        : plural(d.results, "match", "matches");
  const title = heading(headLines(`“${q}”`, 52, 2), 240, 52);
  const hits = (d.messages ?? []).slice(0, rowSlots(title.bottom, 1));
  return eyebrow(count ? `search · ${count}` : "search") + title.svg + messageStack(hits, now);
}

function siteBody(_d: CardData): string {
  const title = heading(headLines("Read it, search it, post into it", 56, 2), 250, 56);
  return (
    eyebrow("the techfren discord, on the web") +
    title.svg +
    text("No Discord account needed.", { x: M, y: title.bottom + 60, size: 29, fill: INK.dim })
  );
}

// How fresh the card is, for the header's right-hand slot. Cards with no
// timestamp of their own (the brand card) leave it empty rather than lie.
function stamp(d: CardData, now: number): string {
  const newest = (d.messages ?? [])[0];
  if (newest) return `updated ${timeAgo(newest.createdAt, now)}`;
  return "";
}

function rightFoot(d: CardData, now: number): string {
  const newest = (d.messages ?? [])[0];
  if (d.kind === "channel" && d.channel) {
    const count = plural(d.channel.messageCount, "message");
    return newest ? `${count}  ·  ${timeAgo(newest.createdAt, now)}` : count;
  }
  if (d.kind === "leaderboard" || d.kind === "resources" || d.kind === "search") return "no Discord account needed";
  return statLine(d) || (newest ? timeAgo(newest.createdAt, now) : "");
}

export function cardSvg(d: CardData, now: number): string {
  const body =
    d.kind === "home"
      ? homeBody(d, now)
      : d.kind === "live"
        ? liveBody(d, now)
        : d.kind === "channel"
          ? channelBody(d, now)
          : d.kind === "leaderboard"
            ? leaderboardBody(d)
            : d.kind === "resources"
              ? resourcesBody(d)
              : d.kind === "search"
                ? searchBody(d, now)
                : siteBody(d);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
<defs>
<linearGradient id="bolt" x1="0.05" y1="0" x2="0.85" y2="1">
<stop offset="0" stop-color="#8B3CFF"/><stop offset="0.45" stop-color="#9A56FF"/><stop offset="1" stop-color="#6D7DFF"/>
</linearGradient>
<linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#8B3CFF"/>
</linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
<stop offset="0" stop-color="#8B3CFF" stop-opacity="0.22"/><stop offset="1" stop-color="#8B3CFF" stop-opacity="0"/>
</radialGradient>
</defs>
<rect width="${CARD_W}" height="${CARD_H}" fill="${INK.bg}"/>
<!-- Glow and the oversized bolt bled off the right edge, as on the static card
     in assets/brand/og.svg — but dimmer, because here there is text over it. -->
<ellipse cx="965" cy="300" rx="470" ry="400" fill="url(#glow)"/>
${bolt(806, -80, 16.7, "url(#bolt)", 0.07)}
${header(stamp(d, now))}
${body}
${footer(rightFoot(d, now))}
</svg>`;
}
