import { useMediaQuery } from "./useMediaQuery";

/**
 * Whether the primary pointer can hover — the JavaScript half of the `hover: hover` gate the
 * stylesheets already use.
 *
 * It exists because hovering a thumbnail is what fetches its video preview, and that has to be
 * a question about the device rather than about the event: `pointerenter` fires on a touch tap
 * too, and a tap on a thumbnail is a request to open the lightbox, not to spend megabytes
 * loading a preview of something that is about to be covered up.
 */
export function useHasHover(): boolean {
  return useMediaQuery('(hover: hover)');
}
