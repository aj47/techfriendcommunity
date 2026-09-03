import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import ChannelRail from "./ChannelRail";
import RecapPanel from "./RecapPanel";

// The chat shell: channel rail on the left, the conversation in the middle, the
// day's recap on the right. The cross-channel Latest feed and a single channel
// are the same screen with a different middle pane, so both render inside one
// shell instance — picking a room swaps the middle and leaves the other two
// panes alone, subscriptions and scroll position included.
//
// Widths, biggest first: below xl the recap folds into a drawer, and below md
// so does the rail. The conversation is the pane that is always on screen.
type Pane = "rail" | "recap";

export default function ChatShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  // Which pane is open, and the route it was opened from. Navigating is the
  // answer to "which channel?", so the drawer has done its job — leaving it up
  // would cover the room it just opened. Remembering the route and comparing
  // during render closes it without an effect that sets state on every
  // navigation just to undo one.
  const [opened, setOpened] = useState<{ pane: Pane; at: string } | null>(null);
  const drawer = opened && opened.at === pathname ? opened.pane : null;
  const open = (pane: Pane) => setOpened({ pane, at: pathname });

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpened(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const button = "rounded-md border border-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-900";

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-56 shrink-0 border-r border-zinc-800 md:block lg:w-60">
        <ChannelRail />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* A way back to whichever panes are currently folded away. The whole
            bar disappears at xl, where nothing is folded. */}
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-3 py-2 xl:hidden">
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => open("rail")}
            className={`${button} md:hidden`}
          >
            ☰ Channels
          </button>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => open("recap")}
            className={`${button} ml-auto`}
          >
            Recap
          </button>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>

      <aside className="hidden w-80 shrink-0 border-l border-zinc-800 xl:block">
        <RecapPanel />
      </aside>

      {drawer ? (
        // z-30 clears the sticky header (z-10) so the drawer covers the app
        // rather than sliding under its top bar.
        <div className="fixed inset-0 z-30 flex xl:hidden">
          <button
            type="button"
            aria-label="Close panel"
            onClick={() => setOpened(null)}
            className="absolute inset-0 bg-black/60"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={drawer === "rail" ? "Channels" : "Recap"}
            className={`relative flex min-h-0 w-[85%] max-w-sm flex-col border-zinc-800 bg-zinc-950 ${
              drawer === "rail" ? "border-r" : "ml-auto border-l"
            }`}
          >
            {drawer === "rail" ? <ChannelRail /> : <RecapPanel />}
          </div>
        </div>
      ) : null}
    </div>
  );
}
