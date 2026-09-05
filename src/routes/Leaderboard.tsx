import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { pageTitle, usePageMeta } from "../lib/head";

export default function Leaderboard() {
  const rows = useQuery(api.points.leaderboard, { limit: 50 });
  const syncedAt = useQuery(api.points.lastSyncedAt);
  usePageMeta(pageTitle("Leaderboard"), "Community standings, scored by the techfren bot.");

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Leaderboard</h1>
      {rows === undefined ? (
        <p className="text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-zinc-500">No standings yet.</p>
      ) : (
        <ol className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
          {rows.map((r) => (
            <li key={r.rank} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-6 text-right tabular-nums text-zinc-500">{r.rank}</span>
              {r.user?.avatarUrl ? (
                <img src={r.user.avatarUrl} alt="" className="h-7 w-7 rounded-full" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-zinc-700" />
              )}
              <span className="flex-1 truncate">{r.user?.handle ? `@${r.user.handle}` : r.name}</span>
              {/* Spending in Discord draws down the balance this board ranks on,
                  so anyone who has spent gets their all-time total alongside it —
                  otherwise the board reads as if they had contributed less. */}
              {r.spent > 0 ? (
                <span className="tabular-nums text-xs text-zinc-500" title={`${r.spent} spent in Discord`}>
                  {r.lifetimePoints} all-time
                </span>
              ) : null}
              <span className="tabular-nums text-emerald-400">{r.points} pts</span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-zinc-500">
        Points are awarded by the techfren bot, which reviews each day's contributions and scores them on how
        much they helped the community. They can be spent in Discord — on a role colour, a GIF bypass, frenbot access —
        so members who have spent any show what they have earned all-time next to their remaining balance. This page
        mirrors those standings
        {syncedAt ? ` (updated ${new Date(syncedAt).toLocaleString()})` : ""}.
      </p>
    </div>
  );
}
