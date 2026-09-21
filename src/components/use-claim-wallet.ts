"use client";

import { useCallback, useEffect, useState } from "react";
import {
  connect as connectWallet,
  getProvider,
  readAccounts,
} from "@/lib/wallet";

/**
 * The connected wallet, and what it holds.
 *
 * Connecting once at the top of the page means the community grid can show
 * which cards are actually claimable, rather than making someone guess and
 * find out by failing. The address is remembered so a reload — or the trip
 * through a wallet popup — doesn't drop the session.
 *
 * Only the address is stored, and only in this browser. It is public
 * information the moment it signs anything, and nothing here grants a claim:
 * the claim still demands a fresh signature.
 */

const KEY = "bunii.claim.wallet.v1";

export type ClaimWallet = {
  address: string | null;
  /** Communities the wallet holds; null while unknown or unreachable. */
  holds: string[] | null;
  checking: boolean;
  error: string | null;
  connect: () => Promise<string | null>;
  disconnect: () => void;
};

export function useClaimWallet(): ClaimWallet {
  const [address, setAddress] = useState<string | null>(null);
  const [holds, setHolds] = useState<string[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore a previous session, but only if the wallet still agrees: a stored
  // address the wallet has since disconnected would show a connected state
  // that cannot sign.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(KEY);
      } catch {}
      if (!saved || !getProvider()) return;

      const accounts = await readAccounts();
      if (cancelled) return;

      const match = accounts.find(
        (a) => a.toLowerCase() === saved.toLowerCase(),
      );
      if (match) setAddress(match);
      else {
        try {
          localStorage.removeItem(KEY);
        } catch {}
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Follow the wallet's own account switching, so the grid never describes an
  // address the visitor has already moved on from.
  useEffect(() => {
    const provider = getProvider();
    if (!provider) return;

    const onAccountsChanged = (...args: never[]) => {
      const accounts = (args[0] ?? []) as unknown as string[];
      const next = accounts[0] ?? null;
      setAddress(next);
      setHolds(null);
      try {
        if (next) localStorage.setItem(KEY, next);
        else localStorage.removeItem(KEY);
      } catch {}
    };

    provider.on("accountsChanged", onAccountsChanged);
    return () => provider.removeListener("accountsChanged", onAccountsChanged);
  }, []);

  /**
   * Look up what the connected wallet holds.
   *
   * The whole body is the async call, with every setState inside a callback:
   * setting state synchronously in an effect cascades a second render before
   * the first has painted, which is what `react-hooks/set-state-in-effect`
   * objects to. Nothing needs clearing on the way out either — every path that
   * drops the address clears `holds` with it.
   */
  useEffect(() => {
    if (!address) return;

    let cancelled = false;
    const done = (next: string[] | null) => {
      if (cancelled) return;
      setHolds(next);
      setChecking(false);
    };

    Promise.resolve()
      .then(() => {
        if (!cancelled) setChecking(true);
        return fetch(`/api/claim/eligibility?wallet=${address}`, {
          cache: "no-store",
        });
      })
      .then((r) => r.json())
      .then((d) => done(Array.isArray(d.communities) ? d.communities : null))
      // Unknown rather than empty: the grid then lets everything be tried,
      // which is better than telling a real holder they hold nothing.
      .catch(() => done(null));

    return () => {
      cancelled = true;
    };
  }, [address]);

  const connect = useCallback(async () => {
    setError(null);
    try {
      const [account] = await connectWallet();
      if (!account) {
        setError("No wallet account was shared.");
        return null;
      }
      setAddress(account);
      try {
        localStorage.setItem(KEY, account);
      } catch {}
      return account;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reach your wallet.");
      return null;
    }
  }, []);

  const disconnect = useCallback(() => {
    // A dapp cannot revoke its own permission; this only forgets the address
    // here, which is what "disconnect" means on every site that offers it.
    setAddress(null);
    setHolds(null);
    setError(null);
    try {
      localStorage.removeItem(KEY);
    } catch {}
  }, []);

  return { address, holds, checking, error, connect, disconnect };
}
