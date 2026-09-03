import DailySummary from "../components/DailySummary";
import ResourcesTease from "../components/ResourcesTease";
import LatestPreview from "../components/LatestPreview";
import { HOME_TITLE, usePageMeta } from "../lib/head";

// The landing page is a document, not the chat shell. Someone arriving cold
// wants what happened and what the community found — so yesterday's highlights
// and the latest alpha take the wide column, and the live conversation is a
// short preview beside them, with the three-pane view a click away at /channels.
export default function Home() {
  usePageMeta(HOME_TITLE);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">
          The techfren Discord<span className="text-zinc-500">, on the web</span>
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          What happened yesterday, what the community has been reading, and a window into the chat.
        </p>
      </div>

      {/* Two thirds to the recap, one to the conversation. The recap cards each
          render nothing at all until the bot has published something, so on a
          cold deployment this collapses to the preview alone rather than to a
          page of empty frames. */}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <DailySummary />
          <ResourcesTease />
        </div>
        <LatestPreview />
      </div>
    </div>
  );
}
