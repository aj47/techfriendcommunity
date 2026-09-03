import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { shortAgo } from "../lib/format";
import { mediaOf } from "../lib/linkify";

// A window into the conversation, sized to stay a window: the landing page
// leads with the alpha, and this is the reminder that there is a live Discord
// behind it. Up to three lines per message — enough that a short post reads
// whole rather than as a cut-off phrase — with no media and no linkified text,
// since every row is itself a link into the channel it came from. The full
// three-pane view is one click away at /channels.
//
// It fills its grid column and scrolls inside itself, so it matches the height
// of the cards beside it however tall those get, and asks for enough rows to
// have something left to scroll on a tall screen.
const PREVIEW = 20;

// Media-only messages are a bare URL in `content`. Printed raw they'd fill the
// row with an unclickable CDN link, so they get named instead.
function lineOf(content: string): { text: string; muted: boolean } {
  const { media, only } = mediaOf(content);
  if (!only) return { text: content, muted: false };
  const kinds = new Set(media.map((m) => m.kind));
  const noun = kinds.size > 1 ? "media" : media[0].kind === "video" ? "a video" : "an image";
  return { text: `shared ${noun}`, muted: true };
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
          {feed.map((m) => {
            const line = lineOf(m.content);
            return (
              <li key={m.id}>
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
                    <p
                      className={`line-clamp-3 break-words text-[13px] leading-snug ${
                        line.muted ? "italic text-zinc-500" : "text-zinc-400"
                      }`}
                    >
                      {line.text}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
