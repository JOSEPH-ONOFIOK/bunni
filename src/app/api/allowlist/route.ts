import { NextRequest, NextResponse } from "next/server";
import { signupsOpen } from "@/lib/allowlist-status";
import { countEntries, submitEntry, type Submission } from "@/lib/allowlist-store";
import { QUESTS, linkBelongsTo, parsePostLink } from "@/lib/quests";
import { verifyQuotePost } from "@/lib/x-verify";
import { currentAccount } from "@/lib/x-session";

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HANDLE_RE = /^@?[A-Za-z0-9_]{1,15}$/;

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
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

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function xConfigured() {
  return Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET);
}

export async function GET() {
  try {
    return NextResponse.json({ count: await countEntries() });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}

export async function POST(req: NextRequest) {
  if (!signupsOpen()) {
    return NextResponse.json(
      { error: "Applications are closed. The list is full." },
      { status: 403 },
    );
  }

  if (isRateLimited(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // The handle is taken from the OAuth session, never from the request body,
  // so nobody can claim an account they haven't proved they control.
  const account = await currentAccount();
  if (xConfigured() && !account) {
    return NextResponse.json(
      { error: "Connect your X account first." },
      { status: 401 },
    );
  }

  const rawHandle = account
    ? account.username
    : String(body.handle ?? "")
        .trim()
        .replace(/^@/, "");
  if (!HANDLE_RE.test(rawHandle)) {
    return NextResponse.json(
      { error: "Enter a valid X/Twitter handle." },
      { status: 400 },
    );
  }

  const wallet = String(body.wallet ?? "").trim();
  if (!ETH_ADDRESS_RE.test(wallet)) {
    return NextResponse.json(
      { error: "Enter a valid EVM wallet address (0x...)." },
      { status: 400 },
    );
  }

  // Quest guard. The link-backed step is checked properly; the rest are
  // attestations, which is as far as the free X API tier allows.
  const quests = (body.quests ?? {}) as Record<string, unknown>;
  for (const quest of QUESTS) {
    const value = quests[quest.id];

    if (!quest.needsLink) {
      if (value !== true) {
        return NextResponse.json(
          { error: `Step ${quest.n} isn't done yet.` },
          { status: 400 },
        );
      }
      continue;
    }

    const link = String(value ?? "").trim();
    if (!linkBelongsTo(link, rawHandle)) {
      return NextResponse.json(
        {
          error: `Step ${quest.n} needs a link to your own post on @${rawHandle}.`,
        },
        { status: 400 },
      );
    }

    // The URL only proves the handle in the path. Read the post itself, so
    // this step cannot be cleared by pasting any old link of your own: it has
    // to really quote the pinned post and carry the phrase.
    const parsed = parsePostLink(link);
    const verdict = await verifyQuotePost(parsed!.statusId, rawHandle);
    if (!verdict.ok) {
      return NextResponse.json(
        { error: `Step ${quest.n}: ${verdict.reason}` },
        // A soft verdict is X being unreadable, not the guest cheating, so it
        // reads as a retryable upstream failure rather than a bad request.
        { status: verdict.hard ? 400 : 503 },
      );
    }
  }

  const submission: Submission = {
    handle: `@${rawHandle}`,
    wallet,
    xUserId: account?.id ?? "",
    quoteLink: String(quests.quote ?? "").trim(),
  };

  try {
    const result = await submitEntry(submission);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      handle: submission.handle,
      position: result.position,
      inviteCode: result.inviteCode,
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach the server. Try again in a sec." },
      { status: 502 },
    );
  }
}
