import type {
  ContactItem,
  CvItem,
  CvProfile,
  HeadingSegment,
  MediaAsset,
  ResolvedIcon,
  ResolvedItem,
  ResolvedMedia,
  ResolvedProfile,
} from './contentTypes';
import { darkVariant, inferMediaType, plainText, splitHeading, splitMuted } from './contentTypes';
import type { GalleryEntry, GalleryItem } from './galleryTypes';

/**
 * Turning authored JSON into the shapes the components render — with **no filesystem access**,
 * which is the whole reason this is its own module.
 *
 * Two callers need this logic and only one of them can touch disk. `contentLoader` and
 * `galleryLoader` run at build time and resolve a pool filename to a URL carrying its content
 * hash, which means reading the bytes. The Studio's canvas renders the *same* content in the
 * browser, from an unsaved document that is not on disk yet at all — so it resolves against a
 * plain `/media/<file>` URL instead.
 *
 * The half that matters is that everything *else* — which files exist, what a heading's
 * `[token]` becomes, what a missing dimension means, how tags are normalised — is decided in
 * exactly one place. A second copy in the Studio would be a copy that drifts, and the way it
 * would drift is silent: the editor would show something the built site does not.
 *
 * So the URL is injected (`AssetUrlFn`) and nothing here imports `fs`, `path` or `crypto`.
 */

/** How a pool filename becomes a URL. See the note above — this is the only fs-shaped seam. */
export type AssetUrlFn = (file: string) => string;

/**
 * Where a bad reference is reported. The loaders send these to the build log; the Studio
 * passes a no-op, because an author mid-edit produces broken intermediate states constantly
 * and a console full of them says nothing.
 */
export type WarnFn = (message: string) => void;

const noWarn: WarnFn = () => {};

/**
 * Turn a filename reference into something a component can render. Returns null — with a
 * warning naming the referrer — rather than throwing, so one bad reference cannot fail a whole
 * export.
 */
export function resolveMedia(
  file: string,
  assets: Record<string, MediaAsset>,
  urlFor: AssetUrlFn,
  referrer: string,
  warn: WarnFn = console.warn
): ResolvedMedia | null {
  const asset = assets[file];
  if (!asset) {
    warn(`${referrer}: "${file}" is not in content/media.json, skipping`);
    return null;
  }

  const type = asset.type ?? inferMediaType(file);
  if (!type) {
    warn(`${referrer}: cannot determine media type for "${file}", skipping`);
    return null;
  }
  if (!asset.width || !asset.height) {
    // Without dimensions the aspect-ratio box collapses and the layout shifts.
    warn(`media.json: "${file}" is missing width/height, skipping`);
    return null;
  }

  return {
    type,
    url: urlFor(file),
    width: asset.width,
    height: asset.height,
    posterUrl: asset.poster ? urlFor(asset.poster) : null,
    // Omitted means matted — see MediaAsset.framed. Only an explicit false opts out, so
    // every asset authored before the flag keeps the treatment it had.
    framed: asset.framed !== false,
    // The mirror of the above: omitted means *not* floating, so only an explicit true opts
    // in. See MediaAsset.floating.
    floating: asset.floating === true,
  };
}

/**
 * A pool filename as an icon: a picture with no poster, no mat and no lightbox, plus whichever
 * `-dark` sibling the registry happens to hold.
 *
 * Both sizes of item icon go through here — the 20px one a `[filename]` token puts inline in a
 * heading, and the 40px one `item.icon` stands beside the heading and subheading — which is what
 * keeps the `-dark` convention, the "must be an image" rule and the missing-dimensions rule from
 * being stated twice. Returns null for anything unrenderable; the caller decides what to show
 * instead, because those two differ: a token falls back to its own literal text, and an item
 * simply draws no icon.
 */
export function resolveIcon(
  file: string,
  assets: Record<string, MediaAsset>,
  urlFor: AssetUrlFn,
  referrer: string,
  warn: WarnFn = console.warn
): ResolvedIcon | null {
  const resolved = resolveMedia(file, assets, urlFor, referrer, warn);
  if (!resolved) return null;
  if (resolved.type !== 'image') {
    warn(`${referrer}: "${file}" is not an image, skipping`);
    return null;
  }

  // The dark sibling is looked up in the registry rather than probed on disk, so an
  // unregistered file is correctly treated as absent: it could not be served anyway.
  const dark = darkVariant(file);

  return {
    url: resolved.url,
    width: resolved.width,
    height: resolved.height,
    darkUrl: dark && assets[dark] ? urlFor(dark) : null,
  };
}

/**
 * Turn a heading's `[filename]` tokens into inline icons, and produce the plain string
 * alongside — the latter is what accessible names and the attachment row's label use, since
 * neither wants markup or a literal filename in it.
 *
 * A token that does not resolve stays visible as its literal text rather than vanishing. The
 * warning goes to the build log, but an author editing in the Studio never sees that, and
 * silently rendering nothing makes a typo look like a feature that does not work.
 */
