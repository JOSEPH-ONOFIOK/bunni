"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FiArrowUpRight,
  FiCheck,
  FiChevronLeft,
  FiLoader,
  FiLock,
} from "react-icons/fi";
import {
  COMMUNITIES,
  CLAIM_CAP,
  HAS_LOGO,
  PER_COMMUNITY_ALLOCATION,
  type Community,
} from "@/lib/communities";
import { claimMessage } from "@/lib/claim-message";
import { X_ACCOUNT, followUrl } from "@/lib/quests";
import { shortAddress, signMessage } from "@/lib/wallet";
import { useClaimWallet, type ClaimWallet } from "./use-claim-wallet";

type Status = "idle" | "checking" | "claimed" | "error";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The follow attestation, as an external store.
 *
 * localStorage is an external system, so reading it through
 * `useSyncExternalStore` — rather than hydrating in an effect — keeps the
 * server render and the first client paint in agreement, and avoids the
 * cascading re-render an effect would cause.
 */
const FOLLOW_KEY = "bunii.claim.followed.v1";

const followStore = {
  listeners: new Set<() => void>(),

  subscribe(onChange: () => void) {
    followStore.listeners.add(onChange);
    // Keeps a second tab in step if the site is open twice.
    window.addEventListener("storage", onChange);
    return () => {
      followStore.listeners.delete(onChange);
      window.removeEventListener("storage", onChange);
    };
  },

  get(): boolean {
    try {
      return localStorage.getItem(FOLLOW_KEY) === "1";
    } catch {
      return false;
    }
  },

  /** Nothing is followed as far as the server knows. */
  getServer(): boolean {
    return false;
  },

  set(next: boolean) {
    try {
      if (next) localStorage.setItem(FOLLOW_KEY, "1");
      else localStorage.removeItem(FOLLOW_KEY);
    } catch {}
    for (const listener of followStore.listeners) listener();
  },
};

/**
 * The holder claim: pick your community, connect the wallet that holds it,
 * sign, and the spot is yours.
 *
 * The signature is the point. Eligibility is a fact we already hold, but a
 * typed address is only a claim about someone else's property — connecting and
 * signing is what makes it the claimant's own.
 */
