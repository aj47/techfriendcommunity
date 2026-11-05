// Shared-link helpers for the resources list.

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // Stored URLs are normalized on write, so this should always parse — but it
    // runs during render, and one bad row would take the page down.
    return url;
  }
}
