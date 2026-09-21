import { NextRequest, NextResponse } from "next/server";
import { communitiesFor } from "@/lib/snapshots";

/**
 * Which communities a wallet holds.
 *
 * Read-only and harmless: the GTD list is public by nature, so this discloses
 * nothing a determined visitor could not work out by trying each community in
 * turn — and answering it up front saves everyone that guessing.
 *
 * It grants nothing on its own. The claim still demands a signature.
 */
const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function GET(req: NextRequest) {
  const wallet = (req.nextUrl.searchParams.get("wallet") ?? "").trim();

  if (!ETH_ADDRESS_RE.test(wallet)) {
    return NextResponse.json({ communities: [] });
  }

  try {
    return NextResponse.json(
      { communities: await communitiesFor(wallet) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // An unreachable sheet shouldn't look like "you hold nothing" — say so,
    // and let the page fall back to showing every community as claimable.
    return NextResponse.json({ communities: null }, { status: 503 });
  }
}
