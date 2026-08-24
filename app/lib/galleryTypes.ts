export type GalleryMediaType = 'image' | 'video';

/**
 * Shape of a single entry in content/gallery.json.
 *
 * Entries carry only *presentation* — which asset, in what order, with what
 * caption. Intrinsic facts about the file (dimensions, poster frame) live once
 * in content/media.json, so an asset shared with the CV cannot end up with two
 * conflicting records. See CONTENT-SCHEMA.md.
 */
export type GalleryEntry = {
  /**
   * Stable, authored, unique. Previously derived from the array index, which
   * meant every id changed whenever the gallery was reordered.
   */
  id: string;
  /** Filename in the public/media/ pool; must exist in content/media.json. */
  file: string;
  title?: string;
  caption?: string;
  /** Free-form date label shown with the caption, e.g. "2026" or "March 2026". */
  date?: string;
  /**
   * Free-text labels joined to the date by middots. Optional and *omitted* when empty
   * rather than written as `[]`, the same rule every other optional field follows.
   *
   * The loader normalises this — blanks dropped, repeats collapsed — so nothing downstream
   * has to. That normalising now carries more weight than it used to: a tag is a *filter key*
   * as well as a label, so two entries agreeing on a tag is what puts them in the same filtered
   * set, and a stray space would silently split one tag into two.
   *
   * Still no routing and no pool reference, so unlike a heading's `[icon.webp]` token they need
   * no reference counting. The mark drawn beside one is keyed off the same string — see
   * `TAG_PATHS` in `app/TagIcon.tsx`, which is the closed vocabulary a tag has to match to get
   * one. An unlisted tag filters exactly the same; it just renders without a mark.
   */
  tags?: string[];
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
  /**
   * Normalised and always present — `[]` when the entry has none, so callers can map it.
   * Also what `Gallery` filters on, matched exactly.
   */
  tags: string[];
  posterUrl: string | null;
  /** From media.json, for the opened view. See `MediaAsset.floating`. */
  floating: boolean;
};
