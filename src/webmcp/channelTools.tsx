import { useRef } from "react";
import { useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import { draftStore } from "../lib/draftStore";
import { fmtTime } from "../lib/format";
import { plainMentions } from "../lib/linkify";
import type { MessageView } from "../components/MessageList";
import { text, useWebMCPTool } from "./useWebMCPTool";

// Tools that only exist while a channel page is open. They wrap the same data
// and composer the human is looking at, so every call is visible on screen.
export function ChannelTools({ slug, channelName, messages }: { slug: string; channelName: string; messages: MessageView[] }) {
  const convex = useConvex();
  const latest = useRef(messages);
  latest.current = messages;

  useWebMCPTool(
    {
      name: "read-channel",
      description: `Read the most recent messages in the currently open channel (#${channelName}). Returns author, time, and text, oldest first. Use this before drafting a reply so you know what people are discussing.`,
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "How many recent messages to return (1-50, default 30)." },
        },
      },
      async execute({ limit }: { limit?: number }) {
        const n = Math.min(Math.max(Math.floor(limit ?? 30), 1), 50);
        const rows = latest.current.slice(-n);
        if (rows.length === 0) return text(`#${channelName} has no messages yet.`);
        // An agent reading this gets names, not snowflakes — <@123> is as
        // opaque to it as it is to a person.
        const lines = rows.map((m) => `${m.author.name} — ${fmtTime(m.createdAt)}${m.source !== "discord" ? ` (via ${m.source})` : ""}\n${plainMentions(m.content, m.mentions)}`);
        return text(`#${channelName}, ${rows.length} most recent messages (oldest first):\n\n${lines.join("\n\n")}`);
      },
    },
    [slug, channelName],
  );

  useWebMCPTool(
    {
      name: "stage-message",
      description: `Draft a message into the composer for #${channelName}. This does NOT send it: the draft is highlighted on screen and the human must press Send. Use read-channel first. Keep it conversational; Discord message limit is 2000 characters. After staging, tell the user to review and send.`,
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "The message text to stage in the composer." },
          replyToAuthor: {
            type: "string",
            description: "Optional: stage this as a reply to that person's most recent message in the channel (matches the name from read-channel).",
          },
        },
        required: ["text"],
      },
      async execute({ text: body, replyToAuthor }: { text: string; replyToAuthor?: string }) {
        const t = (body ?? "").trim();
        if (!t) return text("Nothing staged: the text was empty.");
        if (t.length > 2000) return text(`Not staged: ${t.length} characters is over Discord's 2000 limit. Shorten it and try again.`);
        let replyNote = "";
        let replyTo = null;
        if (replyToAuthor) {
          const target = [...latest.current].reverse().find((m) => m.author.name.toLowerCase().includes(replyToAuthor.toLowerCase()));
          if (target) {
            replyTo = { id: target.id, author: target.author.name, snippet: target.content.slice(0, 140) };
            replyNote = ` as a reply to ${target.author.name}`;
          } else {
            replyNote = ` (couldn't find a recent message from "${replyToAuthor}" to reply to — staged as a normal message instead)`;
          }
        }
        draftStore.stage(slug, t, replyTo);
        document.getElementById("composer")?.focus();
        return text(`Staged a ${t.length}-character draft${replyNote} in the #${channelName} composer. It is highlighted for the human to review and press Send. Nothing has been posted yet.`);
      },
    },
    [slug, channelName],
  );

  useWebMCPTool(
    {
      name: "get-staged-message",
      description: `Check what is currently in the composer for #${channelName} and whether it was staged by an agent or typed by the human.`,
      async execute() {
        const d = draftStore.for(slug);
        if (!d.text) return text(`The #${channelName} composer is empty.`);
        return text(`Composer for #${channelName} contains (${d.agentStaged ? "staged by agent" : "typed by the human"}):\n${d.text}`);
      },
    },
    [slug, channelName],
  );

  useWebMCPTool(
    {
      name: "search-channel",
      description: `Full-text search of messages in #${channelName}. Use for "did anyone mention X" questions.`,
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "Words to search for." } },
        required: ["query"],
      },
      async execute({ query }: { query: string }) {
        const channel = await convex.query(api.channels.bySlug, { slug });
        if (!channel) return text(`Channel ${slug} not found.`);
        const rows = await convex.query(api.messages.search, { query, channelId: channel.id, limit: 15 });
        if (rows.length === 0) return text(`No messages in #${channelName} match "${query}".`);
        return text(rows.map((m) => `${m.author.name} — ${fmtTime(m.createdAt)}\n${plainMentions(m.content, m.mentions)}`).join("\n\n"));
      },
    },
    [slug, channelName],
  );

  return null;
}
