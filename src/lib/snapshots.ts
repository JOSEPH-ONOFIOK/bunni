import { readFile, readdir } from "fs/promises";
import path from "path";
import { COMMUNITIES } from "./communities";

/**
 * Holder snapshots, one file per community.
 *
 * Drop a file at `data/snapshots/<slug>.txt` containing one wallet per line;
 * blank lines, `#` comments and a leading `0x` in any casing are all fine, and
 * a CSV's first column works too. The files are read once per process and kept
 * in memory: they are static for the life of a drop, and re-reading tens of
 * thousands of addresses on every claim would be the slow path.
 *
 * Nothing here throws on a missing file — a community with no snapshot yet
 * simply has nobody eligible, which is the safe reading.
 */

const DIR = path.join(process.cwd(), "data", "snapshots");

/** slug -> set of lowercased wallet addresses. */
let cache: Map<string, Set<string>> | null = null;

const ETH_ADDRESS = /^0x[a-f0-9]{40}$/;

function parse(text: string): Set<string> {
  const out = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    // Take the first column, so a CSV exported from a snapshot tool works
    // without being cleaned up first.
    const first = line.split(/[,;\t]/)[0].trim().toLowerCase();
    if (ETH_ADDRESS.test(first)) out.add(first);
  }

  return out;
}

async function load(): Promise<Map<string, Set<string>>> {
  if (cache) return cache;

  const map = new Map<string, Set<string>>();

  let files: string[] = [];
  try {
    files = await readdir(DIR);
  } catch {
    // No snapshots directory at all: every community is simply empty.
    cache = map;
    return map;
  }

  const known = new Set(COMMUNITIES.map((c) => c.slug));

  await Promise.all(
    files.map(async (file) => {
      const slug = file.replace(/\.(txt|csv)$/i, "");
      // Ignore stray files so an editor's backup can't become a community.
      if (!known.has(slug)) return;

      try {
        const text = await readFile(path.join(DIR, file), "utf-8");
        map.set(slug, parse(text));
      } catch {
        // Unreadable file: leave that community empty rather than failing the
        // whole claim page.
      }
    }),
  );

  cache = map;
  return map;
}

/** Forget the parsed snapshots, so a redeploy isn't needed after editing one. */
export function invalidateSnapshots() {
  cache = null;
}

/**
 * The GTD tab, asked directly.
 *
 * The sheet is the list people can see and you can edit, so it wins: a wallet
 * added or removed there takes effect without a redeploy. The committed files
 * are the fallback for when the sheet is unreachable, which is better than
 * refusing every holder because Apps Script had a bad minute.
 */
async function gtdCommunities(wallet: string): Promise<string[] | null> {
  const webhook = process.env.GOOGLE_SHEETS_WEBAPP_URL;
  if (!webhook) return null;

  try {
    const url = new URL(webhook);
    url.searchParams.set("wallet", wallet.trim().toLowerCase());

    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    return Array.isArray(data.communities) ? data.communities.map(String) : null;
  } catch {
    return null;
  }
}

/** Is this wallet in the given community's snapshot? */
export async function isHolder(
  slug: string,
  wallet: string,
): Promise<boolean> {
  const fromSheet = await gtdCommunities(wallet);
  if (fromSheet) return fromSheet.includes(slug);

  const map = await load();
  return map.get(slug)?.has(wallet.trim().toLowerCase()) ?? false;
}

/** Every community this wallet appears in — used to explain a failed claim. */
export async function communitiesFor(wallet: string): Promise<string[]> {
  const fromSheet = await gtdCommunities(wallet);
  if (fromSheet) return fromSheet;

  const map = await load();
  const needle = wallet.trim().toLowerCase();
  return [...map.entries()]
    .filter(([, set]) => set.has(needle))
    .map(([slug]) => slug);
}

/** How many wallets each community's snapshot holds. */
export async function snapshotSizes(): Promise<Record<string, number>> {
  const map = await load();
  const out: Record<string, number> = {};
  for (const c of COMMUNITIES) out[c.slug] = map.get(c.slug)?.size ?? 0;
  return out;
}
