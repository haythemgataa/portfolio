"use client"

import { useRef, useState, useCallback } from "react";
import Image from "next/image";
import Scrollbar from "./Scrollbar";
import Lightbox from "./Lightbox";
import { AnimatePresence } from "framer-motion";
import { useScrollBoost } from 'react-scrollbooster';
import isMobile from "./isMobile";
import useResizeObserver from "use-resize-observer";
import { useHasHover } from "./useHasHover";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import styles from "./Attachments.module.css";

import { cloudflareImageUrl } from "./lib/cloudflareImage";

/** Height of the thumbnail row. Every thumbnail's width follows from it and the media's ratio. */
const THUMBNAIL_HEIGHT = 90;

/**
 * The thumbnail's two frame layers, in px: an outer border and the mat between it and the
 * image. Declared here rather than in the stylesheet because three things are derived from
 * them — the frame's width, the size of the Cloudflare request, and the CSS itself, which
 * receives them as custom properties. One source of truth, so they cannot drift.
 *
 * The border is on both treatments. It began as the mat's edge, but the light rim reads well on
 * an unmatted thumbnail too — especially against the hover shadow, which is what it is there
 * for — so `imageBox` is now the only thing that distinguishes them.
 */
const THUMBNAIL_BORDER = 2;
const THUMBNAIL_PADDING = 12;

/** Total inset from the frame's outer edge to the image on every side. */
const THUMBNAIL_INSET = THUMBNAIL_BORDER + THUMBNAIL_PADDING;

/**
 * The shape every matted thumbnail takes, whatever the media's own ratio. Locking it is the
 * point of the treatment: a row of mats all the same size reads as a set, and the image
 * floats inside at its own proportions.
 */
const MATTED_RATIO = 14 / 9;

const MAX_THUMBNAIL_RATIO = 21 / 9;   // ultrawide monitor
const MIN_THUMBNAIL_RATIO = 19 / 5 / 9; // iPhone

/**
 * How far one press of an edge arrow travels, as a share of the visible width. Short of a
 * full page so a thumbnail or two stays on screen across the jump, which is what keeps the
 * reader's place in the row.
 */
const ARROW_STEP = 0.8;

/**
 * How many thumbnails of the one above-the-fold row are hinted `high`.
 *
 * Priority has to be rationed, not spread: a hint given to everything is a hint given to
 * nothing. Only the row `priority` names is on screen at load, and only its leading
 * thumbnails are visible within it.
 */
const PRIORITY_THUMBNAILS = 3;

/**
 * Past this point in a row that is not on screen, a thumbnail is hinted `low`, so that when a
 * reader does scroll, the row's leading edge — the part they are looking at — arrives first.
 */
const DEPRIORITISE_AFTER = 3;

/**
 * Every thumbnail is fetched at load; only the *order* is rationed, via `fetchPriority` above.
 * None of them are `loading="lazy"`, and that is a deliberate reversal.
 *
 * Lazy is the obvious choice and was the wrong one here, because the tabs are real routes.
 * Switching to /gallery unmounts this whole tree and destroys every `<img>` in it — decoded
 * pixels belong to the element, not to the URL — so coming back builds a fresh element for
 * every thumbnail, with no memory of having been loaded a moment earlier. Each one then needs
 * the browser to decide, from scratch, to fetch it. Chrome settles that on the next scroll;
 * WebKit does not reliably settle it at all, which showed up on iOS as thumbnails that had
 * been on screen before the round trip and came back blank for good. Measured on the live
 * site: 0 of 44 elements survive the navigation, and the return trip issues 0 requests.
 *
 * What makes eager affordable is the resizing that came before it. The whole set is ~190 KB of
 * AVIF — less than one of the source images it replaced — and on the return trip it is served
 * from cache as `immutable`, so the second visit costs no network at all. The competition
 * `loading="eager"` used to cause was a problem when these were full-size originals; at 2-6 KB
 * apiece the `fetchPriority` hints are enough to keep the order right.
 */
const THUMBNAIL_LOADING = "eager" as const;

/** Chevron for the edge arrows. Mirrored with a transform for the leading edge. */
const Chevron = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path
      d="M4.5 2.5L8 6L4.5 9.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * The play glyph on a video thumbnail's badge. Inline rather than a file for the same reason
 * the chevron above is: it is one monochrome path taking its colour from the element around it,
 * and an `<img>` would be a request and a second copy to keep in step with the theme.
 *
 * Rounded joins rather than a bare triangle, to match the chevron — at 10px a sharp apex reads
 * as a stray pixel.
 *
 * The path is positioned against its *stroke-inclusive* box, which is what the eye sees and is
 * 0.7 wider than the geometry on every side at this stroke width. Vertically that box is dead
 * centre (2.2 to 7.8). Horizontally it is centred on 5.25 rather than 5: a right-pointing
 * triangle carries its area toward the base, so its centroid sits left of its bounding box and
 * it reads as left-shifted when centred geometrically. A quarter-unit is the whole correction —
 * the badge's own `place-items: center` does the rest, and nothing outside this path should be
 * nudging it.
 */
