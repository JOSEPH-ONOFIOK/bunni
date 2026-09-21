"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiCheck, FiChevronLeft } from "react-icons/fi";
import {
  COMMUNITIES,
  CLAIM_CAP,
  HAS_LOGO,
  type Community,
} from "@/lib/communities";

type Status = "idle" | "checking" | "claimed" | "error";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The holder claim: pick your community, paste your wallet, and if the
 * snapshot has you, the spot is yours. No login — eligibility is a fact we
 * already hold, so there is nothing for a visitor to prove interactively.
 */
export function ClaimPortal() {
  const [picked, setPicked] = useState<Community | null>(null);
  const [wallet, setWallet] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{
    community: string;
    position: number;
    inviteCode: string;
  } | null>(null);

  const [claimed, setClaimed] = useState<number | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/claim")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (typeof d.claimed === "number") setClaimed(d.claimed);
        if (typeof d.open === "boolean") setOpen(d.open);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    if (!picked || status === "checking") return;

    setStatus("checking");
    setMessage("");

    try {
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ community: picked.id, wallet }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        // A wallet on another community's list is the common mistake, so name
        // the ones it *is* on rather than a flat refusal.
        const elsewhere: string[] = Array.isArray(data.eligibleFor)
          ? data.eligibleFor
          : [];
        const names = elsewhere
          .map((slug) => COMMUNITIES.find((c) => c.slug === slug)?.name)
          .filter(Boolean);
        setMessage(
          names.length > 0
            ? `${data.error} It is on: ${names.join(", ")}.`
            : (data.error ?? "Something went wrong."),
        );
        return;
      }

      setStatus("claimed");
      setResult({
        community: data.community,
        position: data.position,
        inviteCode: data.inviteCode,
      });
      setClaimed((c) => (c === null ? c : c + 1));
    } catch {
      setStatus("error");
      setMessage("Couldn't reach the server. Try again in a sec.");
    }
  }

  const pct =
    claimed === null ? 0 : Math.min(100, (claimed / CLAIM_CAP) * 100);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <nav className="mb-7 flex items-center justify-between">
        <Link href="/" className="wordmark text-2xl">
          BUNII
        </Link>
        <Link
          href="/join"
          className="text-[11px] font-bold text-ink/50 underline underline-offset-2 hover:text-ink"
        >
          No NFT? Join by quests
        </Link>
      </nav>

      <header className="text-center">
        <span
          className={`eyebrow inline-flex items-center gap-2 rounded-full border-2 border-ink px-3.5 py-1.5 text-[9px] ${
            open ? "bg-grass text-ink" : "bg-paper text-ink/50"
          }`}
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-ink"
            style={
              open ? { animation: "pulse-gold 2.4s ease-out infinite" } : undefined
            }
          />
          {open ? "Claim open" : "Claim closed"}
        </span>

        <h1 className="wordmark mt-4 text-[clamp(2.4rem,9vw,4.5rem)] leading-[0.92]">
          Claim your spot
        </h1>

        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed font-semibold text-ink/75">
          {CLAIM_CAP.toLocaleString()} spots across {COMMUNITIES.length} Furnace
          communities. First come, first served, no login. Pick your community,
          paste your wallet, and if you&rsquo;re on the list it&rsquo;s yours.
        </p>

        {/* The cap made concrete: a bar fills as spots go. */}
        <div className="mx-auto mt-6 max-w-md">
          <div className="inked-sm relative h-9 overflow-hidden rounded-full bg-white">
            <motion.div
              className="absolute inset-y-0 left-0 bg-gold"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: EASE }}
            />
            <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-bold tracking-[0.14em] text-ink uppercase">
              {claimed === null
                ? "Loading…"
                : `${claimed.toLocaleString()} / ${CLAIM_CAP.toLocaleString()} claimed`}
            </span>
          </div>
        </div>
      </header>

      <div className="mt-10">
        <AnimatePresence mode="wait">
          {status === "claimed" && result ? (
            <Claimed key="done" result={result} />
          ) : picked ? (
            <WalletStep
              key="wallet"
              community={picked}
              wallet={wallet}
              onWallet={setWallet}
              onBack={() => {
                setPicked(null);
                setStatus("idle");
                setMessage("");
              }}
              onSubmit={claim}
              status={status}
              message={message}
              open={open}
            />
          ) : (
            <Grid key="grid" onPick={setPicked} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * A community's tile. Art is not in the repo yet, so this draws a monogram on
 * a colour derived from the name — stable per community, and a drop-in for the
 * real logo later.
 */
function Badge({
  community,
  className = "",
}: {
  community: Community;
  className?: string;
}) {
  // A hash rather than a random pick, so a community keeps its colour between
  // renders and across deploys.
  let hash = 0;
  for (const ch of community.id) hash = (hash * 31 + ch.charCodeAt(0)) % 360;

  const initials = community.name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  if (HAS_LOGO.has(community.slug)) {
    return (
      <span
        className={`block overflow-hidden rounded-xl border-2 border-ink bg-paper ${className}`}
      >
        <Image
          src={`/communities/${community.slug}.png`}
          alt=""
          width={400}
          height={400}
          className="h-full w-full object-cover"
          sizes="(max-width: 640px) 45vw, 200px"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={`flex items-center justify-center overflow-hidden rounded-xl border-2 border-ink ${className}`}
      style={{ background: `hsl(${hash} 70% 78%)` }}
    >
      <span className="wordmark text-ink">{initials}</span>
    </span>
  );
}

/** The community cards. */
function Grid({ onPick }: { onPick: (c: Community) => void }) {
  return (
    <motion.ul
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      {COMMUNITIES.map((c, i) => (
        <motion.li
          key={c.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: Math.min(i * 0.03, 0.3) }}
        >
          <button
            type="button"
            onClick={() => onPick(c)}
            className="inked group w-full rounded-2xl bg-white p-3 text-left transition-transform duration-200 hover:-translate-y-1 active:translate-y-0.5 active:shadow-[0_2px_0_0_var(--ink)]"
          >
            <Badge community={c} className="aspect-square w-full text-3xl" />
            <span className="mt-2.5 block text-center text-xs font-extrabold">
              {c.name}
            </span>
          </button>
        </motion.li>
      ))}
    </motion.ul>
  );
}

/** Paste a wallet for the chosen community. */
function WalletStep({
  community,
  wallet,
  onWallet,
  onBack,
  onSubmit,
  status,
  message,
  open,
}: {
  community: Community;
  wallet: string;
  onWallet: (v: string) => void;
  onBack: () => void;
  onSubmit: (e: React.FormEvent) => void;
  status: Status;
  message: string;
  open: boolean;
}) {
  return (
    <motion.form
      onSubmit={onSubmit}
      className="inked mx-auto max-w-md rounded-3xl bg-white p-6 sm:p-8"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-[11px] font-bold text-ink/50 hover:text-ink"
      >
        <FiChevronLeft className="h-3.5 w-3.5" />
        All communities
      </button>

      <div className="mt-4 flex items-center gap-3">
        <Badge community={community} className="h-14 w-14 shrink-0 text-xl" />
        <span>
          <span className="eyebrow block text-[9px] text-ink/45">
            Claiming as
          </span>
          <span className="wordmark block text-2xl">{community.name}</span>
        </span>
      </div>

      <label
        htmlFor="claim-wallet"
        className="mt-6 block font-mono text-[10px] tracking-[0.2em] text-ink/45 uppercase"
      >
        Your wallet
      </label>
      <input
        id="claim-wallet"
        value={wallet}
        onChange={(e) => onWallet(e.target.value)}
        placeholder="0x…"
        autoComplete="off"
        spellCheck={false}
        className="mt-1.5 w-full rounded-2xl border-2 border-ink/15 bg-white px-4 py-3 font-mono text-sm outline-none placeholder:text-ink/25 focus:border-ink"
      />

      <button
        type="submit"
        disabled={!open || status === "checking"}
        className="inked mt-5 w-full rounded-full bg-gold px-6 py-4 text-xs font-extrabold tracking-[0.16em] text-ink uppercase transition-transform duration-200 enabled:hover:-translate-y-0.5 enabled:active:translate-y-1 enabled:active:shadow-[0_2px_0_0_var(--ink)] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {!open
          ? "Every spot is claimed"
          : status === "checking"
            ? "Checking…"
            : "Claim my spot"}
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

      <p className="mt-3 text-center text-[11px] text-ink/45">
        Holders only. Nothing is signed and no wallet is connected.
      </p>
    </motion.form>
  );
}

/** The spot is yours. */
function Claimed({
  result,
}: {
  result: { community: string; position: number; inviteCode: string };
}) {
  return (
    <motion.div
      className="inked mx-auto max-w-md rounded-3xl bg-white p-8 text-center"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <span className="inked-sm mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-grass">
        <FiCheck className="h-6 w-6" />
      </span>

      <h2 className="wordmark mt-5 text-4xl">Spot claimed</h2>

      <p className="mt-3 text-sm leading-relaxed text-ink/70">
        You&rsquo;re in as {result.community}, at #{result.position}. Keep this
        code somewhere safe.
      </p>

      <p className="mt-5 rounded-2xl border-2 border-dashed border-ink/20 bg-paper px-4 py-3 font-mono text-lg font-bold tracking-widest">
        {result.inviteCode}
      </p>
    </motion.div>
  );
}
