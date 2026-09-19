"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";
import { REALMS } from "@/lib/bunnies";

/**
 * A single sky that spans the whole journey. Rather than cross-fading one
 * gradient per realm, every realm's sky is stacked here and its opacity is
 * driven by how close the traveller is to it — so moving between two realms
 * blends their skies instead of cutting between them.
 *
 * `progress` is the journey position in realm units: 0 is the first realm,
 * 1 the second, and fractions are the ground in between.
 */
export function Sky({ progress }: { progress: MotionValue<number> }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* The first realm's sky sits underneath as a base coat, so there is
          never a gap to see through while the layers above it fade. */}
      <div
        className="absolute inset-0"
        style={{ background: gradient(REALMS[0].sky) }}
      />

      {REALMS.slice(1).map((r, i) => (
        <SkyLayer
          key={r.id}
          stops={r.sky}
          index={i + 1}
          progress={progress}
          // The final realm's sky carries on over the join stop, so the last
          // panel isn't lit by the base coat from the start of the journey.
          holdsToEnd={i + 1 === REALMS.length - 1}
        />
      ))}

      {/* Sun, fixed high in the sky for the whole trip */}
      <div
        className="absolute top-[12%] right-[14%] h-56 w-56 rounded-full blur-2xl sm:h-72 sm:w-72"
        style={{
          background:
            "radial-gradient(circle, rgba(255,246,214,0.9) 0%, rgba(255,232,168,0.4) 46%, transparent 72%)",
        }}
      />

      {CLOUDS.map((c, i) => (
        <CloudRow key={i} {...c} progress={progress} />
      ))}
    </div>
  );
}

function gradient(stops: readonly [string, string, string]) {
  return `linear-gradient(to bottom, ${stops[0]} 0%, ${stops[1]} 52%, ${stops[2]} 100%)`;
}

/** One realm's sky: opaque on that realm, faded out at either neighbour. */
function SkyLayer({
  stops,
  index,
  progress,
  holdsToEnd = false,
}: {
  stops: readonly [string, string, string];
  index: number;
  progress: MotionValue<number>;
  holdsToEnd?: boolean;
}) {
  const opacity = useTransform(
    progress,
    holdsToEnd
      ? [index - 1, index, index + 2]
      : [index - 1, index, index + 1],
    holdsToEnd ? [0, 1, 1] : [0, 1, 0],
    { clamp: true },
  );

  return (
    <motion.div
      className="absolute inset-0"
      style={{ opacity, background: gradient(stops) }}
    />
  );
}

const CLOUDS = [
  { top: "8%", dur: 86, delay: -20, scale: 1, opacity: 0.9, push: -60 },
  { top: "17%", dur: 112, delay: -60, scale: 0.72, opacity: 0.72, push: -110 },
  { top: "27%", dur: 96, delay: -85, scale: 0.86, opacity: 0.8, push: -85 },
  { top: "42%", dur: 132, delay: -40, scale: 0.6, opacity: 0.45, push: -150 },
] as const;

/** A band of drifting clouds, nudged against the direction of travel. */
function CloudRow({
  top,
  dur,
  delay,
  scale,
  opacity,
  push,
  progress,
}: (typeof CLOUDS)[number] & { progress: MotionValue<number> }) {
  // Pushed against the journey so the sky reads as further away than the ground.
  const x = useTransform(progress, [0, REALMS.length], [0, push]);

  return (
    <motion.div className="absolute inset-x-0" style={{ top, x }}>
      <div
        className="drift"
        style={
          {
            opacity,
            "--drift-dur": `${dur}s`,
            "--drift-delay": `${delay}s`,
            transform: `scale(${scale})`,
          } as React.CSSProperties
        }
      >
        <svg width="200" height="70" viewBox="0 0 200 70">
          <g fill="rgba(255,255,255,0.92)">
            <ellipse cx="60" cy="42" rx="52" ry="26" />
            <ellipse cx="104" cy="32" rx="40" ry="30" />
            <ellipse cx="140" cy="46" rx="38" ry="22" />
          </g>
        </svg>
      </div>
    </motion.div>
  );
}
