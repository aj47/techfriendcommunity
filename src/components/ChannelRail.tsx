import { NavLink } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { shortAgo } from "../lib/format";

// The rest of the site, parked at the bottom of the rail so the shell doesn't
// need the header's nav to be reachable — which matters on a phone, where the
// header's second nav row is dropped to give the conversation its height back.
const secondary = [
  { to: "/channels", label: "All channels" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/resources", label: "Resources" },
  { to: "/search", label: "Search" },
];

function itemClass(isActive: boolean): string {
  return `block rounded-md px-2 py-1.5 text-sm ${
    isActive ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
  }`;
}

// The left pane: the cross-channel feed, then every mirrored channel in
// Discord's own order (channels.list sorts by position and leaves threads out —
// a thread is reachable from the message that started it).
export default function ChannelRail() {
  const channels = useQuery(api.channels.list);

  return (
    <nav aria-label="Channels" className="flex h-full min-h-0 flex-col overflow-y-auto px-2 py-3">
      <NavLink to="/" end className={({ isActive }) => itemClass(isActive)}>
        Latest across all channels
      </NavLink>

      <p className="px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Channels</p>
      {channels === undefined ? (
        <p className="px-2 py-1 text-sm text-zinc-600">Loading…</p>
      ) : channels.length === 0 ? (
        <p className="px-2 py-1 text-sm text-zinc-600">None mirrored yet.</p>
      ) : (
        <ul>
          {channels.map((c) => (
            <li key={c.id}>
              <NavLink
                to={`/channels/${c.slug}`}
                title={c.topic ?? undefined}
                className={({ isActive }) => itemClass(isActive)}
              >
                <span className="flex items-baseline gap-1.5">
                  <span aria-hidden className="shrink-0 text-zinc-600">#</span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {/* Last activity, not an unread count: nothing here tracks
                      what this reader has already seen. */}
                  {c.lastMessageAt ? (
                    <span className="shrink-0 text-[10px] tabular-nums text-zinc-600">{shortAgo(c.lastMessageAt)}</span>
                  ) : null}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}

      {/* mt-auto pins these to the bottom when the channel list is short, and
          simply follows it when the list is long enough to scroll. */}
      <div className="mt-auto pt-4">
        {secondary.map((s) => (
          <NavLink key={s.to} to={s.to} end className={({ isActive }) => itemClass(isActive)}>
            {s.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
