import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { timeAgo } from "../lib/format";
import DailySummary from "../components/DailySummary";

const FEED_LIMIT = 30;

export default function Home() {
  const feed = useQuery(api.messages.latestAcross, { limit: FEED_LIMIT });

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-4 sm:p-6">
        <h1 className="text-xl font-semibold sm:text-2xl">The techfren community, without the Discord app.</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400 sm:text-base">
          What the community is talking about right now, and what the bot made of yesterday. Post from here and it
          shows up in Discord under your name — or subscribe to a channel digest and reply by email.
        </p>
      </section>

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
            {feed.map((m) => (
              <li key={m.id}>
                <Link
                  to={m.channel ? `/channels/${m.channel.slug}` : "/channels"}
                  className="flex gap-3 px-3 py-3 hover:bg-zinc-900 sm:px-4"
                >
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
                    <p className="mt-0.5 line-clamp-3 break-words text-[15px] leading-relaxed text-zinc-300">
                      {m.content}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
