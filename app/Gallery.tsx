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

/**
 * How long an item has to stay on screen before its video starts, in ms.
 *
 * `play()` is what commits to downloading the file, so this is the difference between
 * fetching what a reader is looking at and fetching everything their scrollbar swept past.
 * Long enough to sit out a flick through the list, short enough that stopping at an item
 * still reads as immediate.
 */
const PLAY_DWELL_MS = 250;

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
      {/* `role="list"` restores what `list-style: none` takes away in WebKit — see the note on
          `.list`. Redundant everywhere else and harmless there. */}
      <ul role="list" className={styles.list}>
        {items.map((item, index) => (
          <li key={item.id} className={styles.row}>
            <GalleryMedia
              item={item}
              index={index}
              onOpen={
                openable.some(o => o.id === item.id) ? () => setOpenId(item.id) : undefined
              }
            />
            {(item.title || item.caption || item.date || item.tags.length > 0) && (
              <div className={styles.meta}>
                {item.title && <div className={styles.title}>{item.title}</div>}
                {item.caption && <div className={styles.caption}>{item.caption}</div>}
                {(item.date || item.tags.length > 0) && (
                  <div className={styles.byline}>
                    {/* The span carries no class of its own — type and colour are inherited
                        from `.byline`, so the whole line reads as one run. It still has to
                        exist: the middot before the tags is `.tags:not(:first-child)`, so the
                        date's presence is exactly what decides whether that separator is
                        drawn. */}
                    {item.date && <span>{item.date}</span>}
                    {item.tags.length > 0 && (
                      // `role="list"` for the same reason as `.list` above — `list-style: none`
                      // takes the semantics away in WebKit. The middots are drawn by CSS off
                      // `:not(:first-child)`, so an entry with tags and no date needs no branch
                      // here.
                      <ul role="list" className={styles.tags}>
                        {item.tags.map(tag => (
                          // Safe as a key: the loader has already deduped them.
                          <li key={tag} className={styles.tag}>
                            {tag}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
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
            // Keyed on the opened item, because `startingIndex` is seeded into state and read
            // only at mount while `openable` can change shape underneath it: toggling Reduce
            // Motion with a lightbox open drops every video from the array, and an index that
            // was valid against the full list then points at a different picture — or past the
            // end of the shorter one, where nothing renders and no dot is active. Remounting on
            // the id re-seeds the index against the array as it now stands.
            key={openId}
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
  /** Whether the video has a frame of its own up, which is when the poster can go. */
  const [painted, setPainted] = useState(false);

  // Play only while the item is on screen, so scrolling a long list never has more than
  // one video decoding at a time. Users who ask for reduced motion get a paused poster.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) { return }

    if (reduceMotion) {
      video.pause();
      return;
    }

    let timer = 0;
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            // Deliberately not immediate. `play()` is what commits to downloading the whole
            // file — preload is "none" until then — so starting on the intersection alone
            // meant a reader who flicked from the top of the list to the bottom pulled every
            // clip in it, several MB, having seen none of them. Waiting for the item to still
            // be there a moment later makes the fetch follow attention rather than the
            // scrollbar. Short enough that arriving at an item normally reads as instant.
            timer = window.setTimeout(() => {
              void video.play().catch(() => {
                // Autoplay can still be refused (e.g. low-power mode); the poster remains.
              });
            }, PLAY_DWELL_MS);
          } else {
            // Cancels a pending start as well as stopping a running one, which is the half
            // that keeps a fast scroll from queueing up every video it passed.
            window.clearTimeout(timer);
            video.pause();
          }
        }
      },
      { threshold: 0.4 }
    );

    observer.observe(video);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
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
        aria-label={item.title ?? undefined}
        width={item.width}
        height={item.height}
        muted
        loop
        playsInline
        controls={reduceMotion}
        // Under reduced motion the video never plays, so it has to fetch enough to paint its
        // own first frame — that is what the controls sit on, and what lets the poster above
        // get out of their way. Otherwise nothing is fetched until `play()`.
        preload={reduceMotion ? "metadata" : "none"}
        // Fires once there is a decoded frame, under either preload. Hiding the poster on this
        // rather than on `playing` is what keeps the reduced-motion path working, where
        // `playing` never comes.
        onLoadedData={() => setPainted(true)}
      />
      {/* The poster, as a lazy image rather than the `poster` attribute.

          That attribute has no lazy option: the browser fetches it as soon as the element is
          parsed, whatever the viewport says. With seven videos spread down a nine-screen list
          that meant every poster — the last of them eight screens down — was pulled before the
          reader had scrolled a pixel, while the plain images beside them deferred correctly.
          As an `<img>` it takes `loading="lazy"` and behaves like everything else on the page.

          Layered over the video rather than under it, so there is no moment of empty frame
          while the file arrives, and it steps aside once the video has painted. Decorative:
          the video carries the accessible name, so this is `alt=""` and aria-hidden, and it is
          click-through so the reduced-motion controls underneath stay reachable. */}
      {item.posterUrl && (
        /* eslint-disable-next-line @next/next/no-img-element -- next/image cannot emit a
           srcset while images.unoptimized is set, and this needs 1x/2x variants. */
        <img
          className={styles.poster}
          src={cloudflareImageUrl(item.posterUrl, { width: COLUMN_WIDTH, dpr: 1 })}
          srcSet={
            `${cloudflareImageUrl(item.posterUrl, { width: COLUMN_WIDTH, dpr: 1 })} 1x, ` +
            `${cloudflareImageUrl(item.posterUrl, { width: COLUMN_WIDTH, dpr: 2 })} 2x`
          }
          alt=""
          aria-hidden="true"
          loading={isFirst ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={isFirst ? "high" : "auto"}
          draggable={false}
          data-hidden={painted || undefined}
        />
      )}
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
