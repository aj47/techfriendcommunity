import { useNavigate } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";

export default function SignIn() {
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const nav = useNavigate();
  if (isAuthenticated) nav("/settings");
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="text-sm text-zinc-400">Discord is the fastest way in — it claims the points and history you already earned in the server.</p>
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
    </div>
  );
}
