"use client";

import { useCallback, useEffect, useState } from "react";

export type XAccountState = {
  connected: boolean;
  /** False when X_CLIENT_ID/SECRET aren't set — the connect step is skipped. */
  configured: boolean;
  username?: string;
  name?: string;
};

/**
 * Seeded from the server (which already read the session cookie), so there
 * is no mount fetch and no "connecting…" flash. Disconnecting only has to
 * clear it locally — the cookie is dropped by the logout route.
 */
export function useXAccount(initial: XAccountState) {
  const [state, setState] = useState<XAccountState>(initial);

  const disconnect = useCallback(async () => {
    await fetch("/api/x/logout", { method: "POST" });
    setState((s) => ({ configured: s.configured, connected: false }));
  }, []);

  return { ...state, disconnect };
}

export const OAUTH_MESSAGES: Record<string, string> = {
  denied: "You cancelled the X authorisation.",
  badstate: "That login link expired. Try connecting again.",
  failed: "X wouldn't hand over your account. Try again in a sec.",
  unconfigured: "X login isn't configured on this deployment yet.",
};

/**
 * The callback bounces back to `/join?x=<status>`. The status is rendered
 * from the server-side search param; this only scrubs it from the address
 * bar so a refresh doesn't replay a stale message. Updating history is an
 * external-system write, not a state update, so it belongs in an effect.
 */
export function useScrubOAuthParam(status: string | null) {
  useEffect(() => {
    if (!status) return;

    const params = new URLSearchParams(window.location.search);
    if (!params.has("x")) return;

    params.delete("x");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }, [status]);
}
