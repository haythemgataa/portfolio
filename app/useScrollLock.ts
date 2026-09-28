"use client";

import { useEffect } from "react";

/**
 * The scroll lock is reference-counted at module scope rather than per instance.
 *
 * Each instance used to save the inline values it found and put them back on unmount, which is
 * correct for one overlay and destructive for two: the second saves the *locked* values, and
 * whichever unmounts last writes `overflow: hidden` and the gutter padding back onto the
 * document — leaving the page unscrollable with nothing open and no way to recover but a reload.
 * Counting means the values are captured once, on the way in, and restored once, on the way out.
 *
 * **That is also why this is a shared hook rather than a copy in each overlay.** The counter *is*
 * module state, so a second copy of this file gets a second counter and a second `lockedStyles`,
 * and the bug above comes straight back — silently, and only for someone who has opened both
 * overlays in one session. There are two callers now (`Lightbox.tsx` and the colophon dialog in
 * `Colophon.tsx`); any third must import this one rather than restate it.
 */
let scrollLocks = 0;
let lockedStyles: { body: string, html: string, padding: string } | null = null;

/**
 * Holds the page still for as long as the calling component is mounted.
 *
 * Restores the previous inline values rather than writing 'unset'. `globals.css` sets
 * `overflow-x: hidden` on html/body, and an inline `overflow: unset` overrides it — so clearing
 * that way leaves the page horizontally scrollable after the overlay closes.
 *
 * The padding is what stops the page jumping. Locking the scroll takes the scrollbar away, which
 * widens the viewport by its width and slides the centred content column sideways by half of
 * that — 7.5px at a 15px scrollbar — then back again on close, which is the visible snap as the
 * scrollbar returns. Reserving the same width as padding on the element that lost it keeps every
 * box exactly where it was, so nothing reflows in either direction.
 *
 * `scrollbar-gutter: stable` would be the declarative version of this and does not work: the
 * gutter is dropped as soon as `overflow` becomes `hidden` (measured — `clientWidth` still jumps
 * the full 15px), so the width has to be measured and put back by hand. It measures 0 with overlay
 * scrollbars, which is exactly right — nothing was taken away, so nothing is added.
 */
export function useScrollLock(): void {
  useEffect(() => {
    const html = document.documentElement;

    if (scrollLocks === 0) {
      lockedStyles = {
        body: document.body.style.overflow,
        html: html.style.overflow,
        padding: html.style.paddingRight,
      };

      const gutter = window.innerWidth - html.clientWidth;

      document.body.style.overflow = 'hidden';
      html.style.overflow = 'hidden';
      if (gutter > 0) {
        html.style.paddingRight = `${gutter}px`;
      }
    }
    scrollLocks += 1;

    return () => {
      scrollLocks -= 1;
      if (scrollLocks > 0 || !lockedStyles) { return }
      document.body.style.overflow = lockedStyles.body;
      html.style.overflow = lockedStyles.html;
      html.style.paddingRight = lockedStyles.padding;
      lockedStyles = null;
    };
  }, []);
}
