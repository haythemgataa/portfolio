"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useHasHover } from "./useHasHover";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { cloudflareImageUrl } from "./lib/cloudflareImage";
import styles from "./GalleryPreview.module.css";
import type { ResolvedMedia } from "./lib/contentTypes";

/**
 * A 2x2 peek at the gallery, opening the CV directly under the shared About block.
 *
 * It sits *below* the tab bar, and that is load-bearing rather than incidental. The bar is
 * sticky and shared, so its resting height is decided by whatever is above it — putting this
 * up there, on the CV only, moved the bar 500px between routes and made it jump on every tab
 * switch. Below the bar, content is free to differ per route and the bar does not move.
 *
 * It is rendered by `Profile.tsx` (the CV page) rather than the layout, which is what lets it
 * be CV-only without asking which route is being rendered. `"use client"` is here for the
 * blur-up state below, nothing else.
 */

/** The widest a tile is ever shown: the 540px column, less the frame's border and padding
    and the gap between the two columns. Narrower viewports shrink it, which is the safe
    direction — the request below is then an over-fetch rather than an upscale. */
const TILE_WIDTH = (540 - 2 * 1 - 2 * 8 - 4) / 2;
/** Border-box, so the picture is the tile less its own border on each side. Asking Cloudflare
    for the whole tile would over-fetch and, with `fit: cover`, crop by two pixels. */
const TILE_BORDER = 1;
const TILE_INNER = TILE_WIDTH - 2 * TILE_BORDER;
/** Every tile is the same shape whatever its media is, so the grid reads as a set rather than
    as four differently-proportioned boxes. `object-fit: cover` absorbs the difference. */
const TILE_RATIO = 4 / 3;

/** The blurred stand-in, on the same terms as the lightbox's: 24px wide is well under a
    kilobyte, and it is about to be blurred into mush, so detail here is wasted bytes. */
const PLACEHOLDER_WIDTH = 24;
const PLACEHOLDER_QUALITY = 40;
const PLACEHOLDER_BLUR_PX = 12;
const PLACEHOLDER_FADE_MS = 320;

/** How far outside the block the pointer still lights it — the "or near" half of the request.
    The light is on its way in before the cursor arrives, which is what separates this from a
    hover state: a hover state is a fact about the box, and this is a fact about the pointer. */
const GLOW_PROXIMITY_PX = 120;

/**
 * Lights the nearest hairlines orange, under the cursor, and follows it.
 *
 * The drawing is entirely in CSS — five rings (the frame's and the four tiles'), each a radial
 * gradient masked to its own 1px border, so a ring only lights where it is within the
 * gradient's radius of the cursor. "The nearest borders" therefore falls out of the geometry
 * rather than being decided here: this hands each ring the cursor's position *in that ring's
 * own coordinates* and one shared strength, and the gradients do the rest. Nothing here knows
 * how many rings there are or where they sit, which is what keeps it right at every column
 * width and inside the Studio's canvas without a second arrangement.
 *
 * Five things about it:
 *
 * - **The rings are found, not listed.** `[data-glow]` is on the frame and on every tile, so a
 *   fifth tile or a changed grid needs nothing here.
 * - **Positions are measured every frame, and that is cheaper than caching them.** Writing a
 *   custom property that only a `background-image` reads invalidates paint and not layout, so
 *   the five reads that follow it never flush a layout — where a cache would need a
 *   `ResizeObserver` and would still be wrong the frame the column changes width.
 * - **A wheel scroll has to repaint it.** It moves the block under a stationary cursor, which
 *   changes every distance this measures without producing one `pointermove`. Without the
 *   scroll listener the light stays parked where the pointer last was and appears to travel
 *   along the border as the page moves. It listens in the *capture* phase because a scroll
 *   event does not bubble, and in the Studio the scroller is the canvas rather than the window.
 * - **Nothing is listening while the block is off screen.** A `pointermove` handler on the
 *   window otherwise runs for every mouse move anywhere on the page, for the whole session, to
 *   light something nobody can see. The observer's margin is the proximity zone, so the light
 *   is already live by the time the block's own edge appears.
 * - **A strength of zero is written once and then not again.** Leaving the zone has to reach
 *   the stylesheet — that is the fade out — but a pointer wandering the rest of the page must
 *   not keep writing it.
 */
