import { promises as fs } from 'fs';
import { join } from 'path';
import type { GalleryEntry, GalleryFile, GalleryItem } from './galleryTypes';
import type { MediaAsset } from './contentTypes';
import { loadMediaRegistry, resolveAsset } from './mediaRegistry';

/** JSON is build-time input outside public/; media is served from public/media/. */
const MANIFEST_PATH = join('content', 'gallery.json');
const POOL_DIR = join('public', 'media');

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
function resolveTags(raw: unknown, id: string): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    console.warn(`gallery.json: "${id}" has a non-array "tags", ignoring it`);
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

function resolveEntry(
  entry: GalleryEntry,
  index: number,
  assets: Record<string, MediaAsset>
): GalleryItem | null {
  if (!entry.file) {
    console.warn(`gallery.json: item at index ${index} has no "file", skipping`);
    return null;
  }
  if (!entry.id) {
    console.warn(`gallery.json: "${entry.file}" has no "id", skipping`);
    return null;
  }

  const media = resolveAsset(entry.file, assets, `gallery.json ${entry.id}`);
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
    tags: resolveTags(entry.tags, entry.id),
    posterUrl: media.posterUrl,
    floating: media.floating,
  };
}

async function readManifest(): Promise<GalleryFile | null> {
  try {
    return JSON.parse(
      await fs.readFile(join(process.cwd(), MANIFEST_PATH), 'utf8')
    ) as GalleryFile;
  } catch {
    return null;
  }
}

/**
 * Cheap check for whether the gallery has anything to show, used to decide if the Gallery
 * tab is worth advertising. Deliberately avoids the registry — it only confirms that at
 * least one listed file actually exists in the pool.
 */
export async function hasGalleryItems(): Promise<boolean> {
  const poolRoot = join(process.cwd(), POOL_DIR);
  const parsed = await readManifest();

  if (!parsed || !Array.isArray(parsed.items)) {
    return false;
  }

  for (const entry of parsed.items) {
    if (!entry?.file) continue;
    try {
      await fs.access(join(poolRoot, entry.file));
      return true;
    } catch {
      // Missing file — keep looking.
    }
  }

  return false;
}

/**
 * Load the gallery in authored order — the order of `items` in gallery.json is the
 * display order, so reordering the array reorders the page.
 *
 * Returns an empty array when gallery.json is absent, so the route builds and renders
 * an empty state before any media has been added.
 */
export async function loadGalleryItems(): Promise<GalleryItem[]> {
  const parsed = await readManifest();

  if (!parsed) {
    return [];
  }

  if (!Array.isArray(parsed.items)) {
    console.warn('gallery.json: expected an "items" array');
    return [];
  }

  assertUniqueIds(parsed.items);

  const assets = await loadMediaRegistry();

  return parsed.items
    .map((entry, index) => resolveEntry(entry, index, assets))
    .filter((item): item is GalleryItem => item !== null);
}

/**
 * The same guarantee `contentLoader` makes for CV item ids, for the same reason and one more.
 * `Gallery` tracks the open item *by id* — the openable subset changes shape with a media query,
 * so an index would go stale — and `findIndex` stops at the first match, so two entries sharing
 * an id open the earlier one whichever was clicked. The Studio addresses entries by id too, and
 * would misroute an edit the same way. Fail the build rather than ship it.
 */
function assertUniqueIds(items: Array<{ id?: string }>): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const entry of items) {
    if (!entry?.id) continue;
    if (seen.has(entry.id)) duplicates.add(entry.id);
    seen.add(entry.id);
  }

  if (duplicates.size) {
    throw new Error(
      `gallery.json: duplicate entry id(s) — ${[...duplicates].join(', ')}. Ids must be unique.`
    );
  }
}
