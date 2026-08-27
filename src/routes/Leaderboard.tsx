import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { text, useWebMCPTool } from "../webmcp/useWebMCPTool";

type Period = "weekly" | "alltime";

export default function Leaderboard() {
  const [period, setPeriod] = useState<Period>("weekly");
  const rows = useQuery(api.points.leaderboard, { period, limit: 50 });
  const week = useQuery(api.points.currentWeek);

  useWebMCPTool(
    {
      name: "get-leaderboard",
      description: "Get the community points leaderboard, weekly or all-time. Switches the visible tab to match. Points come from posting (Discord, web, email), reactions received, sharing links, and agent-assisted posts.",
      inputSchema: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["weekly", "alltime"], description: "Which board to show. Default weekly." },
          limit: { type: "number", description: "Max rows (default 10, max 50)." },
        },
      },
      async execute({ period: p, limit }: { period?: Period; limit?: number }) {
        const chosen: Period = p === "alltime" ? "alltime" : "weekly";
        setPeriod(chosen);
        const data = rows ?? [];
        const n = Math.min(Math.max(Math.floor(limit ?? 10), 1), 50);
        if (chosen !== period) return text(`Switched to the ${chosen} board; call again to read it.`);
        if (data.length === 0) return text(`The ${chosen} leaderboard is empty so far.`);
        return text(`${chosen === "weekly" ? `This week (${week ?? ""})` : "All-time"} top ${Math.min(n, data.length)}:\n` +
          data.slice(0, n).map((r) => `${r.rank}. ${r.user.handle ? "@" + r.user.handle : r.user.displayName} — ${r.points} pts`).join("\n"));
      },
    },
    [period, rows, week],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Leaderboard</h1>
        <div className="flex rounded-md border border-zinc-800 text-sm">
          {(["weekly", "alltime"] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1 ${period === p ? "bg-zinc-800 text-white" : "text-zinc-400"}`}>
              {p === "weekly" ? `This week${week ? ` · ${week}` : ""}` : "All time"}
            </button>
          ))}
        </div>
      </div>
      {rows === undefined ? (
        <p className="text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-zinc-500">No points yet. Post something!</p>
      ) : (
        <ol className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
          {rows.map((r) => (
            <li key={r.user.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-6 text-right tabular-nums text-zinc-500">{r.rank}</span>
              {r.user.avatarUrl ? <img src={r.user.avatarUrl} alt="" className="h-7 w-7 rounded-full" /> : <div className="h-7 w-7 rounded-full bg-zinc-700" />}
              <span className="flex-1 truncate">
                {r.user.handle ? `@${r.user.handle}` : r.user.displayName}
                {r.user.isShadow ? <span className="ml-2 text-xs text-zinc-500">Discord</span> : null}
              </span>
              <span className="tabular-nums text-emerald-400">{r.points} pts</span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-zinc-500">
        Points: Discord message 1 · web post 2 · email reply 3 · agent-assisted post +1 · link shared 3 · reaction received 1 · first post of the day 5.
      </p>
    </div>
  );
}
