// Which routes render the three-pane chat shell (src/components/ChatShell.tsx):
// the cross-channel Latest feed and any single channel. They own the whole
// viewport below the header and scroll inside their own panes, so Layout must
// not wrap them in page padding, a max width or a footer — and the document
// itself must not scroll.
//
// The channel *directory* at /channels is an ordinary page, so this matches a
// slug specifically rather than the prefix: react-router normalizes
// "/channels/" back to the directory, and matching the prefix would have shown
// that page full-bleed inside the shell.
const CHANNEL = /^\/channels\/[^/]+\/?$/;

export function isChatShellRoute(pathname: string): boolean {
  return pathname === "/" || CHANNEL.test(pathname);
}
