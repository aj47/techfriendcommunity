# Deploying the leaderboard mirror

The web app no longer scores anything. The techfren Discord bot's `user_points`
table is the community's only points system, and this app renders it read-only.

Deploy in this order — the bot must be pushing before the page has anything to
show, and the schema cleanup has to come after the code that stops writing.

## 1. Convex (this repo, branch `feat/discord-leaderboard-mirror`)

```
npx convex deploy
```

Adds `leaderboard_mirror` and the `leaderboard.sync` ingest event, and removes
every award path. The retired `points_events` / `leaderboard_weekly` tables and
`users.pointsAllTime` are still declared in `schema.ts` on purpose: Convex
validates existing documents against the schema on deploy, so dropping them
while they still hold rows fails the deploy.

## 2. Bot (techfren-discord-bot, branch `feat/bridge-leaderboard-push`)

Merge and restart. On startup and every 10 minutes the bridge pushes the
standings; the log line is `bridge: leaderboard mirrored (N members)`.
Confirm `/leaderboard` on the site matches the bot's own leaderboard.

## 3. Clean up the retired tables

```
npx convex run points:purgeLegacy
```

Re-run until it returns `done: true` (it batches). Then delete the three
declarations marked *Legacy* in `schema.ts` and deploy again.

## Note on `ANNOUNCE_CHANNEL_SLUG`

The weekly "top members" cron that posted this app's own leaderboard into
Discord is gone. That env var is now unused and can be removed.
