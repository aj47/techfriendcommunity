// The secret that authenticates a reply-by-email.
//
// AgentMail's inbound payload carries no headers and no SPF/DKIM result (see
// InboundMessagePayload in @agentmail/convex), so `From:` is an unverified
// claim: anyone can put a member's address on an email and, if that were all we
// checked, speak in Discord under their name and avatar. A per-subscription
// token can decide it instead, because the only place it has ever appeared is
// the subscriber's own mailbox.
//
// It rides in the subject line, where a reply keeps it without the sender
// having to do anything: `[#general.9f3a1c2b7d4e6a807f1c2b3d]`.

export const REPLY_TOKEN_LENGTH = 24; // 96 bits of hex

const TAG_RE = new RegExp(
  `\\[#([a-z0-9-]+)\\.([a-f0-9]{${REPLY_TOKEN_LENGTH}})\\]`,
  "i",
);

export function newReplyToken(): string {
  // crypto.randomUUID() is CSPRNG-backed in Convex's runtime. Math.random() is
  // seeded per execution and is emphatically not a source of secrets.
  return crypto.randomUUID().replace(/-/g, "").slice(0, REPLY_TOKEN_LENGTH);
}

export function subjectTag(slug: string, token: string): string {
  return `[#${slug}.${token}]`;
}

export function parseSubjectTag(
  subject: string,
): { slug: string; token: string } | null {
  const m = subject.match(TAG_RE);
  if (!m) return null;
  return { slug: m[1].toLowerCase(), token: m[2].toLowerCase() };
}

// Length-checked, data-independent compare. A Convex mutation is a poor timing
// oracle and the token is not attacker-observable, but the constant-time form
// costs nothing and keeps the guarantee from resting on that argument.
export function tokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
