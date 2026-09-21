/**
 * Build holder snapshots for the claim portal.
 *
 *   node scripts/snapshot.mjs              # every community
 *   node scripts/snapshot.mjs cash-cats    # just one
 *
 * Writes data/snapshots/<slug>.txt, one wallet per line — the format
 * src/lib/snapshots.ts reads.
 *
 * Holders come from Alchemy's NFT API, which supports Robinhood Chain as
 * `robinhood-mainnet` and returns a whole collection's owners in one paged
 * call. The alternative is replaying every Transfer log from the chain's
 * genesis: the public RPC caps a response at 10k logs, prunes historical state
 * (so a contract's deployment block can't even be binary-searched), and
 * rate-limits bursts — hours of work for something the API answers in seconds.
 *
 * Needs ALCHEMY_API_KEY in .env.local.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "data", "snapshots");

/** Alchemy's network names for the two chains the Furnace spans. */
const NETWORKS = {
  robinhood: "robinhood-mainnet",
  ethereum: "eth-mainnet",
};

/** Burn addresses hold tokens but are nobody, so they never get a spot. */
const BURN = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
]);

async function apiKey() {
  if (process.env.ALCHEMY_API_KEY) return process.env.ALCHEMY_API_KEY.trim();
  try {
    const env = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
    const line = env.split(/\r?\n/).find((l) => l.startsWith("ALCHEMY_API_KEY="));
    if (line) return line.slice("ALCHEMY_API_KEY=".length).trim();
  } catch {}
  throw new Error("ALCHEMY_API_KEY is not set (put it in .env.local)");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Every owner of a collection, following the API's paging. */
async function ownersOf(community, key) {
  const base = `https://${NETWORKS[community.chain]}.g.alchemy.com/nft/v3/${key}/getOwnersForContract`;
  const owners = new Set();
  let pageKey;

  do {
    const url = new URL(base);
    url.searchParams.set("contractAddress", community.contract);
    if (pageKey) url.searchParams.set("pageKey", pageKey);

    let data;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
        if (res.status === 429) throw new Error("rate limited");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
        break;
      } catch (err) {
        if (attempt >= 5) throw err;
        const wait = 1500 * 2 ** attempt;
        process.stderr.write(`    ${err.message}; retrying in ${wait / 1000}s\n`);
        await sleep(wait);
      }
    }

    for (const owner of data.owners ?? []) {
      const addr = String(owner).toLowerCase();
      if (!BURN.has(addr)) owners.add(addr);
    }

    pageKey = data.pageKey;
    if (pageKey) await sleep(250);
  } while (pageKey);

  return owners;
}

/** The registry is TypeScript, so read it as text rather than importing it. */
async function communities() {
  const src = await readFile(
    path.join(process.cwd(), "src/lib/communities.ts"),
    "utf-8",
  );
  const out = [];
  const re =
    /id:\s*"([^"]+)",\s*slug:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*\n?\s*contract:\s*"([^"]+)",\s*chain:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    out.push({ id: m[1], slug: m[2], name: m[3], contract: m[4], chain: m[5] });
  }
  return out;
}

async function main() {
  const key = await apiKey();
  const all = await communities();

  if (all.length === 0) {
    throw new Error("No communities parsed from src/lib/communities.ts");
  }

  const only = process.argv[2];
  const targets = only
    ? all.filter((c) => c.slug === only || c.id === only)
    : all;

  if (targets.length === 0) {
    console.error(`No community matches "${only}". Known: ${all.map((c) => c.slug).join(", ")}`);
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  let total = 0;
  const failed = [];

  for (const community of targets) {
    process.stderr.write(`${community.name.padEnd(18)} `);
    try {
      const owners = await ownersOf(community, key);
      const list = [...owners].sort();

      await writeFile(
        path.join(OUT_DIR, `${community.slug}.txt`),
        `# ${community.name} — ${community.contract} on ${community.chain}\n` +
          `# ${list.length} holders, taken ${new Date().toISOString()}\n` +
          list.join("\n") +
          "\n",
      );

      total += list.length;
      process.stderr.write(`${list.length} holders\n`);
    } catch (err) {
      process.stderr.write(`FAILED: ${err.message}\n`);
      failed.push(community.slug);
    }
    await sleep(300);
  }

  console.error(`\n${total} wallets across ${targets.length - failed.length} communities.`);
  if (failed.length) {
    console.error(`Failed: ${failed.join(", ")} — re-run with that slug to retry.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