export function ClaimPortal() {
  const wallet = useClaimWallet();
  const [picked, setPicked] = useState<Community | null>(null);

  /**
   * Whether they've said they follow.
   *
   * Following opens X in another tab, so this has to survive leaving the page
   * and coming back — otherwise the tick they just made is gone when they
   * return. Read through the store below rather than an effect, so the server
   * render and the first client paint agree.
   *
   * X's free tier cannot read follows, so this is an attestation, the same as
   * the follow step in the quest flow.
   */
  const followed = useSyncExternalStore(
    followStore.subscribe,
    followStore.get,
    followStore.getServer,
  );
  const markFollowed = followStore.set;
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{
    community: string;
    position: number;
    inviteCode: string;
  } | null>(null);

  const [claimed, setClaimed] = useState<number | null>(null);
  const [open, setOpen] = useState(true);

  /** Claims taken per community, or null while unknown. */
  const [byCommunity, setByCommunity] = useState<Record<
    string,
    number
  > | null>(null);

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

    // Separate request: the rings are a nice-to-have, and a slow breakdown
    // should not hold up the headline counter.
    fetch("/api/claim/breakdown")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.byCommunity) setByCommunity(d.byCommunity);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    if (!picked || status === "checking") return;

    // Guarded here as well as by the disabled button: a form can be submitted
    // with the keyboard before the button's state is read.
    if (!followed) {
      setStatus("error");
      setMessage(`Follow @${X_ACCOUNT} first.`);
      return;
    }

    setStatus("checking");
    setMessage("");

    try {
      // 1. The wallet hands back an address it controls. A pasted address
      //    would only ever be a claim about someone else's property. If one is
      //    already connected from the header, reuse it rather than prompting
      //    a second time.
      const address = wallet.address ?? (await wallet.connect());
      if (!address) {
        setStatus("error");
        setMessage(wallet.error ?? "No wallet account was shared.");
        return;
      }

      // 2. A nonce from the server, so the signature cannot be replayed.
      const nonceRes = await fetch("/api/claim/nonce", { cache: "no-store" });
      const { nonce } = await nonceRes.json();

      // 3. Sign. This moves no funds and costs no gas; it only proves the
      //    wallet agreed to this exact claim.
      const message = claimMessage({
        wallet: address,
        community: picked.name,
        nonce,
      });
      const signature = await signMessage(message, address);

      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          community: picked.id,
          wallet: address,
          nonce,
          signature,
        }),
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
    } catch (err) {
      setStatus("error");
      // A rejected signature or connection is the visitor changing their mind,
      // not a failure — say so plainly rather than showing a stack of jargon.
      const msg = err instanceof Error ? err.message : "";
      setMessage(
        /reject|denied|4001/i.test(msg)
          ? "You cancelled that in your wallet."
          : msg || "Couldn't reach your wallet. Try again in a sec.",
      );
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
        <div className="flex items-center gap-3">
          <Link
            href="/join"
            className="hidden text-[11px] font-bold text-ink/50 underline underline-offset-2 hover:text-ink sm:inline"
          >
            No NFT? Join by quests
          </Link>
          <WalletButton wallet={wallet} />
        </div>
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
          communities. First come, first served. Pick your community, connect
          the wallet that holds it, and the spot is yours.
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
              onBack={() => {
                setPicked(null);
                setStatus("idle");
                setMessage("");
              }}
              onSubmit={claim}
              status={status}
              message={message}
              open={open}
              followed={followed}
              onFollowed={markFollowed}
            />
          ) : (
            <Grid
              key="grid"
              onPick={setPicked}
              wallet={wallet}
              byCommunity={byCommunity}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * How far this community has got, as a ring.
 *
 * `strokeDasharray` on a circle is the whole trick: the circumference is
 * known, so a dash of `pct% of it` followed by a gap draws exactly that
 * fraction. Rotated so it fills from twelve o'clock rather than three.
 */
function ClaimRing({ claimed }: { claimed: number | null }) {
  // Unknown stays blank rather than drawing an empty ring, which would read as
  // "nobody has claimed" — a different and wrong claim.
  if (claimed === null) {
    return <span className="mt-1.5 block h-[18px]" aria-hidden />;
  }

  const pct = Math.min(100, (claimed / PER_COMMUNITY_ALLOCATION) * 100);
  const R = 7;
  const CIRCUMFERENCE = 2 * Math.PI * R;

  return (
    <span
      className="mt-1.5 flex items-center justify-center gap-1.5"
      title={`${claimed} of ${PER_COMMUNITY_ALLOCATION} claimed`}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
        <circle
          cx="9"
          cy="9"
          r={R}
          fill="none"
          stroke="var(--ink)"
          strokeOpacity="0.12"
          strokeWidth="3"
        />
        <circle
          cx="9"
          cy="9"
          r={R}
          fill="none"
          stroke={pct >= 100 ? "var(--lava)" : "var(--grass)"}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          transform="rotate(-90 9 9)"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>

      <span className="font-mono text-[9px] font-bold text-ink/45">
        {Math.round(pct)}%
      </span>
    </span>
  );
}

/** One community, in whichever state the connected wallet puts it. */
function CommunityCard({
  community,
  onPick,
  held,
  claimed,
}: {
  community: Community;
  onPick: (c: Community) => void;
  held?: boolean;
  claimed: number | null;
}) {
  // Only dim on a definite "no". Unknown stays fully clickable: someone whose
  // lookup failed can still try, and the claim itself is the real check.
  const dimmed = held === false;

  return (
    <button
      type="button"
      onClick={() => onPick(community)}
      aria-disabled={dimmed}
      className={`inked relative w-full rounded-2xl bg-white p-3 text-left transition-transform duration-200 hover:-translate-y-1 active:translate-y-0.5 active:shadow-[0_2px_0_0_var(--ink)] ${
        dimmed ? "opacity-45" : ""
      }`}
    >
      <Badge community={community} className="aspect-square w-full text-3xl" />

      <span className="mt-2.5 block text-center text-xs font-extrabold">
        {community.name}
      </span>

      <ClaimRing claimed={claimed} />

      {held === true && (
        <span
          aria-label="You hold this"
          className="inked-sm absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-grass"
        >
          <FiCheck className="h-3.5 w-3.5" />
        </span>
      )}

      {dimmed && (
        <span
          aria-label="Not in this collection"
          className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink bg-white"
        >
          <FiLock className="h-3 w-3 text-ink/40" />
        </span>
      )}
    </button>
  );
}

/**
 * Connect, and then show which address is connected. Connecting here is
 * optional — the claim will prompt if it has to — but doing it up front is
 * what lets the grid say which communities are actually claimable.
 */
function WalletButton({ wallet }: { wallet: ClaimWallet }) {
  if (wallet.address) {
    return (
      <button
        type="button"
        onClick={wallet.disconnect}
        title="Forget this wallet"
        className="inked-sm flex items-center gap-2 rounded-full bg-white px-3.5 py-2 font-mono text-[11px] font-bold text-ink transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_2px_0_0_var(--ink)]"
      >
        <span
          aria-hidden
          className={`h-2 w-2 rounded-full ${
            wallet.checking ? "bg-gold" : "bg-grass"
          }`}
        />
        {shortAddress(wallet.address)}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void wallet.connect()}
      className="inked-sm rounded-full bg-teal px-4 py-2 text-[11px] font-extrabold tracking-[0.12em] text-white uppercase transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_2px_0_0_var(--ink)]"
    >
      Connect wallet
    </button>
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
function Grid({
  onPick,
  wallet,
  byCommunity,
}: {
  onPick: (c: Community) => void;
  wallet: ClaimWallet;
  byCommunity: Record<string, number> | null;
}) {
  // `holds` is null when nothing is connected, or when the lookup could not be
  // made. Both mean "we don't know", and an unknown must not dim a card — a
  // real holder being told they hold nothing is the worst failure here.
  const holds = wallet.address ? wallet.holds : null;

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
          <CommunityCard
            community={c}
            onPick={onPick}
            claimed={byCommunity?.[c.slug] ?? (byCommunity ? 0 : null)}
            // Undefined while unknown, so the card stays neutral rather than
            // claiming either way.
            held={holds ? holds.includes(c.slug) : undefined}
          />
        </motion.li>
      ))}
    </motion.ul>
  );
}

