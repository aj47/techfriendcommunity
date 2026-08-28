import { useState } from "react";
import { Link } from "react-router-dom";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import { draftStore, useDraft } from "../lib/draftStore";

export default function Composer({ slug }: { slug: string }) {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me);
  const post = useMutation(api.messages.post);
  const draft = useDraft();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const text = draft.slug === slug ? draft.text : "";
  const staged = draft.slug === slug && draft.agentStaged && text.length > 0;

  if (!isAuthenticated) {
    return (
      <div className="rounded-lg border border-zinc-800 p-3 text-sm text-zinc-400">
        <Link to="/signin" className="text-emerald-400 hover:underline">Sign in</Link> to post in #{slug}. Your message will appear in Discord under your name.
      </div>
    );
  }
  if (me && me.needsHandle) {
    return (
      <div className="rounded-lg border border-zinc-800 p-3 text-sm text-zinc-400">
        <Link to="/settings" className="text-emerald-400 hover:underline">Pick a handle</Link> first — it's how you'll appear in Discord.
      </div>
    );
  }

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await post({ slug, content: text, agentAssisted: staged });
      draftStore.clear();
    } catch (e) {
      setError(e instanceof ConvexError ? String((e.data as { message?: string })?.message ?? e.data) : "Couldn't send. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`rounded-lg border p-2 ${staged ? "border-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" : "border-zinc-800"}`}>
      {staged ? (
        <div className="mb-1 flex items-center justify-between px-1 text-xs text-emerald-300">
          <span>Drafted by your agent — review, then press Send.</span>
          <button onClick={() => draftStore.clear()} className="text-zinc-500 hover:text-white">Discard</button>
        </div>
      ) : null}
      <textarea
        id="composer"
        value={text}
        onChange={(e) => draftStore.set({ slug, text: e.target.value, agentStaged: false })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
        }}
        rows={3}
        maxLength={2000}
        placeholder={`Message #${slug}`}
        className="w-full resize-none bg-transparent px-1 py-1 text-base outline-none placeholder:text-zinc-600 sm:text-[15px]"
      />
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-zinc-500">{error ?? "⌘/Ctrl+Enter to send"}</span>
        <button
          onClick={() => void send()}
          disabled={!text.trim() || sending}
          className="rounded-md bg-emerald-500 px-3 py-1 text-sm font-medium text-zinc-950 disabled:opacity-40 hover:bg-emerald-400"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