const PlayGlyph = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path
      d="M3.35 2.9 7.15 5 3.35 7.1Z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * What the geometry below needs of a resolved asset. Narrower than `ResolvedMedia` on purpose:
 * these are pure functions of a shape and a flag, and nothing here should be able to reach for
 * a URL.
 */
type Measured = { width: number; height: number; framed?: boolean };

/** The media's own ratio, clamped. Only used by unmatted thumbnails, which take their shape. */
function thumbnailRatio(media: Measured): number {
  const ratio = media.width / media.height;
  if (ratio < MIN_THUMBNAIL_RATIO) { return MIN_THUMBNAIL_RATIO }
  if (ratio > MAX_THUMBNAIL_RATIO) { return MAX_THUMBNAIL_RATIO }
  return ratio;
}

/**
 * The box a thumbnail occupies once the row is laid out — the *outer* box, border included.
 *
 * Unmatted, the shape that has to match the media's is the box the image actually fills, which
 * is inside the rim: `box-sizing: border-box` means the border eats into this width, so the ratio
 * is applied to the inner height and the border added back afterwards. Applying it to the outer
 * height instead makes the inner box slightly the wrong shape, and `object-fit` answers that with
 * a bar down each side — about 1.4px at 90px tall, which is exactly what appeared when the rim
 * was extended to unmatted thumbnails.
 */
function thumbnailWidth(media: Measured, height: number): number {
  if (media.framed) { return Math.round(MATTED_RATIO * height) }
  const inner = height - THUMBNAIL_BORDER * 2;
  return Math.round(thumbnailRatio(media) * inner) + THUMBNAIL_BORDER * 2;
}

/**
 * The image's own box inside a matted frame: its ratio, scaled to fit the padded box, so the
 * inset is the padding on the constraining axis and more than that on the other — a print
 * centred in a mat. The shadow is drawn on this box, which is why it has to be the image's
 * shape and not the mat's: a shadow around the padded box would outline the mat's inner edge
 * with wash showing inside it.
 */
function imageBox(media: Measured, frameWidth: number, frameHeight: number) {
  const available = { width: frameWidth - THUMBNAIL_INSET * 2, height: frameHeight - THUMBNAIL_INSET * 2 };
  const ratio = thumbnailRatio(media);
  if (ratio > available.width / available.height) {
    return { width: available.width, height: Math.round(available.width / ratio) };
  }
  return { width: Math.round(available.height * ratio), height: available.height };
}

