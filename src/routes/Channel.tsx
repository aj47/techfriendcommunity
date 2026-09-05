import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import MessageList, { type MessageView } from "../components/MessageList";
import Composer from "../components/Composer";
import { pageTitle, usePageMeta } from "../lib/head";

// One room, as the middle pane of the chat shell: a title bar, the scrollback,
// and the composer pinned to the bottom. The shell owns the height — this fills
// whatever it is given rather than measuring the viewport itself, which is what
// the old page did with a hand-tuned calc() that had to be kept in step with
// the header.
export default function Channel() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const channel = useQuery(api.channels.bySlug, { slug });
  const retention = useQuery(api.channels.retention);
  const [search, setSearch] = useState("");
  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.list,
    channel ? { channelId: channel.id } : "skip",
    { initialNumItems: 40 },
  );
  const messages = useMemo(() => [...results].reverse() as MessageView[], [results]);

  const label = channel ? (channel.isThread ? channel.name : `#${channel.name}`) : null;
  usePageMeta(
    channel === undefined ? null : channel === null ? pageTitle("Channel not found") : pageTitle(label!),
    channel?.topic ?? undefined,
  );

  if (channel === undefined) return <p className="p-4 text-zinc-500">Loading…</p>;
  if (channel === null)
    return (
      <p className="p-4 text-zinc-400">
        No channel called <code>{slug}</code>. <Link to="/channels" className="text-emerald-400">Open live chat</Link>.
      </p>
    );

  const runSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    navigate(`/search?q=${encodeURIComponent(q)}&channel=${encodeURIComponent(channel.slug)}`);
  };

  // Retention keeps a bounded window of raw messages (convex/retention.ts), so
  // say so where the scrollback actually runs out rather than just stopping.
  const retentionNote = retention?.days
    ? `That's everything kept here — messages older than ${retention.days} days are swept, and earlier activity lives in the daily summaries.`
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-w-0 shrink-0 border-b border-zinc-800 px-3 py-2.5 sm:px-4">
        {channel.isThread && channel.parent ? (
          <Link to={`/channels/${channel.parent.slug}`} className="text-xs text-zinc-500 hover:text-zinc-300">
            ← #{channel.parent.name}
          </Link>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-2">
          <h1 className="text-base font-semibold">{label}</h1>
          {channel.topic ? <p className="min-w-0 truncate text-sm text-zinc-500">{channel.topic}</p> : null}
          <form onSubmit={runSearch} className="ml-auto shrink-0">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${label}`}
              aria-label={`Search ${label}`}
              className="w-40 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-sm outline-none focus:border-zinc-600 sm:w-52"
            />
          </form>
        </div>
      </div>
      {/* `relative` anchors MessageList's "N new messages" pill. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {status === "LoadingFirstPage" ? (
          <p className="p-4 text-zinc-500">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="p-4 text-zinc-500">Nothing here yet. Say hi!</p>
        ) : (
          <MessageList
            slug={channel.slug}
            messages={messages}
            canLoadMore={status === "CanLoadMore"}
            onLoadMore={() => loadMore(40)}
            topNote={retentionNote}
          />
        )}
      </div>
      <div className="shrink-0 border-t border-zinc-800 p-3 sm:px-4">
        <Composer slug={channel.slug} />
      </div>
    </div>
  );
}
