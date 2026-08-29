import type { ReactNode } from "react";

// People paste bare URLs into Discord all day, and the bot's summaries quote
// them back. Turning them into React <a> elements — never an HTML string —
// keeps this injection-proof by construction: the href comes from a matched
// http(s)/www token, and the label is rendered as text.
//
// Matches, in order: a markdown link `[label](url)`, then a bare URL,
// optionally wrapped in the <angle brackets> Discord uses to suppress embeds.
const TOKEN =
  /\[([^\]\n]{1,300})\]\((https?:\/\/[^\s)]+)\)|(<?)((?:https?:\/\/|www\.)[^\s<>]+)(>?)/gi;

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
  "text-emerald-400 underline decoration-emerald-400/40 underline-offset-2 hover:decoration-emerald-400";

// `keyPrefix` only has to be unique among siblings, so callers pass whatever
// they already key that block by (message id, line index).
export function linkify(text: string, keyPrefix = "lk"): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let n = 0;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(text); m; m = TOKEN.exec(text)) {
    const [whole, mdLabel, mdUrl, open, bare, close] = m;
    let href: string;
    let label: string;
    // Where the plain text before this token ends, and where the token ends.
    let textEnd = m.index;
    let end = m.index + whole.length;

    if (mdUrl) {
      href = trimTrailing(mdUrl);
      label = mdLabel;
    } else {
      const url = trimTrailing(bare);
      // A lone "www." or "https://" isn't a link worth making clickable.
      if (url.length < 8 || !/[a-z0-9]\.[a-z]{2,}/i.test(url)) continue;
      href = url.startsWith("www.") ? `https://${url}` : url;
      label = url;
      // Discord's <url> embed-suppression brackets are swallowed only when
      // they actually wrap the URL; a stray "<" stays part of the text.
      const wrapped = open === "<" && close === ">";
      if (!wrapped) textEnd = m.index + open.length;
      end = wrapped ? m.index + whole.length : m.index + open.length + url.length;
    }

    if (textEnd > cursor) nodes.push(text.slice(cursor, textEnd));
    nodes.push(
      <a
        key={`${keyPrefix}-${n++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        className={LINK_CLASS}
        onClick={(e) => e.stopPropagation()}
      >
        {label}
      </a>,
    );
    cursor = end;
    TOKEN.lastIndex = end;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes.length ? nodes : [text];
}
