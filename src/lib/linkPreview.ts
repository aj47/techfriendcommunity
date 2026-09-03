// What a shared link looks like on a card. The image is whatever the crawl
// stored from the page's og:image (convex/links.ts); YouTube is the one host
// worth deriving a thumbnail for without a crawl, because it is the single
// most-shared domain in the Discord and its still is addressable from the id.

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // Stored URLs are normalized on write, so this should always parse — but it
    // runs during render, and one bad row would take the page down.
    return url;
  }
}

// youtube.com/watch?v=ID, youtu.be/ID, /shorts/ID, /embed/ID. Ids are 11 chars
// of [A-Za-z0-9_-]; anything else is not an id and gets no thumbnail.
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return YT_ID.test(id) ? id : null;
    }
    if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "music.youtube.com") return null;
    const v = u.searchParams.get("v");
    if (v && YT_ID.test(v)) return v;
    const [, kind, id] = u.pathname.split("/");
    return (kind === "shorts" || kind === "embed" || kind === "live") && YT_ID.test(id ?? "") ? id : null;
  } catch {
    return null;
  }
}

export function previewImageFor(row: { url: string; imageUrl?: string | null }): string | null {
  if (row.imageUrl) return row.imageUrl;
  const yt = youtubeId(row.url);
  return yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null;
}
