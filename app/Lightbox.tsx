"use client"

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import useResizeObserver from "use-resize-observer";
import ReactDOM from 'react-dom';
import isMobile, { useIsMobile } from './isMobile';
import { cloudflareImageUrl } from './lib/cloudflareImage';
import styles from './Lightbox.module.css';

/**
 * Widths offered for a full-screen image, in CSS px before DPR — the browser picks one from
 * `sizes` and its own pixel ratio.
 *
 * The lightbox previously requested `media.url` itself, so opening one downloaded the original:
 * up to 394 KB of 2560x1440 webp however small the box it landed in. Most of the win is not the
 * resizing but `format=auto` negotiating AVIF — 23-27% off at full size, and 65-77% once a
 * viewport actually picks a smaller step.
 */
const LIGHTBOX_WIDTHS = [640, 960, 1280, 1600, 2048, 2560];

/**
 * The blurred stand-in's width. Tiny on purpose: at 24px it is well under a kilobyte, so it is
 * on screen almost immediately and the wait happens behind something shaped like the picture
 * rather than behind nothing.
 */
const PLACEHOLDER_WIDTH = 24;

/** Quality for that stand-in. It is about to be blurred into mush; detail here is wasted bytes. */
const PLACEHOLDER_QUALITY = 40;

/**
 * How hard the stand-in is blurred, and how long it takes to resolve.
 *
 * `.placeholder`'s `scale(1.06)` is sized against the blur radius — it exists to push the blur's
 * feathered edge outside the clip — so raising one means checking the other.
 */
const PLACEHOLDER_BLUR_PX = 18;
const PLACEHOLDER_FADE_MS = 320;

/**
 * How long the full image gets before a spinner appears.
 *
 * Without the delay every already-cached image flashes one for a frame on open, which reads as
 * jank rather than as feedback. Anything that resolves inside this window shows nothing at all.
 */
const SPINNER_DELAY_MS = 300;

/** Points right; the previous control mirrors it in CSS. */
const Chevron = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M6 3.5L11 8L6 12.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

