"use client"

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import useResizeObserver from "use-resize-observer";
import ReactDOM from 'react-dom';
import isMobile, { useIsMobile } from './isMobile';
import styles from './Lightbox.module.css';

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
  const isMobileNow = useIsMobile();
  const [containerAspectRatio, setContainerAspectRatio] = useState((window.innerWidth - 48) / (window.innerHeight - 96));
  const [progress, setProgress] = useState(0);
  const imageAspectRatio = media.width / media.height;
  const isVideo = media.type !== "image";

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

  const attachment = media.type === "image" ?
    <img
      src={media.url}
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
          {attachment}
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