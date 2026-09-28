"use client";

import { useEffect } from "react";
import { useHasHover } from "./useHasHover";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/**
 * One light, in the viewport's coordinates, that every lit edge on the page masks.
 *
 * It renders nothing. All it does is write the cursor's position and an on/off strength onto
 * `<html>`; `EdgeGlow.module.css` is where a border turns that into a ring of light, and each
 * host states where its own ring sits. The two halves are deliberately that lopsided — the
 * whole point of the arrangement is that adding a lit border costs no JavaScript at all.
 *
 * **The light is one light, not one per element, and `background-attachment: fixed` is what
 * makes that work.** A fixed background is positioned against the viewport rather than the
 * element, so a single `at var(--edge-glow-x) var(--edge-glow-y)` lands on the same spot of the
 * screen in every ring on the page. The first version of this — in the gallery teaser, now
 * folded into it — handed each ring the cursor in *its own* coordinates, which meant a rect
 * read and two writes per ring per frame and would not have survived being asked of forty of
 * them. This is two writes per frame whatever the page contains.
 *
 * Three things follow from the light being anchored to the screen rather than to the page, and
 * all three are deletions:
 *
 * - **No scroll handling.** Scrolling moves the borders *under* a stationary light, which is
 *   what a light in the room does; the teaser's version had to listen for scroll precisely
 *   because its coordinates were per element.
 * - **No `IntersectionObserver`.** There is nothing per-element to switch on and off.
 * - **No proximity ramp.** How near the pointer has to be is the gradient's own falloff, so
 *   "in or near" is decided once, in CSS, rather than measured per box. `--edge-glow-strength`
 *   is now only the pointer's presence: the fade when it leaves the window, and the reason a
 *   page that has never been pointed at draws nothing.
 *
 * **The one exception is a host that cannot use the viewport's coordinates**, and it is why
 * this is not purely two writes. A `transform` on a lit element makes it the containing block
 * for its own fixed background, so the shared light re-anchors to that element's box and lands
 * outside it — which is what happens to a thumbnail while it is hovered and lifted. Such a host
 * marks itself `data-edge-glow-local` and gets `--edge-glow-at` written with the cursor in its
 * *own* coordinates instead, which is continuous with the shared light rather than a second
 * treatment: both put the light on the same point of the screen, so the handover as the pointer
 * leaves is invisible. Centring it on the element was the first attempt and it flashed, because
 * a whole ring lit at once is not what the light a pixel outside the element was doing.
 *
 * It costs one `:hover` selector match and one rect read per frame, and only while such an
 * element is under the pointer. The element's own rotation is ignored: at 1.2° across 140px
 * that is under 1.5px of error on a soft 90px light, where correcting it would mean inverting
 * the transform matrix per frame.
 *
 * Gated on a hovering pointer *and* on motion being allowed. With reduced motion this is
 * dropped rather than stilled — unlike `LocalTime`'s clock there is no information under the
 * animation to keep — and nothing paints, because every ring's opacity resolves through a
 * `--edge-glow-strength` that is then never written.
 */
export default function EdgeGlow() {
  const hasHover = useHasHover();
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!hasHover || reducedMotion) return;

    const root = document.documentElement;
    let queued = 0;
    let x = 0;
    let y = 0;
    let lit = false;
    let local: HTMLElement | null = null;

    const paint = () => {
      queued = 0;
      root.style.setProperty("--edge-glow-x", `${x}px`);
      root.style.setProperty("--edge-glow-y", `${y}px`);
      if (!lit) {
        lit = true;
        root.style.setProperty("--edge-glow-strength", "1");
      }

      // The exception above. `:hover` rather than a pointerover/pointerout pair of our own,
      // because the CSS that switches such a host off the viewport's coordinates is keyed on
      // `:hover` too — one condition, so the two cannot disagree about when it applies.
      const hovered = document.querySelector<HTMLElement>("[data-edge-glow-local]:hover");
      if (hovered !== local) {
        local?.style.removeProperty("--edge-glow-at");
        local = hovered;
      }
      if (hovered) {
        const box = hovered.getBoundingClientRect();
        hovered.style.setProperty("--edge-glow-at", `${x - box.left}px ${y - box.top}px`);
      }
    };

    const onMove = (event: PointerEvent) => {
      // A touch drag produces `pointermove` too, and there is no cursor for a light to follow —
      // the `useHasHover` question, asked of the event rather than the device because a hybrid
      // answers yes to both.
      if (event.pointerType === "touch") return;
      x = event.clientX;
      y = event.clientY;
      if (!queued) queued = requestAnimationFrame(paint);
    };

    // The pointer leaving the window is not a move away from anything, so nothing else would
    // put the light out.
    const release = () => {
      lit = false;
      root.style.setProperty("--edge-glow-strength", "0");
      local?.style.removeProperty("--edge-glow-at");
      local = null;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", release);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", release);
      if (queued) cancelAnimationFrame(queued);
      for (const name of ["--edge-glow-x", "--edge-glow-y", "--edge-glow-strength"]) {
        root.style.removeProperty(name);
      }
      local?.style.removeProperty("--edge-glow-at");
    };
  }, [hasHover, reducedMotion]);

  return null;
}
