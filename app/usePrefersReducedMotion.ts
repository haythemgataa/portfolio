import { useSyncExternalStore } from "react";

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onStoreChange: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener('change', onStoreChange);
  return () => query.removeEventListener('change', onStoreChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

// Server render assumes motion is allowed; React swaps in the real value on hydration.
function getServerSnapshot(): boolean {
  return false;
}

/**
 * Tracks the user's reduced-motion preference, staying in sync if they change it while
 * the page is open.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
