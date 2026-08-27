import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// POST /discord/ingest  { events: [...] }   Authorization: Bearer <BRIDGE_SECRET>
export const ingest = httpAction(async (ctx, req) => {
  const secret = process.env.BRIDGE_SECRET;
  if (!secret) return new Response("bridge not configured", { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!safeEqual(token, secret)) return new Response("unauthorized", { status: 401 });

  let body: { events?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const events = Array.isArray(body.events) ? body.events : [];
  if (events.length === 0) return Response.json({ ok: true, counts: {} });
  if (events.length > 200) return new Response("too many events (max 200)", { status: 413 });

  const counts = await ctx.runMutation(internal.messages.ingest, { events });
  return Response.json({ ok: true, counts });
});
