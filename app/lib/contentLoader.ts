import { promises as fs } from 'fs';
import { join } from 'path';
import type {
  CvFile,
  CvItem,
  MediaEntry,
  ResolvedCv,
  ResolvedItem,
  ResolvedMedia,
  ResolvedSection,
} from './contentTypes';
import { inferMediaType } from './contentTypes';

/**
 * Loads content/cv.json — build-time input, deliberately outside public/ so it
 * is never served. See CONTENT-SCHEMA.md for the authoring contract.
 *
 * Media lives under public/media/ and is referenced by bare filename, resolved
 * against the item's stable id. Dimensions are authored, so this module never
 * needs sharp.
 */

const CV_PATH = join(process.cwd(), 'content', 'cv.json');

/** Media a component can render. `attachments` is the key Attachments.tsx takes. */
function resolveMedia(entry: MediaEntry, itemId: string, label: string): ResolvedMedia | null {
  const type = entry.type ?? inferMediaType(entry.file);
  if (!type) {
    console.warn(`cv.json: cannot determine media type for "${entry.file}" on ${label}, skipping`);
    return null;
  }
  if (!entry.width || !entry.height) {
    // Authored dimensions are required — without them the aspect-ratio box
    // collapses and the layout shifts on load.
    console.warn(`cv.json: "${entry.file}" on ${label} is missing width/height, skipping`);
    return null;
  }

  const base = `/media/cv/${itemId}`;
  return {
    type,
    url: `${base}/${entry.file}`,
    width: entry.width,
    height: entry.height,
    posterUrl: entry.poster ? `${base}/${entry.poster}` : null,
  };
}

function resolveItem(item: CvItem, label: string): ResolvedItem {
  const { media, ...rest } = item;
  const attachments = (media ?? [])
    .map((entry) => resolveMedia(entry, item.id, `${label}/${item.id}`))
    .filter((m): m is ResolvedMedia => m !== null);
  return { ...rest, attachments };
}

/**
 * Ids name media folders (public/media/cv/<id>/), so a collision would make two
 * items silently share images. Fail the build rather than ship that.
 */
function assertUniqueIds(cv: CvFile): void {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  const check = (id: string) => {
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  };

  for (const section of cv.sections ?? []) {
    for (const item of section.items ?? []) check(item.id);
  }
  for (const item of cv.contact?.items ?? []) check(item.id);

  if (duplicates.length) {
    throw new Error(
      `cv.json: duplicate item id(s) — ${[...new Set(duplicates)].join(', ')}. ` +
        `Ids must be unique across the whole document because they name media folders.`
    );
  }
}

export async function loadProfileData(): Promise<ResolvedCv> {
  let cv: CvFile;
  try {
    cv = JSON.parse(await fs.readFile(CV_PATH, 'utf8')) as CvFile;
  } catch (error) {
    throw new Error(`Failed to read content/cv.json: ${error}`);
  }

  if (!cv.profile?.displayName) {
    throw new Error('cv.json: profile.displayName is required');
  }
  assertUniqueIds(cv);

  // Empty sections were omitted by the previous loader; keep that so an
  // in-progress section does not render a bare heading.
  const sections: ResolvedSection[] = (cv.sections ?? [])
    .filter((section) => (section.items ?? []).length > 0)
    .map((section) => ({
      key: section.key,
      label: section.label,
      items: section.items.map((item) => resolveItem(item, section.key)),
    }));

  return {
    profile: {
      displayName: cv.profile.displayName,
      byline: cv.profile.byline,
      about: cv.profile.about,
      profilePhoto: `/media/profile/${cv.profile.photo}`,
    },
    sections,
    contact: {
      label: cv.contact?.label ?? 'Contact',
      items: cv.contact?.items ?? [],
    },
  };
}
