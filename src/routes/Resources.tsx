import { useEffect, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import { timeAgo } from "../lib/format";
import { pageTitle, usePageMeta } from "../lib/head";
import { text, useWebMCPTool } from "../webmcp/useWebMCPTool";

// Stored URLs are normalized on write, so this should always parse — but this
// runs during render, and one unparseable row would take the page down with it.
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function Resources() {
  const convex = useConvex();
  const requestSummary = useMutation(api.links.requestSummary);
  const [filter, setFilter] = useState("");
  usePageMeta(pageTitle("Resources"), "Links the community has shared, crawled and summarized automatically.");

  // The filter box used to match only the rows already on screen, so anything
  // past the newest 100 links was invisible to it — searching the archive
  // silently reported "nothing here". It now runs the backend search index.
  const q = useDebounced(filter.trim(), 250);
  const recent = useQuery(api.links.list, { limit: 100 });
  const found = useQuery(api.links.search, q ? { query: q, limit: 50 } : "skip");
  const rows = q ? found : recent;

  useWebMCPTool(
    {
      name: "search-resources",
      description: "Search the links the community has shared. Each resource has a title, a short summary, and tags produced by crawling the page. Searches the whole archive, and filters the visible list to match.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "Words to match in title, summary, tags, or URL. Empty for everything." } },
      },
      async execute({ query }: { query?: string }) {
        const needle = (query ?? "").trim();
        setFilter(needle);
        const hits = needle
          ? await convex.query(api.links.search, { query: needle, limit: 20 })
          : (recent ?? []).slice(0, 20);
        if (hits.length === 0) return text(needle ? `No shared links match "${needle}".` : "No links shared yet.");
        return text(hits.map((r) => `${r.title ?? r.url}\n${r.url}\n${r.summary ?? (r.crawlStatus === "pending" ? "(summary pending)" : "")}${r.tags.length ? `\nTags: ${r.tags.join(", ")}` : ""}`).join("\n\n"));
      },
    },
    [recent],
  );

  useWebMCPTool(
    {
      name: "summarize-link",
      description: "Have a web page crawled and summarized into the community resources list (title, summary, tags). Requires the human to be signed in; rate-limited. Returns the summary when ready (usually within ~15 seconds).",
      inputSchema: {
        type: "object",
        properties: { url: { type: "string", description: "Full http(s) URL of the page to summarize." } },
        required: ["url"],
      },
      async execute({ url }: { url: string }) {
        try {
          await requestSummary({ url });
        } catch (err) {
          const m = err instanceof ConvexError ? String((err.data as { message?: string })?.message ?? err.data) : "Couldn't request a summary.";
          return text(`${m} (The human must be signed in; try again in a minute if rate limited.)`);
        }
        for (let i = 0; i < 12; i++) {
          const r = await convex.query(api.links.byUrl, { url });
          if (r?.crawlStatus === "done") {
            setFilter(r.title ?? url);
            return text(`${r.title ?? r.url}\n${r.url}\n${r.summary ?? ""}${r.tags.length ? `\nTags: ${r.tags.join(", ")}` : ""}\n\nAdded to Resources.`);
          }
          if (r?.crawlStatus === "failed") return text(`Couldn't summarize ${url}: the crawl failed. The link is still listed under Resources.`);
          await new Promise((res) => setTimeout(res, 1500));
        }
        return text(`Summary for ${url} is still being generated; it will appear under Resources shortly. Call search-resources later to read it.`);
      },
    },
    [requestSummary],
  );

  return (
    <div className="space-y-4">
      {/* Side by side the search box had nowhere to go on a phone: it shrank
          to a slot too narrow to read a query in. Below 640px it gets its own
          full-width row, at 16px so iOS doesn't zoom the page on focus. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <h1 className="text-lg font-semibold">Resources</h1>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search links…"
          aria-label="Search shared links"
          className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-base outline-none focus:border-zinc-600 sm:ml-auto sm:w-72 sm:py-1.5 sm:text-sm"
        />
      </div>
      <p className="text-sm text-zinc-500">
        {q ? `Matching "${q}" across every shared link.` : "Links shared in the community, crawled and summarized automatically."}
      </p>
      {rows === undefined ? (
        <p className="text-zinc-500">{q ? "Searching…" : "Loading…"}</p>
      ) : rows.length === 0 ? (
        <p className="text-zinc-500">{q ? `Nothing matches "${q}".` : "Nothing here yet."}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 sm:p-4">
              {/* An untitled row falls back to its raw URL, which on a phone is
                  wider than the screen unless it is allowed to break. */}
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="block break-words font-medium hover:underline"
              >
                {r.title ?? r.url}
              </a>
              <p className="mt-1 break-words text-xs text-zinc-500">{r.siteName ?? hostOf(r.url)} · {timeAgo(r.createdAt)}</p>
              {r.crawlStatus === "pending" ? (
                <p className="mt-2 text-sm text-amber-300/80">Crawling…</p>
              ) : r.crawlStatus === "failed" ? (
                <p className="mt-2 text-sm text-zinc-500">Couldn't summarize this page.</p>
              ) : (
                <p className="mt-2 line-clamp-4 text-sm text-zinc-300">{r.summary}</p>
              )}
              {r.tags.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.tags.map((t) => <span key={t} className="max-w-full truncate rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">{t}</span>)}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