type AttachmentsProps = {
  attachments: Array<any>,
  label?: string,
  /**
   * True for the one row that is on screen when the page loads. Decided in `Profile.tsx`,
   * which is the only place that knows where a row sits in the document — a row cannot tell
   * from its own index, because every item renders its own.
   */
  priority?: boolean,
  /**
   * Overrides what pressing a thumbnail does. Absent — every case on the site — a press opens
   * the lightbox, which is the row's whole purpose.
   *
   * It exists for the Studio, whose canvas renders this exact row so that what an author sees
   * is what the page shows. There a press means "edit this asset's facts", not "look at it
   * bigger", and the alternative to one optional prop was a second thumbnail renderer carrying
   * a copy of this file's geometry — the frame arithmetic, the mat, the fades, the drag. A copy
   * of that is a copy that drifts, and it would drift in the direction that matters most: the
   * editor would stop showing what the site renders.
   */
  onSelect?: (index: number) => void,
};
const Attachments: React.FC<AttachmentsProps> = ({
  attachments,
  label,
  priority = false,
  onSelect,
}) => {
  const [lightboxState, setLightboxState] = useState({
    open: false,
    startingIndex: 0,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  /**
   * Whether the row has content hidden past each edge, which is what gates the fades that
   * replaced the flat cut there — the same idea as the tab bar's fade being gated on `data-stuck`.
   * A permanent fade would dim the first and last thumbnails when there is nothing beyond them
   * to suggest, so each side is only softened while it actually has something to hide.
   */
  const [overflow, setOverflow] = useState({ start: false, end: false });

  const measureOverflow = useCallback(() => {
    const el = containerRef.current;
    const row = innerRef.current;
    if (!el || !row) { return }

    // Compared against the container's *border box*, because that is exactly where the mask fades
    // and where the clip happens: the question each side asks is "does the row cross this edge".
    // Rectangles rather than `scrollLeft` vs `scrollWidth - clientWidth` on purpose — that test
    // has to agree with wherever `--hover-room` currently lives, and it did not when the room was
    // padding on this container, which left the trailing edge faded with nothing behind it. Both
    // boxes here include the room whoever owns it, so the comparison cannot go stale.
    const box = el.getBoundingClientRect();
    const content = row.getBoundingClientRect();
    // A pixel of slack for sub-pixel layout, so a row that exactly fits is not softened.
    const start = content.left < box.left - 1;
    const end = content.right > box.right + 1;
    setOverflow(prev => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  const [viewport, scrollbooster] = useScrollBoost({
    direction: 'horizontal',
    friction: 0.05,
    scrollMode: 'native',
    textSelection: false,
    // Every thumbnail is a <button>, and Scrollbooster's `inputsFocus` default aborts
    // `pointerdown` outright when the target is one of input/textarea/button/select/label — so a
    // press that landed on the button rather than on the <img> inside it started no drag at all.
    // On a matted thumbnail the mat is a 14px band of button surface around the print, which is
    // why the row seemed to drag only *sometimes*: it depended on whether the grab happened to
    // land on the picture. There is nothing here that wants focus-on-press instead of dragging.
    inputsFocus: false,
    onUpdate: (data) => {
      if (containerRef.current) {
        containerRef.current.scrollLeft = data.position.x;
      }
    },
    shouldScroll: () => { return !isMobile() }
  });

  const updateScrollbooster = () => {
    if (!scrollbooster || !containerRef.current) {
      return;
    }
    scrollbooster.updateMetrics();
  };

  const onResize = () => {
    updateScrollbooster();
    // Resizing changes what fits, so an edge can gain or lose its hidden content without the
    // row being scrolled at all.
    measureOverflow();
  }

  const setRefs = useCallback<React.RefCallback<HTMLDivElement>>(node => {
    containerRef.current = node;
    viewport(node);
    onResize();
  }, [viewport]);

  /**
   * Step the row along, for readers who would rather press than drag.
   *
   * Routed through Scrollbooster's own `scrollTo` rather than the native one so the two never
   * disagree about where the row is: it eases with the same friction a flick does, and its
   * `onUpdate` is what writes `scrollLeft`. It deliberately does *not* clamp during a target
   * scroll, so the target is clamped here — otherwise a press at either end sails past the
   * edge and bounces back.
   */
  const step = useCallback((direction: -1 | 1) => {
    const el = containerRef.current;
    if (!el) { return }
    const max = el.scrollWidth - el.clientWidth;
    const target = Math.max(0, Math.min(el.scrollLeft + direction * el.clientWidth * ARROW_STEP, max));
    if (scrollbooster) {
      scrollbooster.scrollTo({ x: target });
    } else {
      // Before Scrollbooster has attached there is nothing to keep in sync with.
      el.scrollTo({ left: target, behavior: 'smooth' });
    }
  }, [scrollbooster]);

  useResizeObserver({ ref: containerRef as React.RefObject<HTMLDivElement>, onResize });
  useResizeObserver({ ref: innerRef as React.RefObject<HTMLDivElement>, onResize });

  let lightbox;
  // Never mounted while `onSelect` is driving the presses — nothing can open it, so the state
  // it reads can only be the stale `false` it started at.
  if (lightboxState.open === true) {
    lightbox = <Lightbox
        attachments={attachments}
        startingIndex={lightboxState.startingIndex}        
        close={() => setLightboxState({
          open: false,
          startingIndex: 0,
        })}
      />
  }

  return (
    <>
      <div
        className={styles.attachments}
        style={{
          paddingTop: THUMBNAIL_HEIGHT
        }}
      >
        {/* Scrollbooster drives this by assigning `scrollLeft` directly, which fires `scroll`
            like any other scroll — so one handler covers both it and native/touch scrolling. */}
        <div
          ref={setRefs}
          className={styles.scrollableArea}
          data-fade-start={overflow.start}
          data-fade-end={overflow.end}
          onScroll={measureOverflow}>
          <div ref={innerRef} className={styles.images}>
            {attachments.map((media, index) => {
              return (
                <Attachment
                  onClick={() => onSelect
                    ? onSelect(index)
                    : setLightboxState({
                        open: true,
                        startingIndex: index,
                      })}
                  media={media}
                  key={media.url}
                  height={THUMBNAIL_HEIGHT}
                  index={index}
                  total={attachments.length}
                  label={label}
                  priority={priority}
                />
              )
            })}
          </div>
        </div>

        {/* Edge arrows, for pressing rather than dragging.
            Siblings of the scroll container, not children: inside it they would scroll away
            with the row and be dimmed by the very fade they sit in. Each one is rendered only
            when its side actually has something hidden past it — the same flags that gate the
            fades — so an arrow never points at nothing, and a row that fits has neither. */}
        {overflow.start && (
          <button
            type="button"
            className={`${styles.edgeArrow} ${styles.edgeArrowStart}`}
            aria-label="Scroll thumbnails left"
            onClick={() => step(-1)}>
            <Chevron />
          </button>
        )}
        {overflow.end && (
          <button
            type="button"
            className={`${styles.edgeArrow} ${styles.edgeArrowEnd}`}
            aria-label="Scroll thumbnails right"
            onClick={() => step(1)}>
            <Chevron />
          </button>
        )}
      </div>
      <Scrollbar scrollview={containerRef} innerChild={scrollRef} inlineStyle={{ marginTop: 8 }}/>
      <AnimatePresence>
        {lightbox}
      </AnimatePresence>
    </>
  )
}

type AttachmentProps = {
  media: any,
  height: number,
  onClick: () => void,
  index: number,
  total: number,
  label?: string,
  /** Whether this row is the one on screen at load. See `EAGER_THUMBNAILS`. */
  priority?: boolean,
}
const Attachment: React.FC<AttachmentProps> = ({
  media,
  height,
  onClick,
  index,
  total,
  label,
  priority = false,
}) => {
  const hasHover = useHasHover();
  const reduceMotion = usePrefersReducedMotion();

  /**
   * Whether this thumbnail is currently showing its video rather than its poster. Set by
   * hovering, and only ever true on a pointer that can hover — see `useHasHover`.
   */
  const [preview, setPreview] = useState(false);
  /** Set once the preview has a frame to show, which is what it fades in on. */
  const [previewReady, setPreviewReady] = useState(false);

  // Everything is fetched (see THUMBNAIL_LOADING); these hints are what order it. The leading
  // thumbnails of the on-screen row first, the tail of every off-screen row last.
  const leading = priority && index < PRIORITY_THUMBNAILS;
  const fetchPriority = leading
    ? "high"
    : (!priority && index >= DEPRIORITISE_AFTER ? "low" : "auto");

  // The displayed box, which is what the resize request must ask for. Asking for a square
  // box (the previous behaviour) makes Cloudflare constrain by the wrong axis and return
  // fewer pixels than the thumbnail needs, so the browser upscales and it looks soft.
  const displayWidth = thumbnailWidth(media, height);

  // Matted: the image is inset on every side, so the request is for its box inside the mat,
  // not for the frame. Unmatted: it fills the frame *inside the border* — `box-sizing:
  // border-box` means the border eats into the width set below, so the displayed box is
  // smaller than the frame by the border on each side. Asking for the frame would over-fetch
  // and, with `fit: cover`, crop by those two pixels.
  const { width: imageWidth, height: imageHeight } = media.framed
    ? imageBox(media, displayWidth, height)
    : {
        width: displayWidth - THUMBNAIL_BORDER * 2,
        height: height - THUMBNAIL_BORDER * 2,
      };

  // The box asked for is the media's own ratio either way, so nothing is cropped or
  // letterboxed: matted, it was derived from that ratio; unmatted, the frame carries it.
  const fit = media.framed ? 'contain' : 'cover';

  /**
   * A still for this thumbnail, whatever the media is: the image itself, or a video's poster
   * frame. Both are ordinary images, so both go through Cloudflare and arrive at the ~12 KB a
   * 90px-tall thumbnail is worth.
   */
  const still = (url: string) => (
    <Image
      alt=""
      src={cloudflareImageUrl(url, { width: imageWidth, height: imageHeight, fit })}
      height={imageHeight}
      width={imageWidth}
      loading={THUMBNAIL_LOADING}
      fetchPriority={fetchPriority}
      // Images are draggable by default, and a native image drag pre-empts the pointer-move
      // scroll: press on a thumbnail, move, and the browser starts carrying a ghost of the
      // picture instead of scrolling the row. That is the "dragging sometimes does nothing" —
      // sometimes, because it depends on where the press lands and how fast it moves. The CSS
      // has `-webkit-user-drag: none` as well, since Safari honours that rather than this.
      draggable={false}
    />
  );

  let item;
  if (media.type === "image") {
    item = still(media.url);
  } else if (media.type === "video" && media.posterUrl) {
    /**
     * A video shows its poster at rest and fetches nothing else.
     *
     * This row is 90px tall, and it used to render an `autoPlay` video per attachment. That
     * downloads the entire file — `autoPlay` does so regardless of the `preload` hint, and
     * there was no viewport gate here the way there is in `Gallery.tsx` — so the CV page spent
     * ~11 MB, one clip of it 5.9 MB, animating thumbnails the size of a postage stamp, above
     * and below the fold alike. The poster is a normal image and costs about 12 KB.
     *
     * The video is mounted only while hovered, so the fetch is the reader asking for it. It is
     * layered over the poster rather than replacing it: a swap would blank the thumbnail for
     * as long as the file takes to arrive, which on the first hover is the whole point of the
     * delay. Clicking still opens the lightbox, where the video plays at a size that justifies
     * downloading it.
     */
    const canPreview = hasHover && !reduceMotion;
    item = (
      <>
        {still(media.posterUrl)}
        {canPreview && preview && (
          <video
            src={media.url}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            data-preview="true"
            // Not `onLoadedData`: that fires when there is a frame decoded, which is still one
            // paint before the poster should give way. `playing` is the first moment the video
            // is actually showing motion, so the cross-fade never lands on a frozen frame.
            onPlaying={() => setPreviewReady(true)}
            data-ready={previewReady || undefined}
          />
        )}
        {/* Without motion at rest, a video thumbnail is indistinguishable from an image. The
            accessible name already says "video", so this is the sighted equivalent rather than
            new information — hence `aria-hidden`, which also keeps it from being announced
            twice. It sits after the video in source order so the CSS can hide it with a sibling
            combinator once the preview is actually playing: at that point the motion is the
            signal and the badge is just something sitting on top of it. */}
        <span className={styles.playBadge} aria-hidden="true">
          <PlayGlyph />
        </span>
      </>
    );
  } else if (media.type === "video") {
    // No poster recorded for this asset, so there is no still to show — fall back to the
    // previous behaviour rather than rendering an empty frame. `media.json` gives every video
    // a poster today; this is here so that adding one without a poster degrades to "heavy"
    // instead of to "blank".
    item = <video src={media.url} autoPlay loop muted playsInline preload="metadata" />
  }

  const mediaNoun = media.type === "video" ? "video" : "image";
  const accessibleName = label
    ? `${label} — view ${mediaNoun} ${index + 1} of ${total}`
    : `View ${mediaNoun} ${index + 1} of ${total}`;

  return (
    <button
      type="button"
      style={{
        height: height,
        // Explicit rather than an aspect-ratio: matted, the frame's shape is the locked ratio
        // rather than the media's. See `thumbnailWidth`.
        width: displayWidth,
        // The stylesheet's two layers come from the constants above, not from a duplicate
        // pair of numbers that could drift from the resize request.
        '--thumb-border': `${THUMBNAIL_BORDER}px`,
        '--thumb-padding': `${THUMBNAIL_PADDING}px`,
      } as React.CSSProperties}
      onClick={onClick}
      // Hovering is what fetches a video's preview. `useHasHover` gates the mount rather than
      // these handlers, because `pointerenter` fires on a touch tap too — and there the tap is
      // a request to open the lightbox, not to load a preview about to be covered by it.
      onPointerEnter={() => setPreview(true)}
      onPointerLeave={() => {
        setPreview(false);
        // Reset so the next hover fades in again rather than snapping to a frame that is no
        // longer mounted. The file itself stays in the HTTP cache, so only the first hover pays.
        setPreviewReady(false);
      }}
      // Keyboard users get the same affordance: the row is reachable by tab, and focus is the
      // pointer-free equivalent of resting on a thumbnail.
      onFocus={() => setPreview(true)}
      onBlur={() => {
        setPreview(false);
        setPreviewReady(false);
      }}
      aria-label={accessibleName}
      data-framed={media.framed}
      className={styles.media}>
      {/* Sized to the image's box, so the shadow falls under the image rather than around the
          mat. It cannot go on the img itself: with `object-fit`, the element's border box is
          still the whole frame — only the bitmap inside it is inset — so a shadow there would
          trace the frame's edge and be swallowed by `overflow: hidden`.

          Matted, the size is set here and CSS centres it in the mat; unmatted, CSS stretches
          it over the whole frame and these are ignored. */}
      <span
        className={styles.frame}
        style={media.framed ? { width: imageWidth, height: imageHeight } : undefined}>
        {item}
      </span>
    </button>
  )
}

export default Attachments;
