import { useState } from "react";
import type { Media } from "../lib/linkify";

// Discord CDN links are signed and expire, so an old attachment renders as a
// broken-image glyph. When one fails to load we drop the embed entirely — the
// URL is still there in the message text as a link, which is the honest state.
export default function MediaEmbeds({ media, thumb = false }: { media: Media[]; thumb?: boolean }) {
  const [broken, setBroken] = useState<string[]>([]);
  const shown = media.filter((m) => !broken.includes(m.url));
  if (shown.length === 0) return null;
  const fail = (url: string) => setBroken((b) => (b.includes(url) ? b : [...b, url]));
  const frame = "rounded-lg border border-zinc-800 bg-zinc-950";

  return (
    <div className={`flex flex-wrap gap-2 ${thumb ? "mt-1.5" : "mt-2"}`}>
      {shown.map((m) =>
        m.kind === "video" ? (
          // Not wrapped in a link: the controls are the point, and a click on
          // "play" that navigated away instead would be maddening.
          <video
            key={m.url}
            src={m.url}
            controls={!thumb}
            muted={thumb}
            preload="metadata"
            onError={() => fail(m.url)}
            className={`${frame} ${thumb ? "h-20 w-28 object-cover" : "max-h-[22rem] w-auto max-w-full"}`}
          />
        ) : thumb ? (
          // In the home feed the whole row is already a link to the channel,
          // so the thumbnail must not be an anchor of its own.
          <img
            key={m.url}
            src={m.url}
            alt=""
            loading="lazy"
            onError={() => fail(m.url)}
            className={`${frame} h-20 w-28 object-cover`}
          />
        ) : (
          <a
            key={m.url}
            href={m.href ?? m.url}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            onClick={(e) => e.stopPropagation()}
            className="block max-w-full"
            title="Open the original"
          >
            <img
              src={m.url}
              alt=""
              loading="lazy"
              onError={() => fail(m.url)}
              className={`${frame} max-h-[22rem] w-auto max-w-full object-contain hover:border-zinc-600`}
            />
          </a>
        ),
      )}
    </div>
  );
}
