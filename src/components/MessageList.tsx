import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { fmtTime } from "../lib/format";
import { draftStore } from "../lib/draftStore";

export type MessageView = {
  id: string;
  author: { name: string; avatarUrl?: string | null };
  content: string;
  source: "discord" | "web" | "email";
  status: "synced" | "pending" | "failed";
  agentAssisted: boolean;
  createdAt: number;
  editedAt: number | null;
  replyTo?: { id: string; author: string; snippet: string } | null;
  thread?: { slug: string; name: string; messageCount: number } | null;
};

const sourceLabel: Record<MessageView["source"], string> = { discord: "", web: "web", email: "email" };

// `slug` is the channel this list is rendered in — needed so the Reply
// button knows which composer to stage into (also correct inside a thread,
// since a thread is just a channel with its own slug).
export default function MessageList({ slug, messages, onLoadMore, canLoadMore }: {
  slug: string;
  messages: MessageView[];
  onLoadMore?: () => void;
  canLoadMore?: boolean;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [lastId]);
  return (
    <div className="space-y-1">
      {canLoadMore ? (
        <button onClick={onLoadMore} className="mb-2 text-xs text-zinc-500 hover:text-white">Load older messages</button>
      ) : null}
      {messages.map((m) => (
        <div key={m.id} className={`group flex gap-3 rounded-md px-2 py-1.5 hover:bg-zinc-900 ${m.status === "failed" ? "opacity-60" : ""}`}>
          {m.author.avatarUrl ? (
            <img src={m.author.avatarUrl} alt="" className="mt-0.5 h-8 w-8 shrink-0 rounded-full" />
          ) : (
            <div className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-zinc-700" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium">{m.author.name}</span>
              {sourceLabel[m.source] ? (
                <span className="rounded bg-zinc-800 px-1 text-[10px] uppercase text-zinc-400">{sourceLabel[m.source]}</span>
              ) : null}
              {m.agentAssisted ? (
                <span className="rounded bg-emerald-900/60 px-1 text-[10px] uppercase text-emerald-300" title="Drafted with an agent, sent by a human">agent-assisted</span>
              ) : null}
              <span className="text-xs text-zinc-500">{fmtTime(m.createdAt)}</span>
              {m.editedAt ? <span className="text-xs text-zinc-600">(edited)</span> : null}
              {m.status === "pending" ? <span className="text-xs text-amber-400">sending to Discord…</span> : null}
              {m.status === "failed" ? <span className="text-xs text-red-400">not delivered to Discord</span> : null}
              <button
                onClick={() => draftStore.replyTo(slug, { id: m.id, author: m.author.name, snippet: m.content.slice(0, 140) })}
                className="ml-auto shrink-0 text-xs text-zinc-500 opacity-0 hover:text-white group-hover:opacity-100"
              >
                Reply
              </button>
            </div>
            {m.replyTo ? (
              <p className="mt-0.5 truncate border-l-2 border-zinc-700 pl-2 text-xs text-zinc-500">
                <span className="text-zinc-400">{m.replyTo.author}</span> — {m.replyTo.snippet}
              </p>
            ) : null}
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-zinc-200">{m.content}</p>
            {m.thread ? (
              <Link
                to={`/channels/${m.thread.slug}`}
                className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline"
              >
                {m.thread.messageCount} {m.thread.messageCount === 1 ? "reply" : "replies"} in thread →
              </Link>
            ) : null}
          </div>
        </div>
      ))}
      <div ref={bottom} />
    </div>
  );
}
