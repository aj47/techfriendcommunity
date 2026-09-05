# Hackathon log

- **Project:** techfriendcommunity
- **Event:** Convex All Gas hackathon
- **What it does:** A public front door to the techfren community: the day's recap, the links people shared, and the live conversation — readable without an account, and postable from the web or by replying to an email digest, with a points leaderboard and WebMCP tools for browser agents.
- **Live app:** https://www.techfriendcommunity.com (origin: https://hushed-crocodile-237.convex.site)
- **Repo:** https://github.com/aj47/techfriendcommunity
- **Frontend:** Convex static hosting (custom httpAction serving embedded dist/ assets)
- **Convex deployment:** https://hushed-crocodile-237.convex.cloud
- **Components:** @firecrawl/firecrawl-convex, @agentmail/convex, @convex-dev/rate-limiter
- **Convex features:** schema, tables, indexes, full-text search, queries, mutations, actions, HTTP actions, scheduled functions, crons, realtime queries, paginated queries
- **Auth:** Convex Auth
- **AI models:** none
- **Started:** 2026-08-27T02:54:21Z
- **Last updated:** 2026-09-04T22:34:00Z

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

### 2026-08-29 - b7f516a
Bounded the message log. A one-time backfill had put ~250k rows in `messages`,
and since document storage, four B-tree indexes and the `search_content` text
index all scale with that count and none shrink on their own, the deployment
had grown into Convex's free-tier limits. A daily cron now sweeps messages older
than `MESSAGE_RETENTION_DAYS` (default 90) in self-chaining batches of 500.
`channel_summaries` is never pruned, so the community's history stays readable
after the raw messages behind it are gone, and a bad retention value is refused
rather than read as "retain nothing". Convex features: crons, scheduled
functions, internal mutations (`convex/retention.ts`, `convex/crons.ts`).

### 2026-08-30 - cd45acb
Fixed four bugs and closed the gaps a reader feels. `points.lastSyncedAt` read
the *oldest* mirror row through an unindexed `.first()`, so the leaderboard
footer misreported its sync time exactly when the mirror was healthy (added a
`by_updatedAt` index); `messages.list` filtered deleted rows *after*
`paginate()`, returning short pages, fixed here and in the three other readers
that post-filtered the same way. Search had a backend query and a search index
reachable only through the WebMCP tool — agents could search the community and
people could not — so `/search` and a per-channel box now expose it. Added an
error boundary keyed by path and a 404 route; one throw used to blank the whole
app. Convex features: indexes, full-text search, paginated queries
(`convex/points.ts`, `convex/messages.ts`, `src/routes/Search.tsx`).

### 2026-09-02 - 66e71a5
Made the page render like a chat client instead of showing machine text. Discord
markup arrived verbatim: `[source](<url>)` left literal brackets in every
summary, and `<t:…:t>` — a timestamp only Discord's own client draws —
ended every recap bullet as an unreadable token. Timestamps now become `<time>`
elements in the reader's locale and zone; bare image and video URLs render as
the file, with an angle-bracketed URL linking but never embedding, which is
exactly what those brackets mean. Expired CDN links fail closed to plain text
(`src/lib/linkify.tsx`, `src/components/MediaEmbeds.tsx`, `src/routes/Home.tsx`).

### 2026-09-03 - 52a7317
Rebuilt the chat as a three-pane shell: channels on the left, conversation in the
middle, the day's recap on the right. The landing page had put the summary and
resource list above the feed, so the thing the site is for started below the
fold and the channel list lived on its own page. `/` and `/channels/:slug` now
render inside one shell, so picking a room swaps only the middle pane and leaves
the rail and recap subscriptions alone. The shell wraps `<Routes>` from outside
rather than being a layout route — inside the path-keyed ErrorBoundary it would
rebuild on every navigation, flashing both panes back to "Loading…". Below xl the
recap folds into a drawer, below md so does the rail (`src/components/ChatShell.tsx`,
`src/components/ChannelRail.tsx`, `src/components/RecapPanel.tsx`).

