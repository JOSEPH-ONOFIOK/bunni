"use client";

import { useCallback, useSyncExternalStore } from "react";
import { EMPTY_QUESTS, type QuestState } from "./quests";

const KEY = "bunii.quests.v1";

/**
 * Quest progress lives in localStorage because connecting X navigates away
 * to x.com and back, wiping component state. Reading it through
 * `useSyncExternalStore` — rather than hydrating in an effect — keeps the
 * server render and the first client paint in agreement.
 */
const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cached: QuestState = EMPTY_QUESTS;

function getSnapshot(): QuestState {
  const raw = localStorage.getItem(KEY);
  // getSnapshot must be referentially stable, so only reparse when the
  // stored string actually changed.
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = raw ? { ...EMPTY_QUESTS, ...JSON.parse(raw) } : EMPTY_QUESTS;
    } catch {
      cached = EMPTY_QUESTS;
    }
  }
  return cached;
}

function getServerSnapshot(): QuestState {
  return EMPTY_QUESTS;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Keeps a second tab in step if someone opens the site twice.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

export function useQuestState(): [QuestState, (next: QuestState) => void] {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setState = useCallback((next: QuestState) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    emit();
  }, []);

  return [state, setState];
}

export function clearQuestState() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  emit();
}
