/**
 * Schema for content/cv.json, content/gallery.json and content/media.json.
 * See CONTENT-SCHEMA.md for the authoring contract.
 *
 * Three naming/shape notes that are deliberate:
 *
 * - Per-asset facts (dimensions, poster) live ONCE in content/media.json, keyed
 *   by filename. cv.json and gallery.json only reference filenames. A file used
 *   by both tabs previously had two dimension records and they drifted apart.
 * - Authored media is a list of filenames; the loader resolves it to
 *   `attachments` because that is the prop Attachments.tsx already takes.
 * - Media `type` is inferred from the file extension rather than stored, so
 *   there is only one source of truth for it.
 */

export type MediaType = 'image' | 'video';

/**
 * One entry in the content/media.json registry — the single description of a
 * file in the public/media/ pool. Keyed by filename, so the same asset cannot
 * carry two conflicting records.
 */
export type MediaAsset = {
  /** Intrinsic pixel dimensions. Always stored so the build never runs sharp. */
  width: number;
  height: number;
  /** Poster frame filename for video, also in the pool. */
  poster?: string;
  /** Overrides the extension-based type guess. Rarely needed. */
  type?: MediaType;
  /**
   * Whether the CV thumbnail mats this asset: an inset, a shadow and a border, in a frame
   * locked to a fixed ratio. **Omitted means yes** — that is the treatment every thumbnail
   * had before the flag existed, so leaving it out preserves it and only `false` opts out,
   * into an image that fills its thumbnail edge to edge at its own ratio.
   *
   * It belongs to the asset rather than to the reference because it follows from what the
   * file *is*: a UI screenshot wants the mat, a photograph wants to bleed. Recording it per
   * reference would let the same file disagree with itself, which is the problem the pool
   * exists to prevent.
   */
  framed?: boolean;
  /**
   * Whether the asset has no rectangle of its own — a mockup collage or a photo montage
   * sitting on transparency rather than filling its frame. **Omitted means no**, so nothing
   * authored before the flag changes.
   *
   * It only affects the opened view. There, a `floating` asset drops the hairline border and
   * the frame it traces — a rectangle drawn around artwork that has none reads as a mistake —
   * and gains the silhouette shadow its thumbnail already has, so it still sits on the page
   * rather than being pasted onto it. Like `framed` it belongs to the asset and not to the
   * reference, because it follows from what the file *is*: the alpha channel either has a
   * rectangle in it or it does not.
   */
  floating?: boolean;
};

/** content/media.json */
export type MediaRegistry = {
  version?: number;
  /** filename -> facts about that file. */
  assets: Record<string, MediaAsset>;
};

/** An item in one of the orderable, timeline-shaped sections. */
export type CvItem = {
  /** Stable and unique across the whole document; names the media folder. */
  id: string;
  year?: string;
  heading?: string;
  url?: string;
  /** Free text under the heading — a location, a stack, whatever the section needs. */
  subheading?: string;
  /** Markdown. */
  description?: string;
  /** Filenames in the public/media/ pool; array order is display order. */
  media?: string[];
};

/** A row in the pinned contact section. */
export type ContactItem = {
  id: string;
  platform: string;
  handle: string;
  url?: string;
};

/**
 * An orderable section. Every entry renders identically, which is what makes
 * reordering safe — see CONTENT-SCHEMA.md, "Fixed vs. orderable sections".
 */
export type CvSection = {
  /** Stable, machine-facing. Replaces the old hardcoded SECTION_MAP. */
  key: string;
  /** Free text, safe to rename — nothing branches on it. */
  label: string;
  items: CvItem[];
};

/** Pinned to the top of the page: header plus the About block. */
export type CvProfile = {
  displayName: string;
  byline?: string;
  /** Markdown. */
  about?: string;
  /** Filename in the public/media/ pool. */
  photo: string;
};

/** Pinned to the bottom. Its items are orderable; its position is not. */
export type CvContact = {
  label: string;
  items: ContactItem[];
};

export type CvFile = {
  version: number;
  profile: CvProfile;
  sections: CvSection[];
  contact: CvContact;
};

// ---------------------------------------------------------------------------
// Resolved shapes — what the loader hands to components
// ---------------------------------------------------------------------------

/** Matches the media shape Attachments.tsx and Lightbox.tsx already consume. */
export type ResolvedMedia = {
  type: MediaType;
  url: string;
  width: number;
  height: number;
  posterUrl: string | null;
  /** Resolved from `MediaAsset.framed`, where omitted means true. */
  framed: boolean;
  /** Resolved from `MediaAsset.floating`, where omitted means false. */
  floating: boolean;
};

export type ResolvedItem = Omit<CvItem, 'media'> & {
  attachments: ResolvedMedia[];
};

export type ResolvedSection = {
  key: string;
  label: string;
  items: ResolvedItem[];
};

export type ResolvedProfile = Omit<CvProfile, 'photo'> & {
  /** Absolute public URL. */
  profilePhoto: string;
};

export type ResolvedContact = {
  label: string;
  items: ContactItem[];
};

export type ResolvedCv = {
  profile: ResolvedProfile;
  sections: ResolvedSection[];
  contact: ResolvedContact;
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp'];
export const VIDEO_EXTS = ['mp4', 'webm', 'ogg', 'mov', 'avi'];

export function extensionOf(filename: string): string {
  return filename.toLowerCase().split('.').pop() ?? '';
}

export function inferMediaType(filename: string): MediaType | null {
  const ext = extensionOf(filename);
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  return null;
}
