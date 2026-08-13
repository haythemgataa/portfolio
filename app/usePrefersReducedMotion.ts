import { useMediaQuery } from "./useMediaQuery";

/**
 * Tracks the user's reduced-motion preference, staying in sync if they change it while
 * the page is open.
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
