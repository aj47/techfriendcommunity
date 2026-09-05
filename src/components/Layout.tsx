import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { isChatShellRoute } from "../lib/appShell";

const nav = [
  { to: "/channels", label: "Live chat" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/resources", label: "Resources" },
  { to: "/search", label: "Search" },
];

function NavItems() {
  return (
    <>
      {nav.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          className={({ isActive }) =>
            `shrink-0 rounded-md px-3 py-1.5 hover:bg-zinc-800 ${isActive ? "bg-zinc-800 text-white" : "text-zinc-400"}`
          }
        >
          {n.label}
        </NavLink>
      ))}
    </>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();
  const { pathname } = useLocation();

  // The chat shell is an app screen, not a document: it fills the viewport, its
  // panes scroll themselves, and it must not be given a max width, page padding
  // or a footer. Every other route stays the ordinary centered column.
  const chat = isChatShellRoute(pathname);

  return (
    <div className={chat ? "flex h-dvh flex-col overflow-hidden" : "flex min-h-screen flex-col"}>
      <header className="sticky top-0 z-10 shrink-0 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className={`mx-auto w-full px-3 sm:px-4 ${chat ? "" : "max-w-5xl"}`}>
          <div className="flex h-12 items-center gap-4 sm:h-14 sm:gap-6">
            <Link to="/" className="shrink-0 font-semibold tracking-tight">
              techfriend<span className="text-emerald-400">community</span>
            </Link>
            {/* Wide screens keep the one-row header; narrow ones get the row below. */}
            <nav className="hidden gap-1 text-sm sm:flex">
              <NavItems />
            </nav>
            <div className="ml-auto flex min-w-0 items-center gap-2 text-sm sm:gap-3">
              {isLoading ? null : isAuthenticated ? (
                <>
                  <Link to="/settings" className="flex min-w-0 items-center gap-2 text-zinc-300 hover:text-white">
                    {me?.avatarUrl ? <img src={me.avatarUrl} className="h-6 w-6 shrink-0 rounded-full" alt="" /> : null}
                    <span className="max-w-[7rem] truncate sm:max-w-none">
                      {me?.handle ? `@${me.handle}` : "Set up profile"}
                    </span>
                    {me ? <span className="shrink-0 tabular-nums text-emerald-400">{me.pointsAllTime} pts</span> : null}
                  </Link>
                  <button onClick={() => void signOut()} className="shrink-0 text-zinc-500 hover:text-white">
                    Sign out
                  </button>
                </>
              ) : (
                <Link
                  to="/signin"
                  className="shrink-0 rounded-md bg-emerald-500 px-3 py-1.5 font-medium text-zinc-950 hover:bg-emerald-400"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
          {/* Scrolls sideways rather than wrapping, so the header stays one line
              tall. The chat shell drops it: every link is in its channel rail,
              and on a phone this row costs the conversation a visible slice of
              its height. */}
          {chat ? null : (
            <nav className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-2 text-sm sm:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <NavItems />
            </nav>
          )}
        </div>
      </header>
      {chat ? (
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      ) : (
        <>
          <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-4 sm:px-4 sm:py-6">{children}</main>
          <footer className="border-t border-zinc-800 px-4 py-4 text-center text-xs text-zinc-500">
            A web + email front door to the techfren community.
          </footer>
        </>
      )}
    </div>
  );
}
