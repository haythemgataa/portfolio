export type GalleryMediaType = 'image' | 'video';

/**
 * Shape of a single entry in content/gallery.json.
 * See CONTENT-SCHEMA.md for the authoring contract.
 */
export type GalleryEntry = {
  /**
   * Stable, authored, unique. Previously derived from the array index, which
   * meant every id changed whenever the gallery was reordered.
   */
  id: string;
  /** Filename inside public/media/gallery/. Required. */
  file: string;
  title?: string;
  caption?: string;
  /** Overrides the extension-based guess. Rarely needed. */
  type?: GalleryMediaType;
  /**
   * Intrinsic pixel dimensions. Required — video cannot be measured during the
   * build, so leaving these to be inferred silently mis-sized every video. The
   * migration and the Studio always write them.
   */
  width: number;
  height: number;
  /** Poster frame filename for video, also inside public/media/gallery/. */
  poster?: string;
  /** Free-form date label shown with the caption, e.g. "2026" or "March 2026". */
  date?: string;
};

export type GalleryFile = {
  version?: number;
  items?: GalleryEntry[];
};

/** A fully resolved gallery item, ready to render. */
export type GalleryItem = {
  id: string;
  type: GalleryMediaType;
  url: string;
  width: number;
  height: number;
  title: string | null;
  caption: string | null;
  date: string | null;
  posterUrl: string | null;
};
