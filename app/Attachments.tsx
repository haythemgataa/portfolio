"use client"

import { useRef, useState, useCallback } from "react";
import Image from "next/image";
import Scrollbar from "./Scrollbar";
import Lightbox from "./Lightbox";
import { AnimatePresence } from "framer-motion";
import { useScrollBoost } from 'react-scrollbooster';
import isMobile from "./isMobile";
import useResizeObserver from "use-resize-observer";
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
};
const Attachments: React.FC<AttachmentsProps> = ({
  attachments,
  label
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
                  onClick={() => setLightboxState({
                    open: true,
                    startingIndex: index,
                  })}
                  media={media}
                  key={media.url}
                  height={THUMBNAIL_HEIGHT}
                  index={index}
                  total={attachments.length}
                  label={label}
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
}
const Attachment: React.FC<AttachmentProps> = ({
  media,
  height,
  onClick,
  index,
  total,
  label,
}) => {
  // Load first 5 thumbnails eagerly, lazy load the rest
  const shouldLoadEagerly = index < 5;

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

  let item;
  if (media.type === "image") {
    const thumbnailUrl = cloudflareImageUrl(media.url, {
      width: imageWidth,
      height: imageHeight,
      // The box asked for is the media's own ratio either way, so nothing is cropped or
      // letterboxed: matted, it was derived from that ratio; unmatted, the frame carries it.
      fit: media.framed ? 'contain' : 'cover',
    });
    item = <Image
      alt=""
      src={thumbnailUrl}
      height={imageHeight}
      width={imageWidth}
      loading={shouldLoadEagerly ? "eager" : "lazy"}
      // Images are draggable by default, and a native image drag pre-empts the pointer-move
      // scroll: press on a thumbnail, move, and the browser starts carrying a ghost of the
      // picture instead of scrolling the row. That is the "dragging sometimes does nothing" —
      // sometimes, because it depends on where the press lands and how fast it moves. The CSS
      // has `-webkit-user-drag: none` as well, since Safari honours that rather than this.
      draggable={false}
    />
  } else if (media.type === "video") {
    item = <video 
      src={media.url} 
      autoPlay 
      loop 
      muted 
      playsInline
      preload={shouldLoadEagerly ? "auto" : "metadata"}
    />
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
