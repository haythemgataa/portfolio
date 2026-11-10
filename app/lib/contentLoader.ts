import { promises as fs } from 'fs';
import { join } from 'path';
import type { CvFile, ResolvedCaseStudy, ResolvedCv, ResolvedSection } from './contentTypes';
import { resolveCaseStudy, resolveItem, resolveProfile } from './resolveContent';
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
const CASE_STUDIES_DIR = join(process.cwd(), 'content', 'case-studies');

/**
 * Slugs a case study may not take, because `app/[slug]` is a catch-all at the *root* and these
 * are already spoken for. A collision does not error anywhere — the more specific route simply
 * wins and the card links to a page that is not the case study — so it has to be caught here.
 *
 * `__placeholder__` is on the list because `[slug]/page.tsx` synthesises it when the directory
 * is empty and calls `notFound()` on it by name.
 */
const RESERVED_SLUGS = new Set([
  'gallery',
  'studio',
  'robots.txt',
  'sitemap.xml',
  '__placeholder__',
]);

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

/**
 * Case study slugs get their own namespace rather than joining the id pool above.
 *
 * A slug and an item id sharing a word collides in nothing: one is a URL and a file on disk, the
 * other a React key inside a section. Pooling them would reject a perfectly good document — a
 * `deeppcb` case study beside a `deeppcb` CV item is exactly the pairing you would expect to
 * author.
 *
 * Uniqueness *among slugs* still has to hold: two entries with one slug would render two cards
 * pointing at one page, and the second would take the first's React key.
 */
function assertValidSlugs(cv: CvFile): void {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const reserved: string[] = [];

  for (const entry of cv.caseStudies?.items ?? []) {
    if (seen.has(entry.slug)) duplicates.push(entry.slug);
    seen.add(entry.slug);
    if (RESERVED_SLUGS.has(entry.slug)) reserved.push(entry.slug);
  }

  if (duplicates.length) {
    throw new Error(
      `cv.json: duplicate case study slug(s) — ${[...new Set(duplicates)].join(', ')}.`
    );
  }
  if (reserved.length) {
    throw new Error(
      `cv.json: case study slug(s) shadow an existing route — ${reserved.join(', ')}. ` +
        `app/[slug] is a catch-all at the root, so these can never resolve to the case study.`
    );
  }
}

/**
 * The case studies that have something to link to.
 *
 * **A card whose markdown file is missing is dropped**, because it would link to a 404 — worse
 * than no card at all. This is the same shape as the empty-section filter below, and the same
 * call `hasGalleryItems()` makes before the layout offers the Gallery tab.
 *
 * It lives here rather than in `resolveContent.ts` because it needs disk, which is precisely the
 * seam that module exists to stay on the other side of. The consequence is that the Studio's
 * canvas cannot apply it and will show a card the site drops — which for a read-only view is the
 * better failure, since a missing `.md` is an authoring error worth seeing.
 */
async function resolveCaseStudies(
  cv: CvFile,
  assets: Awaited<ReturnType<typeof loadMediaRegistry>>
): Promise<ResolvedCaseStudy[]> {
  const entries = cv.caseStudies?.items ?? [];
  const resolved: ResolvedCaseStudy[] = [];

  for (const entry of entries) {
    try {
      await fs.access(join(CASE_STUDIES_DIR, `${entry.slug}.md`));
    } catch {
      console.warn(
        `cv.json caseStudies/${entry.slug}: no content/case-studies/${entry.slug}.md, skipping`
      );
      continue;
    }
    resolved.push(resolveCaseStudy(entry, assets, assetUrl));
  }

  return resolved;
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
  assertValidSlugs(cv);

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
    caseStudies: {
      label: cv.caseStudies?.label ?? 'Case Studies',
      items: await resolveCaseStudies(cv, assets),
    },
    sections,
    contact: {
      label: cv.contact?.label ?? 'Contact',
      items: cv.contact?.items ?? [],
    },
  };
}