type LightboxProps = {
  attachments: Array<any>,
  startingIndex: number,
  close: () => void,
}
const Lightbox: React.FC<LightboxProps> = ({
  attachments,
  startingIndex,
  close
}) => {
  const [currentIndex, setCurrentIndex] = useState(startingIndex);
  const scrollRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const isMobileNow = useIsMobile();
  const didRestoreScroll = useRef(false);

  // Re-run when isMobileNow flips: on a cold isMobileValue cache the hook
  // seeds false for one commit, so data-mobile="false" makes the carousel
  // unscrollable and the restore below would silently clamp to 0.
  useEffect(() => {
    if (didRestoreScroll.current) { return }
    const el = scrollRef.current;
    if (!el) { return }
    if (isMobile() === false) { return }
    if (!(startingIndex > 0)) { return }
    const bounds = el.getBoundingClientRect();
    el.scrollLeft = bounds.width * startingIndex;
    if (el.scrollLeft > 0) {
      didRestoreScroll.current = true;
    }
  }, [isMobileNow, startingIndex]);

  // Restore the previous inline values rather than writing 'unset'. globals.css
  // sets `overflow-x: hidden` on html/body, and an inline `overflow: unset`
  // overrides it — so clearing that way leaves the page horizontally scrollable
  // after the lightbox closes.
  //
  // The padding is what stops the page jumping. Locking the scroll takes the
  // scrollbar away, which widens the viewport by its width and slides the centred
  // content column sideways by half of that — 7.5px here — then back again on
  // close, which is the visible snap as the scrollbar returns. Reserving the same
  // width as padding on the element that lost it keeps every box exactly where it
  // was, so nothing reflows in either direction.
  //
  // `scrollbar-gutter: stable` would be the declarative version of this and does
  // not work: the gutter is dropped as soon as `overflow` becomes `hidden`
  // (measured — `clientWidth` still jumps the full 15px), so the width has to be
  // measured and put back by hand. It measures 0 with overlay scrollbars, which is
  // exactly right — nothing was taken away, so nothing is added.
  useEffect(() => {
    const html = document.documentElement;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = html.style.overflow;
    const prevHtmlPadding = html.style.paddingRight;

    const gutter = window.innerWidth - html.clientWidth;

    document.body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    if (gutter > 0) {
      html.style.paddingRight = `${gutter}px`;
    }

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      html.style.overflow = prevHtmlOverflow;
      html.style.paddingRight = prevHtmlPadding;
    };
  }, []);

  // Move focus into the dialog on open and hand it back to the trigger on close,
  // so keyboard users are not left tabbing the page behind the lightbox.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, []);

  const next = () => {
    setCurrentIndex(currentIndex => {
      if (currentIndex < attachments.length - 1) {
        return currentIndex + 1;
      } else {
        return 0;
      }
    });
  }
    
  const prev = () => {
    setCurrentIndex(currentIndex => {
      if (currentIndex === 0) {
        return attachments.length - 1;
      } else {
        return currentIndex - 1;
      }
    });
  }

  const handleKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      close();
    }

    if (event.key === "ArrowRight") {
      next();
    }

    if (event.key === "ArrowLeft") {
      prev();
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKey);

    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  const handleScroll = (event: React.UIEvent<HTMLElement>) => {
    if (!attachments) { return }
    const view = event.currentTarget;
    setCurrentIndex(Math.round(
      (view.scrollLeft / (view.scrollWidth - view.offsetWidth)) * (attachments.length - 1)
    ));
  }

  return ReactDOM.createPortal(
    <div
      data-mobile={isMobileNow}
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
      className={styles.lightbox}>
      <div
        onScroll={(event) => handleScroll(event)}
        ref={scrollRef}
        className={styles.carouselScroll}>
        <div className={styles.carousel}>
          {attachments.map((media, index) => {
            // Only render images that are visible or adjacent (for preloading)
            const isVisible = currentIndex === index;
            const isAdjacent = Math.abs(currentIndex - index) <= 1;
            const shouldRender = isVisible || isAdjacent || isMobileNow;
            
            if (!shouldRender) {
              return <div key={media.url} style={{ display: 'none' }} />;
            }
            
            return (
              <LightboxImage
                prev={attachments && attachments.length > 1 ? prev : undefined}
                next={attachments && attachments.length > 1 ? next : undefined}
                key={media.url}
                display={isVisible || isMobileNow ? true : false}
                media={media}
              />
            )
          })}
        </div>
      </div>
      
      {/* One control cluster at the bottom: step back, position, step forward.
          The steps are anchored to the *viewport* rather than to the media, which is the point.
          The click-halves inside `.imageWrap` only cover the media, which is fine for a landscape
          image that nearly fills the screen and useless for a portrait one: at 704px wide in a
          1280px viewport most of what you see is backdrop, and clicking backdrop closes — so there
          was no reachable way to step through a tall item. Being on top of the backdrop, these do
          not trigger its dismiss handler.
          Grouped with the dots rather than pinned to the left and right edges so the arrows sit
          beside the thing they move through. Laying them out as flex siblings is what keeps that
          true at any count: the dots' width grows with the number of items, and an offset from the
          centre would have to be recomputed to match.
          They carry the accessible names; the halves are decoration for the pointer. */}
      {attachments && attachments.length > 1 ?
        <motion.div
          initial={{
            opacity: 0,
          }}
          animate={{
            opacity: 1,
          }}
          exit={{
            opacity: 0,
          }}
          transition={{
            type: 'spring',
            stiffness: 700,
            damping: 50,
          }}
          className={styles.controls}>
          {!isMobileNow && (
            <button
              type="button"
              aria-label="Previous media"
              className={`${styles.step} ${styles.stepPrev}`}
              onClick={() => prev()}>
              <Chevron />
            </button>
          )}
          <div className={styles.dots}>
            {attachments.map((media, index) => {
              return (
                <div
                  className={styles.pagerDot}
                  data-active={currentIndex === index}
                  key={media.url + "dot"}/>
              )
            })}
          </div>
          {!isMobileNow && (
            <button
              type="button"
              aria-label="Next media"
              // No modifier class: forward is the chevron's own direction, and only `.stepPrev`
              // has a rule (it mirrors the glyph).
              className={styles.step}
              onClick={() => next()}>
              <Chevron />
            </button>
          )}
        </motion.div>
      : null}

      <motion.div
        initial={{ 
          opacity: 0,
        }}
        animate={{
          opacity: 1,
        }}
        exit={{
          opacity: 0,
        }}
        transition={{
          type: 'spring',
          stiffness: 700,
          damping: 50,
        }}
        className={styles.backdrop}
        aria-hidden="true"
        onClick={() => close()}/>
      <motion.button
        ref={closeRef}
        type="button"
        aria-label="Close media viewer"
        initial={{ 
          opacity: 0,
        }}
        animate={{
          opacity: 1,
        }}
        exit={{
          opacity: 0,
        }}
        whileTap={{ scale: 0.9 }}
        transition={{
          type: 'spring',
          stiffness: 700,
          damping: 50,
        }}
        className={styles.close}
        onClick={() => close()}/>
    </div>
  , document.body);
}

