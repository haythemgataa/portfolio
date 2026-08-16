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
  /**
   * Where you are, shown in the footer. Takes `{...}` muted runs like the byline does —
   * "Tunisia {(GMT+1)}" sets the offset back from the place. Content rather than markup
   * because it is a fact about the person, and one the Studio has to be able to edit.
   */
  location?: string;
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

/**
 * A resolved inline icon. Deliberately narrower than `ResolvedMedia`: an icon has no poster,
 * no mat and no lightbox, so carrying those fields would only invite the question of what
 * `framed` means on one.
 */
export type ResolvedIcon = {
  url: string;
  width: number;
  height: number;
  /**
   * The `-dark` sibling, when one is in the pool — a mark that disappears against a dark ground
   * needs a different file, not a filter. Null when there is none, in which case the one image
   * serves both themes. See `darkVariant`.
   */
  darkUrl: string | null;
};

/**
 * A heading, split into what renders as text and what renders as an inline icon. Produced by
 * the loader so the parsing happens once on the server and the component just maps over it.
 */
export type HeadingSegment =
  | { kind: 'text'; text: string }
  | { kind: 'icon'; icon: ResolvedIcon };

export type ResolvedItem = Omit<CvItem, 'media'> & {
  attachments: ResolvedMedia[];
  /**
   * `heading` with the icon tokens removed — the plain string, for accessible names and the
   * attachment row's label. `headingSegments` is what actually renders.
   */
  headingSegments: HeadingSegment[];
};

export type ResolvedSection = {
  key: string;
  label: string;
  items: ResolvedItem[];
};

export type ResolvedProfile = Omit<CvProfile, 'photo'> & {
  /** Absolute public URL. */
  profilePhoto: string;
  /**
   * `byline` split into plain and muted runs — what actually renders. `byline` itself is the
   * brace-stripped plain string, which is what the metadata layer wants.
   */
  bylineSegments: MutedSegment[];
  /** `location` split the same way. Empty when none is authored. */
  locationSegments: MutedSegment[];
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

// ---------------------------------------------------------------------------
// Inline icons in headings
// ---------------------------------------------------------------------------

/**
 * `[filename]` inside a heading renders that pool image inline, exactly where it sits — so a
 * logo can go mid-title ("Product Designer at [instadeep.webp] InstaDeep") rather than only
 * before it.
 *
 * Square brackets are safe here because a heading is rendered as plain text, not markdown. If
 * headings ever become markdown this collides with link syntax and the delimiter has to change.
 *
 * Built fresh on each call rather than held at module scope: a `g` regex carries `lastIndex`
 * between uses, which would make a shared instance skip tokens depending on who ran it last.
 */
function tokenPattern(): RegExp {
  return /\[([^[\]\n]+)\]/g;
}

export type HeadingPart =
  | { kind: 'text'; text: string }
  | { kind: 'token'; file: string };

/**
 * Split a heading into literal text and icon tokens. Pure and dependency-free so both the
 * loader and the Studio's reference counter can share it — the filenames referenced from
 * inside a heading have to be counted, or the pool would report them unreferenced and sweep
 * them while they are on screen.
 */
export function splitHeading(heading: string): HeadingPart[] {
  const parts: HeadingPart[] = [];
  const pattern = tokenPattern();
  let last = 0;

  for (let m = pattern.exec(heading); m !== null; m = pattern.exec(heading)) {
    if (m.index > last) parts.push({ kind: 'text', text: heading.slice(last, m.index) });
    parts.push({ kind: 'token', file: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < heading.length) parts.push({ kind: 'text', text: heading.slice(last) });

  return parts;
}

/** Every pool filename a heading names. Used by the reference counter. */
export function headingIconFiles(heading?: string): string[] {
  if (!heading) return [];
  return splitHeading(heading)
    .filter((p): p is { kind: 'token'; file: string } => p.kind === 'token')
    .map((p) => p.file);
}

/**
 * The dark-theme sibling of an icon filename: `-dark` before the extension, so
 * `rive-logo.svg` pairs with `rive-logo-dark.svg`.
 *
 * A convention rather than a second field, because the pairing is a fact about the files and
 * authoring it twice invites the two halves to disagree. Nothing is required to exist — the
 * caller checks the registry and simply gets no variant when there is none.
 *
 * Note that this is also how the dark file becomes *referenced*: a token only ever names the
 * light one, so the counter has to derive the sibling or the sweep would delete it.
 */
export function darkVariant(file: string): string | null {
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return null;

  const stem = file.slice(0, dot);
  // Already a dark file — deriving again would look for `-dark-dark`.
  if (stem.endsWith('-dark')) return null;

  return `${stem}-dark${file.slice(dot)}`;
}

// ---------------------------------------------------------------------------
// Muted runs in free text
// ---------------------------------------------------------------------------

/**
 * `{...}` in an authored string renders that run in the muted grey — "Product Designer
 * {& Engineer}" sets the second half back so the first reads as the primary role, and
 * "Tunisia {(GMT+1)}" does the same for the footer's offset.
 *
 * Named for the treatment rather than for the byline it was written for, because two fields
 * use it now. Anything else that wants the same thing should reuse it rather than grow a
 * second delimiter.
 *
 * Braces rather than the heading's square brackets, and that is not arbitrary: the two tokens
 * mean different things and both are authored by hand, so a shared delimiter would make
 * "[Engineer]" silently a missing-image reference instead of a muted span. Braces are also
 * absent from every byline this CV is likely to carry, where brackets are not.
 *
 * Built fresh on each call for the same reason `tokenPattern` is — a `g` regex carries
 * `lastIndex` between uses and a shared instance would skip tokens depending on who ran last.
 */
function mutedPattern(): RegExp {
  return /\{([^{}\n]*)\}/g;
}

export type MutedSegment = { kind: 'text' | 'muted'; text: string };

/**
 * Split an authored string into plain and muted runs. Pure and dependency-free, matching
 * `splitHeading`, so the loader and the Studio can share it.
 */
export function splitMuted(text: string): MutedSegment[] {
  const segments: MutedSegment[] = [];
  const pattern = mutedPattern();
  let last = 0;

  for (let m = pattern.exec(text); m !== null; m = pattern.exec(text)) {
    if (m.index > last) segments.push({ kind: 'text', text: text.slice(last, m.index) });
    if (m[1]) segments.push({ kind: 'muted', text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ kind: 'text', text: text.slice(last) });

  return segments;
}

/**
 * An authored string with its braces removed — the plain text.
 *
 * This is the half that is easy to forget and expensive to get wrong: the byline is also the
 * site's `description`, its `og:description` and its `twitter:description` (see `layout.tsx`),
 * so without stripping, a literal `{` would ship into the search result and the social card.
 * Same split as a heading's `heading` vs `headingSegments`, and for the same reason.
 */
export function plainText(text?: string): string {
  if (!text) return '';
  return splitMuted(text)
    .map((s) => s.text)
    .join('');
}
