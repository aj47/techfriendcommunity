import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export const roleValidator = v.union(
  v.literal("member"),
  v.literal("mod"),
  v.literal("banned"),
);

export const messageSourceValidator = v.union(
  v.literal("discord"),
  v.literal("web"),
  v.literal("email"),
);

export default defineSchema({
  ...authTables,

  // Extends Convex Auth's users table (auth fields first, app fields after).
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    handle: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    // Discord snowflake of a linked account. Internal only — never returned by a public query.
    discordUserId: v.optional(v.string()),
    // Backfilled/mirrored author with no claimed account yet.
    isShadow: v.optional(v.boolean()),
    role: v.optional(roleValidator),
  })
    .index("email", ["email"])
    .index("by_handle", ["handle"])
    .index("by_discordUserId", ["discordUserId"]),

  channels: defineTable({
    discordChannelId: v.string(),
    slug: v.string(),
    name: v.string(),
    topic: v.optional(v.string()),
    position: v.number(),
    lastMessageAt: v.optional(v.number()),
    messageCount: v.number(),
    // Threads are modeled as channels with a parent, reusing the same
    // messages/webhook/posting infrastructure instead of a parallel concept.
    isThread: v.optional(v.boolean()),
    parentChannelId: v.optional(v.id("channels")),
  })
    .index("by_slug", ["slug"])
    .index("by_discordChannelId", ["discordChannelId"])
    .index("by_parentChannelId", ["parentChannelId"]),

  // Discord webhook URLs are capability secrets. Internal only.
  channelSecrets: defineTable({
    channelId: v.id("channels"),
    webhookUrl: v.string(),
  }).index("by_channelId", ["channelId"]),

  messages: defineTable({
    channelId: v.id("channels"),
    authorUserId: v.optional(v.id("users")),
    // Denormalized so Discord-only and shadow authors render without a join.
    authorDisplay: v.object({
      name: v.string(),
      avatarUrl: v.optional(v.string()),
    }),
    content: v.string(),
    source: messageSourceValidator,
    discordMessageId: v.optional(v.string()),
    replyToDiscordMessageId: v.optional(v.string()),
    urls: v.array(v.string()),
    status: v.union(
      v.literal("synced"),
      v.literal("pending"),
      v.literal("failed"),
    ),
    // Legacy. Set on every message written while the site exposed WebMCP tools,
    // where an agent could stage a draft for a human to send. The tools are gone;
    // the column stays optional until the rows carrying it age out of retention,
    // because Convex validates existing documents against the schema on deploy.
    agentAssisted: v.optional(v.boolean()),
    // Resolved pointer for a reply, web- or Discord-originated (Discord's raw
    // id lives in replyToDiscordMessageId; this is set whenever the target
    // is a message we actually have). Discord threads created from a message
    // share that message's id, so a thread's presence is found by looking up
    // channels.by_discordChannelId with this message's own discordMessageId —
    // no separate link is needed, but the resolved channel is denormalized
    // here once found so channel views don't pay an extra read per message.
    replyToMessageId: v.optional(v.id("messages")),
    threadChannelId: v.optional(v.id("channels")),
    createdAt: v.number(),
    editedAt: v.optional(v.number()),
    hiddenAt: v.optional(v.number()),
  })
    .index("by_channel_time", ["channelId", "createdAt"])
    // Community-wide "latest messages" on the home page. Without it that view
    // would have to fan out over every channel on every new message.
    .index("by_createdAt", ["createdAt"])
    .index("by_author", ["authorUserId", "createdAt"])
    .index("by_discordMessageId", ["discordMessageId"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["channelId"],
    }),

  // Read-only mirror of the Discord bot's user_points table, pushed by the
  // bridge. The bot's LLM-judged points are the community's only scoring
  // system; nothing here computes or awards points.
  leaderboard_mirror: defineTable({
    discordUserId: v.string(),
    name: v.string(),
    points: v.number(),
    // Everything this member has ever been awarded. `points` is a spendable
    // balance in the bot — colours, GIF bypasses and frenbot access all take
    // from it — so it stops answering "how much have they contributed" the
    // moment they spend any. Optional because a bot older than the column
    // pushes rows without it.
    lifetimePoints: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_discordUserId", ["discordUserId"])
    .index("by_points", ["points"])
    // The mirror's freshness is "when did the bot last push", i.e. the newest
    // updatedAt — not the updatedAt of whichever row happens to be oldest.
    .index("by_updatedAt", ["updatedAt"]),

  // The Discord bot's daily per-channel summaries, pushed by the bridge.
  // The bot posts the summary body into a Discord *thread*, and threads are not
  // mirrored, so this table is the web app's only copy of that text.
  channel_summaries: defineTable({
    channelId: v.id("channels"),
    channelName: v.string(),
    // The day summarized, YYYY-MM-DD in the bot's local timezone.
    date: v.string(),
    summaryText: v.string(),
    messageCount: v.number(),
    activeUsers: v.number(),
    createdAt: v.number(),
  })
    .index("by_channel_date", ["channelId", "date"])
    .index("by_date", ["date"]),

  // Idempotency for inbound AgentMail replies. Previously piggybacked on the
  // points ledger; it is bookkeeping, not scoring, so it gets its own table.
  processed_emails: defineTable({
    dedupeKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_dedupeKey", ["dedupeKey"])
    .index("by_createdAt", ["createdAt"]),

  link_resources: defineTable({
    url: v.string(),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    siteName: v.optional(v.string()),
    // og:image, for the preview cards on the landing page. Optional forever:
    // plenty of pages have none, and rows written before this existed keep
    // rendering as a plain card.
    imageUrl: v.optional(v.string()),
    // When the og:image fetch last ran, image or no image. Without it the
    // backfill would re-fetch every page that simply hasn't got one.
    imageAttemptedAt: v.optional(v.number()),
    tags: v.array(v.string()),
    // title + summary + siteName + tags + url, lowercased, maintained on write.
    // The search index needs one field, and searching only `summary` missed
    // every link whose topic appears in its title, tags, or domain.
    searchText: v.optional(v.string()),
    sharedByUserId: v.optional(v.id("users")),
    messageId: v.optional(v.id("messages")),
    channelId: v.optional(v.id("channels")),
    crawlStatus: v.union(
      v.literal("pending"),
      v.literal("done"),
      v.literal("failed"),
    ),
    failReason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_url", ["url"])
    .index("by_createdAt", ["createdAt"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["crawlStatus"],
    }),

  digest_subscriptions: defineTable({
    userId: v.id("users"),
    channelId: v.id("channels"),
    cadence: v.union(v.literal("daily"), v.literal("weekly")),
    lastSentAt: v.optional(v.number()),
    // Authenticates a reply to this subscription's digests; see lib/replyToken.
    // Optional only so rows written before it existed still validate —
    // sendDigests mints one before the subject line can ever carry it.
    replyToken: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_channel_cadence", ["channelId", "cadence"])
    .index("by_replyToken", ["replyToken"]),

  // Maps an AgentMail thread back to (user, channel): one thread per pair, forever.
  digest_threads: defineTable({
    userId: v.id("users"),
    channelId: v.id("channels"),
    agentmailThreadId: v.string(),
    lastDigestAt: v.optional(v.number()),
  })
    .index("by_thread", ["agentmailThreadId"])
    .index("by_user_channel", ["userId", "channelId"]),

  // Short-lived codes for claiming a Discord identity via `!link CODE`.
  link_codes: defineTable({
    code: v.string(),
    userId: v.id("users"),
    expiresAt: v.number(),
  }).index("by_code", ["code"]),

  moderation_log: defineTable({
    actorUserId: v.id("users"),
    action: v.string(),
    targetId: v.string(),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_time", ["createdAt"]),
});