### 2026-09-03 - ef52b7e
Gave the site a real icon set and shared links a card. Every link to the site had
unfurled as a bare grey box — no `og:image` at all, and `twitter:card` set to the
thumbnail-beside-text variant — and the only icon was a 9.5 KB Figma export that
drew the bolt's sheen with fifteen blurred ellipses behind an alpha mask, which
turns to mush by 32px. Rebuilt the mark as three gradient stops and generated the
full set from it: a 1200×630 card in the app's own palette, a multi-size `.ico`,
an apple-touch-icon, and maskable PWA icons behind a manifest
(`scripts/gen-brand.sh`, `public/site.webmanifest`, `convex/staticSite.ts`).

### 2026-09-03 - 2e2e321
Led with the recap and made the chat one destination. The landing page was the
cross-channel feed, which put the two things a cold visitor wants — what happened
and what the community found — in a side pane at xl and behind a drawer
everywhere else. `/` is a document now: Yesterday's Highlights and Latest Alpha
take two thirds of the grid with the conversation as a preview beside them, and
"Live chat" opens the feed at `/channels`. The channel *directory* that used to
live there is gone: its rail is the same list already on screen
(`src/routes/Home.tsx`, `src/routes/LiveChat.tsx`, `src/lib/appShell.ts`).

### 2026-09-03 - 9bbb84f
Every route now draws its own link preview from what the community just said —
the recap and newest messages on `/`, the channel and its last words on
`/channels/<slug>`, the top three on `/leaderboard`, the query and a hit on
`/search`. `/og/<card>.png` builds the card as SVG and rasterizes it with resvg
compiled to WebAssembly, which the Convex runtime runs fine: ~30ms to init an
isolate and ~120ms a card, so there is no external render service in the path and
no CDN to be down. The wasm binary and the Inter subsets are base64 inside a
committed generated module so a cold start fetches nothing; since resvg will not
measure text and there is no canvas, layout wraps against advance widths
generated from those same subsets. Convex features: HTTP actions
(`convex/og/`, `convex/ogRuntime.generated.ts`, `scripts/gen-og-runtime.mjs`).

### 2026-09-03 - bc88be1
Kept reaction GIFs out of resources. A Tenor or Klipy share is a reaction, not a
page worth reading, but it was being queued for Firecrawl like any other link.
`isGifHost` matches the known GIF hosts with their subdomains and
`isCrawlableResource` excludes them along with Discord CDN uploads and raw media
extensions. Klipy was added on evidence: 27 of the 200 most recent links, second
only to x.com, because Discord's own GIF picker emits it (`convex/lib/urls.ts`).

### 2026-09-03 - e171954
Opened on the content and stopped calling this a Discord front end. The framing
had led with the mirror rather than with what a visitor gets, which undersells the
product and misdescribes it. Also versioned the icon URLs, since a new favicon
otherwise stays invisible behind the old cached one
(`src/components/Layout.tsx`, `convex/staticSite.ts`).

### 2026-09-03 - cc69f1f
Rendered mentions, custom emoji and GIF links as what they are. The mirror stores
Discord's raw markup, so a message that read as a name in Discord arrived here as
a raw `<@…>` snowflake — a database error in the middle of a sentence. Names
resolve server-side, where users and channels can be indexed, and draw as a chip
rather than a link, since clicking a name in a mirror has nowhere to go; an
unresolved id reads "@someone". GIF-host pages are not images whatever their path
ends in — tenor.com's own picker emits a `.gif` URL that 301s to HTML — so `/gif`
resolves the page to its `og:image` and redirects, allow-listed and per-view so it
works on everything already mirrored. Klipy stays a plain link on purpose: it
answers 403 to any non-browser request, verified against both UAs
(`convex/messages.ts`, `convex/gif.ts`, `src/lib/linkify.tsx`).

### 2026-09-03 - 31f79c5
Showed what a member earned, not just what they have left. Points are spendable
in Discord — role colour, GIF bypasses, frenbot access and `/ask-fred` all draw
the balance down — so the mirrored number answers "who has points left", not "who
has contributed": 2,529 of the 4,619 points ever awarded have been spent, and the
top contributor by a wide margin sat sixth on the board. The bridge now sends
`lifetimePoints` beside `points`, and `syncMirror` takes the highest of what
arrived, what is stored, and the balance itself, so a bot older than the column
cannot reset what the mirror knows (`convex/points.ts`, `convex/schema.ts`,
`src/routes/Leaderboard.tsx`).

