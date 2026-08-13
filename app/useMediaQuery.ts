import { useCallback, useSyncExternalStore } from "react";

// Server render assumes the query does not match; React swaps in the real value on hydration.
// That direction is deliberate for every caller here: it means the server never commits to a
// preference it cannot know, and the conservative branch (no hover, motion allowed) is the one
// that costs nothing if it turns out to be wrong.
function getServerSnapshot(): boolean {
  return false;
}

/**
 * Tracks a CSS media query from JavaScript, staying in sync if the answer changes while the
 * page is open — a pointer being plugged in, or a preference toggled in the OS.
 *
 * `useSyncExternalStore` rather than an effect so the first client render already has the real
 * value: an effect would paint the server's answer for a frame first, which for the hover query
 * means mounting a video on a touch device and then unmounting it.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener('change', onStoreChange);
    return () => list.removeEventListener('change', onStoreChange);
  }, [query]);

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
