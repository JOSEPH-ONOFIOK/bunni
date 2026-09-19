import { createHash, randomBytes } from "crypto";
import { SITE_URL } from "./site-url";

export const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
export const TOKEN_URL = "https://api.x.com/2/oauth2/token";
export const ME_URL = "https://api.x.com/2/users/me";

/** Only what's needed to identify the guest — no write access is requested. */
export const SCOPES = ["users.read", "tweet.read"];

export const STATE_COOKIE = "bunii_x_state";
export const VERIFIER_COOKIE = "bunii_x_verifier";

export type XConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/**
 * Returns null rather than throwing when X isn't configured, so the site
 * still renders (with the connect step disabled) on a fresh checkout.
 */
export function xConfig(origin: string): XConfig | null {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  // X compares redirect_uri byte for byte. In production that has to be the
  // canonical domain — a proxy must never be able to rewrite it into
  // something unregistered. Locally we follow whichever host you're on, so
  // http://localhost:3000/api/x/callback still works.
  const base = process.env.NODE_ENV === "production" ? SITE_URL : origin;
  return {
    clientId,
    clientSecret,
    redirectUri: new URL("/api/x/callback", base).toString(),
  };
}

// --- PKCE ------------------------------------------------------------

export function newVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function newState(): string {
  return randomBytes(16).toString("base64url");
}

export function authorizeUrl(
  config: XConfig,
  state: string,
  verifier: string,
): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challengeFor(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

// --- Token exchange ---------------------------------------------------

function basicAuth(config: XConfig): string {
  const raw = `${config.clientId}:${config.clientSecret}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

export async function exchangeCode(
  config: XConfig,
  code: string,
  verifier: string,
): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuth(config),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    throw new Error(`X token exchange failed: ${res.status}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("X token exchange returned no token.");
  return data.access_token;
}

export type XUser = { id: string; username: string; name: string };

export async function fetchMe(accessToken: string): Promise<XUser> {
  const res = await fetch(ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`X users/me failed: ${res.status}`);

  const data = (await res.json()) as { data?: XUser };
  if (!data.data?.id) throw new Error("X users/me returned no user.");
  return data.data;
}
