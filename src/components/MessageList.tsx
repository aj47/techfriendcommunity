import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { fmtTime } from "../lib/format";
import MessageBody from "./MessageBody";
import { plainMentions, type Mentions } from "../lib/linkify";
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
  // Discord's <@id> / <#id> tokens resolved to names, from the query.
  mentions?: Mentions;
};

const sourceLabel: Record<MessageView["source"], string> = { discord: "", web: "web", email: "email" };

// How close to the bottom still counts as "following along".
const BOTTOM_SLACK = 80;

// `slug` is the channel this list is rendered in — needed so the Reply
// button knows which composer to stage into (also correct inside a thread,
// since a thread is just a channel with its own slug).
//
// This component owns its scroll container because it owns the scroll rules:
// follow new messages only while the reader is already at the bottom, and hold
// their place when older messages are prepended. Autoscrolling unconditionally
// yanked anyone reading scrollback in a busy channel back down on every mirrored
// Discord message.
export default function MessageList({ slug, messages, onLoadMore, canLoadMore, topNote }: {
  slug: string;
  messages: MessageView[];
  onLoadMore?: () => void;
  canLoadMore?: boolean;
  topNote?: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prevLastId = useRef<string | null>(null);
  const prevLen = useRef(0);
  const restoreHeight = useRef<number | null>(null);
  const [unread, setUnread] = useState(0);

  const lastId = messages[messages.length - 1]?.id ?? null;

  const jumpToBottom = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setUnread(0);
  }, []);

  const handleScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK;
    atBottom.current = pinned;
    if (pinned) setUnread(0);
  };

  const handleLoadMore = () => {
    restoreHeight.current = scroller.current?.scrollHeight ?? null;
    onLoadMore?.();
  };

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const grew = messages.length - prevLen.current;
    prevLen.current = messages.length;

    // A page of older messages was prepended: keep the reader looking at the
    // same message instead of jumping by the height of what just loaded.
    if (restoreHeight.current !== null) {
      const from = restoreHeight.current;
      restoreHeight.current = null;
      if (grew > 0) {
        el.scrollTop += el.scrollHeight - from;
        prevLastId.current = lastId;
        return;
      }
      // The load brought nothing; fall through to the normal rules.
    }

    // First paint: land on the newest message.
    if (prevLastId.current === null) {
      el.scrollTop = el.scrollHeight;
      prevLastId.current = lastId;
      atBottom.current = true;
      return;
    }

    if (lastId === prevLastId.current) return;
    prevLastId.current = lastId;
    if (atBottom.current) el.scrollTop = el.scrollHeight;
    else setUnread((n) => n + Math.max(1, grew));
  }, [messages, lastId]);

  return (
    <>
      <div ref={scroller} onScroll={handleScroll} className="h-full overflow-y-auto p-2">
        <div className="space-y-1">
          {canLoadMore ? (
            <button onClick={handleLoadMore} className="mb-2 text-xs text-zinc-500 hover:text-white">
              Load older messages
            </button>
          ) : topNote ? (
            <p className="mb-2 px-2 text-xs text-zinc-600">{topNote}</p>
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
                    className="ml-auto shrink-0 text-xs text-zinc-500 opacity-0 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    Reply
                  </button>
                </div>
                {m.replyTo ? (
                  <p className="mt-0.5 truncate border-l-2 border-zinc-700 pl-2 text-xs text-zinc-500">
                    <span className="text-zinc-400">{m.replyTo.author}</span> — {plainMentions(m.replyTo.snippet, m.mentions)}
                  </p>
                ) : null}
                <MessageBody content={m.content} id={m.id} mentions={m.mentions} className="text-zinc-200" />
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
        </div>
      </div>
      {unread > 0 ? (
        <button
          onClick={jumpToBottom}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-medium text-zinc-950 shadow-lg hover:bg-emerald-400"
        >
          {unread} new message{unread === 1 ? "" : "s"} ↓
        </button>
      ) : null}
    </>
  );
}