function useBorderGlow(frameRef: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !enabled) return;

    const rings: HTMLElement[] = [frame, ...frame.querySelectorAll<HTMLElement>("[data-glow]")];
    let queued = 0;
    let pointer: { x: number; y: number } | null = null;
    let lit = false;

    const paint = () => {
      queued = 0;
      const box = frame.getBoundingClientRect();
      // Distance from the *box*, so anywhere over the block is zero and the ramp only starts
      // once the pointer is outside it. The `Math.max(…, 0, …)` per axis is what makes an
      // approach towards a corner measure diagonally instead of along whichever edge is nearer.
      const gap = pointer
        ? Math.hypot(
            Math.max(box.left - pointer.x, 0, pointer.x - box.right),
            Math.max(box.top - pointer.y, 0, pointer.y - box.bottom),
          )
        : Infinity;
      const strength = gap >= GLOW_PROXIMITY_PX ? 0 : 1 - gap / GLOW_PROXIMITY_PX;

      if (!strength && !lit) return;
      lit = strength > 0;
      frame.style.setProperty("--glow-strength", strength.toFixed(3));
      if (!pointer || !strength) return;

      for (const ring of rings) {
        const rect = ring.getBoundingClientRect();
        ring.style.setProperty("--glow-x", `${Math.round(pointer.x - rect.left)}px`);
        ring.style.setProperty("--glow-y", `${Math.round(pointer.y - rect.top)}px`);
      }
    };

    const schedule = () => {
      if (!queued) queued = requestAnimationFrame(paint);
    };

    const onMove = (event: PointerEvent) => {
      // A touch drag produces `pointermove` too, and there is no cursor for a light to follow
      // — the `useHasHover` question, asked of the event rather than the device because a
      // hybrid answers yes to both.
      if (event.pointerType === "touch") return;
      pointer = { x: event.clientX, y: event.clientY };
      schedule();
    };

    const onScroll = () => {
      if (pointer) schedule();
    };

    // The pointer leaving the window is not a move away from anything, so nothing would
    // otherwise put the light out.
    const release = () => {
      pointer = null;
      schedule();
    };

    const scrollOptions = { passive: true, capture: true } as const;
    const listen = () => {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("scroll", onScroll, scrollOptions);
      document.addEventListener("pointerleave", release);
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll, scrollOptions);
      document.removeEventListener("pointerleave", release);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          listen();
        } else {
          stop();
          release();
        }
      },
      { rootMargin: `${GLOW_PROXIMITY_PX}px` },
    );
    observer.observe(frame);

    return () => {
      observer.disconnect();
      stop();
      if (queued) cancelAnimationFrame(queued);
    };
  }, [frameRef, enabled]);
}

/**
 * One tile: the picture, with a tiny blurred copy of it standing over it until it arrives.
 *
 * The direction matters and is the same one `LightboxImage` argues for — only the stand-in
 * animates, and the real picture has no opacity of its own. A failure then leaves a blur up a
 * moment too long, where hiding the media until `load` would risk pinning a loaded picture
 * invisible behind a stand-in whose event never came.
 */
