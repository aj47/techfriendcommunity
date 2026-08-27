import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { ingest } from "./discordIngest";
import { agentmail } from "./email";

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

export default http;
