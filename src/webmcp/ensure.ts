// Load the WebMCP polyfill only when the browser has no native document.modelContext.
// Native support: ChatGPT's in-app browser, Chrome 149+ with chrome://flags/#enable-webmcp-testing.
export function ensureWebMCP() {
  if (typeof document === "undefined") return;
  if ("modelContext" in document) return;
  import("../lib/webmcp-polyfill.js").catch((e) => console.warn("WebMCP polyfill failed to load", e));
}

export function hasWebMCP(): boolean {
  return typeof document !== "undefined" && "modelContext" in document;
}
