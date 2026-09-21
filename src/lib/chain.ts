/**
 * Robinhood Chain — EVM-compatible, ETH for gas. The house mints where the
 * house lives.
 */
export const CHAIN = {
  id: 4663,
  name: "Robinhood",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
  blockExplorer: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
} as const;

/**
 * Reads go through whatever RPC is configured. The public endpoint carries a
 * page that polls every twelve seconds well enough; a mint that draws a room
 * is exactly when a public endpoint starts refusing, so it can be pointed
 * somewhere else without touching anything but the environment.
 */
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || CHAIN.rpcUrls[0];

/**
 * Multicall3, at the address it has on every chain that has it. Robinhood
 * does. viem will not use it unless the chain says so, and without it every
 * batched read throws ChainDoesNotSupportContract — which is not a thing you
 * find out gently, because the page keeps rendering with no numbers in it.
 */
export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

/** 0x1237 — what wallet_switchEthereumChain expects. */
export const CHAIN_ID_HEX = `0x${CHAIN.id.toString(16)}`;

export function explorerUrl(kind: "address" | "tx" | "token", value: string) {
  return `${CHAIN.blockExplorer.url}/${kind}/${value}`;
}
