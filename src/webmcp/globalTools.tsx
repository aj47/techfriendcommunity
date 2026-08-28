import { useConvex, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { fmtTime, timeAgo } from "../lib/format";
import { text, useWebMCPTool } from "./useWebMCPTool";

// Tools available on every page: observe the community, search it, know who you are.
export function GlobalTools() {
  const convex = useConvex();
  const channels = useQuery(api.channels.list);
  const me = useQuery(api.users.me);
  const summary = useQuery(api.summaries.latest, { limit: 8 });

  useWebMCPTool(
    {
      name: "get-community-overview",
      description: "Get an overview of the techfriend community: the list of channels (with slugs to open them at /channels/<slug>), recent activity, and who is signed in. Call this first to orient yourself.",
      async execute() {
        const list = channels ?? [];
        const who = me ? `Signed in as ${me.handle ? "@" + me.handle : me.displayName} (${me.pointsAllTime} pts on the Discord leaderboard).` : "Not signed in — the human can browse but must sign in to post.";
        if (list.length === 0) return text(`${who}\nNo channels are mirrored yet.`);
        return text(`${who}\nChannels:\n` + list.map((c) => `- #${c.name} (slug: ${c.slug}) — ${c.messageCount} messages, last ${c.lastMessageAt ? timeAgo(c.lastMessageAt) : "n/a"}${c.topic ? `: ${c.topic}` : ""}`).join("\n"));
      },
    },
    [channels, me],
  );

  useWebMCPTool(
    {
      name: "get-daily-summary",
      description: "Read the latest daily summary of the community. The Discord bot summarizes each channel's day and this returns the most recent one, per channel. Use it to catch up without reading the whole feed.",
      inputSchema: {
        type: "object",
        properties: { channel: { type: "string", description: "Optional channel slug. Omit for the busiest channel that day." } },
      },
      async execute({ channel }: { channel?: string }) {
        if (!summary || summary.entries.length === 0) return text("No daily summary has been published yet.");
        const wanted = channel ? summary.entries.find((e) => e.channelSlug === channel) : summary.entries[0];
        if (!wanted) {
          return text(`No summary for "${channel}" on ${summary.date}. Summarized that day: ${summary.entries.map((e) => e.channelSlug ?? e.channelName).join(", ")}.`);
        }
        return text(`Daily summary for #${wanted.channelName} — ${summary.date} (${wanted.messageCount} messages, ${wanted.activeUsers} people):\n\n${wanted.summaryText}`);
      },
    },
    [summary],
  );

  useWebMCPTool(
    {
      name: "search-messages",
      description: "Full-text search across all community channels. Returns matching messages with author, channel, and time. Optionally restrict to one channel by slug.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Words to search for." },
          channel: { type: "string", description: "Optional channel slug from get-community-overview." },
        },
        required: ["query"],
      },
      async execute({ query, channel }: { query: string; channel?: string }) {
        let channelId;
        if (channel) {
          const c = await convex.query(api.channels.bySlug, { slug: channel });
          if (!c) return text(`No channel with slug "${channel}". Valid slugs: ${(channels ?? []).map((x) => x.slug).join(", ")}.`);
          channelId = c.id;
        }
        const rows = await convex.query(api.messages.search, { query, channelId, limit: 15 });
        if (rows.length === 0) return text(`No messages match "${query}".`);
        return text(rows.map((m) => `[#${m.channel?.name ?? "?"}] ${m.author.name} — ${fmtTime(m.createdAt)}\n${m.content}`).join("\n\n"));
      },
    },
    [channels],
  );

  useWebMCPTool(
    {
      name: "get-my-profile",
      description: "Get the signed-in human's profile: handle, standing on the Discord bot's leaderboard, whether Discord is linked. Explains why posting may be blocked (not signed in, no handle yet).",
      async execute() {
        if (!me) return text("Nobody is signed in. Ask the human to sign in at /signin (GitHub or email link) before posting.");
        return text(`@${me.handle ?? "(no handle yet — set one at /settings before posting)"} · ${me.displayName}\nPoints: ${me.pointsAllTime} on the Discord leaderboard\nDiscord linked: ${me.discordLinked ? "yes" : "no"}\nDigest subscriptions: ${me.subscriptionCount}`);
      },
    },
    [me],
  );

  return null;
}
