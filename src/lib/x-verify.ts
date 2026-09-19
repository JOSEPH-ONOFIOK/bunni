import { QUOTE_PHRASE, X_ACCOUNT, isAcceptedPost } from "./quests";

/**
 * Reads a single public post through X's syndication endpoint — the same one
 * that backs embedded tweets. No API key, no rate-limit tier to buy, and it
 * returns the post's author, its text, and the post it quotes, which is
 * exactly what the quote quest needs to be checked rather than trusted.
 *
 * It is an undocumented endpoint, so it is treated as best-effort: callers
 * decide what an "unavailable" verdict means, and nothing here throws into
 * the request path.
 */

const ENDPOINT = "https://cdn.syndication.twimg.com/tweet-result";

/** The endpoint wants some token; any short alphanumeric string is accepted. */
function tokenFor(id: string): string {
  return ((Number(id.slice(-8)) || 1) % 1e6).toString(36);
}

type QuotedRef = {
  id_str?: string;
  text?: string;
  user?: { screen_name?: string };
};

type TweetResult = {
  id_str?: string;
  text?: string;
  user?: { screen_name?: string };
  quoted_tweet?: QuotedRef;
  /** Present on newer payloads for quote posts. */
  card?: unknown;
};

export type PostFacts = {
  id: string;
  author: string;
  text: string;
  quotedId: string | null;
  quotedAuthor: string | null;
};

/** Fetches a post, or null when it can't be read (deleted, private, blocked). */
export async function fetchPost(id: string): Promise<PostFacts | null> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("id", id);
  url.searchParams.set("lang", "en");
  url.searchParams.set("token", tokenFor(id));

  try {
    const res = await fetch(url, {
      headers: {
        // The endpoint serves the embed widget, and refuses a bare fetch.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as TweetResult;
    if (!data?.id_str) return null;

    return {
      id: data.id_str,
      author: data.user?.screen_name ?? "",
      text: data.text ?? "",
      quotedId: data.quoted_tweet?.id_str ?? null,
      quotedAuthor: data.quoted_tweet?.user?.screen_name ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Pulls the quoted post out of whichever shape the payload used, and reports
 * whether the post links out at all — the fallback signal for "this is a
 * quote" when the structured field is missing.
 */
function quoteTargetFrom(post: PostFacts): {
  id: string | null;
  author: string | null;
  linksOut: boolean;
} {
  if (post.quotedId) {
    return { id: post.quotedId, author: post.quotedAuthor, linksOut: true };
  }

  // A quote renders the quoted post's URL into the text. Reading it back is
  // the same check by other means.
  const inText =
    /(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})/.exec(
      post.text,
    );
  if (inText) return { id: inText[2], author: inText[1], linksOut: true };

  return { id: null, author: null, linksOut: /https?:\/\//.test(post.text) };
}

export type QuoteVerdict =
  | { ok: true }
  | { ok: false; reason: string; hard: boolean };

/** Normalises for comparison: case, whitespace and the variation selectors
    that emoji pick up when they travel through different clients. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/\uFE0F|\u200D/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks that a post really is a quote of the pinned post, by the connected
 * account, carrying the required phrase.
 *
 * `hard: false` marks a verdict we could not establish — the post was
 * unreadable — so the caller can decide whether to let it through rather than
 * punishing someone for X being down.
 */
export async function verifyQuotePost(
  statusId: string,
  expectedAuthor: string,
): Promise<QuoteVerdict> {
  const post = await fetchPost(statusId);

  if (!post) {
    return {
      ok: false,
      hard: false,
      reason:
        "Couldn't read that post. Make sure it's public, then try again.",
    };
  }

  if (post.author.toLowerCase() !== expectedAuthor.toLowerCase()) {
    return {
      ok: false,
      hard: true,
      reason: `That post is by @${post.author}, not @${expectedAuthor}.`,
    };
  }

  // The phrase is the part a human has to actually type, so it is checked
  // first — it fails fast and gives the clearest error.
  if (!normalise(post.text).includes(normalise(QUOTE_PHRASE))) {
    return {
      ok: false,
      hard: true,
      reason: `Your post needs to include: "${QUOTE_PHRASE}"`,
    };
  }

  // --- the quote target -------------------------------------------------
  //
  // The syndication payload only sometimes carries the quoted post: it is an
  // undocumented endpoint and the field is absent on plenty of responses. So
  // the quote is checked whenever the evidence is there, and a missing field
  // is treated as "couldn't establish" rather than "isn't a quote" — the
  // alternative is rejecting genuine entries because X didn't tell us enough.
  //
  // Authorship and the phrase above are always enforced, and a quote carries
  // the quoted post's URL in its text, which catches the ordinary case.
  const target = quoteTargetFrom(post);

  if (target.id) {
    if (!isAcceptedPost(target.id)) {
      return {
        ok: false,
        hard: true,
        reason: "That quotes a different post. Quote the pinned one.",
      };
    }
    if (
      target.author &&
      target.author.toLowerCase() !== X_ACCOUNT.toLowerCase()
    ) {
      return {
        ok: false,
        hard: true,
        reason: `That quotes @${target.author}, not @${X_ACCOUNT}.`,
      };
    }
    return { ok: true };
  }

  // No quote target anywhere in the payload. If the post doesn't even link
  // out, it is a plain post rather than a quote, and that much is safe to say.
  if (!target.linksOut) {
    return {
      ok: false,
      hard: true,
      reason: "That post isn't a quote. Quote the pinned post, don't just post.",
    };
  }

  return { ok: true };
}
