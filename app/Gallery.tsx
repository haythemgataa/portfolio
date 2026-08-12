"use client"

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { GalleryItem } from "./lib/galleryTypes";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { cloudflareImageUrl } from "./lib/cloudflareImage";
import Lightbox from "./Lightbox";
import styles from "./Gallery.module.css";

// Items render in a 540px column. Width is constrained but height is left free so each
// item keeps its own aspect ratio.
const COLUMN_WIDTH = 540;

type GalleryProps = {
  items: GalleryItem[],
};

const Gallery: React.FC<GalleryProps> = ({ items }) => {
  // The *id* of the open item rather than its index, because `openable` below depends on a
  // media query: it changes shape one commit after mount, and a stored index would then be
  // pointing at whatever moved into that slot.
  const [openId, setOpenId] = useState<string | null>(null);
  const reduceMotion = usePrefersReducedMotion();

  // Images and videos both open. The exception is a video under reduced motion, which is
  // showing native controls — wrapping those in a button means every press on the scrubber
  // also opens the lightbox, so there the video stays where it is and the controls win.
  //
  // The lightbox arrow-keys through whatever array it is given, so that array has to be
  // exactly the openable subset; indices into `items` would step onto something with no
  // opened form.
  const openable = useMemo(
    () => (reduceMotion ? items.filter(item => item.type === "image") : items),
    [items, reduceMotion]
  );

  const openIndex = openId === null ? -1 : openable.findIndex(o => o.id === openId);

  // Reachable only by visiting /gallery directly — the CV page hides the tab while the
  // gallery is empty, so this copy is for visitors, not for whoever is authoring content.
  if (items.length === 0) {
    return <p className={styles.empty}>Nothing here yet.</p>;
  }

  return (
    <>
      <ul className={styles.list}>
        {items.map((item, index) => (
          <li key={item.id} className={styles.row}>
            <GalleryMedia
              item={item}
              index={index}
              onOpen={
                openable.some(o => o.id === item.id) ? () => setOpenId(item.id) : undefined
              }
            />
            {(item.title || item.caption || item.date) && (
              <div className={styles.meta}>
                {item.title && <div className={styles.title}>{item.title}</div>}
                {item.caption && <div className={styles.caption}>{item.caption}</div>}
                {item.date && <div className={styles.date}>{item.date}</div>}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* The captions above are deliberately not passed along: the lightbox is for looking at
          the media, and the text that introduced it stays on the page behind it. It renders
          none of its own either, so there is nothing to suppress here — only the media array
          is handed over. */}
      <AnimatePresence>
        {openIndex >= 0 && (
          <Lightbox
            attachments={openable}
            startingIndex={openIndex}
            close={() => setOpenId(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
};

type GalleryMediaProps = {
  item: GalleryItem,
  index: number,
  /** Absent when this item has no opened form — see `openable` in `Gallery`. */
  onOpen?: () => void,
};

const GalleryMedia: React.FC<GalleryMediaProps> = ({ item, index, onOpen }) => {
  // The first item is above the fold on every viewport; everything else defers.
  const isFirst = index === 0;
  const aspectRatio = item.width / item.height;

  const media = item.type === "video"
    ? <GalleryVideo item={item} isFirst={isFirst} aspectRatio={aspectRatio} />
    : <GalleryImage item={item} isFirst={isFirst} aspectRatio={aspectRatio} />;

  if (!onOpen) {
    return media;
  }

  const noun = item.type === "video" ? "video" : "image";

  return (
    <button
      type="button"
      className={styles.trigger}
      onClick={onOpen}
      aria-label={item.title ? `View ${item.title}` : `View ${noun}`}
    >
      {media}
    </button>
  );
};

type GalleryFrameProps = {
  item: GalleryItem,
  isFirst: boolean,
  aspectRatio: number,
};

const GalleryImage: React.FC<GalleryFrameProps> = ({ item, isFirst, aspectRatio }) => {
  const alt = item.title ?? item.caption ?? "";

  return (
    // The aspect-ratio box reserves the item's height before the media loads, so a long
    // scroll does not shift as each row arrives.
    <div className={styles.frame} style={{ aspectRatio }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- next/image cannot emit a
          srcset while images.unoptimized is set, and this list needs 1x/2x variants. */}
      <img
        src={cloudflareImageUrl(item.url, { width: COLUMN_WIDTH, dpr: 1 })}
        srcSet={
          `${cloudflareImageUrl(item.url, { width: COLUMN_WIDTH, dpr: 1 })} 1x, ` +
          `${cloudflareImageUrl(item.url, { width: COLUMN_WIDTH, dpr: 2 })} 2x`
        }
        alt={alt}
        width={item.width}
        height={item.height}
        loading={isFirst ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={isFirst ? "high" : "auto"}
        // A native image drag would otherwise start on press, which on a clickable item reads
        // as the click having been swallowed.
        draggable={false}
      />
    </div>
  );
};

const GalleryVideo: React.FC<GalleryFrameProps> = ({ item, isFirst, aspectRatio }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduceMotion = usePrefersReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [progress, setProgress] = useState(0);

  // Play only while the item is on screen, so scrolling a long list never has more than
  // one video decoding at a time. Users who ask for reduced motion get a paused poster.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) { return }

    if (reduceMotion) {
      video.pause();
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void video.play().catch(() => {
              // Autoplay can still be refused (e.g. low-power mode); the poster remains.
            });
          } else {
            video.pause();
          }
        }
      },
      { threshold: 0.4 }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [reduceMotion]);

  // The progress bar is read off the video on every frame, but only while it is being looked
  // at — so the loop is tied to hover rather than left running for every video in the list.
  // `timeupdate` would be the obvious source and is the wrong one: it fires about four times
  // a second, which is visible as a bar that steps rather than travels.
  useEffect(() => {
    if (!hovered || reduceMotion) { return }

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
  }, [hovered, reduceMotion]);

  return (
    <div
      className={styles.frame}
      style={{ aspectRatio }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <video
        ref={videoRef}
        src={item.url}
        poster={item.posterUrl ?? undefined}
        aria-label={item.title ?? undefined}
        width={item.width}
        height={item.height}
        muted
        loop
        playsInline
        controls={reduceMotion}
        preload={isFirst ? "metadata" : "none"}
      />
      {/* Skipped under reduced motion, where the video carries native controls and already
          has a progress bar of its own. Decorative: the same information is in those
          controls for anyone who needs it exposed. */}
      {!reduceMotion && (
        <div className={styles.progress} aria-hidden="true">
          <div className={styles.progressTrack}>
            <div
              className={styles.progressValue}
              // Width rather than a transform — see the note on `.progressValue` for why the
              // cheaper option had to go.
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Gallery;
