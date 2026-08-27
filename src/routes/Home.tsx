import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { timeAgo } from "../lib/format";

export default function Home() {
  const channels = useQuery(api.channels.list);
  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6">
        <h1 className="text-2xl font-semibold">The techfren community, without the Discord app.</h1>
        <p className="mt-2 max-w-2xl text-zinc-400">
          Read and post in the community's public channels right here. Messages you send show up in Discord
          under your name. Prefer email? Subscribe to a channel digest and just reply.
        </p>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">Channels</h2>
        {channels === undefined ? (
          <p className="text-zinc-500">Loading…</p>
        ) : channels.length === 0 ? (
          <p className="text-zinc-500">No channels mirrored yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {channels.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/channels/${c.slug}`}
                  className="block rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 hover:border-zinc-600"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium">#{c.name}</span>
                    <span className="text-xs text-zinc-500">
                      {c.lastMessageAt ? timeAgo(c.lastMessageAt) : "quiet"}
                    </span>
                  </div>
                  {c.topic ? <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{c.topic}</p> : null}
                  <p className="mt-2 text-xs text-zinc-500">{c.messageCount} messages</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
