// Which routes render the three-pane chat shell (src/components/ChatShell.tsx):
// "Live chat" at /channels, and any single channel under it. They own the whole
// viewport below the header and scroll inside their own panes, so Layout must
// not wrap them in page padding, a max width or a footer — and the document
// itself must not scroll. The landing page is deliberately not one of them: it
// is a document.
//
// One slug segment at most, so /channels/foo/bar is a 404 rather than a
// full-bleed shell around nothing.
const CHAT = /^\/channels(\/[^/]+)?\/?$/;

export function isChatShellRoute(pathname: string): boolean {
  return CHAT.test(pathname);
}
