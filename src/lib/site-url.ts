/**
 * Absolute origin for metadata.
 *
 * Every candidate is trimmed and checked before it is used, because an env var
 * that exists but is blank is the common case: a host's dashboard stores an
 * empty string rather than removing the key, and `??` only falls through on
 * null/undefined — so a blank value would sail past it and reach `new URL("")`,
 * which throws `ERR_INVALID_URL` and fails the production build.
 */

/** A candidate is only usable if it actually parses as an absolute URL. */
function usable(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  // A bare host (`bunii.vercel.app`) is a normal thing to paste into a
  // dashboard field, so it gets a scheme rather than being thrown away.
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

/**
 * Vercel sets VERCEL_PROJECT_PRODUCTION_URL on every deploy, so production and
 * previews resolve OG images against the real host with nothing to configure.
 */
export const SITE_URL =
  usable(process.env.NEXT_PUBLIC_SITE_URL) ??
  usable(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
  usable(process.env.VERCEL_URL) ??
  "http://localhost:3000";
