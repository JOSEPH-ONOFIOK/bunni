/**
 * Push the holder snapshots into the spreadsheet's GTD tab.
 *
 *   node scripts/push-gtd.mjs            # replace the tab with current snapshots
 *   node scripts/push-gtd.mjs --dry-run  # show what would be sent
 *
 * GTD is the eligibility list: every wallet that holds one of the fourteen
 * Furnace collections, and which collection it holds. It is not the claim
 * list — claims land in Allowlist with source=claim, and the 1,111 cap counts
 * those.
 *
 * Sent in chunks because Apps Script times out long past a minute, and tens of
 * thousands of rows in one request is megabytes of JSON.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(process.cwd(), "data", "snapshots");
const CHUNK = 2000;

async function webhookUrl() {
  if (process.env.GOOGLE_SHEETS_WEBAPP_URL) {
    return process.env.GOOGLE_SHEETS_WEBAPP_URL.trim();
  }
  const env = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
  const line = env
    .split(/\r?\n/)
    .find((l) => l.startsWith("GOOGLE_SHEETS_WEBAPP_URL="));
  if (!line) throw new Error("GOOGLE_SHEETS_WEBAPP_URL is not set");
  return line.slice("GOOGLE_SHEETS_WEBAPP_URL=".length).trim();
}

/** Every snapshot, as [wallet, community] rows. */
async function rows() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".txt"));
  const out = [];

  for (const file of files.sort()) {
    const slug = file.replace(/\.txt$/, "");
    const text = await readFile(path.join(DIR, file), "utf-8");

    for (const line of text.split(/\r?\n/)) {
      const wallet = line.trim().toLowerCase();
      if (!wallet || wallet.startsWith("#")) continue;
      if (!/^0x[a-f0-9]{40}$/.test(wallet)) continue;
      out.push([wallet, slug]);
    }
  }

  return out;
}

async function post(url, body, attempt = 0) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "follow",
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(String(data.error));
    return data;
  } catch (err) {
    if (attempt >= 4) throw err;
    const wait = 3000 * 2 ** attempt;
    process.stderr.write(`  ${err.message}; retrying in ${wait / 1000}s\n`);
    await new Promise((r) => setTimeout(r, wait));
    return post(url, body, attempt + 1);
  }
}

async function main() {
  const all = await rows();
  const unique = new Set(all.map(([w]) => w));

  console.error(
    `${all.length} holder rows, ${unique.size} unique wallets, ` +
      `${new Set(all.map(([, c]) => c)).size} communities`,
  );

  if (process.argv.includes("--dry-run")) {
    console.error("\n--dry-run: nothing sent. First rows:");
    for (const r of all.slice(0, 5)) console.error("  ", r.join("  "));
    return;
  }

  const url = await webhookUrl();

  for (let i = 0; i < all.length; i += CHUNK) {
    const chunk = all.slice(i, i + CHUNK);
    const data = await post(url, {
      action: "gtd",
      rows: chunk,
      // Only the first chunk clears the tab; the rest append to it, so an
      // interrupted run can be restarted without wiping what landed.
      replace: i === 0,
    });
    console.error(
      `  ${Math.min(i + CHUNK, all.length)}/${all.length} sent` +
        (data.total ? ` (tab now ${data.total})` : ""),
    );
  }

  console.error("\nGTD tab updated.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
