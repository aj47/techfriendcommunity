# Hackathon log

- **Project:** techfriendcommunity
- **Event:** Convex All Gas hackathon
- **What it does:** Lets people browse, post in, and get email digests from the techfren Discord community without a Discord account, with a points leaderboard and WebMCP tools for browser agents.
- **Live app:** not deployed
- **Repo:** https://github.com/aj47/techfriendcommunity
- **Frontend:** not deployed
- **Convex deployment:** not deployed
- **Components:** @firecrawl/firecrawl-convex, @agentmail/convex, @convex-dev/rate-limiter
- **Convex features:** schema, tables, indexes, full-text search, queries, mutations, actions, HTTP actions, scheduled functions, crons, realtime queries, paginated queries
- **Auth:** Convex Auth
- **AI models:** none
- **Started:** 2026-08-27T02:54:21Z
- **Last updated:** 2026-08-27T03:13:34Z

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

### 2026-08-27 - 4b39852
Built the backend and web app. Discord activity enters through a secret-gated HTTP
endpoint (`/discord/ingest`) that upserts channels, mirrors messages with shadow users
for Discord-only authors, de-duplicates webhook echoes and replays, and awards points
through one idempotent ledger function (per-message, daily-active, reactions received).
Web posts are delivered to Discord by a scheduled action that calls the channel's
webhook with the author's name and avatar, with retry/backoff and a visible
pending/failed status. Shipped the site: live channel views with pagination, a composer
that supports agent-staged drafts (a WebMCP tool fills it; only the human sends, earning
an agent-assisted bonus), weekly/all-time leaderboard, shared-link resources page,
profile/handle settings, Discord account linking via `!link` codes, GitHub + magic-link
sign-in, and nine WebMCP tools scoped per route. Added a one-time backfill script that
replays a discrawl SQLite export through the same ingest path. Verified against a local
deployment: auth rejection, dedupe, point totals, link normalization. Convex features:
queries, mutations, actions, HTTP actions, scheduled functions, paginated and realtime
queries, full-text search, rate-limiter component, Convex Auth (`convex/messages.ts`,
`convex/points.ts`, `convex/discordOut.ts`, `convex/discordIngest.ts`, `convex/users.ts`,
`src/webmcp/*`, `src/components/Composer.tsx`, `scripts/backfill.ts`).

### 2026-08-27 - c7ed9d4
Wired both sponsor components into real product paths. Firecrawl: every URL shared in a
message (Discord, web, or email) becomes a pending resource; a scheduled action scrapes
the page with a JSON extraction prompt (title, summary, site, tags) and the Resources
page updates live from "crawling…" to summarized; failures (credits, rate limits) are
recorded, and a rate-limited `summarize-link` request lets signed-in users and agents add
pages on demand. AgentMail: users subscribe to daily/weekly channel digests, a cron sends
them from the app inbox, and replies are routed back by sender + `[#channel]` subject tag,
sanitized, posted to Discord via the channel webhook, and rewarded with points. Added a
weekly cron that announces top members in Discord and a declarative WebMCP form tool
(`subscribe-to-digest`) that the browser asks the human to confirm. Convex features:
crons, actions, scheduled functions, HTTP actions, Firecrawl and AgentMail components
(`convex/links.ts`, `convex/email.ts`, `convex/crons.ts`, `convex/http.ts`,
`src/components/DigestSection.tsx`, `src/routes/Resources.tsx`).
