import { useEffect } from "react";

export const SITE_NAME = "techfriend community";
export const HOME_TITLE = `${SITE_NAME} — AI news, links and live chat`;

export function pageTitle(section: string): string {
  return `${section} · ${SITE_NAME}`;
}

function setMeta(selector: string, content: string) {
  const el = document.head.querySelector<HTMLMetaElement>(selector);
  if (el) el.content = content;
}

// Keeps the tab title (and the og tags, for anything reading the live DOM) in
// step with client-side navigation. The metadata that link unfurlers actually
// read is written server-side in convex/staticSite.ts — they never run this.
// What this fixes is the browser: tab titles, history entries, bookmarks.
//
// Pass `null` while the data behind the title is still loading, so the previous
// page's title stays up instead of flashing a placeholder.
export function usePageMeta(title: string | null, description?: string) {
  useEffect(() => {
    if (title === null) return;
    document.title = title;
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:url"]', window.location.href);
    if (description) {
      setMeta('meta[name="description"]', description);
      setMeta('meta[property="og:description"]', description);
    }
  }, [title, description]);
}
