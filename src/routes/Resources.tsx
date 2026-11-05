import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { timeAgo } from "../lib/format";
import { pageTitle, usePageMeta } from "../lib/head";
import { hostOf } from "../lib/linkPreview";
import SummarizeLink from "../components/SummarizeLink";
import UpvoteButton from "../components/UpvoteButton";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// Hot is the default because it is the only order that answers "what should I
// read" — new buries a well-received link within a day, and top never lets go
// of the best link of the year. The ranking itself is stored per row and
// recomputed on each vote (links.hotRankOf).
const SORTS = [
  { key: "hot", label: "Hot", blurb: "Links shared in the community, ranked by votes and freshness." },
  { key: "new", label: "New", blurb: "Everything the community has shared, newest first." },
  { key: "top", label: "Top", blurb: "The most upvoted links of all time." },
] as const;

type SortKey = (typeof SORTS)[number]["key"];

export default function Resources() {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("hot");
  usePageMeta(pageTitle("Resources"), "Links the community has shared, ranked by what the community upvoted.");

  // The filter box used to match only the rows already on screen, so anything
  // past the newest 100 links was invisible to it — searching the archive
  // silently reported "nothing here". It now runs the backend search index.
  const q = useDebounced(filter.trim(), 250);
  const ranked = useQuery(api.links.list, { limit: 100, sort });
  const found = useQuery(api.links.search, q ? { query: q, limit: 50 } : "skip");
  const rows = q ? found : ranked;

  // One query for the whole page. Empty for a visitor, so the arrows render
  // unlit rather than waiting on an auth round trip per row.
  const myUpvotes = useQuery(api.links.myUpvotes, {});
  const voted = useMemo(() => new Set<string>(myUpvotes ?? []), [myUpvotes]);

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
      <SummarizeLink onAdded={() => setFilter("")} />

      {/* Search results come back in relevance order, so the sort tabs would
          be lying while a query is live. */}
      {q ? (
        <p className="text-sm text-zinc-500">Matching “{q}” across every shared link, best match first.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div role="tablist" aria-label="Sort links" className="flex gap-1">
            {SORTS.map((s) => (
              <button
                key={s.key}
                role="tab"
                aria-selected={s.key === sort}
                onClick={() => setSort(s.key)}
                className={`rounded-full px-3 py-1 text-sm ${
                  s.key === sort ? "bg-zinc-100 font-medium text-zinc-900" : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-zinc-500">{SORTS.find((s) => s.key === sort)?.blurb}</p>
        </div>
      )}

      {rows === undefined ? (
        <p className="text-zinc-500">{q ? "Searching…" : "Loading…"}</p>
      ) : rows.length === 0 ? (
        <p className="text-zinc-500">{q ? `Nothing matches "${q}".` : "Nothing here yet."}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => {
            const host = r.siteName ?? hostOf(r.url);
            return (
              <li
                key={r.id}
                className="flex gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5 hover:border-zinc-700 sm:gap-3 sm:p-3"
              >
                {/* Rank is a position in *this* order, so it is meaningless
                    next to search results and absent there. */}
                {!q ? (
                  <span aria-hidden className="hidden w-5 shrink-0 pt-1.5 text-right text-sm tabular-nums text-zinc-600 sm:block">
                    {i + 1}
                  </span>
                ) : null}

                <UpvoteButton resourceId={r.id} upvotes={r.upvotes} upvoted={voted.has(r.id)} />

                <div className="min-w-0 flex-1">
                  {/* An untitled row falls back to its raw URL, which on a
                      phone is wider than the screen unless it can break. */}
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-words font-medium hover:underline"
                  >
                    {r.title ?? r.url}
                  </a>{" "}
                  <span className="whitespace-nowrap text-xs text-zinc-500">({host})</span>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {r.upvotes === 1 ? "1 upvote" : `${r.upvotes} upvotes`} · {timeAgo(r.createdAt)}
                  </p>
                  {r.crawlStatus === "pending" ? (
                    <p className="mt-1 text-sm text-amber-300/80">Reading…</p>
                  ) : r.crawlStatus === "failed" ? (
                    <p className="mt-1 text-sm text-zinc-500">Couldn't read this page.</p>
                  ) : r.summary ? (
                    <p className="mt-1 line-clamp-2 break-words text-sm text-zinc-300">{r.summary}</p>
                  ) : null}
                  {r.tags.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {r.tags.map((t) => (
                        <span key={t} className="max-w-full truncate rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
