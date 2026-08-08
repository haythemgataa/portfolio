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
  const galleryHeight = 90;
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [viewport, scrollbooster] = useScrollBoost({
    direction: 'horizontal',
    friction: 0.05,
    scrollMode: 'native',
    textSelection: false,
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
  }

  const setRefs = useCallback<React.RefCallback<HTMLDivElement>>(node => {
    containerRef.current = node;
    viewport(node);
    onResize();
  }, [viewport]);

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
          paddingTop: galleryHeight
        }}
      >
        <div ref={setRefs} className={styles.scrollableArea}>
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
                  height={galleryHeight}
                  index={index}
                  total={attachments.length}
                  label={label}
                />
              )
            })}
          </div>
        </div>
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
  const maxWidth = 21/9;   // ultrawide monitor
  const minWidth = 19/5/9; // iPhone

  const returnThumbnailAspectRatio = (ratio: number) => {
    if (ratio < minWidth) {
      return minWidth
    } else if (ratio > maxWidth) {
      return maxWidth
    } else {
      return ratio
    }
  }

  // Load first 5 thumbnails eagerly, lazy load the rest
  const shouldLoadEagerly = index < 5;

  // The displayed box, which is what the resize request must ask for. Asking for a square
  // box (the previous behaviour) makes Cloudflare constrain by the wrong axis and return
  // fewer pixels than the thumbnail needs, so the browser upscales and it looks soft.
  const displayWidth = Math.round(height * returnThumbnailAspectRatio(media.width / media.height));

  let item;
  if (media.type === "image") {
    const thumbnailUrl = cloudflareImageUrl(media.url, {
      width: displayWidth,
      height,
      fit: 'cover',
    });
    item = <Image
      alt=""
      src={thumbnailUrl}
      height={height}
      width={displayWidth}
      loading={shouldLoadEagerly ? "eager" : "lazy"}
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
        aspectRatio: returnThumbnailAspectRatio(media.width / media.height),
      }}
      onClick={onClick}
      aria-label={accessibleName}
      className={styles.media}>
      {item}
    </button>
  )
}

export default Attachments;
