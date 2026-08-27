import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";

const nav = [
  { to: "/", label: "Channels" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/resources", label: "Resources" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center gap-6">
          <Link to="/" className="font-semibold tracking-tight">
            techfriend<span className="text-emerald-400">community</span>
          </Link>
          <nav className="flex gap-1 text-sm">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md hover:bg-zinc-800 ${isActive ? "bg-zinc-800 text-white" : "text-zinc-400"}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {isLoading ? null : isAuthenticated ? (
              <>
                <Link to="/settings" className="flex items-center gap-2 text-zinc-300 hover:text-white">
                  {me?.avatarUrl ? <img src={me.avatarUrl} className="h-6 w-6 rounded-full" alt="" /> : null}
                  <span>{me?.handle ? `@${me.handle}` : "Set up profile"}</span>
                  {me ? <span className="text-emerald-400 tabular-nums">{me.pointsAllTime} pts</span> : null}
                </Link>
                <button onClick={() => void signOut()} className="text-zinc-500 hover:text-white">Sign out</button>
              </>
            ) : (
              <Link to="/signin" className="rounded-md bg-emerald-500 px-3 py-1.5 font-medium text-zinc-950 hover:bg-emerald-400">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-zinc-800 py-4 text-center text-xs text-zinc-500">
        A web + email front door to the techfren Discord. Agent-ready via WebMCP.
      </footer>
    </div>
  );
}
