"use client";

import { useSyncExternalStore } from "react";

export type Countdown = {
  /** Null until the clock has started on the client. */
  left: { hours: number; minutes: number; seconds: number } | null;
  closed: boolean;
};

function parts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/**
 * The wall clock, as an external store.
 *
 * One interval for the whole page, shared by every countdown on it, and the
 * snapshot is the current second rather than the millisecond — so a component
 * only re-renders when the digits it shows would actually change.
 */
const clock = {
  listeners: new Set<() => void>(),
  timer: undefined as ReturnType<typeof setInterval> | undefined,

  subscribe(onChange: () => void) {
    clock.listeners.add(onChange);
    clock.timer ??= setInterval(() => {
      for (const listener of clock.listeners) listener();
    }, 1000);

    return () => {
      clock.listeners.delete(onChange);
      if (clock.listeners.size === 0) {
        clearInterval(clock.timer);
        clock.timer = undefined;
      }
    };
  },

  now: () => Math.floor(Date.now() / 1000),

  /**
   * The server has no idea what time it is in the visitor's browser, so it
   * reports null and callers render a settled placeholder. Anything else would
   * hydrate into a different value and make the digits visibly jump.
   */
  serverNow: () => null,
};

/** Counts down to a fixed instant. */
export function useCountdown(iso: string): Countdown {
  const nowSeconds = useSyncExternalStore(
    clock.subscribe,
    clock.now,
    clock.serverNow,
  );

  const target = new Date(iso).getTime();
  // A deadline that doesn't parse would otherwise tick out NaNs forever.
  if (Number.isNaN(target)) return { left: null, closed: true };
  if (nowSeconds === null) return { left: null, closed: false };

  const remaining = target - nowSeconds * 1000;
  return { left: parts(remaining), closed: remaining <= 0 };
}

/** Two digits, so the clock doesn't jitter as numbers shrink. */
export const pad = (n: number) => String(n).padStart(2, "0");
