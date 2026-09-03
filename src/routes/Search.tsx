import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { fmtTime } from "../lib/format";
import MessageBody from "../components/MessageBody";
import { pageTitle, usePageMeta } from "../lib/head";

// The message search index and query already existed — they were reachable only
// through the WebMCP `search-messages` tool, so an agent could search the
// community and the person sitting in front of it could not. This is that same
// query, with a box in front of it.
export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const scope = params.get("channel");
  const [input, setInput] = useState(q);
  const [lastQ, setLastQ] = useState(q);

  // The URL is the source of truth for the query (back button, the "search
  // everywhere" link, a pasted /search?q=… link). Adjusting during render is
  // React's own pattern for this; an effect would render twice for no reason.
  if (q !== lastQ) {
    setLastQ(q);
    setInput(q);
  }

  usePageMeta(pageTitle(q ? `Search: ${q}` : "Search"));

  const channel = useQuery(api.channels.bySlug, scope ? { slug: scope } : "skip");
  // Don't fire an unscoped search first and a scoped one a moment later.
  const scopeReady = !scope || channel !== undefined;
  const results = useQuery(
    api.messages.search,
    q.trim() && scopeReady ? { query: q, channelId: channel?.id, limit: 30 } : "skip",
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (input.trim()) next.q = input.trim();
    if (scope) next.channel = scope;
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Search</h1>

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
          placeholder="Search every mirrored message…"
          aria-label="Search messages"
          className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-base outline-none focus:border-zinc-600 sm:text-sm"
        />
        <button className="shrink-0 rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400">
          Search
        </button>
      </form>

      {scope ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
          <span>
            Only in <span className="text-emerald-400">#{channel?.name ?? scope}</span>
          </span>
          <Link
            to={`/search?q=${encodeURIComponent(q)}`}
            className="rounded border border-zinc-700 px-2 py-0.5 text-xs hover:bg-zinc-800"
          >
            Search everywhere
          </Link>
        </p>
      ) : null}

      {!q.trim() ? (
        <p className="text-zinc-500">Type something to search the community's history.</p>
      ) : results === undefined ? (
        <p className="text-zinc-500">Searching…</p>
      ) : results.length === 0 ? (
        <p className="text-zinc-500">
          Nothing matches "{q}"{scope ? ` in #${channel?.name ?? scope}` : ""}.
        </p>
      ) : (
        <>
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            {results.length} {results.length === 1 ? "match" : "matches"}
          </p>
          <ul className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800">
            {results.map((m) => (
              <li key={m.id} className="px-3 py-3 sm:px-4">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">{m.author.name}</span>
                  {m.channel ? (
                    <Link to={`/channels/${m.channel.slug}`} className="text-emerald-400 hover:underline">
                      #{m.channel.name}
                    </Link>
                  ) : null}
                  {m.source !== "discord" ? (
                    <span className="rounded bg-zinc-800 px-1 text-[10px] uppercase text-zinc-400">{m.source}</span>
                  ) : null}
                  <span className="text-xs text-zinc-500">{fmtTime(m.createdAt)}</span>
                </div>
                <MessageBody content={m.content} id={m.id} mentions={m.mentions} className="mt-1 text-zinc-200" />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