/** Paste a wallet for the chosen community. */
function WalletStep({
  community,
  onBack,
  onSubmit,
  status,
  message,
  open,
  followed,
  onFollowed,
}: {
  community: Community;
  onBack: () => void;
  onSubmit: (e: React.FormEvent) => void;
  status: Status;
  message: string;
  open: boolean;
  followed: boolean;
  onFollowed: (next: boolean) => void;
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

      {/* Follow first, and say so before the wallet popup appears: people
          abandon a signature request they weren't expecting. */}
      <div
        className={`mt-6 rounded-2xl border-2 p-4 transition-colors ${
          followed ? "border-grass/70 bg-grass/10" : "border-ink/12 bg-white"
        }`}
      >
        <p className="flex items-center gap-2 text-sm font-extrabold">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink font-mono text-[10px] ${
              followed ? "bg-grass" : "bg-white text-ink/50"
            }`}
          >
            {followed ? <FiCheck className="h-3 w-3" /> : "1"}
          </span>
          Follow @{X_ACCOUNT}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href={followUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-white px-3 py-1.5 text-[11px] font-extrabold transition-transform duration-150 hover:-translate-y-0.5"
          >
            Open X
            <FiArrowUpRight className="h-3 w-3" />
          </a>

          <button
            type="button"
            onClick={() => onFollowed(!followed)}
            aria-pressed={followed}
            className={`rounded-full border-2 border-ink px-3 py-1.5 text-[11px] font-extrabold transition-transform duration-150 hover:-translate-y-0.5 ${
              followed ? "bg-grass text-ink" : "bg-gold text-ink"
            }`}
          >
            {followed ? "Following" : "I followed"}
          </button>
        </div>
      </div>

      <ol className="mt-3 space-y-1.5 rounded-2xl border-2 border-dashed border-ink/15 bg-paper px-4 py-3">
        <li className="flex gap-2 text-xs text-ink/70">
          <span className="font-mono text-ink/40">2.</span>
          Connect the wallet holding your {community.name}
        </li>
        <li className="flex gap-2 text-xs text-ink/70">
          <span className="font-mono text-ink/40">3.</span>
          Sign a message to prove it&rsquo;s yours
        </li>
      </ol>

      <button
        type="submit"
        disabled={!open || !followed || status === "checking"}
        className="inked mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-gold px-6 py-4 text-xs font-extrabold tracking-[0.16em] text-ink uppercase transition-transform duration-200 enabled:hover:-translate-y-0.5 enabled:active:translate-y-1 enabled:active:shadow-[0_2px_0_0_var(--ink)] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {!open ? (
          "Every spot is claimed"
        ) : !followed ? (
          <>
            <FiLock className="h-3.5 w-3.5" />
            Follow to unlock
          </>
        ) : status === "checking" ? (
          <>
            <FiLoader className="h-3.5 w-3.5 animate-spin" />
            Check your wallet…
          </>
        ) : (
          "Connect wallet & claim"
        )}
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
        Holders only. Signing is free — it moves no funds and costs no gas.
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
