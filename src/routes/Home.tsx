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

      {/* On phones, show a short window into the live conversation before the
          resource archive. At desktop widths both columns stretch together. */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <div className="order-1 min-w-0 lg:order-2">
          <LatestPreview />
        </div>
        <div className="order-2 min-w-0 lg:order-1 lg:col-span-2">
          <AlphaCards />
        </div>
      </div>
    </div>
  );
}
