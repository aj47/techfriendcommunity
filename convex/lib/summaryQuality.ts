// The bot's model can return its working notes instead of a finished digest.
// Keep obvious drafts out of public queries even if one reaches the database.
export function isPublishableSummary(text: string): boolean {
  const summary = text.trim();
  if (!summary) return false;
  if (/^(?:we need to|let's scan:|we should|i need to)\b/i.test(summary)) return false;
  const transcriptLines = summary.match(/(?:^|\n)\s*[•*-]\s*\[\d{2}:\d{2}:\d{2}\]/g);
  if ((transcriptLines?.length ?? 0) >= 3) return false;
  // A finished bot digest always has at least one of its requested sections.
  return /(?:^|\n)\s*(?:#{1,3}\s*|\*\*)\s*(?:🔥|💡)?\s*(?:Highlights|Links Worth Checking)\b/i.test(summary);
}
