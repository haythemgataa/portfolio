import { promises as fs } from 'fs';
import { join } from 'path';
import type {
  CvFile,
  CvItem,
  HeadingSegment,
  MediaAsset,
  ResolvedCv,
  ResolvedItem,
  ResolvedMedia,
  ResolvedSection,
} from './contentTypes';
import { darkVariant, plainText, splitMuted, splitHeading } from './contentTypes';
import { assetUrl, loadMediaRegistry, resolveAsset } from './mediaRegistry';

/**
 * Loads content/cv.json — build-time input, deliberately outside public/ so it
 * is never served. See CONTENT-SCHEMA.md for the authoring contract.
 *
 * Items reference media by filename; the dimensions live once in
 * content/media.json, so this module never needs sharp.
 */

const CV_PATH = join(process.cwd(), 'content', 'cv.json');

function resolveItem(
  item: CvItem,
  assets: Record<string, MediaAsset>,
  sectionKey: string
): ResolvedItem {
  const { media, ...rest } = item;
  const referrer = `cv.json ${sectionKey}/${item.id}`;
  const attachments = (media ?? [])
    .map((file) => resolveAsset(file, assets, referrer))
    .filter((m): m is ResolvedMedia => m !== null);

  const { segments, plain } = resolveHeading(item.heading, assets, referrer);
  return { ...rest, heading: plain, attachments, headingSegments: segments };
}

/**
 * Turn a heading's `[filename]` tokens into inline icons, and produce the plain string
 * alongside — the latter is what accessible names and the attachment row's label use, since
 * neither wants markup or a literal filename in it.
 *
 * A token that does not resolve stays visible as its literal text rather than vanishing. The
 * warning below goes to the build log, but an author editing in the Studio never sees that, and
 * silently rendering nothing makes a typo look like a feature that does not work.
 */
function resolveHeading(
  heading: string | undefined,
  assets: Record<string, MediaAsset>,
  referrer: string
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

    const resolved = resolveAsset(part.file, assets, `${referrer} heading icon`);
    if (!resolved) {
      pushText(`[${part.file}]`);
      continue;
    }
    if (resolved.type !== 'image') {
      console.warn(`${referrer}: heading icon "${part.file}" is not an image, skipping`);
      pushText(`[${part.file}]`);
      continue;
    }

    // The dark sibling is looked up in the registry rather than probed on disk, so an unregistered
    // file is correctly treated as absent: it could not be served anyway.
    const dark = darkVariant(part.file);

    segments.push({
      kind: 'icon',
      icon: {
        url: resolved.url,
        width: resolved.width,
        height: resolved.height,
        darkUrl: dark && assets[dark] ? assetUrl(dark) : null,
      },
    });
  }

  // Collapse the whitespace the removed tokens leave behind, so a label does not carry a
  // double space where a logo used to be.
  return { segments, plain: plain.replace(/\s{2,}/g, ' ').trim() };
}

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
  // in-progress section does not render a bare heading.
  const sections: ResolvedSection[] = (cv.sections ?? [])
    .filter((section) => (section.items ?? []).length > 0)
    .map((section) => ({
      key: section.key,
      label: section.label,
      items: section.items.map((item) => resolveItem(item, assets, section.key)),
    }));

  return {
    profile: {
      displayName: cv.profile.displayName,
      // Stripped, not raw: this is what the metadata layer reads. The braces render via
      // `bylineSegments` instead.
      byline: plainText(cv.profile.byline),
      bylineSegments: splitMuted(cv.profile.byline ?? ''),
      // Stripped for the same reason, even though nothing reads it today: a raw brace sitting
      // in a resolved field is a trap for whatever picks it up next.
      location: plainText(cv.profile.location),
      locationSegments: splitMuted(cv.profile.location ?? ''),
      about: cv.profile.about,
      profilePhoto: assetUrl(cv.profile.photo),
      // Resolved here rather than in the component so the grid gets each file's real
      // dimensions — the same registry pass every other reference makes, and the reason a
      // tile can lock its own ratio instead of assuming one.
      galleryPreview: (cv.profile.galleryPreview ?? [])
        .map((file) => resolveAsset(file, assets, 'cv.json: profile.galleryPreview'))
        .filter((media): media is ResolvedMedia => media !== null),
    },
    sections,
    contact: {
      label: cv.contact?.label ?? 'Contact',
      items: cv.contact?.items ?? [],
    },
  };
}
