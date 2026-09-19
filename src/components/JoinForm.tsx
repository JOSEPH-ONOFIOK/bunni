"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiCheck, FiLock } from "react-icons/fi";
import { FaXTwitter } from "react-icons/fa6";
import {
  OAUTH_MESSAGES,
  useScrubOAuthParam,
  useXAccount,
  type XAccountState,
} from "./use-x-account";
import { Quests, type QuoteCheck } from "./Quests";
import { clearQuestState, useQuestState } from "@/lib/quest-store";
import { allQuestsDone } from "@/lib/quests";
import { DROP, DROP_PITCH } from "@/lib/bunnies";
import { useCountdown, pad } from "./use-countdown";

type Status = "idle" | "submitting" | "success" | "error";

const EASE = [0.16, 1, 0.3, 1] as const;

export function JoinForm({
  account,
  oauthStatus,
}: {
  account: XAccountState;
  oauthStatus: string | null;
}) {
  const x = useXAccount(account);
  const [quests, setQuests] = useQuestState();
  useScrubOAuthParam(oauthStatus);

  // The pitch is the first thing on the page; the steps only appear once the
  // visitor has pressed Enter. Keeping it in state rather than on a separate
  // route means pressing Enter costs no navigation and loses no quest progress.
  const [entered, setEntered] = useState(false);

  // The quote gate's verdict, owned here because it also blocks submit.
  const [quoteCheck, setQuoteCheck] = useState<QuoteCheck>({ state: "idle" });

  const [wallet, setWallet] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{
    position: number | null;
    inviteCode: string;
    handle: string;
  } | null>(null);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/allowlist")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && typeof d.count === "number") setCount(d.count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const needsConnect = x.configured && !x.connected;
  // Shape check and the live verdict both have to pass: the first keeps the
  // button honest as you type, the second is the part X actually confirmed.
  const questsReady =
    allQuestsDone(quests, x.username) && quoteCheck.state === "ok";
  const canSubmit = !needsConnect && questsReady && status !== "submitting";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setStatus("submitting");
    setMessage("");

    try {
      const res = await fetch("/api/allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, quests, handle: x.username }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong.");
        return;
      }

      setStatus("success");
      setResult({
        position: data.position ?? null,
        inviteCode: data.inviteCode,
        handle: data.handle,
      });
      // The run is over; clearing keeps a second visit from looking half-done.
      clearQuestState();
      setQuoteCheck({ state: "idle" });
    } catch {
      setStatus("error");
      setMessage("Couldn't reach the server. Try again in a sec.");
    }
  }

  if (status === "success" && result) {
    return (
      <motion.div
        className="inked rounded-3xl bg-white p-8 text-center"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <span className="inked-sm mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-grass">
          <FiCheck className="h-6 w-6" />
        </span>

        <h2 className="wordmark mt-5 text-4xl">You&rsquo;re in</h2>

        <p className="mt-3 text-sm leading-relaxed text-ink/70">
          {result.handle} is on the list
          {result.position ? ` at #${result.position}` : ""}. Keep this code
          somewhere safe.
        </p>

        <p className="mt-5 rounded-2xl border-2 border-dashed border-ink/20 bg-paper px-4 py-3 font-mono text-lg font-bold tracking-widest">
          {result.inviteCode}
        </p>
      </motion.div>
    );
  }

  // The pitch, and the door into the steps.
  if (!entered) {
    return (
      <motion.div
        className="inked rounded-[2rem] bg-white p-8 text-center sm:p-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <p className="eyebrow text-ink/45">End of the trail</p>

        <h2 className="wordmark mt-2 text-[clamp(2rem,7.5vw,3.4rem)] leading-[0.95]">
          {DROP_PITCH.title}
        </h2>

        <p className="wordmark mt-2 text-[clamp(1.1rem,4vw,1.6rem)] text-lava">
          {DROP_PITCH.line}
        </p>

        <ClosingBanner />

        <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed font-semibold text-ink/75">
          The supply is still being decided, so the list is the only way to be
          sure of a spot.
        </p>

        <dl className="mt-6 flex justify-center gap-2">
          {[
            ["Mint", DROP.price],
            ["Supply", DROP.supply],
            ["Date", DROP.date],
          ].map(([k, v]) => (
            <div
              key={k}
              className="rounded-2xl border-2 border-ink/12 bg-paper px-4 py-2.5"
            >
              <dt className="font-mono text-[9px] tracking-[0.18em] text-ink/40 uppercase">
                {k}
              </dt>
              <dd className="wordmark mt-0.5 text-lg">{v}</dd>
            </div>
          ))}
        </dl>

        <button
          type="button"
          onClick={() => setEntered(true)}
          className="inked mt-7 rounded-full bg-gold px-10 py-4 text-xs font-extrabold tracking-[0.18em] text-ink uppercase transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_2px_0_0_var(--ink)]"
        >
          Enter
        </button>

        <p className="mt-3 font-mono text-[10px] tracking-wider text-ink/35 uppercase">
          Four steps · then your wallet
          {count !== null ? ` · ${count} already in` : ""}
        </p>
      </motion.div>
    );
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      className="inked rounded-3xl bg-white p-6 sm:p-8"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <header className="text-center">
        <p className="eyebrow text-ink/45">Free mint</p>
        <h2 className="wordmark mt-2 text-4xl sm:text-5xl">The steps</h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink/65">
          Clear all four, then drop your wallet in at the bottom.
        </p>
        <ClosingBanner compact />
        {count !== null && (
          <p className="mt-2 font-mono text-[10px] tracking-wider text-ink/40 uppercase">
            {count} already in
          </p>
        )}
      </header>

      {/* Step zero: prove who you are. */}
      <div className="mt-7">
        {!x.configured ? (
          <p className="rounded-2xl border-2 border-dashed border-ink/15 bg-paper px-4 py-3 text-xs leading-relaxed text-ink/60">
            X login isn&rsquo;t configured on this deployment, so the handle you
            type is taken at face value.
          </p>
        ) : x.connected ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-grass/70 bg-grass/10 px-4 py-3">
            <span className="flex min-w-0 items-center gap-2">
              <FaXTwitter className="h-4 w-4 shrink-0" />
              <span className="truncate text-sm font-extrabold">
                @{x.username}
              </span>
            </span>
            <button
              type="button"
              onClick={x.disconnect}
              className="shrink-0 text-[11px] font-bold text-ink/45 underline underline-offset-2 hover:text-ink"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <a
            href="/api/x/login"
            className="inked-sm flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3.5 text-xs font-extrabold tracking-[0.14em] text-white uppercase transition-transform duration-200 hover:-translate-y-0.5"
          >
            <FaXTwitter className="h-4 w-4" />
            Connect X
          </a>
        )}

        {oauthStatus && OAUTH_MESSAGES[oauthStatus] && (
          <p className="mt-2.5 text-xs font-semibold text-lava">
            {OAUTH_MESSAGES[oauthStatus]}
          </p>
        )}
      </div>

      {/* The quests unlock once there is an account to attribute them to. */}
      <div
        className={`mt-6 transition-opacity ${
          needsConnect ? "pointer-events-none opacity-40" : ""
        }`}
        aria-hidden={needsConnect}
      >
        <Quests
          state={quests}
          onChange={setQuests}
          username={x.username}
          check={quoteCheck}
          onCheckChange={setQuoteCheck}
        />
      </div>

      <div className="mt-6">
        <label
          htmlFor="wallet"
          className="font-mono text-[10px] tracking-[0.2em] text-ink/45 uppercase"
        >
          Wallet address
        </label>
        <input
          id="wallet"
          name="wallet"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="0x…"
          autoComplete="off"
          spellCheck={false}
          className="mt-1.5 w-full rounded-2xl border-2 border-ink/15 bg-white px-4 py-3 font-mono text-sm outline-none placeholder:text-ink/25 focus:border-ink"
        />
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="inked mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-gold px-6 py-4 text-xs font-extrabold tracking-[0.16em] text-ink uppercase transition-transform duration-200 enabled:hover:-translate-y-0.5 enabled:active:translate-y-1 enabled:active:shadow-[0_2px_0_0_var(--ink)] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {!canSubmit && <FiLock className="h-3.5 w-3.5" />}
        {status === "submitting" ? "Sending…" : "Join the list"}
      </button>

      <AnimatePresence>
        {status === "error" && message && (
          <motion.p
            className="mt-3 text-center text-xs font-semibold text-lava"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {message}
          </motion.p>
        )}
      </AnimatePresence>

      {needsConnect && (
        <p className="mt-3 text-center text-[11px] text-ink/45">
          Connect X to unlock the steps.
        </p>
      )}
    </motion.form>
  );
}

