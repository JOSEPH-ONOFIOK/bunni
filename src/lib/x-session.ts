import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "bunii_x";
const MAX_AGE_SECONDS = 60 * 60 * 6;

export type XAccount = {
  id: string;
  username: string;
  name: string;
  /** Unix seconds. Checked on read so a stolen cookie has a short life. */
  exp: number;
};

/**
 * In production the secret must be configured — otherwise every deploy (and
 * every serverless instance) would sign with a different key and silently log
 * everyone out. In dev we fall back to a per-process key so `npm run dev`
 * works with no setup.
 */
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

export function serializeAccount(account: Omit<XAccount, "exp">): string {
  const withExp: XAccount = {
    ...account,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(withExp)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function parseAccount(raw: string | undefined): XAccount | null {
  if (!raw) return null;
  const [body, mac] = raw.split(".");
  if (!body || !mac) return null;
  if (!safeEqual(mac, sign(body))) return null;

  try {
    const account = JSON.parse(
      Buffer.from(body, "base64url").toString("utf-8"),
    ) as XAccount;
    if (!account.id || !account.username) return null;
    if (account.exp < Math.floor(Date.now() / 1000)) return null;
    return account;
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
} as const;

/** Reads the connected X account from the request cookie, if any. */
export async function currentAccount(): Promise<XAccount | null> {
  const store = await cookies();
  return parseAccount(store.get(SESSION_COOKIE)?.value);
}
