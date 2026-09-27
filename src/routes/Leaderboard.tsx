import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { pageTitle, usePageMeta } from "../lib/head";

type Row = {
  rank: number;
  points: number;
  lifetimePoints: number;
  spent: number;
  name: string;
  user?: { handle?: string | null; avatarUrl?: string | null } | null;
};

function MemberRow({ row, figure }: { row: Row; figure: "earned" | "spent" }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className="w-6 text-right tabular-nums text-zinc-500">{row.rank}</span>
      {row.user?.avatarUrl ? (
        <img src={row.user.avatarUrl} alt="" className="h-7 w-7 rounded-full" />
      ) : (
        <div className="h-7 w-7 rounded-full bg-zinc-700" />
      )}
      <span className="flex-1 truncate">{row.user?.handle ? `@${row.user.handle}` : row.name}</span>
      {/* The balance this member has left, and what they have spent. Neither
          hides the other: spending is the point of the economy, so it is shown
          next to what it cost rather than treated as a missing number. */}
      <span className="tabular-nums text-xs text-zinc-500">
        {row.points} left{figure === "earned" && row.spent > 0 ? ` · ${row.spent} spent` : ""}
      </span>
      <span className="tabular-nums text-emerald-400">
        {figure === "spent" ? `${row.spent} spent` : `${row.lifetimePoints} earned`}
      </span>
    </li>
  );
}

export default function Leaderboard() {
  const rows = useQuery(api.points.leaderboard, { limit: 50 });
  const spenders = useQuery(api.points.topSpenders, { limit: 10 });
  const syncedAt = useQuery(api.points.lastSyncedAt);
  usePageMeta(pageTitle("Leaderboard"), "Community standings, scored by the techfren bot.");

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Leaderboard</h1>
        {rows === undefined ? (
          <p className="text-zinc-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-zinc-500">No standings yet.</p>
        ) : (
          <ol className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {rows.map((r) => (
              <MemberRow key={r.rank} row={r} figure="earned" />
            ))}
          </ol>
        )}
      </div>

      {spenders && spenders.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Biggest spenders</h2>
          <ol className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {spenders.map((r) => (
              <MemberRow key={r.rank} row={r} figure="spent" />
            ))}
          </ol>
        </div>
      ) : null}

      <p className="text-xs text-zinc-500">
        Points are awarded by the techfren bot, which reviews each day's contributions and scores them on how
        much they helped the community. They can be spent in Discord — on a role colour, a GIF bypass, frenbot access.
        Ranked on everything a member has earned, so spending never costs anyone their place. This page
        mirrors those standings
        {syncedAt ? ` (updated ${new Date(syncedAt).toLocaleString()})` : ""}.
      </p>
    </div>
  );
}
