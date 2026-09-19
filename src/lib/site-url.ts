/**
 * Absolute origin for metadata. Vercel sets VERCEL_PROJECT_PRODUCTION_URL on
 * every deploy, so production and previews resolve OG images against the real
 * host without anything to configure by hand.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");
