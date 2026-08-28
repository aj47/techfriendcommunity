import { httpAction } from "./_generated/server";
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

// Serves the built React app (dist/) so the site lives at *.convex.site with no
// separate static host, as required for the All Gas submission URL. Exact asset
// paths are served as-is; everything else (client-side routes, "/") falls back
// to index.html since routing happens in the browser via react-router.
export const serveStatic = httpAction(async (_ctx, req) => {
  const url = new URL(req.url);
  const asset = staticAssets[url.pathname];
  if (asset) return serve(asset);
  if (!indexHtml) return new Response("Site not built yet.", { status: 503 });
  return serve(indexHtml);
});
