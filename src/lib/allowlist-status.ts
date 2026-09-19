/**
 * Hard kill-switch for new allowlist applications.
 *
 * Flip this to false and redeploy to shut submissions off from source — for
 * when something is wrong and a deploy is the fastest lever available.
 */
export const ALLOWLIST_OPEN = true;

export const signupsOpen = () => ALLOWLIST_OPEN;
