import { NextRequest, NextResponse } from "next/server";
import { CLAIM_CAP, communityById } from "@/lib/communities";
import { countClaims, submitEntry, type Submission } from "@/lib/allowlist-store";
import { communitiesFor, isHolder } from "@/lib/snapshots";
import { claimMessage, nonceValid } from "@/lib/claim-nonce";
import { verifyMessage } from "viem";

/**
 * The holder claim. Unlike the quest flow there is no login: eligibility is a
 * wallet's presence in a community snapshot, which is a fact we already hold,
 * so there is nothing for a visitor to prove interactively.
 *
 * The cap is enforced here rather than in the page, because the page's counter
 * is a snapshot in time and two people can always race the last spot.
 */

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
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

export async function GET() {
  try {
    const claimed = await countClaims();
    return NextResponse.json({
      claimed,
      cap: CLAIM_CAP,
      open: claimed < CLAIM_CAP,
    });
  } catch {
    // A counter that can't be read shouldn't imply the claim is closed.
    return NextResponse.json({ claimed: 0, cap: CLAIM_CAP, open: true });
  }
}

export async function POST(req: NextRequest) {
  if (isRateLimited(clientIp(req))) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const community = communityById(String(body.community ?? ""));
  if (!community) {
    return NextResponse.json(
      { error: "Pick a community first." },
      { status: 400 },
    );
  }

  const wallet = String(body.wallet ?? "").trim();
  if (!ETH_ADDRESS_RE.test(wallet)) {
    return NextResponse.json(
      { error: "Connect a wallet first." },
      { status: 400 },
    );
  }

  // --- prove the claimant controls the wallet --------------------------
  //
  // Without this the address is just text, and anyone could paste a known
  // holder's wallet and take their spot. The signature is over a nonce this
  // server issued, so a signature captured elsewhere cannot be replayed here.
  const nonce = String(body.nonce ?? "");
  if (!nonceValid(nonce)) {
    return NextResponse.json(
      { error: "That signing request expired. Try again." },
      { status: 400 },
    );
  }

  const signature = String(body.signature ?? "");
  if (!/^0x[0-9a-fA-F]+$/.test(signature)) {
    return NextResponse.json(
      { error: "Sign the message to claim." },
      { status: 400 },
    );
  }

  let signerOk = false;
  try {
    signerOk = await verifyMessage({
      address: wallet as `0x${string}`,
      message: claimMessage({ wallet, community: community.name, nonce }),
      signature: signature as `0x${string}`,
    });
  } catch {
    signerOk = false;
  }

  if (!signerOk) {
    return NextResponse.json(
      { error: "That signature doesn't match the wallet." },
      { status: 401 },
    );
  }

  // Checked before the snapshot lookup: once the spots are gone, being
  // eligible no longer matters and saying so is clearer than a near miss.
  const claimed = await countClaims().catch(() => 0);
  if (claimed >= CLAIM_CAP) {
    return NextResponse.json(
      { error: "Every spot is claimed." },
      { status: 403 },
    );
  }

  if (!(await isHolder(community.slug, wallet))) {
    // If the wallet is on another community's list, say so — it is almost
    // always someone who picked the wrong card, not someone ineligible.
    const elsewhere = await communitiesFor(wallet);
    if (elsewhere.length > 0) {
      return NextResponse.json(
        {
          error: `That wallet isn't on the ${community.name} list.`,
          eligibleFor: elsewhere,
        },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: "That wallet isn't on the list." },
      { status: 403 },
    );
  }

  const submission: Submission = {
    // There is no X session on this route, so the community stands in for the
    // handle; the sheet's source column is what tells the two apart.
    handle: community.name,
    wallet,
    xUserId: "",
    quoteLink: "",
    source: "claim",
    community: community.slug,
  };

  try {
    const result = await submitEntry(submission);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      community: community.name,
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
