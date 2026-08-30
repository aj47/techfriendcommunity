import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import MessageList, { type MessageView } from "../components/MessageList";
import Composer from "../components/Composer";
import { ChannelTools } from "../webmcp/channelTools";
import { pageTitle, usePageMeta } from "../lib/head";

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

  if (channel === undefined) return <p className="text-zinc-500">Loading…</p>;
  if (channel === null)
    return (
      <p className="text-zinc-400">
        No channel called <code>{slug}</code>. <Link to="/channels" className="text-emerald-400">See all channels</Link>.
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
    <div className="flex h-[calc(100dvh-11rem)] flex-col sm:h-[calc(100dvh-8rem)]">
      <ChannelTools slug={channel.slug} channelName={channel.name} messages={messages} />
      <div className="mb-3 min-w-0">
        {channel.isThread && channel.parent ? (
          <Link to={`/channels/${channel.parent.slug}`} className="text-xs text-zinc-500 hover:text-zinc-300">
            ← #{channel.parent.name}
          </Link>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-2">
          <h1 className="text-lg font-semibold">{label}</h1>
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
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
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
      <div className="mt-3">
        <Composer slug={channel.slug} />
      </div>
    </div>
  );
}
