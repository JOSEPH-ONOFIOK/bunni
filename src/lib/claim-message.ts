/**
 * The exact text a claimant's wallet signs.
 *
 * Its own module, with no imports: the client needs it to ask the wallet, and
 * the server needs it to verify — but the nonce helpers beside it use
 * node:crypto, which has no business in a browser bundle. Built in one place
 * so the two cannot drift, since a single differing character makes every
 * signature fail with nothing to show why.
 */
export function claimMessage(opts: {
  wallet: string;
  community: string;
  nonce: string;
}): string {
  return [
    "Claim your BUNII spot",
    "",
    `Wallet: ${opts.wallet.toLowerCase()}`,
    `Community: ${opts.community}`,
    `Nonce: ${opts.nonce}`,
    "",
    "Signing costs nothing and moves no funds.",
  ].join("\n");
}
