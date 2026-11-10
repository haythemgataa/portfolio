"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import Lightbox from "./Lightbox";
import styles from "./ProseImage.module.css";
import { cloudflareImageUrl } from "./lib/cloudflareImage";
import type { ResolvedMedia } from "./lib/contentTypes";

/**
 * A picture inside a body of prose — `![alt](filename.webp)` in a case study — and the lightbox
 * that opens it.
 *
 * **It is a client module and `RichText` is not, which is the whole reason it is a separate file.**
 * `RichText` renders from both sides of the RSC boundary: the layout's About and a case study's
 * body are server components, `Profile`'s descriptions are client. Marking `RichText` itself
 * `"use client"` to get an onClick would drag About across the boundary for a feature it does not
 * use. A server component may render a client one, so the split costs nothing and the boundary
 * lands exactly where the interactivity starts.
 */

/**
 * How a picture reaches the lightbox.
 *
 * Context rather than a prop, because the images are rendered by `react-markdown` from deep inside
 * a body of text — there is no call site to thread a handler through. `enabled` is false in the
 * default value, so a `RichText` with no viewer above it (About, a CV description) renders the
 * same figure without a button around it rather than throwing.
 *
 * **The whole opened media travels through here, not a url into an ordered set.** A case study
 * opens one asset and nothing else — see `ProseImageViewer` — so there is no set for an index or a
 * url to be resolved against, and passing the object retires the lookup entirely.
 */
type ViewerApi = {
  enabled: boolean;
  open: (media: ResolvedMedia) => void;
};

const ViewerContext = createContext<ViewerApi>({ enabled: false, open: () => {} });

/**
 * Wraps a document so every picture in it opens in the shared lightbox.
 *
 * **Each picture opens as a single asset: no pager, no arrows, nothing to step to.** The pictures
 * in a case study are spread through a document with prose between them, so they are not a set a
 * reader is browsing — they are whatever happened to be illustrated, and stepping from a v0
 * screenshot into an unrelated explainer diagram is a move nobody asked for. A reader who wants
 * the next one scrolls to it.
 *
 * That needs no option on `Lightbox`: it already hides the control cluster and the click-halves
 * when it is handed fewer than two items, and `next`/`prev` wrap, so with one they are no-ops.
 * Handing it a one-item array says exactly what is meant and adds no API.
 */
export const ProseImageViewer: React.FC<{
  children: React.ReactNode,
}> = ({ children }) => {
  const [openMedia, setOpenMedia] = useState<ResolvedMedia | null>(null);

  // `enabled` is a constant, so the value never changes identity and consumers never re-render
  // because of this provider.
  const api = useMemo(() => ({ enabled: true, open: setOpenMedia }), []);

  return (
    <ViewerContext.Provider value={api}>
      {children}
      <AnimatePresence>
        {openMedia && (
          // Keyed on the opened item for the same reason `Gallery` keys it: `startingIndex` is
          // seeded into state and read only at mount, so remounting is what re-seeds it.
          <Lightbox
            key={openMedia.url}
            attachments={[openMedia]}
            startingIndex={0}
            close={() => setOpenMedia(null)}
          />
        )}
      </AnimatePresence>
    </ViewerContext.Provider>
  );
};

/** The content column's own width, which is what an image in prose is asked to fill. */
const COLUMN_WIDTH = 540;

/** The steps offered to the browser, capped at the file's own width so Cloudflare never upscales. */
const IMAGE_WIDTHS = [540, 810, 1080, 1620];

/**
 * The mat's width in CSS px, reaching the stylesheet as a custom property because the Cloudflare
 * request has to subtract it — the `THUMBNAIL_PADDING` pattern. Asking for the whole frame while
 * matted would over-fetch by twice this on each axis.
 */
const MAT = 24;

type ProseImageProps = {
  media: ResolvedMedia,
  alt: string,
  title?: string,
};

const ProseImage: React.FC<ProseImageProps> = ({ media, alt, title }) => {
  const { enabled: openable, open } = useContext(ViewerContext);

  // **Matted is the default, and only an explicit `framed: false` opts out** — the same rule and
  // the same flag a CV thumbnail follows, because it follows from what the file *is* rather than
  // from where it is shown. An app screenshot is a print and wants the mat; artwork that already
  // carries its own margin, or a photograph meant to bleed, sets the flag.
  const matted = media.framed;

  // The box the picture actually occupies, which is the frame less the mat on each side. Asking
  // Cloudflare for the frame instead would over-fetch, the same arithmetic `Attachments` documents.
  const boxWidth = matted ? COLUMN_WIDTH - MAT * 2 : COLUMN_WIDTH;
  const widths = [...new Set([...IMAGE_WIDTHS.filter((w) => w < media.width), media.width])];

  const picture = (
    <div
      className={styles.mount}
      style={{ aspectRatio: `${media.width} / ${media.height}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- next/image cannot emit a srcset of
          Cloudflare transform URLs, and `images.unoptimized` is on for the whole site anyway: the
          edge does the resizing, not the Next loader. The same call `Gallery.tsx` already makes. */}
      <img
        className={styles.image}
        src={cloudflareImageUrl(media.url, { width: boxWidth, fit: 'contain' })}
        srcSet={widths
          .map((w) => `${cloudflareImageUrl(media.url, { width: w, dpr: 1, fit: 'contain' })} ${w}w`)
          .join(', ')}
        // The column is `min(540px, 100vw - 48px)` — `.page` pads 24px either side — less the mat.
        // Spelled as a breakpoint rather than a `min()` so it is understood everywhere.
        sizes={
          `(max-width: ${COLUMN_WIDTH + 48}px) calc(100vw - ${48 + (matted ? MAT * 2 : 0)}px), ${boxWidth}px`
        }
        alt={alt}
        width={media.width}
        height={media.height}
        loading="lazy"
        decoding="async"
      />
    </div>
  );

  return (
    <figure className={styles.figure}>
      {/* The aspect-ratio box is on the *mount* rather than the frame, and that is what makes the
          mat exact: inset the picture inside a frame that carries the media's own ratio and the
          picture's box is no longer that ratio, so `object-fit` crops it by the mat. Sizing the
          mount and letting the frame be padding around it keeps the picture uncropped. */}
      <div
        className={styles.frame}
        data-matted={matted}
        style={{ '--mat': `${MAT}px` } as React.CSSProperties}
      >
        {openable ? (
          // No `aria-label`: the button's accessible name falls through to the picture's `alt`,
          // which in a case study is the description of what changed and is worth keeping. A short
          // label like the gallery's "View image" would replace it rather than add to it.
          <button type="button" className={styles.trigger} onClick={() => open(media)}>
            {picture}
          </button>
        ) : (
          picture
        )}
      </div>
      {title ? <figcaption className={styles.caption}>{title}</figcaption> : null}
    </figure>
  );
};

export default ProseImage;
