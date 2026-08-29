# Hackathon log

- **Project:** techfriendcommunity
- **Event:** Convex All Gas hackathon
- **What it does:** Lets people browse, post in, and get email digests from the techfren Discord community without a Discord account, with a points leaderboard and WebMCP tools for browser agents.
- **Live app:** https://www.techfriendcommunity.com (origin: https://hushed-crocodile-237.convex.site)
- **Repo:** https://github.com/aj47/techfriendcommunity
- **Frontend:** Convex static hosting (custom httpAction serving embedded dist/ assets)
- **Convex deployment:** https://hushed-crocodile-237.convex.cloud
- **Components:** @firecrawl/firecrawl-convex, @agentmail/convex, @convex-dev/rate-limiter
- **Convex features:** schema, tables, indexes, full-text search, queries, mutations, actions, HTTP actions, scheduled functions, crons, realtime queries, paginated queries
- **Auth:** Convex Auth
- **AI models:** none
- **Started:** 2026-08-27T02:54:21Z
- **Last updated:** 2026-08-29T01:48:46Z

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

### 2026-08-28 - bb3a196
Diagnosed and fixed a real Discord-linking failure via production logs: AJ's
own `!link` attempt was received correctly by the bridge, matched the code,
and started the merge — then `linkDiscordByCode` threw "Too many reads in a
single function execution (limit: 4096)". The account being linked (a
long-time, heavily backfilled member) had more historical messages than one
Convex mutation's read/write budget, and the reassignment ran as a single
synchronous loop. Fixed by clearing the shadow's Discord id and completing
the link immediately (new messages from that id now attach straight to the
target account), while a new paginated internalMutation walks the shadow's
message history in batches of 200 and deletes the shadow once done.
Verified on dev with a real create-shadow / reassign / verify-deleted cycle
before deploying to production.

Also set the real Convex Auth JWT keypair (none existed — sign-in was
completely unrouted before this), SITE_URL, and GitHub OAuth credentials on
production; verified the full pre-consent OAuth pipeline via the real
`signIn` action (correct client_id, exact redirect_uri, valid PKCE), and a
real end-to-end GitHub sign-in has since been completed live. Real
FIRECRAWL_API_KEY is also set on both deployments, verified against a real
page crawl. Convex features: internalMutation with cursor-based pagination
for a background merge, Convex Auth (GitHub provider) (`convex/users.ts`).

### 2026-08-28 - (env only, no code change)
Migrated the public-facing domain to https://www.techfriendcommunity.com (DNS
already correctly pointed at the Convex deployment via Cloudflare, apex 308s
to www). Sign-in was landing users on the old hushed-crocodile-237.convex.site
domain after GitHub auth instead of staying on the new one — a real bug, not
cosmetic, since it left the session cookie scoped to the wrong host.
Traced to @convex-dev/auth building its OAuth redirect_uri from an env var
rather than the request's actual host. Set CUSTOM_AUTH_SITE_URL and SITE_URL
to the new domain on production; verified via the real signIn action that
the whole pre-consent chain (initial redirect, GitHub authorize URL,
redirect_uri) now correctly targets www.techfriendcommunity.com throughout.
Remaining piece: the new callback URL needs registering on the GitHub OAuth
app (asked the bot-side session to add it, since they manage that app).

