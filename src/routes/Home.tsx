import DailySummary from "../components/DailySummary";
import AlphaCards from "../components/AlphaCards";
import LatestPreview from "../components/LatestPreview";
import { HOME_TITLE, usePageMeta } from "../lib/head";

// The landing page is a document, not the chat shell. What the community found
// is the page — Latest Alpha takes the wide column as preview cards — with
// yesterday's highlights folded into a banner above it and the conversation
// running full-height alongside, one click from the real thing at /channels.
export default function Home() {
  usePageMeta(HOME_TITLE);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">
          The techfren Discord<span className="text-zinc-500">, on the web</span>
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          What the community has been reading, what happened yesterday, and a window into the chat.
        </p>
      </div>

      <DailySummary variant="banner" />

      {/* No items-start: the row stretches, so the conversation column runs to
          the same height as the cards beside it and scrolls inside itself. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AlphaCards />
        </div>
        <LatestPreview />
      </div>
    </div>
  );
}
