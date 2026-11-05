import { useState } from "react";
import { Link } from "react-router-dom";
import { useConvexAuth, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// The vote gutter: an arrow over a count, the shape every link aggregator has
// used since reddit. Clicking an arrow that is already lit takes the vote back,
// so the control has two states and no separate "undo".
//
// There is no optimistic update here. links.list and links.myUpvotes are both
// reactive queries, so the count and the arrow change together the moment the
// mutation lands — an optimistic patch would have to guess at the list's sort
// arguments to find the row it just changed, and get the ordering wrong while
// it was at it. The in-flight dim is the feedback instead.

function Arrow({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round">
      <path d="M10 4 L17 13 H3 Z" />
    </svg>
  );
}

export default function UpvoteButton({
  resourceId,
  upvotes,
  upvoted,
}: {
  resourceId: Id<"link_resources">;
  upvotes: number;
  upvoted: boolean;
}) {
  const { isAuthenticated } = useConvexAuth();
  const toggleUpvote = useMutation(api.links.toggleUpvote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = (
    <span className={`text-xs font-semibold tabular-nums ${upvoted ? "text-emerald-400" : "text-zinc-400"}`}>
      {upvotes}
    </span>
  );

  // A visitor sees the score but has nothing to click: the arrow is the
  // invitation to sign in, which is more use than a disabled button.
  if (!isAuthenticated) {
    return (
      <div className="flex w-9 shrink-0 flex-col items-center gap-0.5">
        <Link
          to="/signin"
          title="Sign in to upvote"
          aria-label="Sign in to upvote"
          className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-emerald-400"
        >
          <Arrow filled={false} />
        </Link>
        {count}
      </div>
    );
  }

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await toggleUpvote({ resourceId });
    } catch (e) {
      setError(
        e instanceof ConvexError
          ? String((e.data as { message?: string })?.message ?? e.data)
          : "Couldn't record that vote.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-9 shrink-0 flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        aria-pressed={upvoted}
        aria-label={upvoted ? "Remove upvote" : "Upvote"}
        title={error ?? (upvoted ? "Remove upvote" : "Upvote")}
        className={`rounded p-1 hover:bg-zinc-800 disabled:opacity-40 ${
          error ? "text-red-400" : upvoted ? "text-emerald-400" : "text-zinc-500 hover:text-emerald-400"
        }`}
      >
        <Arrow filled={upvoted} />
      </button>
      {count}
      {/* The failure is worth announcing but not worth a line of layout in
          every row — the button's title carries it for a pointer, this for a
          screen reader. */}
      <span role="status" aria-live="polite" className="sr-only">
        {error ?? ""}
      </span>
    </div>
  );
}
