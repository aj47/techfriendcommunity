import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { ingest } from "./discordIngest";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({ path: "/discord/ingest", method: "POST", handler: ingest });

// AgentMail inbound webhook mount is added with convex/email.ts — P4.

export default http;
