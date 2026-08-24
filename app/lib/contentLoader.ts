import { promises as fs } from 'fs';
import { join } from 'path';
import type { CvFile, ResolvedCv, ResolvedSection } from './contentTypes';
import { resolveItem, resolveProfile } from './resolveContent';
import { assetUrl, loadMediaRegistry } from './mediaRegistry';

/**
 * Loads content/cv.json — build-time input, deliberately outside public/ so it
 * is never served. See CONTENT-SCHEMA.md for the authoring contract.
 *
 * Items reference media by filename; the dimensions live once in
 * content/media.json, so this module never needs sharp.
 *
 * The resolution itself is in `resolveContent.ts` and touches no filesystem, because the
 * Studio's canvas has to perform exactly the same one on a document that is not on disk yet.
 * What stays here is what is genuinely file- and build-shaped: reading the JSON, validating it,
 * and binding the URL function to `assetUrl` so the built site gets content-hashed URLs.
 */

const CV_PATH = join(process.cwd(), 'content', 'cv.json');

/**
 * Ids name nothing on disk any more, but they are still React keys and the
 * Studio's addressing scheme, so a collision would make two items
 * indistinguishable. Fail the build rather than ship that.
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
        `Ids must be unique across the whole document.`
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

  const assets = await loadMediaRegistry();

  // Empty sections were omitted by the original loader; keep that so an
  // in-progress section does not render a bare heading. Note that the Studio
  // deliberately does *not* apply this filter — a section you have just created
  // has to be visible in order to put the first item in it.
  const sections: ResolvedSection[] = (cv.sections ?? [])
    .filter((section) => (section.items ?? []).length > 0)
    .map((section) => ({
      key: section.key,
      label: section.label,
      items: section.items.map((item) => resolveItem(item, assets, assetUrl, section.key)),
    }));

  return {
    profile: resolveProfile(cv.profile, assets, assetUrl),
    sections,
    contact: {
      label: cv.contact?.label ?? 'Contact',
      items: cv.contact?.items ?? [],
    },
  };
}
