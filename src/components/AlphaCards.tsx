import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { timeAgo } from "../lib/format";
import { hostOf, previewImageFor } from "../lib/linkPreview";

// The landing page's main event: what the community has been reading, as
// preview cards rather than a list of blue text. The compact list version still
// exists for the chat shell's narrow recap pane (src/components/ResourcesTease).
const LIMIT = 8;

export default function AlphaCards() {
  const rows = useQuery(api.links.list, { limit: LIMIT });
  // Hotlinked og:images rot: the page moves, the CDN expires the object, the
  // host refuses a foreign referrer. A card that falls back to its domain reads
  // as deliberate; a broken-image glyph reads as a bug.
  const [broken, setBroken] = useState<Set<string>>(new Set());

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-zinc-800 px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold sm:text-lg">Latest Alpha</h2>
        <Link to="/resources" className="text-xs text-emerald-400 hover:underline">
          Search all resources
        </Link>
      </div>

      {rows === undefined ? (
        <p className="px-4 py-6 text-sm text-zinc-600 sm:px-5">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-zinc-600 sm:px-5">
          Nothing here yet — links shared in the Discord land here once they have been read and summarized.
        </p>
      ) : (
        <ul className="grid gap-3 p-3 sm:grid-cols-2 sm:gap-4 sm:p-4">
          {rows.map((r) => {
            const image = broken.has(r.id) ? null : previewImageFor(r);
            const host = r.siteName ?? hostOf(r.url);
            return (
              <li key={r.id}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex h-full flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/40 hover:border-zinc-600"
                >
                  {image ? (
                    <img
                      src={image}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() => setBroken((s) => new Set(s).add(r.id))}
                      className="aspect-[16/9] w-full bg-zinc-900 object-cover"
                    />
                  ) : (
                    // No stored image. The domain, set large, is still a
                    // recognisable mark — and every card keeps the same shape.
                    <div className="flex aspect-[16/9] w-full items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-800 px-4">
                      <span className="truncate text-sm font-medium text-zinc-500">{host}</span>
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
                    <p className="line-clamp-2 break-words text-[15px] font-medium group-hover:underline">
                      {r.title ?? r.url}
                    </p>
                    {r.summary ? (
                      <p className="line-clamp-2 break-words text-sm text-zinc-400">{r.summary}</p>
                    ) : r.crawlStatus === "pending" ? (
                      <p className="text-sm italic text-zinc-600">Summarizing…</p>
                    ) : null}
                    <p className="mt-auto truncate pt-1 text-xs text-zinc-500">
                      {host} · {timeAgo(r.createdAt)}
                    </p>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
