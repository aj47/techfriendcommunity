import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { shortAgo } from "../lib/format";
import { linkify, mediaOf, type Media } from "../lib/linkify";

// A window into the conversation, sized to stay a window: the landing page
// leads with the alpha, and this is the reminder that there is a live Discord
// behind it. Up to three lines per message — enough that a short post reads
// whole rather than as a cut-off phrase — with no linkified text, since every
// row is itself a link into the channel it came from. The full three-pane view
// is one click away at /channels.
//
// It fills its grid column and scrolls inside itself, so it matches the height
// of the cards beside it however tall those get, and asks for enough rows to
// have something left to scroll on a tall screen.
const PREVIEW = 20;

type FeedItem = FunctionReturnType<typeof api.messages.latestAcross>[number];

// What a message says when it has no words of its own to say it with.
function labelFor(media: Media[]): string {
  const kinds = new Set(media.map((m) => m.kind));
  if (kinds.size > 1) return "shared media";
  return media[0].kind === "video" ? "shared a video" : "shared an image";
}

function Row({ m }: { m: FeedItem }) {
  // Discord's attachment URLs are signed and expire within about a day, so a
  // thumbnail here is always one refresh away from being a broken-image glyph.
  // Drop it when it fails and let the row fall back to describing itself.
  const [broken, setBroken] = useState<string[]>([]);
  const { media, rest } = mediaOf(m.content);
  // Images only. Twenty rows of <video preload="metadata"> is a lot of network
  // for a sidebar, and a controlless still frame is a black box anyway — a
  // video keeps its label and stays one click from the channel that has it.
  const shown = media.filter((x) => x.kind === "image" && !broken.includes(x.url));

  // With the picture on screen the CDN URL above it is noise, so the text is
  // the message minus its media links. A message that was nothing but an
  // upload says nothing at all — unless nothing rendered, in which case the
  // row would otherwise be blank and the old wording is the honest answer.
  const captionless = media.length > 0 && rest === "";
  const text = captionless ? (shown.length > 0 ? "" : labelFor(media)) : rest || m.content;

  return (
    <li>
      <Link
        to={m.channel ? `/channels/${m.channel.slug}` : "/channels"}
        className="flex gap-2 px-4 py-2 hover:bg-zinc-900"
      >
        {m.author.avatarUrl ? (
          <img src={m.author.avatarUrl} alt="" className="mt-0.5 h-5 w-5 shrink-0 rounded-full" />
        ) : (
          <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-zinc-700" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 text-xs">
            <span className="truncate font-medium text-zinc-300">{m.author.name}</span>
            {m.channel ? <span className="shrink-0 text-emerald-400">#{m.channel.name}</span> : null}
            <span className="ml-auto shrink-0 tabular-nums text-zinc-600">{shortAgo(m.createdAt)}</span>
          </div>
          {text ? (
            <p
              className={`line-clamp-3 break-words text-[13px] leading-snug ${
                captionless ? "italic text-zinc-500" : "text-zinc-400"
              }`}
            >
              {/* Names, emoji and timestamps resolve here exactly as they do in
                  the chat pane; only the URLs stay plain, because this whole
                  row is already a link into the channel. `captionless` text is
                  our own wording, not the message, so it is printed as-is. */}
              {captionless ? text : linkify(text, m.id, m.mentions, { links: false })}
            </p>
          ) : null}
          {shown.length > 0 ? (
            // Small on purpose: enough to see that someone posted a screenshot
            // and roughly what of. Bounded by height and by the column rather
            // than cropped to a fixed box — most of what gets pasted here is a
            // wide screenshot, and cropping one to a tile leaves an unreadable
            // grey square. Giving an <img> both maximums and no fixed size
            // scales it to fit inside them at its own aspect ratio.
            //
            // The row is already a link to the channel, so these must not be
            // anchors of their own.
            <div className="mt-1.5 flex flex-wrap items-start gap-1.5">
              {shown.map((x) => (
                <img
                  key={x.url}
                  src={x.url}
                  alt=""
                  loading="lazy"
                  onError={() => setBroken((b) => (b.includes(x.url) ? b : [...b, x.url]))}
                  className="max-h-24 max-w-full rounded border border-zinc-800 bg-zinc-950"
                />
              ))}
            </div>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

export default function LatestPreview() {
  const feed = useQuery(api.messages.latestAcross, { limit: PREVIEW });

  return (
    <section className="flex h-full min-h-[18rem] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex shrink-0 items-baseline justify-between gap-3 border-b border-zinc-800 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-zinc-300">Latest messages</h2>
        <Link to="/channels" className="text-xs text-emerald-400 hover:underline">
          Open live chat
        </Link>
      </div>

      {feed === undefined ? (
        <p className="px-4 py-3 text-sm text-zinc-600">Loading…</p>
      ) : feed.length === 0 ? (
        <p className="px-4 py-3 text-sm text-zinc-600">Nothing mirrored yet.</p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-zinc-800/70 overflow-y-auto">
          {feed.map((m) => (
            <Row key={m.id} m={m} />
          ))}
        </ul>
      )}
    </section>
  );
}
