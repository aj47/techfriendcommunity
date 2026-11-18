import { Navigate } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { pageTitle, usePageMeta } from "../lib/head";
import { DISCORD_INVITE_URL } from "../lib/discord";

export default function SignIn() {
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  usePageMeta(pageTitle("Sign in"));
  // The old `if (isAuthenticated) nav("/settings")` ran during render, updating
  // the router mid-render. <Navigate> performs the same redirect on commit.
  if (isAuthenticated) return <Navigate to="/settings" replace />;
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="text-sm text-zinc-400">No invite needed. Discord is the fastest way in — it claims the points and history you already earned in the server.</p>
      </div>
      <button onClick={() => void signIn("discord", { redirectTo: "/settings" })} className="w-full rounded-md bg-[#5865F2] px-3 py-2 font-medium text-white hover:bg-[#4752c4]">
        Continue with Discord
      </button>
      <div className="text-center text-xs text-zinc-500">or</div>
      <button onClick={() => void signIn("github", { redirectTo: "/settings" })} className="w-full rounded-md bg-zinc-100 px-3 py-2 font-medium text-zinc-950 hover:bg-white">
        Continue with GitHub
      </button>
      <p className="text-xs text-zinc-500">
        Not in the Discord? GitHub works on its own — you can link a Discord account later from Settings.
      </p>
      <a
        href={DISCORD_INVITE_URL}
        target="_blank"
        rel="noopener"
        className="block rounded-md border border-[#5865F2]/40 bg-[#5865F2]/10 px-3 py-2 text-center text-sm text-zinc-200 hover:bg-[#5865F2]/20"
      >
        Rather chat in the Discord app? Join the server
      </a>
    </div>
  );
}
