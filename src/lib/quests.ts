/** Shared by the client checklist and the server-side submit guard. */

export const X_ACCOUNT = "bunionrh";

/**
 * The exact text a quote post has to contain. The server checks for it after
 * normalising case, whitespace and emoji variation selectors, so a quote that
 * picked up different spacing on its way through a client still passes — but
 * the words themselves have to be there.
 */
export const QUOTE_PHRASE =
  "The Bunii world is open\n\nFree mint on Robinhood\n\nCloses in 48hrs";

/**
 * The posts a quote may point at — newest first.
 *
 * A list rather than one id, because the announcement post can be replaced
 * mid-drop. Rotating a single id would reject everyone who had already quoted
 * the previous one, stranding entries that were honestly earned; keeping the
 * old id here costs nothing and keeps those people valid.
 *
 *   [0] https://x.com/bunionrh/status/2101356079699439883  (current pin)
 *   [1] https://x.com/bunionrh/status/2101298583387451632  (first announcement)
 *
 * Plain constants with no env override. They are public the moment the page
 * renders, so there is nothing to hide, and an override meant a stale value
 * left in the host's dashboard could quietly beat the committed one — the
 * deployed links going wrong while local looked fine. Change them here.
 */
export const ACCEPTED_POST_IDS = [
  "2101356079699439883",
  "2101298583387451632",
] as const;

/** The post the quest links to and asks people to quote. */
export const PINNED_POST_ID = ACCEPTED_POST_IDS[0];

/** True when a quote points at any post we still accept. */
export function isAcceptedPost(id: string): boolean {
  return (ACCEPTED_POST_IDS as readonly string[]).includes(id);
}

export type QuestId = "follow" | "boost" | "quote" | "tag";

export type Quest = {
  id: QuestId;
  n: string;
  title: string;
  /** Line breaks are deliberate — rendered with `whitespace-pre-line`. */
  detail: string;
  cta: string;
  /** Rendered as a quotable block rather than buried in the prose. */
  phrase?: string;
  /** Quests that need the guest to paste back a link to their own post. */
  needsLink: boolean;
};

export const QUESTS: Quest[] = [
  {
    id: "follow",
    n: "01",
    title: `Follow @${X_ACCOUNT}`,
    detail: "Every trail starts at the same gate.\nThis is the gate.",
    cta: "Open X",
    needsLink: false,
  },
  {
    id: "boost",
    n: "02",
    title: "Like + repost the pinned post",
    detail: "Word travels slowly out here.\nGive it a push.",
    cta: "Open post",
    needsLink: false,
  },
  {
    id: "quote",
    n: "03",
    title: "Quote the pinned post",
    detail: "Quote it with:",
    phrase: QUOTE_PHRASE,
    cta: "Open post",
    needsLink: true,
  },
  {
    id: "tag",
    n: "04",
    title: "Tag 3 friends in the comments",
    detail: "Nobody crosses the Flats alone.\n\nThree friends.\nNo alts. No strays.",
    cta: "Open post",
    needsLink: false,
  },
];

export const QUEST_IDS = QUESTS.map((q) => q.id);

/**
 * A post link is only accepted if it points at a status on the connected
 * account — that is the one part of these quests the server can actually
 * check without paid X API access.
 */
const STATUS_URL_RE =
  /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:[/?#].*)?$/;

export type ParsedPostLink = { username: string; statusId: string };

export function parsePostLink(input: string): ParsedPostLink | null {
  const match = STATUS_URL_RE.exec(input.trim());
  if (!match) return null;
  return { username: match[1], statusId: match[2] };
}

export function linkBelongsTo(input: string, username: string): boolean {
  const parsed = parsePostLink(input);
  return (
    parsed !== null && parsed.username.toLowerCase() === username.toLowerCase()
  );
}

// --- Outbound X links -------------------------------------------------

export const pinnedPostUrl = (postId?: string) =>
  postId
    ? `https://x.com/${X_ACCOUNT}/status/${postId}`
    : `https://x.com/${X_ACCOUNT}`;

export const followUrl = () =>
  `https://x.com/intent/follow?screen_name=${X_ACCOUNT}`;

export const quoteIntentUrl = (postId?: string) =>
  `https://x.com/intent/post?text=${encodeURIComponent(QUOTE_PHRASE)}${
    postId ? `&url=${encodeURIComponent(pinnedPostUrl(postId))}` : ""
  }`;

/**
 * What someone posts after claiming, and the link that opens X with it ready
 * to send.
 *
 * Offered the moment the spot is theirs, because that is when they are most
 * willing to say so — a share asked for later is a share that doesn't happen.
 */
export const CLAIM_SHARE_TEXT = `I just claimed my Bunii GTD free mint @${X_ACCOUNT}`;

export const claimShareUrl = (siteUrl?: string) =>
  `https://x.com/intent/post?text=${encodeURIComponent(CLAIM_SHARE_TEXT)}${
    siteUrl ? `&url=${encodeURIComponent(siteUrl)}` : ""
  }`;

export function questLinkFor(id: QuestId, postId?: string) {
  if (id === "follow") return followUrl();
  if (id === "quote") return quoteIntentUrl(postId);
  return pinnedPostUrl(postId);
}

// --- Quest progress ---------------------------------------------------

export type QuestState = Record<QuestId, boolean | string>;

export const EMPTY_QUESTS: QuestState = {
  follow: false,
  boost: false,
  quote: "",
  tag: false,
};

/**
 * Mirrors the server-side guard in the allowlist route so the submit button
 * never claims to be ready when the API would reject the payload.
 */
export function isQuestDone(
  id: QuestId,
  state: QuestState,
  username?: string,
): boolean {
  const quest = QUESTS.find((q) => q.id === id);
  if (!quest) return false;
  if (!quest.needsLink) return state[id] === true;

  const parsed = parsePostLink(String(state[id] ?? ""));
  if (!parsed) return false;
  return !username || parsed.username.toLowerCase() === username.toLowerCase();
}

export function allQuestsDone(state: QuestState, username?: string): boolean {
  return QUESTS.every((q) => isQuestDone(q.id, state, username));
}
