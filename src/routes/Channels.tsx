import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { timeAgo } from "../lib/format";

// The channel directory. It used to be the home page; home now leads with the
// daily summary and the live feed, and this is where you come to pick a room.
export default function Channels() {
  const channels = useQuery(api.channels.list);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Channels</h1>
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
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">#{c.name}</span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {c.lastMessageAt ? timeAgo(c.lastMessageAt) : "quiet"}
                  </span>
                </div>
                {c.topic ? <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{c.topic}</p> : null}
                <p className="mt-2 text-xs text-zinc-500">{c.messageCount.toLocaleString()} messages</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
