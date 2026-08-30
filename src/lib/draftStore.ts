// Composer drafts, kept per channel and persisted across reloads.
//
// An agent "stages" a message here; only the human pressing Send posts it. That
// makes a draft something worth not losing: a single in-memory slot meant that
// glancing at another channel — or a reload — silently discarded whatever you
// or your agent had just written.
import { useSyncExternalStore } from "react";

export type ReplyTarget = { id: string; author: string; snippet: string };
export type Draft = { text: string; agentStaged: boolean; replyTo: ReplyTarget | null };

const KEY = "tfc:drafts:v1";
const EMPTY: Draft = { text: "", agentStaged: false, replyTo: null };

type Drafts = Record<string, Draft>;

// Storage can throw outright (private mode, disabled site data) and can hold
// anything (an older shape, hand-edited JSON). A lost draft is never worth a
// crash, so every path here degrades to "no saved drafts".
function load(): Drafts {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Drafts = {};
    for (const [slug, value] of Object.entries(parsed as Record<string, Partial<Draft>>)) {
      if (value && typeof value.text === "string" && value.text.trim()) {
        out[slug] = {
          text: value.text,
          agentStaged: !!value.agentStaged,
          replyTo: value.replyTo ?? null,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

let state: Drafts = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    const keep: Drafts = {};
    for (const [slug, draft] of Object.entries(state)) {
      if (draft.text.trim()) keep[slug] = draft;
    }
    if (Object.keys(keep).length) localStorage.setItem(KEY, JSON.stringify(keep));
    else localStorage.removeItem(KEY);
  } catch {
    // Out of quota or storage blocked — the in-memory draft still works.
  }
}

function emit() {
  persist();
  for (const listener of listeners) listener();
}

function forSlug(slug: string): Draft {
  // Returns a stable reference per slug (or the shared EMPTY), which is what
  // useSyncExternalStore needs to avoid re-rendering forever.
  return state[slug] ?? EMPTY;
}

function setFor(slug: string, patch: Partial<Draft>) {
  state = { ...state, [slug]: { ...forSlug(slug), ...patch } };
  emit();
}

function clearFor(slug: string) {
  if (!state[slug]) return;
  const next = { ...state };
  delete next[slug];
  state = next;
  emit();
}

export const draftStore = {
  for: forSlug,
  setFor,
  clearFor,
  replyTo(slug: string, target: ReplyTarget) {
    setFor(slug, { replyTo: target });
  },
  stage(slug: string, text: string, replyTo: ReplyTarget | null = null) {
    setFor(slug, { text, agentStaged: true, replyTo });
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useDraft(slug: string): Draft {
  return useSyncExternalStore(
    draftStore.subscribe,
    () => forSlug(slug),
    () => EMPTY,
  );
}
