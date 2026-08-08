import { useSyncExternalStore } from "react";

let isMobileValue: null | boolean = null;
function isMobile(): boolean {
  // When rendering on the server, return false and do not cache the value.
  if (typeof window === 'undefined') {
    return false;
  }

  if (isMobileValue === null) {
    const prefixes = ' -webkit- -moz- -o- -ms- '.split(' ');
    if ('ontouchstart' in window) {
      isMobileValue = true;
    } else {
      const query = ['(', prefixes.join('touch-enabled),('), 'heartz', ')'].join('');
      isMobileValue = window.matchMedia(query).matches;
    }
  }
  return isMobileValue;
}

// The value never changes for the life of the page, so there is nothing to subscribe to.
const subscribe = () => () => {};

/**
 * Reads the cached touch-capability check in a hydration-safe way: the server snapshot is
 * always false, and React swaps in the real client value after hydration without the
 * cascading re-render that a setState-in-effect would cause.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, isMobile, () => false);
}

export default isMobile;