type LightboxImageProps = {
  media: any,
  prev?: () => void,
  next?: () => void,
  display: boolean,
}
const LightboxImage: React.FC<LightboxImageProps> = ({
  media,
  prev,
  next,
  display,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const isMobileNow = useIsMobile();
  const [containerAspectRatio, setContainerAspectRatio] = useState((window.innerWidth - 48) / (window.innerHeight - 96));
  const [progress, setProgress] = useState(0);
  /** Whether the real media has arrived, which is what the stand-in gives way to. */
  const [loaded, setLoaded] = useState(false);
  /** Armed by the delay timer; `showSpinner` below is the value actually rendered. */
  const [spinnerDue, setSpinnerDue] = useState(false);
  const imageAspectRatio = media.width / media.height;
  const isVideo = media.type !== "image";

  /**
   * Attaches the image and, in the same breath, asks whether it is already there.
   *
   * An image in the browser's cache is `complete` before React can attach a `load` listener, so
   * the event on its own would leave the blurred stand-in sitting over a picture that had in
   * fact arrived. Opening the lightbox on something just scrolled past is the common case, so
   * that is not an edge. This lives in a ref callback rather than an effect because reading the
   * node as it attaches is exactly what they are for — the effect equivalent sets state
   * synchronously on mount and cascades a second render.
   */
  /**
   * Whether the real media has something to show yet.
   *
   * It checks first and only then subscribes, rather than relying on React's `onLoad` /
   * `onLoadedData` alone. That matters because the media here is usually *already* cached — from
   * the thumbnail or the gallery row that opened the lightbox — so it can be `complete` before a
   * listener is ever live, and an event that already fired is an event you never hear. Attaching
   * the listener after the check is what closes the gap in the other direction. `error` counts as
   * done too: a broken file should not mean a permanently blurred frame.
   */
  useEffect(() => {
    if (loaded) { return }
    const node: HTMLImageElement | HTMLVideoElement | null =
      isVideo ? videoRef.current : imgRef.current;
    if (!node) { return }

    const ready = isVideo
      // HAVE_CURRENT_DATA: there is a frame to paint, which is all this is asking.
      ? (node as HTMLVideoElement).readyState >= 2
      : (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0;

    if (ready) {
      // A timeout rather than `requestAnimationFrame`, and the two are not interchangeable here.
      // Animation frames only run while the page is painting, so in a backgrounded tab this
      // never fires — and since it is the thing that reveals the picture, the stand-in would
      // still be up when the reader came back. (Observed exactly that in a non-painting
      // preview pane.) A timeout is not tied to paint. The hop itself is only here to keep the
      // set off the synchronous mount path.
      const timer = window.setTimeout(() => setLoaded(true), 0);
      return () => window.clearTimeout(timer);
    }

    const done = () => setLoaded(true);
    const event = isVideo ? 'loadeddata' : 'load';
    node.addEventListener(event, done);
    node.addEventListener('error', done);
    return () => {
      node.removeEventListener(event, done);
      node.removeEventListener('error', done);
    };
  }, [loaded, isVideo]);

  // The timer only ever arms the spinner; whether it is actually shown is derived below. Doing
  // it that way keeps this effect from having to set state synchronously to *unset* it, which
  // cascades an extra render on every open and on every step through the carousel.
  useEffect(() => {
    if (loaded || !display) { return }
    const timer = window.setTimeout(() => setSpinnerDue(true), SPINNER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [loaded, display]);

  // Gated on `display` as well as on `loaded`: the carousel keeps the neighbours mounted, and
  // they have no business spinning offscreen.
  const showSpinner = spinnerDue && !loaded && display;

  // Read the playhead every frame, and only for the item actually on screen — the carousel keeps
  // the neighbours mounted, so gating on `display` is what stops three loops running at once.
  // `timeupdate` would be the cheaper source and is too coarse: it fires about four times a
  // second, which at this size is plainly a bar that steps rather than travels.
  useEffect(() => {
    if (!isVideo || !display) { return }

    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video && video.duration > 0) {
        setProgress(video.currentTime / video.duration);
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isVideo, display]);

  // Never above the media's own width — asking for more makes Cloudflare upscale, which costs
  // bytes to invent detail. The intrinsic width is kept as the top entry so a picture that falls
  // between two steps is still offered at full size.
  const widths = Array.from(
    new Set([...LIGHTBOX_WIDTHS.filter(w => w < media.width), media.width])
  );

  /**
   * The still this item is represented by while it loads: the picture itself, or a video's
   * poster. A video has no still of its own to shrink — Cloudflare cannot resize video — so one
   * without a poster simply goes without.
   */
  const stillUrl = media.type === "image" ? media.url : media.posterUrl;

  /**
   * Blur-up: a thumbnail-sized copy, scaled up and blurred, standing over the real picture until
   * it arrives and then sharpening as it fades away.
   *
   * Three things about the arrangement:
   *
   * - **The real media carries no opacity of its own**, so only this stand-in ever animates. That
   *   is the safe direction: the worst a failure in here can do is skip the fade and leave a
   *   blurred copy up for a moment, where hiding the media until `load` instead would risk a
   *   sharp picture pinned invisible behind a stand-in that never left.
   * - **The state and its transition are set inline**, keeping "how far along is this" in one
   *   place — a `data-` attribute plus a rule in the stylesheet splits the same fact across two
   *   files, and the stylesheet half is the easier one to break without noticing.
   * - **The blur is on the image, inside a plain clipping span.** `filter` applies to the *result*
   *   of a clip, so blurring the clipping box would feather the blur straight back out past the
   *   edge that box exists to contain. The clip is needed at all because `.imageWrap` drops its
   *   `overflow: hidden` for both the floating and the video treatments.
   */
  const placeholder = stillUrl ? (
    <span className={styles.placeholderClip} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed-size stand-in; next/image
          would add a srcset for a picture that is 24px wide by design. */}
      <img
        className={styles.placeholder}
        src={cloudflareImageUrl(stillUrl, {
          width: PLACEHOLDER_WIDTH,
          quality: PLACEHOLDER_QUALITY,
          dpr: 1,
        })}
        alt=""
        draggable={false}
        // Inline rather than through a class or a `data-` attribute, and that is not a style
        // preference. Both CSS-driven attempts failed here — see the note above — and an inline
        // declaration sidesteps the whole question: there is no competing rule for a transition
        // to outrank, and nothing about how this module's CSS is compiled can drop it. The
        // transition rides along inline for the same reason.
        style={{
          opacity: loaded ? 0 : 1,
          filter: `blur(${loaded ? 0 : PLACEHOLDER_BLUR_PX}px)`,
          transition: `opacity ${PLACEHOLDER_FADE_MS}ms ease, filter ${PLACEHOLDER_FADE_MS}ms ease`,
        }}
      />
    </span>
  ) : null;

  const attachment = media.type === "image" ?
    /* eslint-disable-next-line @next/next/no-img-element -- next/image cannot emit a srcset
       while images.unoptimized is set, and the whole point here is letting the browser pick. */
    <img
      ref={imgRef}
      src={cloudflareImageUrl(media.url, { width: widths[widths.length - 1], dpr: 1 })}
      srcSet={widths
        .map(w => `${cloudflareImageUrl(media.url, { width: w, dpr: 1 })} ${w}w`)
        .join(', ')}
      // The media is fitted inside the viewport less `.lightboxImage`'s horizontal padding. A
      // height-constrained picture is narrower still, which `sizes` cannot express — erring
      // wide is the safe direction, since the cost of guessing low is a visibly soft image.
      sizes="calc(100vw - 48px)"
      loading={display ? "eager" : "lazy"}
      decoding="async"
      alt=""
      width={media.width}
      height={media.height}
      draggable={false}
    /> :
    <video
      ref={videoRef}
      src={media.url}
      autoPlay={display}
      muted
      playsInline
      loop
      preload={display ? "auto" : "none"}
      width={media.width}
      height={media.height}
    />

  const setRatio = () => {
    if (!containerRef.current) { return }
    const bounds = containerRef.current.getBoundingClientRect();
    setContainerAspectRatio(bounds.width / bounds.height);
  }

  useEffect(() => {
    setRatio();
  }, []);


  const onResize = () => {
    setRatio();
  }

  useResizeObserver({ ref: containerRef as React.RefObject<HTMLDivElement>, onResize });
  
  return (
    <div
      className={styles.lightboxImage}
      // Reserves room below the media for the progress bar — see the rule in the stylesheet.
      data-video={isVideo}
      style={{
        visibility: display ? "visible" : "hidden",
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{
          type: 'spring',
          stiffness: 700,
          damping: 50,
        }}
        ref={containerRef}
        className={styles.lightboxInner}>
        <div
          className={styles.imageWrap}
          // Drops the border and adds a silhouette shadow — see `.imageWrap[data-floating]`.
          data-floating={media.floating === true}
          // Lifts the wrap's clip so the progress bar below it is not cut off; the media keeps its
          // rounded corners by carrying the radius itself.
          data-video={isVideo}
          style={{
            pointerEvents: display ? "all" : "none",
            aspectRatio: imageAspectRatio,
            width: containerAspectRatio > imageAspectRatio ? "auto" : "100%",
            height: containerAspectRatio > imageAspectRatio ? "100%" : "auto",
          }}
        >
          {/* Click-anywhere-on-the-media shortcut, kept alongside the visible controls at the
              viewport edges. `aria-hidden` and out of the tab order because those controls are the
              named ones — two pairs of "Previous media" would just be read twice. */}
          {prev && next && !isMobileNow ?
            <div
              className={styles.navigation}
              aria-hidden="true">
              <button type="button" tabIndex={-1} className={styles.prev} onClick={() => prev()} />
              <button type="button" tabIndex={-1} className={styles.next} onClick={() => next()} />
            </div>
          : null}
          {placeholder}
          {attachment}
          {/* Shown only once the media has taken longer than `SPINNER_DELAY_MS`, so a cached
              picture opens without one. Dark disc under a light ring for the same reason the
              thumbnail's play badge wears those colours: it sits on the blurred stand-in, whose
              brightness is whatever the picture happens to be. `aria-hidden` because the media
              it covers is itself `alt=""` — announcing the wait for something that is not
              announced would be noise. */}
          {showSpinner && <span className={styles.spinner} aria-hidden="true" />}
          {/* Playback position, sitting just under the media rather than over it — `top: 100%` on
              a box that spans the wrap, so it is exactly the video's width without taking part in
              the sizing arithmetic above. `data-video` is what lets it escape: `.imageWrap` clips
              to round the media's corners, so for a video the clip moves onto the media itself and
              the wrap is free to paint outside. */}
          {isVideo && (
            <div className={styles.videoProgress} aria-hidden="true">
              <div className={styles.videoProgressValue} style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default Lightbox;