### 2026-09-03 - fdb7f9d
Gave the resources page the same preview cards as the landing page — preview
image on top, then title, host, date, summary and tags. Both queries already
returned `imageUrl`; the duplicated `hostOf` helper is gone in favour of the
shared one (`src/routes/Resources.tsx`, `src/lib/linkPreview.ts`).

### 2026-09-04 - 854a1a7
Fixed three things the landing page got wrong. The recap said "yesterday" whether
or not the summary was actually from yesterday; the latest-messages feed rendered
bodies as plain characters, so a reply opening with two pings arrived as raw
snowflakes three lines of code away from the chat pane that resolves them. The
feed had avoided `linkify` for one real reason — every row is itself an `<a>` and
anchors cannot nest — which only ever applied to URLs, so `linkify` takes a
`links: false` option and everything else resolves as it does everywhere. Custom
emoji are now sized in `em`, invisible at 15px text and wrong at the feed's 13px
(`src/components/LatestPreview.tsx`, `src/lib/linkify.tsx`).

### 2026-09-04 - 4d8c6d3
Replaced magic-link sign-in with Discord OAuth that links itself. The Resend
provider was registered without `AUTH_RESEND_KEY` ever being set on production,
so `signIn("resend")` rejected server-side, and SignIn only called `setSent(true)`
from `.then()` — a rejection rendered nothing and the button appeared dead. Both
remaining providers hand us a verified address, so digests still have somewhere
to go. Signing in with Discord *is* the link: the OAuth handshake already proves
the person owns the account, which is what the `!link CODE` round trip existed to
establish, so the shadow user holding their mirrored history and points is
absorbed during sign-in. Convex features: Convex Auth with Discord and GitHub
OAuth (`convex/auth.ts`, `convex/users.ts`, `src/routes/SignIn.tsx`).

### 2026-09-04 - 3f68dfd
AgentMail had never sent a message from production, and the cause was not a
missing key. Convex components are isolated from the app's environment: a
component sees only what its own `defineComponent` declares and the app passes in
`convex.config`. Firecrawl declares its env block, which is why crawling always
worked; `@agentmail/convex@0.1.0` declares none while its code still reads
`process.env.AGENTMAIL_API_KEY` from inside the component, so the key was
permanently undefined there. The failure was invisible: `sendDigests` returns
after enqueuing to the component's send pool, so it reported `sent:1` while every
delivery died in a pool worker seconds later. A postinstall patch adds the missing
declaration, and the webhook is now served at `/mailhook` as well
(`scripts/patch-agentmail-env.mjs`, `convex/convex.config.ts`, `convex/http.ts`).

### 2026-09-04 - 72972bf
Gave a code-claimed Discord identity its auth account, so signing in finds it.
Convex Auth resolves an OAuth sign-in by `(provider, providerAccountId)` in
`authAccounts`, but `!link CODE` recorded the snowflake only on the user row —
with no matching auth account the sign-in fell through to email linking, and for
anyone whose Discord address differs from their GitHub one that meant a brand new
empty account. All three accounts that had used `!link` were in this state and
have been repaired. `linkDiscordByCode` now writes the auth account as part of
claiming the identity; the snowflake is exactly as trustworthy there as from
OAuth, since it only arrives because the person typed the code from that account
(`convex/users.ts`).

### 2026-09-04 - 77ffa87
Made reply-by-email decide who is speaking from a secret rather than from the
`From:` header. An inbound reply was trusted on the strength of its sender
address: `onMessageReceived` looked it up in `users` and posted to Discord under
that member's name and avatar. AgentMail's inbound payload carries no headers and
no SPF/DKIM result, so that address is an unverified claim — putting a member's
address on an email was enough to speak as them. Every digest now carries a
per-subscription reply key in its subject, and the key alone authenticates; the
sender address stays as a second check so a leaked key cannot be replayed
elsewhere. Also charged the email path the Discord bot's GIF limit (1 per 5
minutes), which a member had found and used as a way around it, moved the
idempotency check ahead of the rate limit so a webhook retry no longer spends
someone's quota, and put a daily sweep on the `processed_emails` table. Convex
features: indexes, rate-limiter component, crons, scheduled functions
(`convex/email.ts`, `convex/lib/replyToken.ts`, `convex/retention.ts`).
On branch `fix/email-sender-auth` (PR #2), deployed to production.
