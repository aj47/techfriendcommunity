import { defineApp } from "convex/server";
import { v } from "convex/values";
import firecrawl from "@firecrawl/firecrawl-convex/convex.config";
import agentmail from "@agentmail/convex/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";

// Components are isolated from the app's environment variables — a component
// cannot read anything set with `npx convex env set` unless it is declared by
// the component and handed over explicitly below.
const app = defineApp({
  env: {
    FIRECRAWL_API_KEY: v.string(),
    FIRECRAWL_WEBHOOK_SECRET: v.optional(v.string()),
    AGENTMAIL_API_KEY: v.string(),
    AGENTMAIL_WEBHOOK_SECRET: v.optional(v.string()),
  },
});

app.use(firecrawl, {
  // Mounts the crawl webhook route at <site>/firecrawl/webhook.
  httpPrefix: "/firecrawl/",
  env: {
    FIRECRAWL_API_KEY: app.env.FIRECRAWL_API_KEY,
    FIRECRAWL_WEBHOOK_SECRET: app.env.FIRECRAWL_WEBHOOK_SECRET,
  },
});
// @agentmail/convex@0.1.0 ships `defineComponent("agentmail")` with no env
// declaration, while its own code reads process.env.AGENTMAIL_API_KEY from
// inside the component. Since components can't see the app's env vars, the key
// was always undefined and every send failed in the send pool. patches/ adds
// the missing declaration so it can be passed in here.
// AGENTMAIL_INBOX_ID stays app-side: convex/email.ts reads it to address the
// outbox, and the component never needs to know which inbox we use.
app.use(agentmail, {
  env: {
    AGENTMAIL_API_KEY: app.env.AGENTMAIL_API_KEY,
    AGENTMAIL_WEBHOOK_SECRET: app.env.AGENTMAIL_WEBHOOK_SECRET,
  },
});
app.use(rateLimiter);

export default app;
