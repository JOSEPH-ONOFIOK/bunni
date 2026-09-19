"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { REALMS, DROP, bunnyFor, type Realm } from "@/lib/bunnies";
import { Sky } from "./Sky";

/**
 * You travel sideways through the world: one full-viewport panel per realm,
 * laid out in a native horizontal scroller with scroll snapping.
 *
 * Native scroll rather than a hijacked wheel handler, because it gets touch
 * flings, trackpad gestures, keyboard paging and the scrollbar for free — and
 * a transform-based pager would have to reimplement all four badly.
 *
 * Everything parallaxed reads from one `progress` value in realm units, so the
 * sky, the ground and the panels all move as parts of the same world.
 */
/** The realms plus the join stop; the index of the final stop. */
const STOPS_LAST = REALMS.length;

export function Journey() {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  // Journey position in realm units, read straight off the page's own vertical
  // scroll. Springing it means a flung scroll settles the scenery smoothly
  // instead of tracking every jittery scroll sample.
  const raw = useMotionValue(0);
  const progress = useSpring(raw, { stiffness: 90, damping: 22, mass: 0.5 });

  useEffect(() => {
    function onScroll() {
      const el = track.current;
      if (!el) return;

      // The track is one viewport tall per stop, so how far the page has
      // scrolled through it *is* the position in the journey. Scrolling the
      // page is the only navigation: no swiping, no wheel to intercept.
      const span = el.offsetHeight - window.innerHeight;
      const travelled = window.scrollY - el.offsetTop;
      const p = span > 0 ? (travelled / span) * STOPS_LAST : 0;
      const clamped = Math.min(Math.max(p, 0), STOPS_LAST);

      raw.set(clamped);
      setIndex(Math.round(clamped));
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [raw]);

  /** Scrolls the page to a stop; the scroll handler does the rest. */
  const goTo = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const target = Math.min(Math.max(i, 0), STOPS_LAST);
    const span = el.offsetHeight - window.innerHeight;
    window.scrollTo({
      top: el.offsetTop + (span * target) / STOPS_LAST,
      behavior: "smooth",
    });
  }, []);

  return (
    <div
      ref={track}
      className="relative"
      // One viewport of scrolling per stop, plus one for the first stop to
      // rest on. This height is the only thing that makes the page scrollable,
      // and it is what the handler above measures against.
      style={{ height: `${(STOPS_LAST + 1) * 100}svh` }}
    >
      {/* Everything the traveller sees is pinned to the viewport; the scroll
          moves the world, not the page content. */}
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <Sky progress={progress} />
        <Ground progress={progress} />

        <div className="relative z-10 h-full" aria-label="The world">
          {REALMS.map((r, i) => (
            <Panel key={r.id} realm={r} index={i} progress={progress} />
          ))}

          {/* The end of the road: where the journey turns into a signup. */}
          <JoinPanel index={REALMS.length} progress={progress} />
        </div>

        <Chrome index={index} onPick={goTo} />
      </div>
    </div>
  );
}

