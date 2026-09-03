import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { timeAgo } from "../lib/format";
import { hostOf } from "../lib/linkPreview";

// A glance at what the community has been reading, for the chat shell's narrow
// recap pane. The full archive with search lives at /resources, and the landing
// page shows the same rows as preview cards (src/components/AlphaCards.tsx);
// this is the tease: three rows folded, the rest one click away, and no
// summaries until it is open so the fold stays short in a 320px column.
const TEASE = 3;
const LIMIT = 9;

export default function ResourcesTease() {
  const rows = useQuery(api.links.list, { limit: LIMIT });
  const [expanded, setExpanded] = useState(false);

  // Same reasoning as the daily summary: an empty card explaining itself would
  // be noise, and the nav already has a Resources link.
  if (!rows || rows.length === 0) return null;

  const shown = expanded ? rows : rows.slice(0, TEASE);
  const hidden = rows.length - shown.length;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-zinc-800 px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold sm:text-lg">Latest Alpha</h2>
        <Link to="/resources" className="text-xs text-emerald-400 hover:underline">
          Search all resources
        </Link>
      </div>

      <ul className="divide-y divide-zinc-800">
        {shown.map((r) => (
          <li key={r.id} className="min-w-0 px-4 py-2.5 sm:px-5">
            <a
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="block break-words text-[15px] font-medium hover:underline"
            >
              {r.title ?? r.url}
            </a>
            <p className="mt-0.5 break-words text-xs text-zinc-500">
              {r.siteName ?? hostOf(r.url)} · {timeAgo(r.createdAt)}
            </p>
            {/* Summaries only once open: folded, this list is a headline scan. */}
            {expanded && r.summary ? (
              <p className="mt-1 line-clamp-2 break-words text-sm text-zinc-400">{r.summary}</p>
            ) : null}
          </li>
        ))}
      </ul>

      {rows.length > TEASE ? (
        <div className="px-4 py-3 sm:px-5">
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="text-sm text-emerald-400 hover:underline"
          >
            {expanded ? "Show fewer" : `Show ${hidden} more`}
          </button>
        </div>
      ) : null}
    </section>
  );
}
