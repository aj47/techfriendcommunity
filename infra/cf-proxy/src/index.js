// Serves techfriendcommunity.com from the Convex deployment that hosts the app.
//
// The app (UI + HTTP actions) lives at one *.convex.site origin; Convex custom
// domains are a Pro feature, so the branded domain is kept by reverse-proxying
// here instead. The apex redirects to www so there is a single canonical origin.
const ORIGIN = "https://hushed-crocodile-237.convex.site";
const CANONICAL_HOST = "www.techfriendcommunity.com";

export default {
  async fetch(request, _env, ctx) {
    const url = new URL(request.url);

    // Apex -> www only. Any other host (a workers.dev preview) proxies as-is,
    // so the worker can be smoke-tested before it is put on the live routes.
    if (url.hostname === "techfriendcommunity.com") {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 308);
    }

    const target = new URL(url.pathname + url.search, ORIGIN);
    // Convex is in a separate Cloudflare zone, where fetch({ cf }) cannot
    // override cache policy. Keep a brief copy of anonymous SPA documents in
    // this zone's cache. Everything else, especially API and auth traffic,
    // passes through untouched.
    const documentPath =
      url.pathname === "/" ||
      /^\/(?:channels(?:\/[^/]+)?|leaderboard|resources|search|settings|signin)\/?$/.test(url.pathname);
    const cacheDocument =
      request.method === "GET" &&
      request.headers.get("accept")?.includes("text/html") &&
      !request.headers.has("authorization") &&
      !request.headers.has("cookie") &&
      documentPath;
    const cacheKey = new Request(url.toString());
    if (cacheDocument) {
      const cached = await caches.default.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("x-techfriend-edge-cache", "HIT");
        return new Response(cached.body, { status: cached.status, headers });
      }
    }
    const upstream = await fetch(
      new Request(target, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: "manual",
      }),
    );

    // Rewrite anything the origin says about itself back to the branded host,
    // so auth callbacks and cookies stay on the domain the visitor is on.
    const headers = new Headers(upstream.headers);
    const location = headers.get("location");
    if (location) {
      try {
        const loc = new URL(location, target);
        if (loc.origin === ORIGIN) {
          loc.protocol = "https:";
          loc.hostname = url.hostname;
          loc.port = "";
          headers.set("location", loc.toString());
        }
      } catch {
        // Relative or malformed Location: leave it as the origin sent it.
      }
    }
    const cookies = headers.getAll ? headers.getAll("set-cookie") : [];
    if (cookies.length) {
      headers.delete("set-cookie");
      for (const cookie of cookies) {
        headers.append("set-cookie", cookie.replace(/;\s*domain=[^;]*/i, ""));
      }
    }

    const response = new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
    if (cacheDocument && response.status === 200 &&
        response.headers.get("content-type")?.includes("text/html") &&
        !response.headers.has("set-cookie")) {
      const cacheHeaders = new Headers(response.headers);
      cacheHeaders.set("cache-control", "public, max-age=30");
      cacheHeaders.delete("cf-cache-status");
      ctx.waitUntil(caches.default.put(cacheKey, new Response(response.clone().body, {
        status: response.status,
        headers: cacheHeaders,
      })));
      response.headers.set("x-techfriend-edge-cache", "MISS");
    }
    return response;
  },
};
