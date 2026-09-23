import { Link } from "react-router-dom";
import DailySummary from "../components/DailySummary";
import AlphaCards from "../components/AlphaCards";
import LatestPreview from "../components/LatestPreview";
import { HOME_TITLE, usePageMeta } from "../lib/head";

// A short invitation explains the two ways in: read freely, or sign in to post.
// The highlights and live preview remain immediately below it.
export default function Home() {
  usePageMeta(HOME_TITLE);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-zinc-800 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">The techfren conversation, on the web.</h1>
          <p className="text-sm leading-relaxed text-zinc-400">
            Read live Discord chat and the links members share. Sign in with Discord or GitHub to post from your browser and get email digests.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 text-sm">
          <Link to="/channels" className="rounded-md border border-zinc-700 px-3 py-1.5 font-medium text-zinc-200 hover:bg-zinc-800">
            Read live chat
          </Link>
          <Link to="/signin" className="rounded-md bg-emerald-500 px-3 py-1.5 font-medium text-zinc-950 hover:bg-emerald-400">
            Join to post
          </Link>
        </div>
      </div>

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
