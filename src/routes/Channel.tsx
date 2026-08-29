import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import MessageList, { type MessageView } from "../components/MessageList";
import Composer from "../components/Composer";
import { ChannelTools } from "../webmcp/channelTools";

export default function Channel() {
  const { slug = "" } = useParams();
  const channel = useQuery(api.channels.bySlug, { slug });
  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.list,
    channel ? { channelId: channel.id } : "skip",
    { initialNumItems: 40 },
  );
  const messages = useMemo(() => [...results].reverse() as MessageView[], [results]);

  if (channel === undefined) return <p className="text-zinc-500">Loading…</p>;
  if (channel === null)
    return (
      <p className="text-zinc-400">
        No channel called <code>{slug}</code>. <Link to="/" className="text-emerald-400">See all channels</Link>.
      </p>
    );

  return (
    <div className="flex h-[calc(100dvh-11rem)] flex-col sm:h-[calc(100dvh-8rem)]">
      <ChannelTools slug={channel.slug} channelName={channel.name} messages={messages} />
      <div className="mb-3 min-w-0">
        {channel.isThread && channel.parent ? (
          <Link to={`/channels/${channel.parent.slug}`} className="text-xs text-zinc-500 hover:text-zinc-300">
            ← #{channel.parent.name}
          </Link>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <h1 className="text-lg font-semibold">
            {channel.isThread ? channel.name : `#${channel.name}`}
          </h1>
          {channel.topic ? <p className="min-w-0 truncate text-sm text-zinc-500">{channel.topic}</p> : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
        {status === "LoadingFirstPage" ? (
          <p className="p-2 text-zinc-500">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="p-2 text-zinc-500">Nothing here yet. Say hi!</p>
        ) : (
          <MessageList slug={channel.slug} messages={messages} canLoadMore={status === "CanLoadMore"} onLoadMore={() => loadMore(40)} />
        )}
      </div>
      <div className="mt-3">
        <Composer slug={channel.slug} />
      </div>
    </div>
  );
}
