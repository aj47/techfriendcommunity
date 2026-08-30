import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { ingest } from "./discordIngest";
import { agentmail } from "./email";
import { serveStatic } from "./staticSite";

const http = httpRouter();

auth.addHttpRoutes(http);

// Discord bot bridge → Convex (bearer BRIDGE_SECRET).
http.route({ path: "/discord/ingest", method: "POST", handler: ingest });

// AgentMail inbound mail (Svix-verified by the component).
http.route({
  path: "/agentmail/webhook",
  method: "POST",
  // Cast: installed convex adds an options param to runMutation that the
  // component's RunMutationCtx type (older peer range) doesn't declare. Runtime-compatible.
  handler: httpAction(async (ctx, req) =>
    agentmail.handleWebhook(ctx as unknown as Parameters<typeof agentmail.handleWebhook>[0], req),
  ),
});

// Serve the built web app. Registered last: Convex Auth, /discord/ingest, and
// /agentmail/webhook are matched first for their exact/prefix paths.
http.route({ path: "/", method: "GET", handler: serveStatic });
http.route({ pathPrefix: "/assets/", method: "GET", handler: serveStatic });
http.route({ path: "/favicon.svg", method: "GET", handler: serveStatic });
http.route({ path: "/channels", method: "GET", handler: serveStatic });
http.route({ pathPrefix: "/channels/", method: "GET", handler: serveStatic });
http.route({ path: "/leaderboard", method: "GET", handler: serveStatic });
http.route({ path: "/resources", method: "GET", handler: serveStatic });
http.route({ path: "/search", method: "GET", handler: serveStatic });
http.route({ path: "/settings", method: "GET", handler: serveStatic });
http.route({ path: "/signin", method: "GET", handler: serveStatic });

export default http;
