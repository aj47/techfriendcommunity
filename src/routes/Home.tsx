import DailySummary from "../components/DailySummary";
import AlphaCards from "../components/AlphaCards";
import LatestPreview from "../components/LatestPreview";
import { HOME_TITLE, usePageMeta } from "../lib/head";

// The landing page is a document, not the chat shell. It opens straight into
// the content: yesterday's highlights folded into a banner, then what the
// community found as preview cards in the wide column, with the conversation
// running full-height alongside and the real thing a click away at /channels.
//
// The heading is present but not painted. It is the page's name for crawlers
// and for anyone arriving by screen reader — both of which read an <h1> as the
// answer to "what is this page?" — and a landing page that starts with a card
// has nowhere to put that answer visually.
export default function Home() {
  usePageMeta(HOME_TITLE);

  return (
    <div className="space-y-4">
      <h1 className="sr-only">AI news, links and live chat from the techfren community</h1>

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
