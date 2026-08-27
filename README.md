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
npx convex dev        # starts Convex dev deployment + codegen
npm run dev           # Vite dev server
```

## License

[MIT](./LICENSE)
