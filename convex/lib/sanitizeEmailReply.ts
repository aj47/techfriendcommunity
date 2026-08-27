// Keep only the part a person typed in a reply: drop quoted history, signatures,
// and forwarded headers. Conservative: when in doubt, cut.
export function sanitizeEmailReply(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*>/.test(line)) break;
    if (/^On .{5,200} wrote:\s*$/.test(line)) break;
    if (/^-{2,}\s*$/.test(line) || /^_{5,}\s*$/.test(line)) break;
    if (/^(From|Sent|To|Subject):\s/.test(line) && out.length > 0) break;
    if (/^-{3,}\s*(Original Message|Forwarded message)/i.test(line)) break;
    if (/^Sent from my /i.test(line)) break;
    out.push(line);
  }
  return out.join("\n").trim().slice(0, 2000);
}

export function extractEmail(from: unknown): string | null {
  const s = typeof from === "string" ? from : Array.isArray(from) ? String(from[0] ?? "") : from && typeof from === "object" ? String((from as { email?: string }).email ?? "") : "";
  const m = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}
