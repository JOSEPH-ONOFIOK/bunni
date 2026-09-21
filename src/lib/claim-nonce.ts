import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * The challenge a claimant signs.
 *
 * A bare "I am 0x…" message could be replayed forever, and a signature posted
 * publicly once would let anyone claim that wallet's spot. So the message
 * carries a nonce that this server minted, stamped with an expiry and signed
 * with the session secret — which means it can be checked on the way back in
 * without storing anything. Serverless instances do not share memory, so a
 * nonce held in a Map would only work until the next cold start.
 */

const TTL_SECONDS = 10 * 60;

let devSecret: string | undefined;

function secret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 16) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set (32+ random characters).");
  }
  devSecret ??= randomBytes(32).toString("hex");
  return devSecret;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** A fresh nonce: random, stamped, and signed so it can be trusted later. */
export function issueNonce(): string {
  const body = `${randomBytes(16).toString("base64url")}.${
    Math.floor(Date.now() / 1000) + TTL_SECONDS
  }`;
  return `${body}.${sign(body)}`;
}

/** True when the nonce is one we issued and hasn't expired. */
export function nonceValid(nonce: string): boolean {
  const parts = String(nonce ?? "").split(".");
  if (parts.length !== 3) return false;

  const [random, expiry, mac] = parts;
  if (!safeEqual(mac, sign(`${random}.${expiry}`))) return false;

  const expiresAt = Number(expiry);
  return Number.isFinite(expiresAt) && expiresAt > Math.floor(Date.now() / 1000);
}

export { claimMessage } from "./claim-message";
