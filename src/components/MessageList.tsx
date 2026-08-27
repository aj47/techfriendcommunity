import { useEffect, useRef } from "react";
import { fmtTime } from "../lib/format";

export type MessageView = {
  id: string;
  author: { name: string; avatarUrl?: string | null };
  content: string;
  source: "discord" | "web" | "email";
  status: "synced" | "pending" | "failed";
  agentAssisted: boolean;
  createdAt: number;
  editedAt: number | null;
};

const sourceLabel: Record<MessageView["source"], string> = { discord: "", web: "web", email: "email" };

export default function MessageList({ messages, onLoadMore, canLoadMore }: {
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
            </div>
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-zinc-200">{m.content}</p>
          </div>
        </div>
      ))}
      <div ref={bottom} />
    </div>
  );
}
