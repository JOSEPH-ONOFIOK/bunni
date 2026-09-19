Written for: anyone picking this repo up, including future you.

# BUNII

A free-mint bunny PFP drop. One scroll-driven world of five realms, and an
X-gated allowlist behind it.

- **Live:** <https://bunii.fun>
- **Vercel URL:** <https://bunni-tau.vercel.app> — the same deploy; every page
  canonicalises to `bunii.fun`, so search engines treat that as the real one.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · framer-motion ·
react-icons

## The site

`/` is a single scroll-driven journey. One full-viewport stop per realm plus a
join stop at the end, all pinned with `position: sticky` while the page's own
vertical scroll drives which stop is active — so a plain mouse, trackpad,
scrollbar, keyboard and touch all work without anything being intercepted.

| Piece | File | What it does |
| --- | --- | --- |
| Journey | [Journey.tsx](src/components/Journey.tsx) | The stops, the pager, the ground, and the scroll→stop mapping |
| Sky | [Sky.tsx](src/components/Sky.tsx) | Every realm's sky stacked and cross-faded by journey position, with the drifting clouds |
| Countdown | [use-countdown.ts](src/components/use-countdown.ts) | One shared clock for the page, ticking at second granularity |

Sky, ground and panels all read one spring-smoothed `progress` value, so they
move as parts of the same world rather than as independent animations. All
motion is gated behind `prefers-reduced-motion` in
[globals.css](src/app/globals.css).

## The allowlist

`/join` opens on the pitch. Pressing **Enter** reveals the four quests and the
wallet field beneath them — local state, not a second route, so the press costs
no navigation and quest progress survives it.

The flow is: connect X → clear four quests → submit a wallet → get an invite
code.

**Connect X** is OAuth 2.0 with PKCE ([x-oauth.ts](src/lib/x-oauth.ts)). The
callback exchanges the code, reads `/2/users/me`, and stores *only* the identity
in an HMAC-signed, httpOnly cookie ([x-session.ts](src/lib/x-session.ts)) — the
access token is never persisted. The handle on a submission comes from that
session, never from the request body, so nobody can claim an account they don't
control.

### What is and isn't verified

The quote quest is the gate, because it is the one step X lets us check without
a paid API tier. The post is read back through the syndication endpoint
([x-verify.ts](src/lib/x-verify.ts)) and checked for real authorship and the
required phrase; the steps after it stay locked and submit stays disabled until
it passes. Pasting someone else's post URL with your own handle in the path
fails, because the author comes from X's response rather than the URL.

Follows, likes and reposts cannot be read on the free tier, so those three steps
are attestations — but they can't be used to skip the enforced one. Every
submission stores the verified X user id, so the sheet can be audited after the
fact.

One limit worth knowing: the syndication payload doesn't always expose the
quoted post. When it doesn't, the verifier falls back to reading the quoted URL
out of the post text, and passes rather than falsely rejecting a real entry.
Closing that fully needs a paid API tier; the place to add it is
`quoteTargetFrom` in [x-verify.ts](src/lib/x-verify.ts).

## Storage

Submissions go to a Google Apps Script web app — see
[scripts/apps-script/README.md](scripts/apps-script/README.md) for the deploy
guide. The local `data/allowlist.json` fallback is development only: a
serverless filesystem is read-only, so anything written there in production is
lost with the instance.

## Running it

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill it in. Everything is optional for a
local run — with no X credentials the connect step is skipped and the handle you
type is taken at face value.

| Variable | Needed for |
| --- | --- |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | The connect-X step. App permissions **Read**, type **Web App** |
| `SESSION_SECRET` | Signing the session cookie. 32+ random chars, **required in production** |
| `GOOGLE_SHEETS_WEBAPP_URL` | Durable storage. **Required in production** |
| `NEXT_PUBLIC_SITE_URL` | Only on a non-Vercel host; Vercel infers it |

Register both callbacks on the X app:
`https://bunii.fun/api/x/callback` and
`http://localhost:3000/api/x/callback`. X compares them byte for byte.

## Before launch

- [ ] Set `X_ACCOUNT` and `PINNED_POST_ID` in [quests.ts](src/lib/quests.ts) —
      both are placeholders. Without the pinned id the gate can only require a
      quote of the account, not of that specific post.
- [ ] Set `DROP.closesAt` in [bunnies.ts](src/lib/bunnies.ts) to the real
      closing time. The countdown reads from it and flips to "Allowlist closed"
      on its own.
- [ ] Delete any test rows from the allowlist sheet so the counter starts at 0.
