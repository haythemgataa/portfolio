export type GalleryMediaType = 'image' | 'video';

/**
 * Shape of a single entry in public/content/gallery/gallery.json.
 * Everything except `file` is optional — see gallery.json's own comments and
 * public/content/gallery/README.md for the authoring contract.
 */
export type GalleryEntry = {
  /** Filename inside public/content/gallery/media/. Required. */
  file: string;
  title?: string;
  caption?: string;
  /** Overrides the extension-based guess. Rarely needed. */
  type?: GalleryMediaType;
  /**
   * Intrinsic pixel dimensions. Optional for images (measured at build time with
   * sharp) but REQUIRED for video, which cannot be measured during the build.
   */
  width?: number;
  height?: number;
  /** Poster frame filename for video, also inside media/. */
  poster?: string;
  /** Free-form date label shown with the caption, e.g. "2026" or "March 2026". */
  date?: string;
};

export type GalleryFile = {
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
