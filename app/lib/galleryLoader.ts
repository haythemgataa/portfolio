import { promises as fs } from 'fs';
import { join } from 'path';
import type {
  GalleryEntry,
  GalleryFile,
  GalleryItem,
  GalleryMediaType,
} from './galleryTypes';

/** JSON is build-time input outside public/; media is served from public/. */
const MANIFEST_PATH = join('content', 'gallery.json');
const MEDIA_DIR = join('public', 'media', 'gallery');
const PUBLIC_BASE = '/media/gallery';

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg'];
const VIDEO_EXTS = ['mp4', 'webm', 'ogg', 'mov'];

/** Fallback used only when an image cannot be measured, to keep the layout sane. */
const FALLBACK_DIMENSIONS = { width: 1600, height: 900 };

function extensionOf(filename: string): string {
  return filename.toLowerCase().split('.').pop() ?? '';
}

function inferType(filename: string): GalleryMediaType | null {
  const ext = extensionOf(filename);
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  return null;
}

/**
 * Measure an image at build time. sharp is a dev dependency and only ever runs during
 * the build, so a failure here must not break the export — we fall back to 16:9.
 */
async function measureImage(path: string): Promise<{ width: number; height: number } | null> {
  try {
    const sharp = await import('sharp');
    const { width, height } = await sharp.default(path).metadata();
    return width && height ? { width, height } : null;
  } catch {
    return null;
  }
}

async function resolveEntry(
  entry: GalleryEntry,
  index: number,
  mediaRoot: string
): Promise<GalleryItem | null> {
  if (!entry.file) {
    console.warn(`gallery.json: item at index ${index} has no "file", skipping`);
    return null;
  }
  if (!entry.id) {
    console.warn(`gallery.json: "${entry.file}" has no "id", skipping`);
    return null;
  }

  const type = entry.type ?? inferType(entry.file);
  if (!type) {
    console.warn(`gallery.json: cannot determine media type for "${entry.file}", skipping`);
    return null;
  }

  const absolutePath = join(mediaRoot, entry.file);
  try {
    await fs.access(absolutePath);
  } catch {
    console.warn(`gallery.json: "${entry.file}" is listed but missing from media/, skipping`);
    return null;
  }

  let width = entry.width;
  let height = entry.height;

  if (!width || !height) {
    if (type === 'image') {
      const measured = await measureImage(absolutePath);
      if (measured) {
        width = measured.width;
        height = measured.height;
      }
    }
  }

  if (!width || !height) {
    // Video dimensions cannot be measured during the build, so an unspecified video is a
    // content bug — it will render at the wrong aspect ratio and shift the layout.
    console.warn(
      `gallery.json: "${entry.file}" has no width/height${
        type === 'video' ? ' (required for video — add them to gallery.json)' : ''
      }, falling back to ${FALLBACK_DIMENSIONS.width}x${FALLBACK_DIMENSIONS.height}`
    );
    width = FALLBACK_DIMENSIONS.width;
    height = FALLBACK_DIMENSIONS.height;
  }

  return {
    id: entry.id,
    type,
    url: `${PUBLIC_BASE}/${entry.file}`,
    width,
    height,
    title: entry.title ?? null,
    caption: entry.caption ?? null,
    date: entry.date ?? null,
    posterUrl: entry.poster ? `${PUBLIC_BASE}/${entry.poster}` : null,
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
 * tab is worth advertising. Deliberately avoids sharp — it only confirms that at least
 * one listed file actually exists on disk.
 */
export async function hasGalleryItems(): Promise<boolean> {
  const mediaRoot = join(process.cwd(), MEDIA_DIR);
  const parsed = await readManifest();

  if (!parsed || !Array.isArray(parsed.items)) {
    return false;
  }

  for (const entry of parsed.items) {
    if (!entry?.file) continue;
    try {
      await fs.access(join(mediaRoot, entry.file));
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
 * Returns an empty array when the gallery directory or gallery.json is absent, so the
 * route builds and renders an empty state before any media has been added.
 */
export async function loadGalleryItems(): Promise<GalleryItem[]> {
  const mediaRoot = join(process.cwd(), MEDIA_DIR);
  const parsed = await readManifest();

  if (!parsed) {
    return [];
  }

  if (!Array.isArray(parsed.items)) {
    console.warn('gallery.json: expected an "items" array');
    return [];
  }

  const resolved = await Promise.all(
    parsed.items.map((entry, index) => resolveEntry(entry, index, mediaRoot))
  );

  return resolved.filter((item): item is GalleryItem => item !== null);
}
