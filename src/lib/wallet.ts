import { CHAIN, CHAIN_ID_HEX } from "./chain";

/**
 * Wallet access through the injected EIP-1193 provider — MetaMask, Rabby,
 * Coinbase Wallet, Phantom and friends. No connector library: the mint needs
 * an address and the right network, and a dependency for that is not worth
 * the bundle on a page people open on a phone under time pressure.
 */

export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, handler: (...args: never[]) => void): void;
  removeListener(event: string, handler: (...args: never[]) => void): void;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

/**
 * EIP-6963: wallets announce themselves instead of fighting over
 * `window.ethereum`. This is how the picker can name them rather than
 * offering one anonymous "connect" that opens whoever won the race.
 */
export type WalletInfo = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
};

export type DiscoveredWallet = { info: WalletInfo; provider: Eip1193Provider };

type AnnounceEvent = CustomEvent<DiscoveredWallet>;

/**
 * Asks every installed wallet to announce itself. They answer synchronously
 * on dispatch, but some inject late, so this keeps listening and reports back
 * through `onChange` as more arrive.
 */
export function discoverWallets(
  onChange: (wallets: DiscoveredWallet[]) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const found = new Map<string, DiscoveredWallet>();

  const onAnnounce = (event: Event) => {
    const detail = (event as AnnounceEvent).detail;
    if (!detail?.info?.rdns || found.has(detail.info.rdns)) return;
    found.set(detail.info.rdns, detail);
    onChange([...found.values()]);
  };

  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
}

/** Worth offering an install link for when nothing is detected. */
export const KNOWN_WALLETS = [
  { name: "MetaMask", url: "https://metamask.io/download/" },
  { name: "Rabby", url: "https://rabby.io/" },
  { name: "Coinbase Wallet", url: "https://www.coinbase.com/wallet/downloads" },
  { name: "Phantom", url: "https://phantom.app/download" },
] as const;

export function getProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

export const hasWallet = () => getProvider() !== null;

/** Addresses already authorised, without prompting. */
export async function readAccounts(target?: Eip1193Provider): Promise<string[]> {
  const provider = target ?? getProvider();
  if (!provider) return [];
  try {
    return (await provider.request({ method: "eth_accounts" })) as string[];
  } catch {
    return [];
  }
}

/**
 * Prompts. Pass a specific provider to connect that exact wallet; without one
 * it falls back to whatever claimed `window.ethereum`.
 */
export async function connect(target?: Eip1193Provider): Promise<string[]> {
  const provider = target ?? getProvider();
  if (!provider) throw new Error("No wallet found in this browser.");

  try {
    return (await provider.request({ method: "eth_requestAccounts" })) as string[];
  } catch (cause) {
    const code = (cause as { code?: number })?.code;
    if (code === 4001) throw new Error("You turned the connection down.");
    if (code === -32002) throw new Error("Your wallet is already asking. Check it.");
    throw new Error("Couldn't reach your wallet.");
  }
}

export async function readChainId(target?: Eip1193Provider): Promise<number | null> {
  const provider = target ?? getProvider();
  if (!provider) return null;
  try {
    const hex = (await provider.request({ method: "eth_chainId" })) as string;
    return Number.parseInt(hex, 16);
  } catch {
    return null;
  }
}

/**
 * Switches to Robinhood Chain, adding it first if the wallet has never seen
 * it — 4902 is the "unrecognised chain" code every wallet returns for that.
 */
export async function switchToChain(target?: Eip1193Provider): Promise<void> {
  const provider = target ?? getProvider();
  if (!provider) throw new Error("No wallet found in this browser.");

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch (cause) {
    const code = (cause as { code?: number })?.code;
    if (code !== 4902) throw new Error("Couldn't switch network.");

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: CHAIN_ID_HEX,
          chainName: `${CHAIN.name} Chain`,
          nativeCurrency: CHAIN.nativeCurrency,
          rpcUrls: [...CHAIN.rpcUrls],
          blockExplorerUrls: [CHAIN.blockExplorer.url],
        },
      ],
    });
  }
}

/** What the wallet holds, in wei. Used to warn before a mint that cannot pay. */
export async function readBalance(
  address: string,
  target?: Eip1193Provider,
): Promise<bigint | null> {
  const provider = target ?? getProvider();
  if (!provider) return null;
  try {
    const hex = (await provider.request({
      method: "eth_getBalance",
      params: [address, "latest"],
    })) as string;
    return BigInt(hex);
  } catch {
    return null;
  }
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Asks the wallet to sign a plain message — personal_sign, which every
 * injected wallet supports and which shows the text to the signer rather than
 * a blob of hex they cannot read.
 *
 * No transaction, no gas, no approval: the signature only proves the account
 * agreed to this exact text.
 */
export async function signMessage(
  message: string,
  address: string,
  target?: Eip1193Provider,
): Promise<string> {
  const provider = target ?? getProvider();
  if (!provider) throw new Error("No wallet found.");

  const signature = await provider.request({
    method: "personal_sign",
    // personal_sign takes the message first and the account second — the
    // reverse of eth_sign, and getting it the wrong way round fails with an
    // error that blames the address.
    params: [message, address],
  });

  return String(signature);
}
