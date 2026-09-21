import { NextResponse } from "next/server";
import { claimsByCommunity } from "@/lib/allowlist-store";

/**
 * Claims taken per community, for the rings on the cards.
 *
 * Its own route rather than part of /api/claim, because the grid wants it on
 * load while the claim itself does not — folding it in would make every claim
 * pay for a scan it has no use for.
 */
export async function GET() {
  try {
    return NextResponse.json(
      { byCommunity: await claimsByCommunity() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // An unreadable sheet means unknown, not zero: empty rings would claim
    // nobody has claimed anything.
    return NextResponse.json({ byCommunity: null }, { status: 503 });
  }
}
