import { useState } from "react";
import { Link } from "react-router-dom";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";

export default function Settings() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me);
  const updateProfile = useMutation(api.users.updateProfile);
  const createLinkCode = useMutation(api.users.createLinkCode);
  const [handle, setHandle] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  if (!isAuthenticated) return <p className="text-zinc-400"><Link to="/signin" className="text-emerald-400">Sign in</Link> to manage your profile.</p>;
  if (!me) return <p className="text-zinc-500">Loading…</p>;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const r = await updateProfile({ handle: handle ?? me.handle ?? "", displayName: displayName ?? me.displayName });
      setMsg(`Saved. You'll appear in Discord as ${displayName ?? me.displayName} (@${r.handle}).`);
    } catch (err) {
      setMsg(err instanceof ConvexError ? String((err.data as { message?: string })?.message) : "Couldn't save.");
    }
  };

  return (
    <div className="max-w-xl space-y-8">
      <section className="space-y-3">
        <h1 className="text-lg font-semibold">Profile</h1>
        <form onSubmit={save} className="space-y-3">
          <label className="block text-sm">
            <span className="text-zinc-400">Handle</span>
            <input value={handle ?? me.handle ?? ""} onChange={(e) => setHandle(e.target.value)} placeholder="yourname" className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 outline-none focus:border-zinc-600" />
          </label>
          <label className="block text-sm">
            <span className="text-zinc-400">Display name (shown in Discord)</span>
            <input value={displayName ?? me.displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 outline-none focus:border-zinc-600" />
          </label>
          <div className="flex items-center gap-3">
            <button className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-emerald-400">Save</button>
            {msg ? <span className="text-sm text-zinc-400">{msg}</span> : null}
          </div>
        </form>
        <p className="text-sm text-zinc-500">{me.pointsThisWeek} pts this week · {me.pointsAllTime} all time</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Link your Discord account</h2>
        {me.discordLinked ? (
          <p className="text-sm text-zinc-400">Linked. Your Discord activity counts toward your points.</p>
        ) : (
          <>
            <p className="text-sm text-zinc-400">Already in the Discord? Claim your history and points: generate a code, then type <code>!link CODE</code> in any channel.</p>
            {code ? (
              <p className="rounded-md border border-emerald-700 bg-emerald-950/40 p-3 font-mono text-lg tracking-widest">!link {code}<span className="ml-3 text-xs font-sans tracking-normal text-zinc-400">expires in 15 min</span></p>
            ) : (
              <button onClick={() => void createLinkCode().then((r) => setCode(r.code))} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">Generate link code</button>
            )}
          </>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Email digests</h2>
        <p className="text-sm text-zinc-500">Coming next: subscribe to a channel and reply to the digest email to post.</p>
      </section>
    </div>
  );
}
