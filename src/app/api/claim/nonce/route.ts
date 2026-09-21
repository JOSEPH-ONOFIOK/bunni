import { NextResponse } from "next/server";
import { issueNonce } from "@/lib/claim-nonce";

/**
 * Hands out a challenge for the claim signature.
 *
 * Deliberately unauthenticated and cheap: a nonce grants nothing on its own,
 * and rate-limiting the mint would only make the claim flakier without making
 * it safer — the guard that matters is on the claim itself.
 */
export async function GET() {
  return NextResponse.json(
    { nonce: issueNonce() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
