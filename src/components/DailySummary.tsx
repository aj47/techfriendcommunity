import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { linkify } from "../lib/linkify";

// The bot writes summaries as light Discord markdown (**bold**, `code`, "- "
// bullets, "## " headings, <t:...> timestamps). Rendering it as React elements
// rather than HTML keeps the text unescaped-by-construction — nothing here can
// inject markup. URLs and timestamps become real elements via linkify(), same
// guarantee.

// `code` spans and links, the two things that can appear inside a bold run —
// the bot writes usernames as **`name`**, which used to reach the page with its
// backticks intact.
function codeAndLinks(text: string, key: string) {
  return text.split(/(`[^`\n]+`)/g).map((part, i) =>
    part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
      <code key={`${key}-c${i}`} className="rounded bg-zinc-800/80 px-1 py-px text-[13px] text-zinc-200">
        {part.slice(1, -1)}
      </code>
    ) : (
      <span key={`${key}-t${i}`}>{linkify(part, `${key}-t${i}`)}</span>
    ),
  );
}

function inline(line: string, key: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={`${key}-b${i}`} className="font-semibold text-zinc-100">
        {codeAndLinks(part.slice(2, -2), `${key}-b${i}`)}
      </strong>
    ) : (
      <span key={`${key}-s${i}`}>{codeAndLinks(part, `${key}-s${i}`)}</span>
    ),
  );
}

function SummaryText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-[15px] leading-relaxed text-zinc-300">
      {text.split("\n").map((raw, i) => {
        const line = raw.trimEnd();
        const key = `l${i}`;
        if (!line.trim()) return <div key={key} className="h-1.5" />;
        const heading = line.match(/^#{1,4}\s+(.*)$/);
        if (heading) {
          return (
            <h4 key={key} className="pt-1 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              {inline(heading[1], key)}
            </h4>
          );
        }
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        if (bullet) {
          return (
            <div key={key} className="flex gap-2">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
              <p className="min-w-0 break-words">{inline(bullet[1], key)}</p>
            </div>
          );
        }
        return (
          <p key={key} className="break-words">
            {inline(line, key)}
          </p>
        );
      })}
    </div>
  );
}

// The banner shows one line before you open it, so the markdown has to go: no
// bullet dashes, no bold stars, no backticks, no heading hashes. Headings are
// skipped outright — "## Highlights" is a label, not the news.
function teaserOf(text: string): string {
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || /^#{1,4}\s/.test(line)) continue;
    const flat = line
      .replace(/^[-*•]\s+/, "")
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (flat) return flat;
  }
  return "";
}

function prettyDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

// Collapsed height in pixels rather than a line count: one bullet that wraps
// to four lines on a phone used to blow past a 14-line budget, and a summary
// that happened to be exactly 14 lines long collapsed to nothing at all — it
// rendered whole and simply looked truncated. Clipping by height and measuring
// the rendered element decides this from what the reader actually sees.
const COLLAPSED_PX = 130;
// Slack, so a summary that overflows by a couple of lines doesn't get a
// "show more" button that reveals almost nothing.
const OVERFLOW_SLACK_PX = 24;

// "card" is the full panel the chat shell's recap pane shows. "banner" is the
// landing page's slim strip: one line and a date, opening to the same text —
// there, the summary is context for the page, not the page itself.
export default function DailySummary({ variant = "card" }: { variant?: "card" | "banner" } = {}) {
  const latest = useQuery(api.summaries.latest, { limit: 6 });
  const [channel, setChannel] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const entries = latest?.entries ?? [];
  const active = entries.find((e) => e.channelSlug === channel) ?? entries[0];

  // Re-measure when the text changes (channel tab, or a live summary push) and
  // whenever the element resizes — a rotation or a font change moves the line
  // count under us.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > COLLAPSED_PX + OVERFLOW_SLACK_PX);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active?.summaryText]);

  // Nothing to show until the bot has pushed a day's summaries. A card that
  // explains its own emptiness would be noise on the busiest page.
  if (!active || !latest) return null;

  const clipped = overflows && !expanded;

  if (variant === "banner") {
    return (
      <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-zinc-900/60 sm:px-4"
        >
          <span className="shrink-0 rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
            Yesterday’s Highlights
          </span>
          {/* The teaser is the first thing to go when the strip gets narrow —
              the label and the date are what make it read as a banner. */}
          <span className="hidden min-w-0 flex-1 truncate text-sm text-zinc-400 sm:block">
            {teaserOf(active.summaryText)}
          </span>
          <span className="ml-auto shrink-0 text-xs text-zinc-500 sm:ml-0">{prettyDate(latest.date)}</span>
          <span aria-hidden className="shrink-0 text-[10px] text-zinc-500">
            {expanded ? "▲" : "▼"}
          </span>
        </button>

        {expanded ? (
          <div className="border-t border-zinc-800 px-3 py-3 sm:px-4">
            {entries.length > 1 ? (
              <div className="mb-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {entries.map((e) => (
                  <button
                    key={e.channelSlug ?? e.channelName}
                    onClick={() => setChannel(e.channelSlug)}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                      e === active ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                    }`}
                  >
                    #{e.channelName}
                  </button>
                ))}
              </div>
            ) : null}
            {/* Open means open: no height clamp here, unlike the card. */}
            <SummaryText text={active.summaryText} />
            <p className="mt-3 text-xs text-zinc-500">
              #{active.channelName} · {active.messageCount} messages · {active.activeUsers} people
            </p>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-zinc-800 px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold sm:text-lg">Yesterday’s Highlights</h2>
        <p className="text-xs text-zinc-500">{prettyDate(latest.date)}</p>
      </div>

      {entries.length > 1 ? (
        <div className="-mx-px flex gap-1.5 overflow-x-auto px-4 pt-3 sm:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {entries.map((e) => (
            <button
              key={e.channelSlug ?? e.channelName}
              onClick={() => {
                setChannel(e.channelSlug);
                setExpanded(false);
              }}
              className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                e === active ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-400 hover:text-zinc-100"
              }`}
            >
              #{e.channelName}
            </button>
          ))}
        </div>
      ) : null}

      <div className="px-4 py-4 sm:px-5">
        {/* The full summary is always in the DOM — find-in-page, screen readers
            and copy-paste get all of it, and only the visual height is clipped.
            A mask fades the last lines out instead of guillotining a bullet, so
            the cut reads as "there is more" rather than "this is broken". */}
        <div
          ref={bodyRef}
          className="overflow-hidden"
          style={
            clipped
              ? {
                  maxHeight: COLLAPSED_PX,
                  maskImage: "linear-gradient(to bottom, #000 72%, transparent 100%)",
                  WebkitMaskImage: "linear-gradient(to bottom, #000 72%, transparent 100%)",
                }
              : undefined
          }
        >
          <SummaryText text={active.summaryText} />
        </div>
        {overflows ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="mt-3 text-sm text-emerald-400 hover:underline"
          >
            {expanded ? "Show less" : "Read the full summary"}
          </button>
        ) : null}
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>
            {active.messageCount.toLocaleString()} messages · {active.activeUsers} people
          </span>
          {active.channelSlug ? (
            <Link to={`/channels/${active.channelSlug}`} className="text-emerald-400 hover:underline">
              Open #{active.channelName}
            </Link>
          ) : null}
        </p>
      </div>
    </section>
  );
}
