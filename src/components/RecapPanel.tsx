import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import DailySummary from "./DailySummary";
import ResourcesTease from "./ResourcesTease";

// The right pane: what happened today, and what the community has been reading.
// Both cards used to sit above the landing feed and both render nothing at all
// when they have no data, so this panel subscribes to the same two queries with
// the same arguments — Convex serves those from the cards' own subscription
// rather than opening a second one — purely so an empty column can say why it
// is empty instead of looking broken.
const SUMMARY_LIMIT = 6;
const LINK_LIMIT = 9;

export default function RecapPanel() {
  const summary = useQuery(api.summaries.latest, { limit: SUMMARY_LIMIT });
  const links = useQuery(api.links.list, { limit: LINK_LIMIT });
  const loading = summary === undefined || links === undefined;
  const empty = !loading && !summary?.entries.length && links.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="sticky top-0 z-[1] shrink-0 border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Recap</h2>
      </div>
      <div className="space-y-4 p-3">
        {loading ? <p className="px-1 text-sm text-zinc-600">Loading…</p> : null}
        {empty ? (
          <p className="px-1 text-sm text-zinc-600">
            Nothing to recap yet — the bot writes a summary once a day has some traffic, and shared links show up here
            after they're crawled.
          </p>
        ) : null}
        <DailySummary />
        <ResourcesTease />
      </div>
    </div>
  );
}
