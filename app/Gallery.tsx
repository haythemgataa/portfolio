"use client"

import { useEffect, useRef } from "react";
import type { GalleryItem } from "./lib/galleryTypes";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import styles from "./Gallery.module.css";

// The gallery renders in a 540px column, so a 2x display needs 1080px. Cloudflare Image
// Resizing lives at the edge only, so in development we serve the original file —
// otherwise every item 404s under `npm run dev` (same guard as Attachments.tsx).
const COLUMN_WIDTH = 540;

const resized = (url: string, width: number): string => {
  if (process.env.NODE_ENV !== "production") {
    return url;
  }
  return `/cdn-cgi/image/width=${width},quality=82,format=auto${url}`;
};

type GalleryProps = {
  items: GalleryItem[],
};

const Gallery: React.FC<GalleryProps> = ({ items }) => {
  // Reachable only by visiting /gallery directly — the CV page hides the tab while the
  // gallery is empty, so this copy is for visitors, not for whoever is authoring content.
  if (items.length === 0) {
    return <p className={styles.empty}>Nothing here yet.</p>;
  }

  return (
    <ul className={styles.list}>
      {items.map((item, index) => (
        <li key={item.id} className={styles.row}>
          <GalleryMedia item={item} index={index} />
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
  );
};

type GalleryMediaProps = {
  item: GalleryItem,
  index: number,
};

const GalleryMedia: React.FC<GalleryMediaProps> = ({ item, index }) => {
  // The first item is above the fold on every viewport; everything else defers.
  const isFirst = index === 0;
  const aspectRatio = item.width / item.height;

  if (item.type === "video") {
    return <GalleryVideo item={item} isFirst={isFirst} aspectRatio={aspectRatio} />;
  }

  const alt = item.title ?? item.caption ?? "";

  return (
    // The aspect-ratio box reserves the item's height before the media loads, so a long
    // scroll does not shift as each row arrives.
    <div className={styles.frame} style={{ aspectRatio }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- next/image cannot emit a
          srcset while images.unoptimized is set, and this list needs 1x/2x variants. */}
      <img
        src={resized(item.url, COLUMN_WIDTH)}
        srcSet={`${resized(item.url, COLUMN_WIDTH)} 1x, ${resized(item.url, COLUMN_WIDTH * 2)} 2x`}
        alt={alt}
        width={item.width}
        height={item.height}
        loading={isFirst ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={isFirst ? "high" : "auto"}
      />
    </div>
  );
};

type GalleryVideoProps = {
  item: GalleryItem,
  isFirst: boolean,
  aspectRatio: number,
};

const GalleryVideo: React.FC<GalleryVideoProps> = ({ item, isFirst, aspectRatio }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduceMotion = usePrefersReducedMotion();

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

  return (
    <div className={styles.frame} style={{ aspectRatio }}>
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
    </div>
  );
};

export default Gallery;
