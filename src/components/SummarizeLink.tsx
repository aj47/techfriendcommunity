import { useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";

// Ask for a page to be crawled and summarized into Resources.
//
// The backend mutation has always existed; until now the only thing that could
// call it was an agent tool, so the one person who could add a link by hand was
// the one who wasn't there. The list this feeds is a reactive query, so a new
// row shows up on its own the moment the crawl is queued — there is nothing to
// poll and no success state to invent beyond clearing the box.
export default function SummarizeLink({ onAdded }: { onAdded?: () => void }) {
  const { isAuthenticated } = useConvexAuth();
  const requestSummary = useMutation(api.links.requestSummary);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!isAuthenticated) return null;

  const submit = async () => {
    const raw = url.trim();
    if (!raw || busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const { status } = await requestSummary({ url: raw });
      setUrl("");
      // "done" means someone had already shared it and it is in the list below.
      setNote(status === "done" ? "Already in Resources." : "Crawling — it'll appear below.");
      onAdded?.();
    } catch (e) {
      setError(
        e instanceof ConvexError
          ? String((e.data as { message?: string })?.message ?? e.data)
          : "Couldn't request that summary. Try again in a minute.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
            setNote(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          type="url"
          inputMode="url"
          placeholder="Paste a link to summarize…"
          aria-label="Paste a link to crawl and summarize"
          className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-base outline-none focus:border-zinc-600 sm:py-1.5 sm:text-sm"
        />
        <button
          onClick={() => void submit()}
          disabled={!url.trim() || busy}
          className="shrink-0 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 sm:py-1.5"
        >
          {busy ? "Adding…" : "Summarize"}
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
      {note && !error ? <p className="mt-1 text-xs text-emerald-400">{note}</p> : null}
    </div>
  );
}
