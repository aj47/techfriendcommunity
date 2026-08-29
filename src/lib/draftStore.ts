// Composer draft shared between the UI and WebMCP tools. An agent "stages" a
// message here; only the human pressing Send posts it.
import { useSyncExternalStore } from "react";

export type ReplyTarget = { id: string; author: string; snippet: string };
export type Draft = { slug: string | null; text: string; agentStaged: boolean; replyTo: ReplyTarget | null };

let state: Draft = { slug: null, text: "", agentStaged: false, replyTo: null };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const draftStore = {
  get: () => state,
  set(patch: Partial<Draft>) {
    state = { ...state, ...patch };
    emit();
  },
  stage(slug: string, text: string) {
    state = { slug, text, agentStaged: true, replyTo: state.slug === slug ? state.replyTo : null };
    emit();
  },
  replyTo(slug: string, target: ReplyTarget) {
    state = { slug, text: state.slug === slug ? state.text : "", agentStaged: false, replyTo: target };
    emit();
  },
  clear() {
    state = { slug: state.slug, text: "", agentStaged: false, replyTo: null };
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useDraft(): Draft {
  return useSyncExternalStore(draftStore.subscribe, draftStore.get, draftStore.get);
}
