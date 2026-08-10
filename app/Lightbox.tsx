"use client"

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import useResizeObserver from "use-resize-observer";
import ReactDOM from 'react-dom';
import isMobile, { useIsMobile } from './isMobile';
import styles from './Lightbox.module.css';

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
  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
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
          className={styles.dots}>
          {attachments.map((media, index) => {
            return (
              <div
                className={styles.pagerDot}
                data-active={currentIndex === index}
                key={media.url + "dot"}/>
            )
          })}
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
  const isMobileNow = useIsMobile();
  const [containerAspectRatio, setContainerAspectRatio] = useState((window.innerWidth - 48) / (window.innerHeight - 96));
  const imageAspectRatio = media.width / media.height;
  
  const attachment = media.type === "image" ?
    <img 
      src={media.url}
      loading={display ? "eager" : "lazy"}
      decoding="async"
      alt=""
      width={media.width}
      height={media.height}
    /> :
    <video
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
          style={{
            pointerEvents: display ? "all" : "none",
            aspectRatio: imageAspectRatio,
            width: containerAspectRatio > imageAspectRatio ? "auto" : "100%",
            height: containerAspectRatio > imageAspectRatio ? "100%" : "auto",
          }}
        >
          {prev && next && !isMobileNow ?
            <div
              className={styles.navigation}>
              <button type="button" aria-label="Previous media" className={styles.prev} onClick={() => prev()} />
              <button type="button" aria-label="Next media" className={styles.next} onClick={() => next()} />
            </div>
          : null}
          {attachment}
        </div>
      </motion.div>
    </div>
  )
}

export default Lightbox;