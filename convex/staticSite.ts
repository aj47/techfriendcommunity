import { httpAction, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { cardPath, cardRouteFor } from "./og/routes";
import { staticAssets, indexHtml } from "./staticAssets.generated";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function serve(asset: { contentType: string; cache: string; base64: string }): Response {
  return new Response(base64ToBytes(asset.base64) as unknown as BodyInit, {
    headers: { "content-type": asset.contentType, "cache-control": asset.cache },
  });
}

const SITE_NAME = "techfriend community";
const DEFAULT_DESCRIPTION =
  "Join the techfren community from your browser or inbox — no Discord account needed.";

type PageMeta = { title: string; description: string; url: string; image: string; alt?: string };

// The card is drawn from live content, so its alt text says what that content
// is rather than describing the brand. Screen readers on Twitter and Mastodon
// read this out in place of the card.
const DEFAULT_ALT = `${SITE_NAME} — the techfren Discord, on the web.`;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// index.html is the same bytes every request; decode it once per isolate.
let indexSource: string | null | undefined;
function indexText(): string | null {
  if (indexSource === undefined) {
    indexSource = indexHtml ? new TextDecoder().decode(base64ToBytes(indexHtml.base64)) : null;
  }
  return indexSource;
}

// index.html brackets its default title/description/og tags with these markers
// so the whole block can be swapped per route without regex-matching each tag.
const META_BLOCK = /<!--meta:start-->[\s\S]*?<!--meta:end-->/;
const TITLE_TAG = /<title>[\s\S]*?<\/title>/;

function renderMeta(m: PageMeta): string {
  const title = esc(m.title);
  const description = esc(m.description);
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    m.url ? `<meta property="og:url" content="${esc(m.url)}" />` : "",
    // The card is rendered per route from live content by /og/<card>.png, and
    // carries a ?v= stamped from the newest thing it shows — unfurlers cache by
    // URL, so without that stamp Discord and Twitter would keep serving the
    // first card they ever fetched. Unfurlers fetch og:image themselves, from
    // wherever they are, so it has to be absolute — and it is built from the
    // same origin as og:url so a preview never points at a host that didn't
    // serve the page. summary_large_image is what turns Twitter's preview from
    // a thumbnail beside the text into the full-width card the others show.
    `<meta property="og:image" content="${esc(m.image)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(m.alt ?? DEFAULT_ALT)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:image" content="${esc(m.image)}" />`,
  ]
    .filter(Boolean)
    .join("");
}

function inject(source: string, meta: PageMeta): string {
  if (META_BLOCK.test(source)) return source.replace(META_BLOCK, renderMeta(meta));
  // Markers didn't survive the build. Fall back to the title alone rather than
  // splicing a second og: block in beside the static one.
  if (TITLE_TAG.test(source)) return source.replace(TITLE_TAG, `<title>${esc(meta.title)}</title>`);
  return source;
}

// The path of this route's link-preview card. The version stamp costs one
// indexed read per page render; if that read fails the page still unfurls, just
// with the static card in public/og.png.
async function cardUrl(ctx: ActionCtx, url: URL): Promise<string> {
  const route = cardRouteFor(url);
  try {
    const version = await ctx.runQuery(internal.og.data.version, {
      kind: route.kind,
      slug: route.slug,
    });
    return cardPath(route, version);
  } catch (e) {
    console.warn("staticSite: card version lookup failed", e);
    return "/og.png";
  }
}

async function metaFor(ctx: ActionCtx, url: URL): Promise<PageMeta> {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const origin = (process.env.SITE_URL ?? url.origin).replace(/\/+$/, "");
  const href = `${origin}${path === "/" ? "" : path}`;
  const image = `${origin}${await cardUrl(ctx, url)}`;
  const page = (title: string, description: string, alt?: string): PageMeta => ({
    title: `${title} · ${SITE_NAME}`,
    description,
    url: href,
    image,
    alt,
  });

  if (path === "/") {
    return {
      title: `${SITE_NAME} — the techfren Discord, on the web`,
      description: DEFAULT_DESCRIPTION,
      url: href,
      image,
      alt: "The techfren Discord's latest daily recap and newest messages.",
    };
  }
  if (path === "/channels")
    return page(
      "Live chat",
      "Every channel of the techfren Discord, newest message first.",
      "The newest messages from every channel of the techfren Discord.",
    );
  if (path === "/leaderboard")
    return page(
      "Leaderboard",
      "Community standings, scored in Discord by the techfren bot.",
      "The current techfren community standings.",
    );
  if (path === "/resources")
    return page(
      "Resources",
      "Links the community has shared, crawled and summarized automatically.",
      "The links the techfren community shared most recently.",
    );
  if (path === "/search") {
    const q = url.searchParams.get("q")?.trim();
    return page(
      q ? `Search: ${q}` : "Search",
      "Search every message mirrored from the techfren Discord.",
      q ? `Search results for “${q}” in the techfren Discord.` : undefined,
    );
  }
  if (path === "/settings") return page("Settings", "Your profile, Discord link, and email digests.");
  if (path === "/signin") return page("Sign in", "Sign in with GitHub or an email link — no Discord account needed.");

  if (path.startsWith("/channels/")) {
    const slug = decodeURIComponent(path.slice("/channels/".length));
    const channel = await ctx.runQuery(api.channels.bySlug, { slug });
    if (!channel) return page("Channel not found", DEFAULT_DESCRIPTION);
    const name = channel.isThread ? channel.name : `#${channel.name}`;
    return page(
      name,
      channel.topic ??
        `Read ${name} on the web and post straight into the techfren Discord — no Discord account needed.`,
      `The latest messages in ${name} on the techfren Discord.`,
    );
  }
  return page("Not found", DEFAULT_DESCRIPTION);
}

// Serves the built React app (dist/) so the site lives at *.convex.site with no
// separate static host, as required for the All Gas submission URL. Exact asset
// paths are served as-is; everything else (client-side routes, "/") falls back
// to index.html since routing happens in the browser via react-router.
//
// The fallback is not served verbatim: title/description/og tags are rewritten
// per route on the way out. Link unfurlers (Discord's included) don't run the
// SPA, so setting document.title on the client alone would leave every shared
// link previewing as the generic site.
export const serveStatic = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const asset = staticAssets[url.pathname];
  if (asset) return serve(asset);
  if (!indexHtml) return new Response("Site not built yet.", { status: 503 });
  const source = indexText();
  if (!source) return new Response("Site not built yet.", { status: 503 });

  let body = source;
  try {
    body = inject(source, await metaFor(ctx, url));
  } catch (e) {
    // A page that unfurls badly beats a page that doesn't load.
    console.warn("staticSite: meta injection failed", e);
  }
  return new Response(body, {
    headers: { "content-type": indexHtml.contentType, "cache-control": indexHtml.cache },
  });
});
