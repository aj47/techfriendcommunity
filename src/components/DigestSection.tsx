import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";

// Declarative WebMCP: the browser synthesizes a "subscribe-to-digest" tool from this
// form. No `toolautosubmit`, so an agent can fill it but the human confirms.
const formToolAttrs = {
  toolname: "subscribe-to-digest",
  tooldescription:
    "Subscribe the signed-in person to an email digest of one community channel (daily or weekly). They can reply to the digest email to post in that channel. The browser asks the human to confirm before submitting.",
} as Record<string, string>;

export default function DigestSection() {
  const data = useQuery(api.email.mySubscriptions);
  const channels = useQuery(api.channels.list);
  const subscribe = useMutation(api.email.subscribe);
  const unsubscribe = useMutation(api.email.unsubscribe);
  const [msg, setMsg] = useState<string | null>(null);
  const subs = Array.isArray(data) ? [] : data?.subscriptions ?? [];
  const email = Array.isArray(data) ? null : data?.email ?? null;

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Email digests</h2>
      <p className="text-sm text-zinc-400">
        Get a digest of a channel by email and <strong>reply to post</strong> — your reply lands in Discord and here.
        {email ? <span className="text-zinc-500"> Sent to {email}.</span> : <span className="text-amber-300"> Sign in with an email address to enable.</span>}
      </p>
      <form
        {...formToolAttrs}
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const p = subscribe({ slug: String(fd.get("channel")), cadence: fd.get("cadence") === "weekly" ? "weekly" : "daily" })
            .then((r) => { setMsg(`Subscribed to #${r.channel} (${r.cadence}).`); return `Subscribed to #${r.channel}, ${r.cadence} digest.`; })
            .catch((err) => { const m = err instanceof ConvexError ? String((err.data as { message?: string })?.message) : "Couldn't subscribe."; setMsg(m); return m; });
          const native = e.nativeEvent as SubmitEvent & { respondWith?: (r: Promise<unknown>) => void };
          native.respondWith?.(p.then((text) => ({ content: [{ type: "text", text }] })));
        }}
      >
        <label className="text-sm">
          <span className="block text-zinc-400">Channel</span>
          <select name="channel" required {...({ toolparamdescription: "Channel slug, e.g. general" } as Record<string, string>)} className="mt-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5">
            {(channels ?? []).map((c) => <option key={c.id} value={c.slug}>#{c.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-zinc-400">Cadence</span>
          <select name="cadence" {...({ toolparamdescription: "daily or weekly" } as Record<string, string>)} className="mt-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>
        <button type="submit" disabled={!email} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50">Subscribe</button>
        {msg ? <span className="text-sm text-zinc-400">{msg}</span> : null}
      </form>
      {subs.length ? (
        <ul className="divide-y divide-zinc-800 rounded-md border border-zinc-800 text-sm">
          {subs.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-3 py-2">
              <span>#{s.name} <span className="text-zinc-500">· {s.cadence}</span></span>
              <button onClick={() => void unsubscribe({ subscriptionId: s.id })} className="text-zinc-500 hover:text-white">Unsubscribe</button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
