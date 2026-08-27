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
    pointsAllTime: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("by_handle", ["handle"])
    .index("by_discordUserId", ["discordUserId"])
    .index("by_pointsAllTime", ["pointsAllTime"]),

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
    .index("by_author", ["authorUserId", "createdAt"])
    .index("by_discordMessageId", ["discordMessageId"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["channelId"],
    }),

  // Append-only ledger. All point awards flow through points.award.
  points_events: defineTable({
    userId: v.id("users"),
    kind: v.string(),
    points: v.number(),
    dedupeKey: v.string(),
    weekKey: v.string(),
    meta: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_dedupeKey", ["dedupeKey"])
    .index("by_user_time", ["userId", "createdAt"]),

  leaderboard_weekly: defineTable({
    weekKey: v.string(),
    userId: v.id("users"),
    points: v.number(),
  })
    .index("by_week_points", ["weekKey", "points"])
    .index("by_week_user", ["weekKey", "userId"]),

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
