/**
 * Simple Analytics' event API, and the one guard every call to it needs.
 *
 * This is to `Analytics.tsx` what `lib/theme.ts` is to `ThemeScript.tsx`: the component renders
 * the tag, and the fact the rest of the app has to reach for lives beside the type instead of
 * being restated at each call site.
 *
 * **The guard is "is the script there", not "is this the production branch", and that is the
 * point.** `Analytics.tsx` emits no tag off the production branch, so on a dev deploy and in local
 * dev `sa_event` simply does not exist and every call is a no-op — no second copy of
 * `IS_PRODUCTION_DEPLOY` to keep in step. It covers the case a branch check cannot, too: a reader
 * with an ad blocker, or any visit where the CDN did not answer, where a call that assumed the
 * function was present would throw inside an event handler.
 *
 * **There is deliberately no queue stub.** Simple Analytics documents a 130-byte inline shim
 * (`window.sa_event.q`) that holds events fired before the async script has landed, and the site
 * does not carry it, because nothing here can fire that early: the only event today needs the
 * reader at the bottom of a 5,400px document with a ~6s animation already finished behind them.
 * A blocking script in every page's `<head>` — restated in `global-not-found.tsx`, which has no
 * footer to clap at all — would be paid by every visit to insure an event that cannot happen.
 * Add it if something ever needs to report during load; do not add it because it is the
 * documented setup.
 */

/**
 * Simple Analytics takes a flat key/value object: nesting, arrays, functions and falsy values are
 * all rejected, booleans excepted. So a value that might come back empty needs a fallback at the
 * call site rather than being passed through and silently dropping the field.
 */
export type EventMetadata = Record<string, string | number | boolean>;

declare global {
  interface Window {
    sa_event?: (name: string, metadata?: EventMetadata) => void;
  }
}

/**
 * Records one event, if anything is listening.
 *
 * `name` must be alphanumeric and underscores to arrive as written — Simple Analytics lowercases
 * it and coerces anything else to a valid form rather than rejecting it, which means a typo does
 * not fail loudly, it quietly becomes a second event name in the dashboard.
 *
 * The `window` check is not for any caller that exists today — every one of them is a pointer
 * handler in a client component — but this module is importable from a server component, where
 * the reward for reaching for it would otherwise be a build-time crash.
 */
export function trackEvent(name: string, metadata?: EventMetadata): void {
  if (typeof window === "undefined") return;
  window.sa_event?.(name, metadata);
}
