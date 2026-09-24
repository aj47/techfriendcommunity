# Move link enrichment to tfbot

Status: plan, September 24, 2026. No Firecrawl calls have been removed yet.

## Current path

- The website records eligible URLs from Discord, web posts, email, and the signed-in **Summarize link** form in `link_resources`. Each new or retried row schedules `convex/links.ts:enrich`, which calls Firecrawl for page markdown and structured title, summary, site name, and tags. It also captures an image from page metadata or a direct OG fetch.
- tfbot separately processes Discord URLs in `bot.py`. It already extracts YouTube content, uses Apify for X where configured, falls back to Firecrawl for ordinary pages and some failed special cases, asks its LLM to summarize the result, and stores that summary on the message row. The bot does not currently enrich links submitted on the website or by email.
- The bot-to-website bridge can send events to Convex, but currently sends messages, reactions, points, and daily summaries, not link enrichment results. Removing the site's crawler before adding a request path to tfbot would strand website and email links in `pending`.

## Target

tfbot owns URL fetching and summarization for all sources. The website remains the queue and public index, and continues to render `link_resources` with the same fields and `pending` / `done` / `failed` states.

1. **Queue and claim:** Add an authenticated bot-only endpoint for tfbot to claim pending resource IDs and URLs. Use a short lease and retry count so a bot restart cannot leave rows stuck, and make claiming idempotent by normalized URL.
2. **Fetch:** Replace tfbot's generic Firecrawl call with bounded direct HTTP fetching and readable-content extraction. Reuse its existing YouTube and X handlers where they succeed. Enforce public-address DNS and redirect checks, response-size and time limits, and content-type handling because website users can submit URLs. Mark pages that cannot be read, including some script-rendered pages, as failed with a useful reason.
3. **Summarize:** Reuse tfbot's LLM client, but require a validated response containing title, a grounded 2–4 sentence summary, site name, and 3–5 short tags. Extract an OG image separately. Preserve source URL and extraction status; do not publish page markdown or model working notes.
4. **Return:** Add a signed bridge event for the result keyed by resource ID and lease token. The Convex receiver checks the claim, validates field lengths and image URL, updates the resource and search text, or records a bounded failure reason. Do not post website-only requests to Discord.
5. **Reuse:** Cache by normalized URL in tfbot and reuse successful bot summaries for links the website already indexed. The website's single resource row remains the deduplication point, including retries from the Summarize link form.

## Rollout and checks

1. Record a representative sample of existing `done` / `failed` resources: ordinary articles, GitHub, YouTube, X, PDFs, blocked pages, and script-rendered pages. Compare current metadata and latency with the proposed worker.
2. Build the bot worker and signed queue/result protocol behind flags. Exercise Discord, website, email, duplicate URL, retry, bot restart, private-address redirect, and failed-fetch paths in staging. Compare summaries against the source page for factual errors.
3. Enable tfbot enrichment for a small production slice while Firecrawl remains available for the rest. Track completion rate, time to `done`, failed reasons, LLM usage, and bot load. Increase the slice after the new path handles the representative sample without losing sources or creating duplicate work.
4. Switch all new resources and retries to tfbot. Drain existing pending rows, verify no Firecrawl calls from either service, then remove the website Convex component/package/webhook and the bot Firecrawl handler/package/configuration. Revoke both Firecrawl keys after the no-call check. Existing `link_resources` data stays intact.

Rollback before removal: flip the website enrichment flag back to its current action, leave queued rows for retry, and disable the bot poller. After removal, rollback would require redeploying the prior release, so keep the cutover observable for several days first.

## Decision to confirm

This plan assumes Firecrawl should be removed from **both** the website and tfbot. If the goal is only to remove the website integration, keep tfbot's Firecrawl fetcher in step 2 and omit bot package/key removal in step 4.