/** One realm: a full-viewport stop on the journey. */
function Panel({
  realm,
  index,
  progress,
}: {
  realm: Realm;
  index: number;
  progress: ReturnType<typeof useSpring>;
}) {
  const bunny = bunnyFor(realm);

  // Distance from this panel, in panels. 0 when centred.
  const away = useTransform(progress, (p) => p - index);

  // The copy drifts slower than the scroll and fades at the edges, so the
  // panel feels layered rather than like a slab sliding past.
  const copyX = useTransform(away, (d) => d * 90);
  const copyOpacity = useTransform(away, [-0.85, 0, 0.85], [0, 1, 0], {
    clamp: true,
  });
  const artX = useTransform(away, (d) => d * -40);
  const artScale = useTransform(away, [-1, 0, 1], [0.88, 1, 0.88], {
    clamp: true,
  });

  // Only the stop nearest the camera takes clicks; the rest are scenery.
  const [isHere, setIsHere] = useState(index === 0);
  useEffect(
    () => away.on("change", (d) => setIsHere(Math.abs(d) < 0.5)),
    [away],
  );
  const interactive = isHere ? "auto" : ("none" as const);

  return (
    <motion.section
      // Stacked, not laid out in a row: only the stop being scrolled through
      // is visible, and `pointerEvents` keeps the faded ones from swallowing
      // clicks meant for the panel on top.
      className="absolute inset-0 flex items-center justify-center px-6 pt-20 pb-28 sm:px-10 lg:pb-24"
      style={{ opacity: copyOpacity, pointerEvents: interactive }}
      aria-label={realm.name}
      aria-hidden={!isHere}
    >
      <div className="flex w-full max-w-4xl min-w-0 flex-col items-center gap-6 lg:flex-row lg:gap-14">
        <motion.div
          className="shrink-0"
          style={{ x: artX, scale: artScale }}
        >
          <Portrait bunny={bunny} tint={realm.color} />
        </motion.div>

        <motion.div
          className="w-full min-w-0 text-center lg:text-left"
          style={{ x: copyX }}
        >
          <p className="eyebrow text-ink/50">{realm.tagline}</p>

          <h2 className="wordmark mt-2 text-[clamp(2.2rem,9vw,4.5rem)] leading-[0.9]">
            {realm.name}
          </h2>

          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed font-semibold text-ink/75 lg:mx-0">
            {realm.copy}
          </p>

          <div className="mt-5 inline-flex items-center gap-2.5 rounded-full border-2 border-ink/12 bg-white/70 px-4 py-2 backdrop-blur-sm">
            <span
              className="h-5 w-5 rounded-full border-2 border-ink"
              style={{ background: realm.color }}
            />
            <span className="text-sm font-bold">{bunny.name}</span>
            <span className="font-mono text-[10px] tracking-wider text-ink/45 uppercase">
              {bunny.rarity}
            </span>
          </div>

          <dl className="mt-4 flex flex-wrap justify-center gap-2 lg:justify-start">
            {bunny.traits.map(([k, v]) => (
              <div
                key={k}
                className="rounded-full border-2 border-ink/12 bg-white/60 px-3 py-1.5 backdrop-blur-sm"
              >
                <dt className="inline font-mono text-[9px] tracking-[0.15em] text-ink/40 uppercase">
                  {k}
                </dt>
                <dd className="ml-1.5 inline text-xs font-bold text-ink/80">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </motion.div>
      </div>
    </motion.section>
  );
}

/**
 * The last stop. Same parallax treatment as a realm panel so it reads as part
 * of the world rather than a page bolted onto the end of it.
 */
function JoinPanel({
  index,
  progress,
}: {
  index: number;
  progress: ReturnType<typeof useSpring>;
}) {
  const away = useTransform(progress, (p) => p - index);
  const copyX = useTransform(away, (d) => d * 90);
  const opacity = useTransform(away, [-0.85, 0, 0.85], [0, 1, 0], {
    clamp: true,
  });

  // The join panel holds a real link, so it must only be clickable once the
  // traveller has actually arrived at it.
  const [isHere, setIsHere] = useState(false);
  useEffect(
    () => away.on("change", (d) => setIsHere(Math.abs(d) < 0.5)),
    [away],
  );

  return (
    <motion.section
      className="absolute inset-0 flex items-center justify-center px-6 pt-20 pb-28 sm:px-10 lg:pb-24"
      style={{ opacity, pointerEvents: isHere ? "auto" : "none" }}
      aria-label="Join the list"
      aria-hidden={!isHere}
    >
      <motion.div className="w-full max-w-md text-center" style={{ x: copyX }}>
        <div className="inked rounded-[2rem] bg-white/90 p-8 backdrop-blur-sm sm:p-10">
          <p className="eyebrow text-ink/45">End of the trail</p>

          <h2 className="wordmark mt-2 text-[clamp(2.2rem,8vw,3.6rem)] leading-[0.95]">
            Come with us
          </h2>

          <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed font-semibold text-ink/75">
            The mint is free and the supply is still being decided. The list is
            the only way to be sure of a spot.
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

          <Link
            href="/join"
            className="inked mt-7 inline-block rounded-full bg-gold px-10 py-4 text-xs font-extrabold tracking-[0.18em] text-ink uppercase transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_2px_0_0_var(--ink)]"
          >
            Join the list
          </Link>

          <p className="mt-3 font-mono text-[10px] tracking-wider text-ink/35 uppercase">
            Four steps · no wallet needed yet
          </p>
        </div>
      </motion.div>
    </motion.section>
  );
}

/** The framed PFP, bobbing on the spot. */
function Portrait({
  bunny,
  tint,
}: {
  bunny: ReturnType<typeof bunnyFor>;
  tint: string;
}) {
  return (
    <div
      className="bob relative"
      style={{ "--bob-dur": "7s" } as React.CSSProperties}
    >
      <div
        aria-hidden
        className="absolute inset-x-6 -bottom-5 h-5 rounded-[50%] blur-md"
        style={{ background: "rgba(22,33,46,0.22)" }}
      />

      <div
        className="relative w-40 overflow-hidden rounded-[2rem] border-[3px] border-ink bg-white sm:w-52 lg:w-64 xl:w-72"
        style={{ boxShadow: `0 22px 44px -20px ${tint}, 0 8px 0 0 var(--ink)` }}
      >
        <Image
          src={bunny.src}
          alt={`${bunny.name}, Bunii #${bunny.no}`}
          width={640}
          height={640}
          className="h-full w-full object-cover"
          sizes="(max-width: 640px) 45vw, 288px"
          priority
          draggable={false}
        />
        <span
          className="eyebrow absolute top-3 left-3 rounded-full border-2 border-ink px-2.5 py-1 text-[9px] text-ink"
          style={{ background: tint }}
        >
          #{bunny.no}
        </span>
      </div>
    </div>
  );
}

/**
 * The rolling ground the panels travel over: a wide SVG ridge that slides
 * faster than the sky, tying the journey together.
 */
function Ground({ progress }: { progress: ReturnType<typeof useSpring> }) {
  const x = useTransform(progress, [0, REALMS.length], ["0%", "-38%"]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[38svh]"
      style={{ x }}
    >
      <svg
        className="h-full w-[220%]"
        viewBox="0 0 2400 300"
        preserveAspectRatio="none"
      >
        <path
          d="M0 300 L0 180 Q 180 96 380 150 Q 560 60 760 140 Q 980 200 1180 130 Q 1380 60 1600 150 Q 1820 220 2040 140 Q 2220 82 2400 160 L2400 300 Z"
          fill="rgba(255,255,255,0.4)"
        />
        <path
          d="M0 300 L0 226 Q 200 160 420 205 Q 640 250 860 196 Q 1080 140 1300 200 Q 1520 254 1740 198 Q 1960 146 2180 204 Q 2300 232 2400 210 L2400 300 Z"
          fill="rgba(255,255,255,0.55)"
        />
      </svg>
    </motion.div>
  );
}

/** Wordmark, mint pill, and the realm pager along the bottom. */
function Chrome({
  index,
  onPick,
}: {
  index: number;
  onPick: (i: number) => void;
}) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-5 py-4 sm:px-8 sm:py-6">
        <div className="pointer-events-auto">
          <p className="wordmark text-2xl sm:text-3xl">BUNII</p>
          <p className="eyebrow mt-1 hidden text-[9px] text-ink/50 sm:block">
            A small world, wide open
          </p>
        </div>

        <a
          href="/join"
          className="inked-sm pointer-events-auto shrink-0 rounded-full bg-gold px-4 py-2.5 text-[10px] font-extrabold tracking-[0.14em] text-ink uppercase transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_2px_0_0_var(--ink)] sm:px-5 sm:text-[11px]"
        >
          Free mint
          <span className="hidden sm:inline"> · {DROP.supply} supply</span>
        </a>
      </div>

      {/* The pager doubles as the map: where you are, and how far is left. */}
      <nav
        className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-5 sm:pb-7"
        aria-label="Realms"
      >
        <div className="no-scrollbar flex max-w-full gap-1.5 overflow-x-auto rounded-full border-2 border-ink bg-white/80 p-1.5 backdrop-blur-md">
          {REALMS.map((r, i) => {
            const on = i === index;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onPick(i)}
                aria-current={on ? "true" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-extrabold whitespace-nowrap transition-colors ${
                  on ? "bg-ink text-white" : "text-ink/60 hover:bg-ink/6"
                }`}
              >
                <span
                  className="h-3.5 w-3.5 rounded-full border-2 border-ink"
                  style={{ background: r.color }}
                />
                <span className={on ? "" : "hidden sm:inline"}>{r.name}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => onPick(REALMS.length)}
            aria-current={index === REALMS.length ? "true" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-extrabold whitespace-nowrap transition-colors ${
              index === REALMS.length
                ? "bg-gold text-ink"
                : "text-ink/60 hover:bg-ink/6"
            }`}
          >
            <span className="h-3.5 w-3.5 rounded-full border-2 border-ink bg-gold" />
            <span className={index === REALMS.length ? "" : "hidden sm:inline"}>
              Join
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
