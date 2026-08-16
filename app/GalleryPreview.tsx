"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
    <div className={styles.tile}>
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
  if (!items.length) return null;

  return (
    <section className={styles.wrap} aria-label="From the gallery">
      {/* The frame wears the unselected tab pill's fill and the hairline the media thumbnails
          carry, via the same tokens, so the three surfaces cannot drift apart. */}
      <div className={styles.frame}>
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
