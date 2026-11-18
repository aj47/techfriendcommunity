import { Link } from "react-router-dom";
import DailySummary from "../components/DailySummary";
import LatestPreview from "../components/LatestPreview";
import { HOME_TITLE, usePageMeta } from "../lib/head";
import { DISCORD_INVITE_URL } from "../lib/discord";

// The landing page is a document, not the chat shell. It opens straight into
// the content: the latest highlights as the wide column's main card, with the
// conversation running full-height alongside and the real thing a click away at
// /channels. The link archive is not duplicated here — it lives at /resources.
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

      {/* The community's own banner, carrying the name the sr-only heading
          above states. Served from our origin rather than hotlinked from
          pbs.twimg.com: that URL has a mutable timestamp segment that changes
          whenever the banner is re-uploaded, and the host refuses some foreign
          referrers — a dead hero is worse than no hero.

          The file is 3:1. On a phone that is a 125px strip, so below 640px the
          frame is squarer and anchored left, which keeps the lockup legible
          and crops the crowd instead. Width and height are set so the space is
          reserved before the image arrives and nothing below it jumps. */}
      <img
        src="/hero.webp"
        alt="techfren — 3,500+ builders shipping with AI"
        width={1500}
        height={500}
        decoding="async"
        fetchPriority="high"
        className="aspect-[2/1] w-full rounded-xl border border-zinc-800 object-cover object-left sm:aspect-[3/1] sm:object-center"
      />

      {/* The two ways in, side by side: join the Discord server itself, or use
          this web app (read freely, sign in to post). Posts sync both ways. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-lg border border-[#5865F2]/40 bg-[#5865F2]/10 p-3">
          <h2 className="text-sm font-semibold text-zinc-100">Join on Discord</h2>
          <p className="flex-1 text-sm text-zinc-400">Voice chats, live streams, the bots, and points you can spend on roles. Free, no approval.</p>
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener"
            className="self-start rounded-md bg-[#5865F2] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4752c4]"
          >
            Open in Discord
          </a>
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 p-3">
          <h2 className="text-sm font-semibold text-zinc-100">Use the web app</h2>
          <p className="flex-1 text-sm text-zinc-400">No Discord account needed. Read every channel, post from your browser (it shows up in Discord under your name), and get email digests you can reply to.</p>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link to="/channels" className="rounded-md border border-zinc-700 px-3 py-1.5 font-medium text-zinc-200 hover:bg-zinc-800">
              Read live chat
            </Link>
            <Link to="/signin" className="rounded-md bg-emerald-500 px-3 py-1.5 font-medium text-zinc-950 hover:bg-emerald-400">
              Sign in to post
            </Link>
          </div>
        </div>
      </div>

      {/* On phones, show a short window into the live conversation before the
          highlights. At desktop widths both columns stretch together. */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <div className="order-1 min-w-0 lg:order-2">
          <LatestPreview />
        </div>
        <div className="order-2 min-w-0 lg:order-1 lg:col-span-2">
          <DailySummary startExpanded />
        </div>
      </div>
    </div>
  );
}
