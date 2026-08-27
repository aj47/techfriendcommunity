import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { timeAgo } from "../lib/format";
import { text, useWebMCPTool } from "../webmcp/useWebMCPTool";

export default function Resources() {
  const rows = useQuery(api.links.list, { limit: 100 });
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const visible = (rows ?? []).filter((r) =>
    !q || [r.url, r.title, r.summary, r.siteName, ...r.tags].filter(Boolean).some((s) => String(s).toLowerCase().includes(q)),
  );

  useWebMCPTool(
    {
      name: "search-resources",
      description: "Search the links the community has shared. Each resource has a title, a short summary, and tags produced by crawling the page. Filters the visible list to match.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "Words to match in title, summary, tags, or URL. Empty for everything." } },
      },
      async execute({ query }: { query?: string }) {
        setFilter(query ?? "");
        const needle = (query ?? "").trim().toLowerCase();
        const hits = (rows ?? []).filter((r) => !needle || [r.url, r.title, r.summary, r.siteName, ...r.tags].filter(Boolean).some((s) => String(s).toLowerCase().includes(needle)));
        if (hits.length === 0) return text(needle ? `No shared links match "${query}".` : "No links shared yet.");
        return text(hits.slice(0, 20).map((r) => `${r.title ?? r.url}\n${r.url}\n${r.summary ?? (r.crawlStatus === "pending" ? "(summary pending)" : "")}${r.tags.length ? `\nTags: ${r.tags.join(", ")}` : ""}`).join("\n\n"));
      },
    },
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Resources</h1>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter links…" className="ml-auto rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-zinc-600" />
      </div>
      <p className="text-sm text-zinc-500">Links shared in the community, crawled and summarized automatically.</p>
      {rows === undefined ? (
        <p className="text-zinc-500">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-zinc-500">Nothing here yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visible.map((r) => (
            <li key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
              <a href={r.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">{r.title ?? r.url}</a>
              <p className="mt-1 text-xs text-zinc-500">{r.siteName ?? new URL(r.url).hostname} · {timeAgo(r.createdAt)}</p>
              {r.crawlStatus === "pending" ? (
                <p className="mt-2 text-sm text-amber-300/80">Crawling…</p>
              ) : r.crawlStatus === "failed" ? (
                <p className="mt-2 text-sm text-zinc-500">Couldn't summarize this page.</p>
              ) : (
                <p className="mt-2 line-clamp-4 text-sm text-zinc-300">{r.summary}</p>
              )}
              {r.tags.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.tags.map((t) => <span key={t} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">{t}</span>)}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
