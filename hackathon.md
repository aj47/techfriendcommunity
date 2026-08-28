# Hackathon log

- **Project:** techfriendcommunity
- **Event:** Convex All Gas hackathon
- **What it does:** Lets people browse, post in, and get email digests from the techfren Discord community without a Discord account, with a points leaderboard and WebMCP tools for browser agents.
- **Live app:** https://hushed-crocodile-237.convex.site
- **Repo:** https://github.com/aj47/techfriendcommunity
- **Frontend:** Convex static hosting (custom httpAction serving embedded dist/ assets)
- **Convex deployment:** https://hushed-crocodile-237.convex.cloud
- **Components:** @firecrawl/firecrawl-convex, @agentmail/convex, @convex-dev/rate-limiter
- **Convex features:** schema, tables, indexes, full-text search, queries, mutations, actions, HTTP actions, scheduled functions, crons, realtime queries, paginated queries
- **Auth:** Convex Auth
- **AI models:** none
- **Started:** 2026-08-27T02:54:21Z
- **Last updated:** 2026-08-28T21:11:15Z

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

### 2026-08-28 - 10f4450
Deployed to a real Convex project (team hi-82714) with dev and production
deployments, all three components (Firecrawl, AgentMail, rate-limiter) installed
on both. Since the installed Convex CLI has no built-in static-hosting command,
built a small pipeline instead: `npm run build` produces `dist/`,
`scripts/gen-static-assets.mjs` embeds it as base64 in a generated module, and
a catch-all httpAction (`convex/staticSite.ts`) serves it — exact asset paths
as-is, everything else (client-side routes) falling back to `index.html` for
react-router — registered after Convex Auth, `/discord/ingest`, and
`/agentmail/webhook` so it never shadows the API. Verified on the live
production URL: the served bundle points at itself (not the dev deployment),
`/leaderboard` and `/channels/:slug` return the app shell, and
`/discord/ingest` still returns 401/works only with the correct bearer secret.
Firecrawl and AgentMail keys are placeholders pending real credentials.
Convex features: HTTP actions serving the frontend, production deployment
(`convex/staticSite.ts`, `convex/http.ts`, `scripts/gen-static-assets.mjs`).

### 2026-08-28 - d825858
Retired Convex's own points system in favor of mirroring the Discord bot's
existing one. The community already had a trusted, LLM-judged leaderboard (110
members, running since November) that scores quality; the volume-based scoring
this app shipped with (1pt/message, +5 first-of-day, etc.) would have minted
~320,000 points replaying the 250k-message backfilled archive — a second,
gameable leaderboard contradicting the real one. Removed every award path
(`awardPoints`, the weekly Discord announcement cron, per-message scoring on
web/Discord/email); added a `leaderboard_mirror` table the bridge replaces
wholesale via a new `leaderboard.sync` ingest event (bot pushes its standings
every 10 min), keyed by Discord id so account-linking needs no points merge.
Retired tables (`points_events`, `leaderboard_weekly`, `users.pointsAllTime`)
stay declared until `points:purgeLegacy` clears their handful of real rows
from before this landed, then a follow-up deploy drops them. Verified on
production: ingest auth intact, a Discord message creates no points_events,
`leaderboard.sync` populates the mirror correctly and sorts by points.
Convex features: schema migration with staged legacy-table removal, mirror
sync as an idempotent upsert-and-prune (`convex/points.ts`, `convex/schema.ts`,
`convex/messages.ts`).

### 2026-08-28 - de53771
Closed out the leaderboard mirror handoff with the peer session working the
Discord bot side. Implemented the `complete` flag on `leaderboard.sync`: a
partial push (the bot's guild read hit its row cap) now upserts without
pruning, since a row missing from a truncated batch may just be missing from
the batch, not gone — only a push the bot marks complete deletes stale
entries. Missing `complete` (an older bot) still prunes as before. Verified
all three cases on a real push/response cycle.

Also finished the retired-tables cleanup: `purgeLegacy`'s plain `.take(n)`
never advanced past the same first batch on repeat calls, so `points_events`
and `leaderboard_weekly` (small tables) cleared fine but `users.pointsAllTime`
left 381 documents behind, which correctly blocked the schema deploy. Replaced
it with a cursor-paginated sweep, ran it to completion, verified a second full
pass clears zero, then dropped `points_events`, `leaderboard_weekly`, and
`users.pointsAllTime` from the schema for real and removed the dead
`weekKey.ts` helper. Production leaderboard (98 real members, matching the
bot's own `user_points` table) was untouched throughout every deploy in this
sequence.

### 2026-08-28 - e62d1a2
Fixed /resources capturing Discord attachment URLs as if they were shared
links: extractUrls() finds every http(s) URL in a message including its
attachments, and enqueueLinks treated all of them as resources, so any
screenshot someone posted became a page Firecrawl tried to crawl and summarize.
All 3 entries in production were Discord CDN URLs, not real links. Added
isCrawlableResource() excluding Discord's CDN/media hosts and raw
image/video/audio/archive extensions, applied once in enqueueLinks so it
covers Discord, web, and email ingest from a single place. Purged the 3
junk entries from production. Verified: a message with both a real link and
an attachment now only enqueues the real link. FIRECRAWL_API_KEY is still a
placeholder on both deployments, so no resource has actually crawled
successfully yet — a real key is the remaining blocker for the feature to
produce summaries (`convex/lib/urls.ts`, `convex/links.ts`).
