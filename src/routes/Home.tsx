import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { timeAgo } from "../lib/format";
import { linkify, mediaOf } from "../lib/linkify";
import MediaEmbeds from "../components/MediaEmbeds";
import DailySummary from "../components/DailySummary";
import { HOME_TITLE, usePageMeta } from "../lib/head";

const FEED_LIMIT = 30;

export default function Home() {
  const feed = useQuery(api.messages.latestAcross, { limit: FEED_LIMIT });
  usePageMeta(HOME_TITLE);

  return (
    <div className="space-y-6">
      {/* The banner that used to carry this page's <h1> is gone; the heading
          stays for screen readers and search, which have nothing else to name
          the page by. */}
      <h1 className="sr-only">The techfren community</h1>

      <DailySummary />

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Latest messages</h2>
          <Link to="/channels" className="text-sm text-emerald-400 hover:underline">
            Browse channels
          </Link>
        </div>
        {feed === undefined ? (
          <p className="text-zinc-500">Loading…</p>
        ) : feed.length === 0 ? (
          <p className="text-zinc-500">Nothing mirrored yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800">
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
                          {linkify(m.content, m.id)}
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
      </section>
    </div>
  );
}