### 2026-08-29 - f8713db
Reviewed and deployed the other session's home-page redesign and mobile fixes.
Home now leads with the bot's daily per-channel summary (rendered as React
elements from lightweight markdown, not HTML — no injection surface for
bot-sourced text) and a community-wide latest-messages feed; the channel
directory moved to its own /channels route. Daily summaries live in Discord
threads, which the bridge doesn't mirror, so a new `summary.sync` ingest
event pushes them straight from the bot's own channel_summaries table;
unlike the leaderboard this is an upsert-only sync (no pruning), so an
empty or partial push can never delete anything — verified with a real push
including two intentionally-invalid rows (unknown channel, malformed date),
both correctly rejected while the valid row landed. Layout, Composer, and
the channel view got real mobile fixes (100dvh, min-h-0 for flex-scroll,
16px input text to avoid iOS auto-zoom, a horizontally-scrolling nav strip
below the sm breakpoint). Also fixes the dangling @auth/core peer dependency
noted earlier. Verified on production: bundle hash matches the reviewed
build exactly, all routes 200, ingest still 401s unauthenticated, the
existing 98-row leaderboard untouched. channel_summaries is empty until the
production bot is restarted on techfren-discord-bot main (the commit with
the summary-push code) — nothing to render until then. Convex features:
new ingest event type, upsert-without-prune sync pattern, cross-channel
index (`convex/summaries.ts`, `convex/schema.ts`, `convex/messages.ts`,
`src/components/DailySummary.tsx`, `src/components/Layout.tsx`).

### 2026-08-29 - (reply-to-message + real Discord threads)
Added the ability to reply to a specific message and to see and post inside
real Discord threads, not just top-level channels.

Threads are modeled as `channels` rows with `isThread` + `parentChannelId`
rather than a parallel concept, so every existing piece — the channel view,
composer, webhook posting, pagination, search — works for a thread with no
special-casing. The one new fact this leans on: Discord guarantees a thread
started from a message shares that message's id, so `channel.sync` linking a
thread to its origin message is a plain lookup by that shared id, no extra
bookkeeping event needed. The channel directory excludes threads; a message
that grew a thread shows a live "N replies in thread →" link instead.

Reply-to-message: `messages.post` takes an optional `replyToMessageId`
(validated against the same channel, silently dropped rather than failing
the post if stale or foreign); the UI shows a quoted preview above replies
and a "reply" chip while composing. Discord's webhook API has no
`message_reference` field (confirmed against the docs — that's bot-only), so
a reply relayed outward is rendered as a quoted line prepended to the
content rather than a true linked reply; posting into a thread reuses the
parent channel's webhook with Discord's documented `?thread_id=` parameter,
so no per-thread webhook is created.

Extended `stage-message` (WebMCP) with an optional `replyToAuthor` so an
agent can stage a reply, not just a bare message — kept inside the existing
tool rather than adding a new one. Verified the full chain on dev: a
message started a "thread", the thread linked to its origin message
automatically, a reply inside it resolved correctly, and outbound delivery
resolved the parent webhook + thread_id + quote text all correctly.
Deployed to production; bundle hash, all routes, ingest auth, and the
existing 98-row leaderboard all verified unaffected.

### 2026-08-29 - 8623254
Links people share now render as clickable links. Message bodies and the
bot's daily summaries were being printed as raw text, so every URL that
came in from Discord arrived here as dead characters — the thing people
most want to click in a community feed.

`linkify()` (`src/lib/linkify.tsx`) tokenizes text into React nodes:
markdown `[label](url)`, bare http(s)/www URLs, and Discord's `<url>`
embed-suppression form. Returning elements rather than an HTML string
keeps it injection-proof by construction — an href can only come from a
matched http(s) token, so `javascript:` never becomes one, and labels
render as text. Trailing sentence punctuation is trimmed, but only
unbalanced closing brackets, so `.../Foo_(bar)` survives intact.

Deliberately not reusing `convex/lib/urls.ts`: that normalizes URLs
(drops hashes and tracking params) for crawl dedup, which would silently
rewrite what a person clicks. The home feed stays plain text because each
row is already wrapped in a `<Link>` to its channel and nested anchors are
invalid HTML.

Checked the tokenizer against 14 cases compiled from the real source
(trailing punctuation, balanced parens, angle-wrapped, markdown, bare
`www.`, a lone `https://`, `javascript:`): no text is ever lost or
duplicated and every emitted href is http(s). Deployed to production and
verified the live bundle hash on both the branded domain and the
convex.site origin (`src/components/MessageList.tsx`,
`src/components/DailySummary.tsx`).
