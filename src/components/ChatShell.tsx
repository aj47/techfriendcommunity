import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
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

function MobileDrawer({ pane, onDismiss }: { pane: Pane; onDismiss: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal(); // Native modal behavior keeps Tab inside and makes the page inert.
    return () => {
      if (dialog.open) dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={pane === "rail" ? "Channels" : "Recap"}
      // StrictMode briefly closes and reopens effects in development. Ignore
      // the delayed close event if the same dialog has since reopened.
      onClose={() => { if (!ref.current?.open) onDismiss(); }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const items = [...e.currentTarget.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )].filter((item) => item.getClientRects().length > 0);
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === e.currentTarget)) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
      onClick={(e) => {
        // A click on the backdrop targets the dialog itself, outside its box.
        if (e.target !== e.currentTarget) return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
          e.currentTarget.close();
        }
      }}
      className={`fixed inset-y-0 h-dvh max-h-none w-[85%] max-w-sm overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-zinc-100 shadow-2xl backdrop:bg-black/65 open:flex open:flex-col ${
        pane === "rail" ? "ml-0 mr-auto border-r" : "ml-auto mr-0 border-l"
      }`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-2">
        <h2 className="text-sm font-semibold">{pane === "rail" ? "Channels" : "Recap"}</h2>
        <button
          type="button"
          autoFocus
          onClick={() => ref.current?.close()}
          className="rounded-md px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
        >
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1">{pane === "rail" ? <ChannelRail /> : <RecapPanel showHeader={false} />}</div>
    </dialog>
  );
}

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

      {drawer ? <MobileDrawer pane={drawer} onDismiss={() => setOpened(null)} /> : null}
    </div>
  );
}
