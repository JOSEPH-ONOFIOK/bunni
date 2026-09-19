import { NextRequest, NextResponse } from "next/server";
import { parsePostLink } from "@/lib/quests";
import { verifyQuotePost } from "@/lib/x-verify";
import { currentAccount } from "@/lib/x-session";

/**
 * Checks a quote link on demand, so the guest finds out it's wrong while they
 * can still fix it rather than at submit. The same verifier runs again in the
 * allowlist route — this endpoint is a convenience, never the authority.
 */

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 12;
const requestLog = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (requestLog.get(key) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  recent.push(now);
  requestLog.set(key, recent);
  return recent.length > RATE_LIMIT_MAX;
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function xConfigured() {
  return Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET);
}

export async function POST(req: NextRequest) {
  if (isRateLimited(clientIp(req))) {
    return NextResponse.json(
      { ok: false, reason: "Slow down a moment, then try again." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const link = String(
    (body as { link?: unknown } | null)?.link ?? "",
  ).trim();

  const parsed = parsePostLink(link);
  if (!parsed) {
    return NextResponse.json({
      ok: false,
      reason: "That doesn't look like a post link.",
    });
  }

  // Verify against the connected account, never against a handle from the
  // body — otherwise this endpoint would happily bless someone else's post.
  const account = await currentAccount();
  if (xConfigured() && !account) {
    return NextResponse.json(
      { ok: false, reason: "Connect your X account first." },
      { status: 401 },
    );
  }

  const handle = account?.username ?? parsed.username;
  const verdict = await verifyQuotePost(parsed.statusId, handle);

  return NextResponse.json(
    verdict.ok ? { ok: true } : { ok: false, reason: verdict.reason },
  );
}
