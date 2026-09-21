/**
 * The communities on Robinhood whose holders can claim a spot.
 *
 * Normies and NPC are deliberately absent from the original lineup; this
 * claim is open to sixteen: that lineup less Normies and NPC, plus
 * Stonk Interns and Clickihood.
 */

export type Community = {
  id: string;
  name: string;
  /** Sits on the card, and is what a snapshot file is named after. */
  slug: string;
  /** The NFT contract holders are read from. */
  contract: string;
  /**
   * Which chain that contract lives on. Everything here is on
   * Robinhood Chain except Blokyz, whose original collection is on Ethereum —
   * so the snapshot script has to point at a different RPC for it.
   */
  chain: "robinhood" | "ethereum";
};

export const COMMUNITIES: Community[] = [
  { id: "bull-runners", slug: "bull-runners", name: "Bull Runners",
    contract: "0x4d908ec6f8b6b63dcd57e68ede19e595c402d83b", chain: "robinhood" },
  { id: "cash-cats", slug: "cash-cats", name: "Cash Cats",
    contract: "0xe3b34c4bb0f12c82143745eee6a6cf4e3154b1fa", chain: "robinhood" },
  { id: "gremlin-cartel", slug: "gremlin-cartel", name: "Gremlin Cartel",
    contract: "0x12449b9a29865621be166aaff04dc14a640b4119", chain: "robinhood" },
  { id: "clay-stonkz", slug: "clay-stonkz", name: "Clay Stonkz",
    contract: "0xde0acefc89d4cf5f4ce45a4fb8a51aa355091b44", chain: "robinhood" },
  { id: "monkeyhood", slug: "monkeyhood", name: "MonkeyHood",
    contract: "0x6581b6fa83e714956935cd1e16ac8f6f5c44c484", chain: "robinhood" },
  { id: "internet-monkes", slug: "internet-monkes", name: "Internet Monkes",
    contract: "0x315c62f3a56dc2f581cc09096a5b438f3171cacb", chain: "robinhood" },
  { id: "pyopyopyopyo", slug: "pyopyopyopyo", name: "PyoPyoPyoPyo",
    contract: "0x08dc7cb3f4ccc8eea782e2924d151e2130f22b28", chain: "robinhood" },
  { id: "blokyz", slug: "blokyz", name: "Blokyz",
    contract: "0x86ffb7988913e85a5a07d459a5165ab1273cfe62", chain: "ethereum" },
  { id: "rh-machine", slug: "rh-machine", name: "RH Machine",
    contract: "0x8c71d170fbd94bcba93bb08fc2cfd0e8620cd9ce", chain: "robinhood" },
  { id: "quotrons", slug: "quotrons", name: "Quotrons",
    contract: "0x027aca2794e44f24950d81227dcd516ffbb49d6e", chain: "robinhood" },
  { id: "script-kiddies", slug: "script-kiddies", name: "Script Kiddies",
    contract: "0x0130adfd81393dcb5f510469635413bae1cd6402", chain: "robinhood" },
  { id: "wif-outlaws", slug: "wif-outlaws", name: "WIF Outlaws",
    contract: "0x12a4c7659a4b7c4a2870b5167c4f8b014c7fa690", chain: "robinhood" },
  { id: "onchainhoodies", slug: "onchainhoodies", name: "OnChainHoodies",
    contract: "0x9ec6c5b9f572a9b02138e553bc5f5882da735f45", chain: "robinhood" },
  { id: "h00dle", slug: "h00dle", name: "H00dle",
    contract: "0x14924807ff03f410f0965a25d66bf44e1e926841", chain: "robinhood" },
  { id: "stonk-interns", slug: "stonk-interns", name: "Stonk Interns",
    contract: "0xfc4b0c4f464dc3037cf013934648a8a726d565a5", chain: "robinhood" },
  { id: "clickihood", slug: "clickihood", name: "Clickihood",
    contract: "0x985607672ffee71316d3ebf2c71c8381435f156e", chain: "robinhood" },
];

/** Total spots on offer, shared across every community. */
export const CLAIM_CAP = 1111;

/**
 * Each community's share of the cap, as a percentage denominator for its ring.
 *
 * The spots themselves are not reserved — the claim is first come, first
 * served against the single 1,111 — so this is what "how far has this
 * community got" is measured against, not a quota that stops anyone.
 */
export const PER_COMMUNITY_ALLOCATION = Math.ceil(
  CLAIM_CAP / COMMUNITIES.length,
);

export function communityById(id: string): Community | undefined {
  return COMMUNITIES.find((c) => c.id === id);
}

/**
 * Every community now has artwork in public/communities, so the monogram
 * fallback in the portal is dead weight — kept only so a community added
 * without a logo still renders rather than showing a broken image.
 */
export const HAS_LOGO = new Set(COMMUNITIES.map((c) => c.slug));
