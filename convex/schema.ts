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
  })
    .index("by_slug", ["slug"])
    .index("by_discordChannelId", ["discordChannelId"]),

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
    agentAssisted: v.boolean(),
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
    updatedAt: v.number(),
  })
    .index("by_discordUserId", ["discordUserId"])
    .index("by_points", ["points"]),

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
  }).index("by_dedupeKey", ["dedupeKey"]),

  link_resources: defineTable({
    url: v.string(),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    siteName: v.optional(v.string()),
    tags: v.array(v.string()),
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
    .searchIndex("search_resources", {
      searchField: "summary",
      filterFields: ["crawlStatus"],
    }),

  digest_subscriptions: defineTable({
    userId: v.id("users"),
    channelId: v.id("channels"),
    cadence: v.union(v.literal("daily"), v.literal("weekly")),
    lastSentAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_channel_cadence", ["channelId", "cadence"]),

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
