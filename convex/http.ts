import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { ingest } from "./discordIngest";
import { agentmail } from "./email";
import { serveStatic } from "./staticSite";
import { gifRedirect } from "./gif";
import { ogImage } from "./og/image";

const http = httpRouter();

auth.addHttpRoutes(http);

// Discord bot bridge → Convex (bearer BRIDGE_SECRET).
http.route({ path: "/discord/ingest", method: "POST", handler: ingest });

// AgentMail inbound mail (Svix-verified by the component).
// Cast: installed convex adds an options param to runMutation that the
// component's RunMutationCtx type (older peer range) doesn't declare. Runtime-compatible.
const agentmailWebhook = httpAction(async (ctx, req) =>
  agentmail.handleWebhook(ctx as unknown as Parameters<typeof agentmail.handleWebhook>[0], req),
);
http.route({ path: "/agentmail/webhook", method: "POST", handler: agentmailWebhook });
// Alias: the inbox registered in AgentMail points here. Kept as a second route
// rather than a redirect because Svix signs the body, and a 307 would make the
// sender replay it — some webhook clients drop the signature headers on replay.
http.route({ path: "/mailhook", method: "POST", handler: agentmailWebhook });

// Link-preview cards, rendered from live content. Registered before the app so
// /og/... never falls through to index.html; the static public/og.png keeps its
// own route below as the fallback this redirects to when a render fails.
http.route({ pathPrefix: "/og/", method: "GET", handler: ogImage });

// Serve the built web app. Registered last: Convex Auth, /discord/ingest, and
// /agentmail/webhook are matched first for their exact/prefix paths.
http.route({ path: "/", method: "GET", handler: serveStatic });
http.route({ pathPrefix: "/assets/", method: "GET", handler: serveStatic });
// Every root-level file in public/ needs its own route: this router has no
// catch-all, so an asset that is in the bundle but not listed here answers
// "No matching routes found" and never reaches serveStatic. Hashed build output
// is covered by the /assets/ prefix above; these are not.
http.route({ path: "/favicon.svg", method: "GET", handler: serveStatic });
http.route({ path: "/favicon.ico", method: "GET", handler: serveStatic });
http.route({ path: "/apple-touch-icon.png", method: "GET", handler: serveStatic });
http.route({ path: "/icon-192.png", method: "GET", handler: serveStatic });
http.route({ path: "/icon-512.png", method: "GET", handler: serveStatic });
http.route({ path: "/icon-maskable-512.png", method: "GET", handler: serveStatic });
http.route({ path: "/site.webmanifest", method: "GET", handler: serveStatic });
http.route({ path: "/og.png", method: "GET", handler: serveStatic });
// Resolves a GIF-host page to the media it shows (convex/gif.ts). Registered
// with the API routes rather than the static ones: it answers with a redirect,
// not a file.
http.route({ path: "/gif", method: "GET", handler: gifRedirect });

http.route({ path: "/channels", method: "GET", handler: serveStatic });
http.route({ pathPrefix: "/channels/", method: "GET", handler: serveStatic });
http.route({ path: "/leaderboard", method: "GET", handler: serveStatic });
http.route({ path: "/resources", method: "GET", handler: serveStatic });
http.route({ path: "/search", method: "GET", handler: serveStatic });
http.route({ path: "/settings", method: "GET", handler: serveStatic });
http.route({ path: "/signin", method: "GET", handler: serveStatic });

export default http;
