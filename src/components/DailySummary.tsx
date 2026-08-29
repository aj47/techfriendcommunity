import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { linkify } from "../lib/linkify";

// The bot writes summaries as light markdown (**bold**, "- " bullets, "## "
// headings). Rendering it as React elements rather than HTML keeps the text
// unescaped-by-construction — nothing here can inject markup. Bare URLs in the
// summary text become real links via linkify(), same guarantee.
function inline(line: string, key: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={`${key}-${i}`} className="font-semibold text-zinc-100">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={`${key}-${i}`}>{linkify(part, `${key}-${i}`)}</span>
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

function prettyDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

const COLLAPSED_LINES = 14;

export default function DailySummary() {
  const latest = useQuery(api.summaries.latest, { limit: 6 });
  const [channel, setChannel] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Nothing to show until the bot has pushed a day's summaries. A card that
  // explains its own emptiness would be noise on the busiest page.
  if (!latest || latest.entries.length === 0) return null;

  const entries = latest.entries;
  const active = entries.find((e) => e.channelSlug === channel) ?? entries[0];
  const lines = active.summaryText.split("\n");
  const clipped = !expanded && lines.length > COLLAPSED_LINES;
  const shown = clipped ? lines.slice(0, COLLAPSED_LINES).join("\n") : active.summaryText;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-zinc-800 px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold sm:text-lg">Daily summary</h2>
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
        <SummaryText text={shown} />
        {clipped ? (
          <button onClick={() => setExpanded(true)} className="mt-3 text-sm text-emerald-400 hover:underline">
            Read the rest
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
