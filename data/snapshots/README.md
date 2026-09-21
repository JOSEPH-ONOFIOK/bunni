# Holder snapshots

One file per community: `<slug>.txt`, one wallet per line.

Blank lines and `#` comments are ignored, casing doesn't matter, and a CSV
export works too — the first column of each row is read.

The slugs must match `COMMUNITIES` in `src/lib/communities.ts`:

```
bull-runners      cash-cats         gremlin-cartel    clay-stonkz
monkeyhood        internet-monkes   pyopyopyopyo      blokyz
rh-machine        quotrons          script-kiddies    wif-outlaws
onchainhoodies    h00dle
```

A community with no file here simply has nobody eligible — the page still
renders and the claim just refuses.

**These files are gitignored**, since a holder list is data rather than code
and can be large. In production they have to ship with the deploy or live
somewhere the server can read; a serverless filesystem is read-only, so
anything written at runtime is lost.
