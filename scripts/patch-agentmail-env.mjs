// Convex components are isolated from the app's environment variables: a
// component can only receive one its own `defineComponent` declares, which the
// app then passes in `convex.config.ts`. @agentmail/convex@0.1.0 declares none,
// yet its code reads process.env.AGENTMAIL_API_KEY from inside the component —
// so the key is always undefined there and every send fails inside the send
// pool, asynchronously, long after the calling mutation has returned success.
//
// This adds the missing declaration. Runs from postinstall so it survives
// `npm ci`. Idempotent, and a no-op if upstream fixes it or the shape changes.
import { readFileSync, writeFileSync } from "node:fs";

const TARGET = "node_modules/@agentmail/convex/dist/component/convex.config.js";
const NEEDLE = `defineComponent("agentmail")`;
const REPLACEMENT = `defineComponent("agentmail", {
    env: {
        AGENTMAIL_API_KEY: v.string(),
        AGENTMAIL_BASE_URL: v.optional(v.string()),
        AGENTMAIL_WEBHOOK_SECRET: v.optional(v.string()),
    },
})`;

let source;
try {
  source = readFileSync(TARGET, "utf8");
} catch {
  process.exit(0); // dependency absent (e.g. --omit=optional, fresh clone)
}

if (source.includes("AGENTMAIL_API_KEY")) process.exit(0); // already patched
if (!source.includes(NEEDLE)) {
  console.warn(`patch-agentmail-env: ${NEEDLE} not found — upstream changed, skipping.`);
  process.exit(0);
}

const patched = source
  .replace(`import { defineComponent } from "convex/server";`,
    `import { defineComponent } from "convex/server";\nimport { v } from "convex/values";`)
  .replace(NEEDLE, REPLACEMENT);
writeFileSync(TARGET, patched);
console.log("patch-agentmail-env: declared AgentMail component env vars.");
