/**
 * Build holder snapshots by replaying ERC-721 Transfer logs.
 *
 *   node scripts/snapshot.mjs              # every community
 *   node scripts/snapshot.mjs cash-cats    # just one
 *
 * Writes data/snapshots/<slug>.txt, one wallet per line — the format
 * src/lib/snapshots.ts reads.
 *
 * Ownership is derived rather than queried: replaying every Transfer in order
 * and keeping the last `to` per tokenId gives the current holder without
 * calling ownerOf() once per token, which would be tens of thousands of calls.
 *
 * The public RPC sits behind Cloudflare and rate-limits bursts, so requests are
 * spaced, retried with backoff, and progress is written as it goes — a run that
 * trips the limiter can be resumed rather than restarted.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TRANSFER =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const RPCS = {
  robinhood: "https://rpc.mainnet.chain.robinhood.com",
  ethereum: process.env.ETHEREUM_RPC_URL ?? "https://eth.llamarpc.com",
};

const OUT_DIR = path.join(process.cwd(), "data", "snapshots");
const STATE_DIR = path.join(process.cwd(), "data", ".snapshot-state");

/** Blocks per getLogs call. The chain caps a response at 10k logs. */
const STEP = 2000;
/** Pause between calls, to stay under the rate limiter. */
const GAP_MS = 250;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(url, method, params, attempt = 0) {
  await sleep(GAP_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(30000),
    });

    const text = await res.text();
    // A challenge page rather than JSON means the limiter has kicked in.
    if (!text.startsWith("{")) throw new Error("rate-limited");

    const json = JSON.parse(text);
    if (json.error) throw new Error(json.error.message);
    return json.result;
  } catch (err) {
    if (attempt >= 6) throw err;
    const wait = 2000 * 2 ** attempt;
    process.stderr.write(`    ${err.message}; retrying in ${wait / 1000}s\n`);
    await sleep(wait);
    return rpc(url, method, params, attempt + 1);
  }
}

/** Every Transfer for one contract, walked forward and folded into owners. */
async function holdersOf(community, head) {
  const url = RPCS[community.chain];
  const owners = new Map(); // tokenId -> current owner

  const statePath = path.join(STATE_DIR, `${community.slug}.json`);
  let from = 0;

  // Resume a run that was interrupted part-way.
  try {
    const saved = JSON.parse(await readFile(statePath, "utf-8"));
    if (saved.head === head && Array.isArray(saved.owners)) {
      for (const [id, who] of saved.owners) owners.set(id, who);
      from = saved.nextBlock ?? 0;
      process.stderr.write(`    resuming at block ${from}\n`);
    }
  } catch {}

  for (let start = from; start <= head; start += STEP) {
    const end = Math.min(start + STEP - 1, head);

    const logs = await rpc(url, "eth_getLogs", [
      {
        address: community.contract,
        fromBlock: "0x" + start.toString(16),
        toBlock: "0x" + end.toString(16),
        topics: [TRANSFER],
      },
    ]);

    for (const log of logs) {
      // Four topics means the tokenId is indexed: an ERC-721 transfer. Three
      // means ERC-20, which has no per-token ownership to track.
      if (log.topics.length !== 4) continue;
      const to = "0x" + log.topics[2].slice(26).toLowerCase();
      const tokenId = log.topics[3];
      owners.set(tokenId, to);
    }

    if ((start / STEP) % 25 === 0) {
      process.stderr.write(
        `    ${start}/${head} · ${owners.size} tokens seen\n`,
      );
      await mkdir(STATE_DIR, { recursive: true });
      await writeFile(
        statePath,
        JSON.stringify({ head, nextBlock: end + 1, owners: [...owners] }),
      );
    }
  }

  const ZERO = "0x0000000000000000000000000000000000000000";
  // Burned tokens land at the zero address and have no holder.
  return new Set([...owners.values()].filter((a) => a !== ZERO));
}

async function main() {
  const only = process.argv[2];
  const { COMMUNITIES } = await import("../src/lib/communities.ts").catch(
    async () => {
      // The registry is TypeScript; read it as text when it can't be imported.
      const src = await readFile(
        path.join(process.cwd(), "src/lib/communities.ts"),
        "utf-8",
      );
      const out = [];
      const re =
        /id:\s*"([^"]+)"[\s\S]*?slug:\s*"([^"]+)"[\s\S]*?name:\s*"([^"]+)"[\s\S]*?contract:\s*"([^"]+)"[\s\S]*?chain:\s*"([^"]+)"/g;
      let m;
      while ((m = re.exec(src))) {
        out.push({
          id: m[1],
          slug: m[2],
          name: m[3],
          contract: m[4],
          chain: m[5],
        });
      }
      return { COMMUNITIES: out };
    },
  );

  const targets = only
    ? COMMUNITIES.filter((c) => c.slug === only || c.id === only)
    : COMMUNITIES;

  if (targets.length === 0) {
    console.error(`No community matches "${only}".`);
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const heads = {};
  for (const chain of new Set(targets.map((c) => c.chain))) {
    heads[chain] = parseInt(await rpc(RPCS[chain], "eth_blockNumber", []), 16);
    console.error(`${chain} head block: ${heads[chain]}`);
  }

  for (const community of targets) {
    console.error(`\n${community.name} (${community.contract})`);
    try {
      const holders = await holdersOf(community, heads[community.chain]);
      const file = path.join(OUT_DIR, `${community.slug}.txt`);
      await writeFile(
        file,
        `# ${community.name} — ${community.contract} on ${community.chain}\n` +
          `# ${holders.size} holders, taken at block ${heads[community.chain]}\n` +
          [...holders].sort().join("\n") +
          "\n",
      );
      console.error(`  -> ${holders.size} holders written`);
    } catch (err) {
      console.error(`  !! failed: ${err.message}`);
      console.error(`     re-run to resume: node scripts/snapshot.mjs ${community.slug}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
