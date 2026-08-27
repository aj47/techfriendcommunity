// ISO-8601 week key, e.g. "2026-W36". Weeks start Monday, UTC.
export function weekKey(ts: number): string {
  const d = new Date(ts);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7; // Sunday -> 7
  date.setUTCDate(date.getUTCDate() + 4 - day); // nearest Thursday
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}
