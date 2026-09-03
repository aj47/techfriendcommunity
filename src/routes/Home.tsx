import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { timeAgo } from "../lib/format";
import { linkify, mediaOf } from "../lib/linkify";
import MediaEmbeds from "../components/MediaEmbeds";
import { HOME_TITLE, usePageMeta } from "../lib/head";

const FEED_LIMIT = 30;

// The middle pane of the chat shell when no channel is picked: everything the
// community said, newest first, across every mirrored channel. The daily
// summary and the shared-resource list used to sit above this feed and push it
// below the fold; they now live in the shell's recap pane, permanently beside
// it (src/components/RecapPanel.tsx).
export default function Home() {
  const feed = useQuery(api.messages.latestAcross, { limit: FEED_LIMIT });
  usePageMeta(HOME_TITLE);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-zinc-800 px-3 py-2.5 sm:px-4">
        {/* The pane's visible label is "Latest", but this is the site's home
            page and its <h1> is the only thing naming it for crawlers and
            screen readers, so the rest of the name stays in the heading. */}
        <h1 className="text-base font-semibold">
          Latest<span className="sr-only"> across the techfren community</span>
        </h1>
        <p className="text-xs text-zinc-500">Every channel, newest first</p>
        <Link to="/channels" className="ml-auto shrink-0 text-xs text-emerald-400 hover:underline">
          Browse channels
        </Link>
      </div>

      {/* Unlike a channel, this pane is newest-first and never auto-scrolls:
          it is a glance at what is happening, so the newest line is the one
          you should already be looking at. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {feed === undefined ? (
          <p className="p-4 text-zinc-500">Loading…</p>
        ) : feed.length === 0 ? (
          <p className="p-4 text-zinc-500">Nothing mirrored yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {feed.map((m) => {
              const { media, only } = mediaOf(m.content);
              return (
                <li key={m.id} className="relative hover:bg-zinc-900">
                  {/* The whole row opens the channel, but the row also contains
                      real links now, and an anchor cannot nest inside an anchor.
                      So the row link is an overlay and the content layer passes
                      clicks straight through it — except for its own links. */}
                  <Link
                    to={m.channel ? `/channels/${m.channel.slug}` : "/channels"}
                    aria-label={m.channel ? `Open #${m.channel.name}` : "Browse channels"}
                    className="absolute inset-0"
                  />
                  <div className="pointer-events-none relative flex gap-3 px-3 py-3 sm:px-4">
                    {m.author.avatarUrl ? (
                      <img src={m.author.avatarUrl} alt="" className="mt-0.5 h-8 w-8 shrink-0 rounded-full" />
                    ) : (
                      <div className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-zinc-700" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className="font-medium">{m.author.name}</span>
                        {m.channel ? <span className="text-emerald-400">#{m.channel.name}</span> : null}
                        {m.source !== "discord" ? (
                          <span className="rounded bg-zinc-800 px-1 text-[10px] uppercase text-zinc-400">{m.source}</span>
                        ) : null}
                        <span className="text-xs text-zinc-500">{timeAgo(m.createdAt)}</span>
                      </div>
                      {only ? null : (
                        <p className="mt-0.5 line-clamp-3 break-words text-[15px] leading-relaxed text-zinc-300 [&_a]:pointer-events-auto">
                          {linkify(m.content, m.id, m.mentions)}
                        </p>
                      )}
                      {/* Thumbnails only: the feed is a glance, not the channel. */}
                      <MediaEmbeds media={media} thumb />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
