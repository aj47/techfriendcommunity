import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { timeAgo } from "../lib/format";
import { pageTitle, usePageMeta } from "../lib/head";

// The channel directory: every room with its topic and how much traffic it has
// seen. Day to day you pick a room from the chat shell's rail instead; this is
// the browsable, linkable version of that list, and the one place threads and
// quiet channels are easy to survey.
export default function Channels() {
  const channels = useQuery(api.channels.list);
  const retention = useQuery(api.channels.retention);
  usePageMeta(pageTitle("Channels"), "Every mirrored channel in the techfren community.");
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
                {/* messageCount is lifetime activity; retention sweeps don't
                    decrement it, so don't imply all of it is still readable. */}
                <p className="mt-2 text-xs text-zinc-500">
                  {c.messageCount.toLocaleString()} messages all-time
                  {retention?.days ? <span className="text-zinc-600"> · last {retention.days} days here</span> : null}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
