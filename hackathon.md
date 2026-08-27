# Hackathon log

- **Project:** techfriendcommunity
- **Event:** Convex All Gas hackathon
- **What it does:** Lets people browse, post in, and get email digests from the techfren Discord community without a Discord account, with a points leaderboard and WebMCP tools for browser agents.
- **Live app:** not deployed
- **Repo:** https://github.com/aj47/techfriendcommunity
- **Frontend:** not deployed
- **Convex deployment:** not deployed
- **Components:** @firecrawl/firecrawl-convex, @agentmail/convex, @convex-dev/rate-limiter
- **Convex features:** schema, tables, indexes, full-text search, HTTP actions
- **Auth:** Convex Auth
- **AI models:** none
- **Started:** 2026-08-27T02:54:21Z
- **Last updated:** 2026-08-27T02:54:21Z

## Log

### 2026-08-27 - 70b25d1
Scaffolded the app: Vite + React + TypeScript frontend with Tailwind, MIT license,
and a README describing the product (web/email participation in a Discord community,
leaderboard, WebMCP tools). Defined the full data model — users (extending Convex Auth),
channels, channel webhook secrets, messages, an append-only points ledger, weekly
leaderboard, crawled link resources, digest subscriptions/threads, Discord link codes,
and a moderation log — with indexes and full-text search on messages and resources.
Registered the Firecrawl, AgentMail, and rate-limiter components and set up Convex Auth
with GitHub and Resend providers plus the HTTP router. Convex features: schema, tables,
indexes, full-text search, HTTP actions, Convex Auth, registered components
(`convex/schema.ts`, `convex/convex.config.ts`, `convex/auth.ts`, `convex/http.ts`).
