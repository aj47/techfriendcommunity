import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { pageTitle, usePageMeta } from "../lib/head";

export default function SignIn() {
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  usePageMeta(pageTitle("Sign in"));
  // The old `if (isAuthenticated) nav("/settings")` ran during render, updating
  // the router mid-render. <Navigate> performs the same redirect on commit.
  if (isAuthenticated) return <Navigate to="/settings" replace />;
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="text-sm text-zinc-400">No invite needed.</p>
      </div>
      <button onClick={() => void signIn("github", { redirectTo: "/settings" })} className="w-full rounded-md bg-zinc-100 px-3 py-2 font-medium text-zinc-950 hover:bg-white">
        Continue with GitHub
      </button>
      <div className="text-center text-xs text-zinc-500">or</div>
      {sent ? (
        <p className="rounded-md border border-zinc-800 p-3 text-sm text-zinc-300">Check your inbox for a sign-in link.</p>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            const fd = new FormData(e.currentTarget);
            void signIn("resend", fd).then(() => setSent(true)).finally(() => setBusy(false));
          }}
        >
          <input name="email" type="email" required placeholder="you@example.com" className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 outline-none focus:border-zinc-600" />
          <button disabled={busy} className="w-full rounded-md border border-zinc-700 px-3 py-2 hover:bg-zinc-800 disabled:opacity-50">Email me a sign-in link</button>
        </form>
      )}
    </div>
  );
}
