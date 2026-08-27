/**
 * One-time history backfill from a discrawl SQLite export into Convex.
 *
 * Replays history through the same secret-gated /discord/ingest endpoint the
 * live bridge uses, so dedupe, shadow users, points, and channel bookkeeping
 * behave identically. Link enrichment is skipped for backfilled messages.
 *
 *   npx tsx scripts/backfill.ts --db ./discrawl.sqlite --url https://<deployment>.convex.site \
 *     --secret "$BRIDGE_SECRET" [--guild <id>] [--since 2025-01-01] [--channels general,help] \
 *     [--limit 5000] [--dry-run]
 */
import Database from "better-sqlite3";

type Args = Record<string, string | boolean>;
const args: Args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) {
    const next = process.argv[i + 1];
    if (next && !next.startsWith("--")) { args[a.slice(2)] = next; i++; } else args[a.slice(2)] = true;
  }
}
const need = (k: string) => { const v = args[k]; if (typeof v !== "string") { console.error(`--${k} is required`); process.exit(1); } return v; };

const dbPath = need("db");
const dryRun = args["dry-run"] === true;
const url = dryRun ? String(args.url ?? "") : need("url");
const secret = dryRun ? String(args.secret ?? "") : need("secret");
const guild = typeof args.guild === "string" ? args.guild : null;
const since = typeof args.since === "string" ? new Date(args.since).toISOString() : null;
const limit = typeof args.limit === "string" ? Number(args.limit) : Infinity;
const channelFilter = typeof args.channels === "string" ? new Set(args.channels.split(",").map((s) => s.trim())) : null;

const db = new Database(dbPath, { readonly: true });

type ChannelRow = { id: string; guild_id: string; name: string; topic: string | null; position: number | null; kind: string; is_private_thread: number; thread_parent_id: string | null };
const channels = (db.prepare("select id, guild_id, name, topic, position, kind, is_private_thread, thread_parent_id from channels").all() as ChannelRow[])
  .filter((c) => (!guild || c.guild_id === guild))
  .filter((c) => !c.is_private_thread && !c.thread_parent_id)
  .filter((c) => /text|^0$|announcement|^5$/i.test(String(c.kind)))
  .filter((c) => !channelFilter || channelFilter.has(c.name) || channelFilter.has(c.id));
console.error(`channels: ${channels.length} (kinds seen: ${[...new Set((db.prepare("select distinct kind from channels").all() as { kind: string }[]).map((r) => r.kind))].join(", ")})`);

type MemberRow = { user_id: string; username: string; global_name: string | null; display_name: string | null; nick: string | null; avatar: string | null; bot: number };
const members = new Map<string, MemberRow>();
for (const m of db.prepare("select user_id, username, global_name, display_name, nick, avatar, bot from members").all() as MemberRow[]) members.set(m.user_id, m);
const avatarUrl = (m?: MemberRow) => (m?.avatar ? `https://cdn.discordapp.com/avatars/${m.user_id}/${m.avatar}.png?size=128` : undefined);
const displayName = (m?: MemberRow, id?: string) => m?.nick || m?.display_name || m?.global_name || m?.username || `user-${(id ?? "").slice(-4)}`;

const hasAttachmentUrl = (db.prepare("pragma table_info(message_attachments)").all() as { name: string }[]).some((c) => c.name === "url");
const attachmentsFor = hasAttachmentUrl ? db.prepare("select url from message_attachments where message_id = ?") : null;

type MessageRow = { id: string; channel_id: string; author_id: string | null; message_type: number; created_at: string; edited_at: string | null; content: string; reply_to_message_id: string | null; has_attachments: number };
const channelIds = channels.map((c) => c.id);
const placeholders = channelIds.map(() => "?").join(",");
const rows = db.prepare(
  `select id, channel_id, author_id, message_type, created_at, edited_at, content, reply_to_message_id, has_attachments
   from messages where deleted_at is null and message_type in (0, 19) and channel_id in (${placeholders})
   ${since ? "and created_at >= ?" : ""} order by created_at asc`,
).all(...channelIds, ...(since ? [since] : [])) as MessageRow[];
console.error(`messages: ${rows.length}${Number.isFinite(limit) ? ` (limit ${limit})` : ""}`);

async function send(events: unknown[]) {
  if (dryRun) return { dryRun: true, n: events.length };
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${url.replace(/\/$/, "")}/discord/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ events }),
    });
    if (res.ok) return await res.json();
    const body = await res.text();
    if (res.status === 401 || res.status === 400) throw new Error(`${res.status}: ${body}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
  throw new Error("giving up on batch");
}

(async () => {
  const sync = { type: "channel.sync", channels: channels.map((c) => ({ id: c.id, name: c.name, topic: c.topic, position: c.position ?? 0 })) };
  console.error("channel.sync", JSON.stringify(await send([sync])));

  let sent = 0;
  const batch: unknown[] = [];
  const flush = async () => {
    if (!batch.length) return;
    const r = await send(batch.splice(0));
    process.stderr.write(`\r${sent}/${Math.min(rows.length, limit)}  ${JSON.stringify(r)}   `);
  };
  for (const m of rows) {
    if (sent >= limit) break;
    const member = m.author_id ? members.get(m.author_id) : undefined;
    const attachmentUrls = m.has_attachments && attachmentsFor ? (attachmentsFor.all(m.id) as { url: string }[]).map((a) => a.url) : [];
    if (!m.content && attachmentUrls.length === 0) continue;
    batch.push({
      type: "message.create",
      id: m.id,
      channelId: m.channel_id,
      authorId: m.author_id ?? "0",
      authorName: displayName(member, m.author_id ?? undefined),
      authorAvatar: avatarUrl(member),
      isBot: !!member?.bot,
      webhookId: null,
      content: m.content,
      createdAt: Date.parse(m.created_at),
      replyToId: m.reply_to_message_id,
      attachmentUrls,
      skipLinks: true,
    });
    sent++;
    if (batch.length >= 200) await flush();
  }
  await flush();
  console.error(`\ndone: ${sent} messages`);
})().catch((e) => { console.error("\n", e); process.exit(1); });