const PreviewTile: React.FC<{ media: ResolvedMedia; alt: string; priority: boolean }> = ({
  media,
  alt,
  priority,
}) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  /**
   * Checks before it subscribes. These four are small and eager, so one can easily be
   * `complete` before React attaches a listener — and an event that already fired is one you
   * never hear. `error` counts as done, so a broken file is not a permanent blur.
   */
  useEffect(() => {
    if (loaded) return;
    const node = imgRef.current;
    if (!node) return;

    if (node.complete && node.naturalWidth > 0) {
      // A timeout, not `requestAnimationFrame`: frames only run while the page paints, so in a
      // backgrounded tab rAF would never fire and the reader would come back to the stand-in
      // still up. The hop exists only to keep the set off the synchronous mount path.
      const timer = window.setTimeout(() => setLoaded(true), 0);
      return () => window.clearTimeout(timer);
    }

    const done = () => setLoaded(true);
    node.addEventListener("load", done);
    node.addEventListener("error", done);
    return () => {
      node.removeEventListener("load", done);
      node.removeEventListener("error", done);
    };
  }, [loaded]);

  return (
    // `data-glow` is what `useBorderGlow` finds; the ring itself is drawn by this class's
    // pseudo-elements, so a tile that is never pointed at costs nothing but two empty layers.
    <div className={styles.tile} data-glow>
      {/* A plain clipping span, and the blur is on the image inside it rather than on this.
          `filter` applies to the *result* of a clip, so blurring the clipping box would feather
          the blur straight back out past the edge the box exists to hold. */}
      <span className={styles.clip} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- a 24px fixed-size stand-in;
            next/image would add a wrapper and a srcset to something under a kilobyte. */}
        <img
          src={cloudflareImageUrl(media.url, {
            width: PLACEHOLDER_WIDTH,
            quality: PLACEHOLDER_QUALITY,
            dpr: 1,
          })}
          alt=""
          className={styles.placeholder}
          // Inline rather than in the stylesheet so how-far-along-is-this lives in one place,
          // next to the state that drives it, instead of split across a `data-` attribute.
          style={{
            opacity: loaded ? 0 : 1,
            filter: `blur(${loaded ? 0 : PLACEHOLDER_BLUR_PX}px)`,
            transition: `opacity ${PLACEHOLDER_FADE_MS}ms ease, filter ${PLACEHOLDER_FADE_MS}ms ease`,
          }}
        />
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element -- next/image cannot emit the
          Cloudflare variant URLs the rest of the site's media uses; `images.unoptimized` is on
          for the same reason. */}
      <img
        ref={imgRef}
        src={cloudflareImageUrl(media.url, {
          width: TILE_INNER,
          height: TILE_INNER / TILE_RATIO,
          fit: "cover",
        })}
        alt={alt}
        width={TILE_INNER}
        height={Math.round(TILE_INNER / TILE_RATIO)}
        className={styles.image}
        // Not lazy, and hinted: all four are above the fold on every viewport this column
        // fits, so deferring them only delays the thing the reader is looking at.
        loading="eager"
        fetchPriority={priority ? "high" : "low"}
        draggable={false}
      />
    </div>
  );
};

const ArrowRight12 = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M2.5 6H9.5M9.5 6L6.5 3M9.5 6L6.5 9"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const GalleryPreview: React.FC<{ items: ResolvedMedia[] }> = ({ items }) => {
  const frameRef = useRef<HTMLDivElement>(null);
  // Two questions, not one. Without a hovering pointer there is no cursor for the light to
  // follow at all; with reduced motion set, the whole effect *is* the motion — there is no
  // information in it to keep, the way `LocalTime` keeps its clock and drops the scramble — so
  // it is dropped rather than stilled, and the listeners are never attached.
  const hasHover = useHasHover();
  const reducedMotion = usePrefersReducedMotion();
  useBorderGlow(frameRef, hasHover && !reducedMotion);

  if (!items.length) return null;

  return (
    <section className={styles.wrap} aria-label="From the gallery">
      {/* The frame wears the unselected tab pill's fill and the hairline the media thumbnails
          carry, via the same tokens, so the three surfaces cannot drift apart. */}
      <div className={styles.frame} ref={frameRef} data-glow>
        {items.map((media, i) => (
          <PreviewTile
            key={media.url}
            media={media}
            // The gallery's captions deliberately stay on the gallery. These are decorative
            // here — the link below is what names the destination — so the accessible name
            // would be inventing text the author never wrote.
            alt=""
            priority={i < 2}
          />
        ))}
      </div>
      <Link href="/gallery" className={styles.more}>
        See more in Gallery
        <span className={styles.moreArrow}>
          {/* Zero-width space + `nowrap` on the span, the same trick the heading links use, so
              the arrow can never be left alone on a wrapped line. */}
          &#xfeff;
          <ArrowRight12 />
        </span>
      </Link>
    </section>
  );
};

export default GalleryPreview;
