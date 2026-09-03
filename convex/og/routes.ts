// The map between an app route and the card that previews it, in both
// directions: convex/staticSite.ts uses it to point og:image at the right card,
// and convex/og/image.ts uses it to read the route back off that URL. One
// module so the two can't drift apart.
import type { CardKind } from "./data";

export type CardRoute = { kind: CardKind; slug?: string; query?: string };

/** App path (what a visitor shared) → the card that should preview it. */
export function cardRouteFor(url: URL): CardRoute {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return { kind: "home" };
  if (path === "/channels") return { kind: "live" };
  if (path === "/leaderboard") return { kind: "leaderboard" };
  if (path === "/resources") return { kind: "resources" };
  if (path === "/search") {
    const q = url.searchParams.get("q")?.trim();
    // Capped: this ends up in the og:image URL, which crawlers and logs keep.
    return q ? { kind: "search", query: q.slice(0, 80) } : { kind: "search" };
  }
  if (path.startsWith("/channels/")) {
    const slug = decodeURIComponent(path.slice("/channels/".length));
    return slug ? { kind: "channel", slug } : { kind: "live" };
  }
  return { kind: "site" };
}

/** Card route → the path that renders it, `?v=` and all. */
export function cardPath(route: CardRoute, version?: string): string {
  const base =
    route.kind === "channel" && route.slug
      ? `/og/channel/${encodeURIComponent(route.slug)}.png`
      : `/og/${route.kind}.png`;
  const params = new URLSearchParams();
  if (route.query) params.set("q", route.query);
  // The version is what makes a cached unfurl go stale when the content moves;
  // without it Discord and Twitter would keep serving the first card for days.
  if (version) params.set("v", version);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Reads a card route back off a /og/… request. */
export function parseCardPath(url: URL): CardRoute {
  const rest = url.pathname.replace(/^\/og\//, "").replace(/\.png$/, "");
  const query = url.searchParams.get("q")?.trim().slice(0, 80) || undefined;
  if (rest.startsWith("channel/")) {
    const slug = decodeURIComponent(rest.slice("channel/".length));
    return slug ? { kind: "channel", slug } : { kind: "live" };
  }
  switch (rest) {
    case "home":
      return { kind: "home" };
    case "live":
      return { kind: "live" };
    case "leaderboard":
      return { kind: "leaderboard" };
    case "resources":
      return { kind: "resources" };
    case "search":
      return { kind: "search", query };
    default:
      return { kind: "site" };
  }
}
