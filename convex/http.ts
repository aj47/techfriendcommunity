import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

// /discord/ingest (bridge) is added in convex/discordIngest.ts wiring — P1.
// AgentMail inbound webhook mount is added in convex/email.ts wiring — P4.

export default http;