/**
 * The closing clock. Loud on the pitch, quiet above the steps — the deadline
 * still has to be visible while someone is working through them, but it should
 * not compete with the form.
 */
function ClosingBanner({ compact = false }: { compact?: boolean }) {
  const { left, closed } = useCountdown(DROP.closesAt);

  const label = closed
    ? "The allowlist has closed"
    : left
      ? `Allowlist closes in ${left.hours} hours ${left.minutes} minutes`
      : "Allowlist closing soon";

  const text = closed
    ? "Allowlist closed"
    : left
      ? `Closes in ${pad(left.hours)}:${pad(left.minutes)}:${pad(left.seconds)}`
      : "Closes soon";

  if (compact) {
    return (
      <p
        className="mt-3 font-mono text-[10px] tracking-[0.14em] text-ink/45 uppercase"
        aria-label={label}
      >
        <span aria-hidden>{text}</span>
      </p>
    );
  }

  return (
    <p
      className={`mt-5 inline-flex items-center gap-2 rounded-full border-2 px-4 py-2 font-mono text-[11px] font-bold tracking-[0.14em] uppercase ${
        closed
          ? "border-ink/15 bg-paper text-ink/45"
          : "border-ink bg-lava text-white"
      }`}
      aria-label={label}
    >
      {!closed && (
        <span
          aria-hidden
          className="h-2 w-2 rounded-full bg-white"
          style={{ animation: "pulse-gold 2.4s ease-out infinite" }}
        />
      )}
      <span aria-hidden>{text}</span>
    </p>
  );
}
