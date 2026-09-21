import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

/**
 * Where submissions go.
 *
 * The Google Sheets web app is the durable store when `GOOGLE_SHEETS_WEBAPP_URL`
 * is set, because a serverless filesystem is read-only in production and
 * anything written to it disappears with the instance. The local JSON file is
 * the no-sheet development fallback.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "allowlist.json");

export type Entry = {
  handle: string;
  wallet: string;
  inviteCode: string;
  joinedAt: string;
  xUserId?: string;
  quoteLink?: string;
  /** Which door this entry came through: the X quests, or a holder claim. */
  source?: string;
  /** For a holder claim, the community whose snapshot matched. */
  community?: string;
};

export type Submission = {
  handle: string;
  wallet: string;
  xUserId: string;
  quoteLink: string;
  /** "quests" or "claim". Defaults to the quest flow when absent. */
  source?: string;
  community?: string;
};

export type SubmitResult =
  | { position: number; inviteCode: string }
  | { error: string };

function newInviteCode() {
  return `BUNII-${randomUUID().split("-")[0].toUpperCase().slice(0, 6)}`;
}

// --- local JSON fallback ---------------------------------------------

async function readLocalEntries(): Promise<Entry[]> {
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalEntries(entries: Entry[]) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(entries, null, 2));
}

async function submitToLocalFile(sub: Submission): Promise<SubmitResult> {
  const entries = await readLocalEntries();

  if (entries.some((e) => e.wallet.toLowerCase() === sub.wallet.toLowerCase())) {
    return { error: "That wallet is already on the list." };
  }
  if (sub.xUserId && entries.some((e) => e.xUserId === sub.xUserId)) {
    return { error: "That X account is already on the list." };
  }

  const inviteCode = newInviteCode();
  entries.push({
    handle: sub.handle,
    wallet: sub.wallet,
    inviteCode,
    joinedAt: new Date().toISOString(),
    xUserId: sub.xUserId,
    quoteLink: sub.quoteLink,
    source: sub.source ?? "quests",
    community: sub.community,
  });
  await writeLocalEntries(entries);

  return { position: entries.length, inviteCode };
}

// --- Google Sheets backend -------------------------------------------

async function submitToSheet(
  webAppUrl: string,
  sub: Submission,
): Promise<SubmitResult> {
  const inviteCode = newInviteCode();

  const res = await fetch(webAppUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...sub, inviteCode }),
    redirect: "follow",
  });

  if (!res.ok) throw new Error(`Sheets webhook returned ${res.status}`);

  const data = await res.json();

  if (data.error === "duplicate") {
    return { error: "That wallet is already on the list." };
  }
  if (data.error === "duplicate_x") {
    return { error: "That X account is already on the list." };
  }
  if (data.error) throw new Error(String(data.error));

  return { position: Number(data.position), inviteCode };
}

async function countSheetEntries(webAppUrl: string, source?: string) {
  const url = new URL(webAppUrl);
  if (source) url.searchParams.set("source", source);
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  if (!res.ok) throw new Error(`Sheets webhook returned ${res.status}`);
  const data = await res.json();
  return Number(data.count ?? 0);
}

// --- public API -------------------------------------------------------

export async function submitEntry(sub: Submission): Promise<SubmitResult> {
  const url = process.env.GOOGLE_SHEETS_WEBAPP_URL;
  return url ? submitToSheet(url, sub) : submitToLocalFile(sub);
}

export async function countEntries(): Promise<number> {
  const url = process.env.GOOGLE_SHEETS_WEBAPP_URL;
  return url ? countSheetEntries(url) : (await readLocalEntries()).length;
}

/**
 * Claims only, for the claim portal's cap.
 *
 * The quest flow writes to the same sheet, so counting every row would spend
 * the claim's allocation on people who never used it — with the quest list
 * already underway, the cap would read as full on day one.
 */
/** Claims per community slug, for the portal's per-card rings. */
export async function claimsByCommunity(): Promise<Record<string, number>> {
  const url = process.env.GOOGLE_SHEETS_WEBAPP_URL;

  if (url) {
    const target = new URL(url);
    target.searchParams.set("breakdown", "claim");
    const res = await fetch(target, { cache: "no-store" });
    if (!res.ok) throw new Error(`Sheets webhook returned ${res.status}`);
    const data = await res.json();
    return data.byCommunity ?? {};
  }

  const entries = await readLocalEntries();
  const out: Record<string, number> = {};
  for (const e of entries) {
    if (e.source !== "claim" || !e.community) continue;
    out[e.community] = (out[e.community] ?? 0) + 1;
  }
  return out;
}

export async function countClaims(): Promise<number> {
  const url = process.env.GOOGLE_SHEETS_WEBAPP_URL;
  if (url) return countSheetEntries(url, "claim");
  const entries = await readLocalEntries();
  return entries.filter((e) => e.source === "claim").length;
}
