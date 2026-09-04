# techfriendcommunity.com

Join the techfren Discord community from your browser or inbox — no Discord account needed.

- **Browse and post on the web.** Messages you send appear in the real Discord server, attributed to your community account.
- **Reply by email.** Subscribe to channel digests and reply to the email — your reply lands in the channel.
- **Earn points.** A live leaderboard tracks community activity across Discord, web, and email.
- **Bring your agent.** The site exposes its features as [WebMCP](https://github.com/webmachinelearning/webmcp) tools, so a browser-embedded AI agent (ChatGPT's in-app browser, Chrome 149+) can read channels, search, and stage replies collaboratively with you — the page updates live as it works.

## Stack

- [Convex](https://convex.dev) — database, reactive queries, auth, crons, HTTP actions
- [`@firecrawl/firecrawl-convex`](https://github.com/firecrawl/firecrawl-convex) — links shared in chat are crawled and summarized into a community resources page
- [`@agentmail/convex`](https://github.com/agentmail-to/convex) — the app's email inbox: channel digests out, replies in
- React + Vite + TypeScript + Tailwind
- WebMCP (`document.modelContext`) with the [GoogleChromeLabs polyfill](https://github.com/GoogleChromeLabs/webmcp-tools) as fallback

## Discord side

Live mirroring is handled by a small bridge extension to the community's existing bot,
[techfren-discord-bot](https://github.com/techfren/techfren-discord-bot) (Python/discord.py).
The bridge forwards messages/reactions/channel metadata to a secret-gated Convex HTTP
endpoint. Outbound web/email posts go straight from Convex actions to Discord channel
webhooks — no bot in the posting path.

All code in this repository was started on 2026-08-27 for the Convex All Gas hackathon
and the OpenAI WebMCP Challenge. See [hackathon.md](./hackathon.md) for the build log.
techfren-discord-bot is pre-existing community infrastructure; only its new bridge
extension (dated within the submission window in that repo's history) is part of this project.

## Development

```bash
npm install
npx convex dev        # dev deployment + codegen (or CONVEX_AGENT_MODE=anonymous npx convex dev for a no-account local backend)
npm run dev           # Vite on 0.0.0.0:5173
```

### Brand assets

The favicon, app icons and the `og.png` link-preview card in `public/` are
generated from the SVG sources in `assets/brand/` by `scripts/gen-brand.sh`.
The outputs are committed, so the build needs none of its tooling — run it only
after editing a source SVG:

```bash
sudo apt-get install -y librsvg2-bin imagemagick pngquant optipng fonts-inter
./scripts/gen-brand.sh
```

### Link-preview cards

`/og/<card>.png` draws a route's link-preview card from live content — the
day's recap on `/`, the newest messages on `/channels`, the standings on
`/leaderboard`, the query on `/search` — with resvg compiled to WebAssembly,
inside the Convex deployment (`convex/og/`). `convex/staticSite.ts` points each
route's `og:image` at its own card and stamps a `?v=` taken from the newest
thing that card shows: unfurlers cache by URL, so without the stamp Discord and
Twitter would keep serving the first card they ever fetched. A render that
throws redirects to the static `public/og.png`.

```bash
npx tsx scripts/preview-og.ts og-preview   # render every card from sample data
node scripts/check-site-meta.mjs           # cards routed, og:image wired, kinds drawn
```

`convex/ogRuntime.generated.ts` carries the wasm renderer and the Inter subsets
(≈3.5 MB, committed) so no cold start needs a CDN. Regenerate it only when
upgrading `@resvg/resvg-wasm` or widening the glyph coverage:

```bash
pip install --break-system-packages fonttools brotli   # pyftsubset
sudo apt-get install -y fonts-inter
node scripts/gen-og-runtime.mjs
```

## Setup checklist (production)

1. **Convex**: `npx convex login`, then `npx convex dev --once --configure new` to create the project. Static hosting: `npx convex deploy`.
2. **Backend env** (`npx convex env set NAME value`):
   - `BRIDGE_SECRET` — long random string; the Discord bot bridge sends it as a bearer token.
   - `FIRECRAWL_API_KEY` (+ optional `FIRECRAWL_WEBHOOK_SECRET`) — link enrichment.
   - `AGENTMAIL_API_KEY`, `AGENTMAIL_WEBHOOK_SECRET`, `AGENTMAIL_INBOX_ID` — create an inbox in AgentMail, register the webhook `https://<deployment>.convex.site/agentmail/webhook`.
   - `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` — GitHub OAuth app with callback `https://<deployment>.convex.site/api/auth/callback/github`.
   - `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET` — Discord OAuth app with redirect `https://<deployment>.convex.site/api/auth/callback/discord` (or `<CUSTOM_AUTH_SITE_URL>/api/auth/callback/discord` if that is set). Reuse the bot's existing Discord application: **OAuth2 → Client ID / Client Secret**, and add the redirect there. Signing in with Discord claims the member's mirrored history and points automatically, so no `!link` code is needed.
   - `SITE_URL` — public site URL (used in emails and auth redirects).
   - `ANNOUNCE_CHANNEL_SLUG` — optional; channel for the weekly leaderboard post.
   - Convex Auth also needs `JWT_PRIVATE_KEY` / `JWKS`: run `npx @convex-dev/auth` once to generate them.
3. **Discord bridge** (in [techfren-discord-bot](https://github.com/aj47/techfren-discord-bot/tree/bridge/techfriendcommunity), see its `BRIDGE.md`): set `BRIDGE_ENABLED=true`, `CONVEX_INGEST_URL=https://<deployment>.convex.site`, `BRIDGE_SECRET`, and give the bot **Manage Webhooks**. Before the main bot is redeployed, `python run_bridge_standalone.py` mirrors from anywhere with its own token.
4. **History backfill** (one time, from a discrawl SQLite export):
   `npx tsx scripts/backfill.ts --db discrawl.sqlite --url https://<deployment>.convex.site --secret "$BRIDGE_SECRET" [--since 2025-01-01]`
4b. **Deploy the web app** (there is no separate frontend host — it's served by Convex itself):
   ```bash
   VITE_CONVEX_URL=https://<prod-deployment>.convex.cloud VITE_CONVEX_SITE_URL=https://<prod-deployment>.convex.site npm run build
   node scripts/gen-static-assets.mjs
   npx convex deploy -y
   ```
   `convex/staticSite.ts` serves `dist/` (embedded as base64 in `convex/staticAssets.generated.ts`) from an httpAction registered after the API routes, so the whole product — UI and backend — lives at one `*.convex.site` URL.
5. **Branded domain** (`infra/cf-proxy/`): Convex custom domains are a Pro feature, so techfriendcommunity.com is kept by a Cloudflare Worker that reverse-proxies the zone to the `*.convex.site` origin (apex → www). Deploy it with `cd infra/cf-proxy && wrangler deploy`; change `ORIGIN` in `src/index.js` if the deployment moves.
6. **WebMCP check**: open the site in ChatGPT's in-app browser or Chrome 149+ (`chrome://flags/#enable-webmcp-testing`) and run `(await document.modelContext.getTools()).map(t => t.name)` in the console.

## License

[MIT](./LICENSE)
