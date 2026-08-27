import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

const MAX_ATTEMPTS = 5;

// Deliver a web/email message to Discord through the channel's webhook.
// Per-message username/avatar give attribution without a bot in the path.
export const post = internalAction({
  args: { messageId: v.id("messages"), attempt: v.number() },
  handler: async (ctx, { messageId, attempt }) => {
    const info = await ctx.runQuery(internal.messages.getForDelivery, { messageId });
    if (!info || info.message.status === "synced") return;
    if (!info.webhookUrl) {
      await ctx.runMutation(internal.messages.markFailed, { messageId, reason: "channel has no webhook" });
      return;
    }
    const { message } = info;
    const suffix = message.source === "email" ? " (via email)" : "";
    const username = `${message.authorDisplay.name}${suffix}`.slice(0, 80);
    let status = 0;
    try {
      const res = await fetch(`${info.webhookUrl}?wait=true`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: message.content.slice(0, 2000),
          username,
          avatar_url: message.authorDisplay.avatarUrl,
          allowed_mentions: { parse: [] },
        }),
      });
      status = res.status;
      if (res.ok) {
        const data = (await res.json()) as { id: string };
        await ctx.runMutation(internal.messages.markSynced, { messageId, discordMessageId: data.id });
        return;
      }
    } catch (e) {
      console.error("discord webhook error", e);
    }
    if (attempt + 1 < MAX_ATTEMPTS) {
      const delay = Math.min(60_000, 2_000 * 2 ** attempt);
      await ctx.scheduler.runAfter(delay, internal.discordOut.post, { messageId, attempt: attempt + 1 });
    } else {
      await ctx.runMutation(internal.messages.markFailed, { messageId, reason: `Discord responded ${status}` });
    }
  },
});

// Weekly flavor: announce last week's top members in the configured channel.
export const announceWeekly = internalAction({
  args: {},
  handler: async (ctx) => {
    const slug = process.env.ANNOUNCE_CHANNEL_SLUG;
    if (!slug) return;
    const info = await ctx.runQuery(internal.points.lastWeekTop, { slug, limit: 5 });
    if (!info || info.rows.length === 0 || !info.webhookUrl) return;
    const lines = info.rows.map((r: { name: string; points: number }, i: number) => `${["🥇", "🥈", "🥉", "4.", "5."][i]} ${r.name} — ${r.points} pts`);
    await fetch(info.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "techfriend community",
        content: `**Top members for ${info.weekKey}**\n${lines.join("\n")}\n\nEarn points by posting on Discord, the web, or by email: ${process.env.SITE_URL ?? ""}`,
        allowed_mentions: { parse: [] },
      }),
    });
  },
});