export function resolveHeading(
  heading: string | undefined,
  assets: Record<string, MediaAsset>,
  urlFor: AssetUrlFn,
  referrer: string,
  warn: WarnFn = console.warn
): { segments: HeadingSegment[]; plain: string } {
  if (!heading) return { segments: [], plain: '' };

  const segments: HeadingSegment[] = [];
  let plain = '';

  const pushText = (text: string) => {
    const previous = segments[segments.length - 1];
    // Merge with the run before it, so an unresolved token in the middle of a heading does not
    // leave the text split across adjacent nodes.
    if (previous?.kind === 'text') previous.text += text;
    else segments.push({ kind: 'text', text });
    plain += text;
  };

  for (const part of splitHeading(heading)) {
    if (part.kind === 'text') {
      pushText(part.text);
      continue;
    }

    const icon = resolveIcon(part.file, assets, urlFor, `${referrer} heading icon`, warn);
    if (!icon) {
      pushText(`[${part.file}]`);
      continue;
    }

    segments.push({ kind: 'icon', icon });
  }

  // Collapse the whitespace the removed tokens leave behind, so a label does not carry a
  // double space where a logo used to be.
  return { segments, plain: plain.replace(/\s{2,}/g, ' ').trim() };
}

/** One item in an orderable section, with its media, its heading icons and its own icon resolved. */
export function resolveItem(
  item: CvItem,
  assets: Record<string, MediaAsset>,
  urlFor: AssetUrlFn,
  sectionKey: string,
  warn: WarnFn = console.warn
): ResolvedItem {
  // `icon` is destructured out for the same reason `media` is: both are authored as bare
  // filenames, and `...rest` is spread verbatim, so leaving either in place would hand the
  // component a string where it expects a resolved shape.
  const { media, icon, ...rest } = item;
  const referrer = `cv.json ${sectionKey}/${item.id}`;
  const attachments = (media ?? [])
    .map((file) => resolveMedia(file, assets, urlFor, referrer, warn))
    .filter((m): m is ResolvedMedia => m !== null);

  const { segments, plain } = resolveHeading(item.heading, assets, urlFor, referrer, warn);
  return {
    ...rest,
    heading: plain,
    attachments,
    headingSegments: segments,
    icon: icon ? resolveIcon(icon, assets, urlFor, `${referrer} icon`, warn) : null,
  };
}

/**
 * The pinned profile block. `byline` and `location` come back brace-stripped because that is
 * what the metadata layer reads — the braces render through the `*Segments` fields instead.
 * Writing the raw string into metadata would ship a literal `{` into the search result and the
 * social card.
 */
export function resolveProfile(
  profile: CvProfile,
  assets: Record<string, MediaAsset>,
  urlFor: AssetUrlFn,
  warn: WarnFn = console.warn
): ResolvedProfile {
  return {
    displayName: profile.displayName,
    byline: plainText(profile.byline),
    bylineSegments: splitMuted(profile.byline ?? ''),
    location: plainText(profile.location),
    locationSegments: splitMuted(profile.location ?? ''),
    about: profile.about,
    profilePhoto: urlFor(profile.photo),
    // Resolved here rather than in the component so the grid gets each file's real
    // dimensions — the same registry pass every other reference makes, and the reason a
    // tile can lock its own ratio instead of assuming one.
    galleryPreview: (profile.galleryPreview ?? [])
      .map((file) => resolveMedia(file, assets, urlFor, 'cv.json: profile.galleryPreview', warn))
      .filter((media): media is ResolvedMedia => media !== null),
  };
}

/** Contact rows carry no media and no tokens, so they pass through untouched. */
export function resolveContactItems(items: ContactItem[] | undefined): ContactItem[] {
  return items ?? [];
}

/**
 * Tags are hand-authorable free text, so the array can arrive with blank strings, repeats, or
 * — from a bad edit — not be an array at all. Normalising here is what lets `GalleryItem.tags`
 * be a plain `string[]` that the component maps over without re-checking anything, and what
 * makes the rendered tag safe to use as a React key.
 *
 * A `Set` both dedupes and preserves authored order. A malformed value warns and renders
 * nothing rather than failing the build — the same call the loader already makes for a missing
 * file, since one bad label is not worth blocking a deploy over.
 */
export function resolveTags(raw: unknown, id: string, warn: WarnFn = console.warn): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    warn(`gallery.json: "${id}" has a non-array "tags", ignoring it`);
    return [];
  }

  const tags = new Set<string>();
  for (const tag of raw) {
    if (typeof tag !== 'string') continue;
    const trimmed = tag.trim();
    if (trimmed) tags.add(trimmed);
  }
  return [...tags];
}

/** One gallery entry, resolved against the pool. Null for anything unrenderable. */
export function resolveGalleryEntry(
  entry: GalleryEntry,
  index: number,
  assets: Record<string, MediaAsset>,
  urlFor: AssetUrlFn,
  warn: WarnFn = console.warn
): GalleryItem | null {
  if (!entry.file) {
    warn(`gallery.json: item at index ${index} has no "file", skipping`);
    return null;
  }
  if (!entry.id) {
    warn(`gallery.json: "${entry.file}" has no "id", skipping`);
    return null;
  }

  const media = resolveMedia(entry.file, assets, urlFor, `gallery.json ${entry.id}`, warn);
  if (!media) return null;

  return {
    id: entry.id,
    type: media.type,
    url: media.url,
    width: media.width,
    height: media.height,
    title: entry.title ?? null,
    caption: entry.caption ?? null,
    date: entry.date ?? null,
    tags: resolveTags(entry.tags, entry.id, warn),
    posterUrl: media.posterUrl,
    floating: media.floating,
  };
}

/** The Studio's warn: an author mid-edit produces broken states constantly. */
export const silent = noWarn;
