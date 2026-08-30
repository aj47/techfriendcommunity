import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { text, useWebMCPTool } from "../webmcp/useWebMCPTool";
import { pageTitle, usePageMeta } from "../lib/head";

export default function Leaderboard() {
  const rows = useQuery(api.points.leaderboard, { limit: 50 });
  const syncedAt = useQuery(api.points.lastSyncedAt);
  usePageMeta(pageTitle("Leaderboard"), "Community standings, scored in Discord by the techfren bot.");

  useWebMCPTool(
    {
      name: "get-leaderboard",
      description:
        "Get the community points leaderboard. Points are awarded by the techfren Discord bot, which judges each day's contributions for quality; this site mirrors those standings read-only.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max rows (default 10, max 50)." },
        },
      },
      async execute({ limit }: { limit?: number }) {
        const data = rows ?? [];
        if (data.length === 0) return text("The leaderboard is empty so far.");
        const n = Math.min(Math.max(Math.floor(limit ?? 10), 1), 50);
        return text(
          `Top ${Math.min(n, data.length)} (Discord points):\n` +
            data
              .slice(0, n)
              .map((r) => `${r.rank}. ${r.user?.handle ? "@" + r.user.handle : r.name} — ${r.points} pts`)
              .join("\n"),
        );
      },
    },
    [rows],
  );

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
              <span className="tabular-nums text-emerald-400">{r.points} pts</span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-zinc-500">
        Points are awarded in Discord by the techfren bot, which reviews each day's contributions and scores them on how
        much they helped the community. This page mirrors those standings
        {syncedAt ? ` (updated ${new Date(syncedAt).toLocaleString()})` : ""}.
      </p>
    </div>
  );
}
