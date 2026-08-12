import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import type {
  ContactItem,
  CvFile,
  CvItem,
  CvSection,
  MediaAsset,
} from '../../lib/contentTypes';
import { darkVariant, headingIconFiles, inferMediaType } from '../../lib/contentTypes';
import type { GalleryEntry, GalleryFile } from '../../lib/galleryTypes';
import {
  CV_PATH,
  GALLERY_PATH,
  MEDIA_PATH,
  POOL_ROOT,
  StudioError,
  assertSafeSegment,
  poolPath,
} from './paths';

/**
 * All Studio mutations are read-modify-write over content/cv.json and
 * content/media.json.
 *
 * Three guards make whole-file rewrites safe (see CONTENT-SCHEMA.md):
 *   1. each write is atomic — temp file then rename;
 *   2. a stale write is rejected by comparing the caller's content hash, which
 *      covers BOTH files, so a change to either invalidates a pending edit;
 *   3. media is only deleted from the pool once nothing references it.
 *
 * gallery.json is written too, so the hash covers all three files. Reference
 * counting spans both tabs: removing a CV thumbnail must not delete a file the
 * gallery still shows, and vice versa.
 */

export type Doc = {
  cv: CvFile;
  gallery: GalleryFile;
  assets: Record<string, MediaAsset>;
  hash: string;
  /** Exact bytes on disk, so a write can skip files that did not change. */
  raw: { cv: string; media: string; gallery: string };
};

function hashOf(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 16);
}

async function readMaybe(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, 'utf8');
  } catch {
    return null;
  }
}

export async function readDoc(): Promise<Doc> {
  const cvRaw = await readMaybe(CV_PATH);
  if (cvRaw === null) {
    throw new StudioError('content/cv.json not found — run the migration first', 404);
  }
  const mediaRaw = await readMaybe(MEDIA_PATH);
  if (mediaRaw === null) {
    throw new StudioError('content/media.json not found — run the migration first', 404);
  }
  const galleryRaw = (await readMaybe(GALLERY_PATH)) ?? '{"items":[]}';

  let cv: CvFile;
  let assets: Record<string, MediaAsset>;
  let gallery: GalleryFile;
  try {
    cv = JSON.parse(cvRaw) as CvFile;
    assets = (JSON.parse(mediaRaw) as { assets?: Record<string, MediaAsset> }).assets ?? {};
    gallery = JSON.parse(galleryRaw) as GalleryFile;
  } catch (error) {
    throw new StudioError(`Content JSON is invalid: ${error}`);
  }

  return {
    cv,
    gallery,
    assets,
    hash: hashOf(cvRaw, mediaRaw, galleryRaw),
    raw: { cv: cvRaw, media: mediaRaw, gallery: galleryRaw },
  };
}

async function writeAtomic(path: string, contents: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, contents, 'utf8');
  // rename is atomic within a filesystem, so no reader sees a partial file.
  await fs.rename(tmp, path);
}

export async function writeDoc(
  next: { cv: CvFile; assets: Record<string, MediaAsset>; gallery: GalleryFile },
  expectedHash?: string
): Promise<string> {
  // One read serves both the stale check and the "did this file change" test.
  const current = await readDoc();
  if (expectedHash && current.hash !== expectedHash) {
    throw new StudioError(
      // No instruction to reload: the client resyncs and replays the operation
      // when it can, and this text is only ever surfaced once that has failed.
      'Content on disk changed since this page loaded, so nothing was written.',
      409
    );
  }

  const cvContents = JSON.stringify(next.cv, null, 2) + '\n';
  // Registry keys sorted so it stays diff-friendly as assets come and go.
  const sorted: Record<string, MediaAsset> = {};
  for (const key of Object.keys(next.assets).sort()) sorted[key] = next.assets[key];
  const mediaContents = JSON.stringify({ version: 1, assets: sorted }, null, 2) + '\n';
  const galleryContents =
    JSON.stringify({ version: next.gallery.version ?? 1, items: next.gallery.items ?? [] }, null, 2) +
    '\n';

  // Only rewrite what actually differs, so an untouched file keeps its mtime and
  // stays out of the diff. `current.raw` is the bytes we just read.
  const pending: [string, string, string][] = [
    [CV_PATH, cvContents, current.raw.cv],
    [MEDIA_PATH, mediaContents, current.raw.media],
    [GALLERY_PATH, galleryContents, current.raw.gallery],
  ];
  for (const [path, contents, existing] of pending) {
    if (contents !== existing) await writeAtomic(path, contents);
  }

  return hashOf(cvContents, mediaContents, galleryContents);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function slugify(input: string, fallback = 'item'): string {
  const slug = String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug || fallback;
}

function allIds(cv: CvFile): Set<string> {
  const ids = new Set<string>();
  for (const section of cv.sections ?? []) {
    for (const item of section.items ?? []) ids.add(item.id);
  }
  for (const item of cv.contact?.items ?? []) ids.add(item.id);
  return ids;
}

function uniqueId(cv: CvFile, base: string): string {
  const taken = allIds(cv);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function findSection(cv: CvFile, key: string): CvSection {
  const section = (cv.sections ?? []).find((s) => s.key === key);
  if (!section) throw new StudioError(`No section with key "${key}"`, 404);
  return section;
}

function findItem(section: CvSection, itemId: string): CvItem {
  const item = (section.items ?? []).find((i) => i.id === itemId);
  if (!item) throw new StudioError(`No item "${itemId}" in section "${section.key}"`, 404);
  return item;
}

/** Reorder `list` to match `order`, rejecting anything that is not a permutation. */
function applyOrder<T>(list: T[], order: string[], keyOf: (item: T) => string): T[] {
  const byKey = new Map(list.map((item) => [keyOf(item), item]));
  if (order.length !== byKey.size || !order.every((k) => byKey.has(k))) {
    throw new StudioError(
      'Reorder list does not match the document — reload the Studio and try again.'
    );
  }
  return order.map((k) => byKey.get(k)!);
}

/** Drop keys the caller cleared, so nothing is written as "". */
function mergePatch<T extends Record<string, unknown>>(
  target: T,
  patch: Record<string, unknown>,
  protectedKeys: string[] = ['id']
): T {
  const next: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (protectedKeys.includes(key)) continue;
    if (value === '' || value === null || value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as T;
}

// ---------------------------------------------------------------------------
// Media references — the pool is shared, so nothing is deleted while in use
// ---------------------------------------------------------------------------

/**
 * Every filename referenced anywhere: CV item media, item icons, the profile
 * photo, gallery entries, and poster frames declared in the registry.
 *
 * This is the only reference counter — `planGarbage` and `findOrphans` both read
 * it — so a *kind* of reference missing from here is not a small bug: the assets
 * it protects are reported as unreferenced and can be swept while still in use.
 * Anything that can name a pool file has to be counted here.
 */
export function collectReferences(
  cv: CvFile,
  gallery: GalleryFile,
  assets: Record<string, MediaAsset>
): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (file?: string) => {
    if (!file) return;
    counts.set(file, (counts.get(file) ?? 0) + 1);
  };

  if (cv.profile?.photo) bump(cv.profile.photo);
  for (const section of cv.sections ?? []) {
    for (const item of section.items ?? []) {
      for (const file of item.media ?? []) bump(file);
      // Inline heading icons are named inside the heading *string*, so they have to be parsed
      // out rather than read off a field. Missing this is what would let the sweep delete a
      // logo that is currently rendering.
      for (const file of headingIconFiles(item.heading)) {
        bump(file);
        // A `-dark` sibling is never named by anything — it is found by convention from the
        // light file, exactly like a poster is found through its video. So it counts as
        // referenced when the light one is, and nothing else would ever count it.
        const dark = darkVariant(file);
        if (dark && assets[dark]) bump(dark);
      }
    }
  }
  for (const entry of gallery.items ?? []) bump(entry.file);
  // A poster is only reachable through its video, so it counts as referenced
  // exactly when that video is.
  for (const [file, asset] of Object.entries(assets)) {
    if (asset.poster && counts.has(file)) bump(asset.poster);
  }

  return counts;
}

/**
 * Work out which assets are now unreferenced, without touching disk.
 *
 * Kept pure and separate from the deletion so the caller can order things
 * safely: verify the write is not stale, write the JSON, and only then remove
 * files. Deleting first would destroy media even when the write is rejected.
 *
 * Removing a video can orphan its poster, so freed posters are re-queued.
 */
export function planGarbage(
  cv: CvFile,
  gallery: GalleryFile,
  assets: Record<string, MediaAsset>,
  candidates: string[]
): { assets: Record<string, MediaAsset>; remove: string[] } {
  const next = { ...assets };
  const remove: string[] = [];
  const queue = [...new Set(candidates)];

  while (queue.length) {
    const file = queue.pop()!;
    if (!file || !next[file]) continue;

    const counts = collectReferences(cv, gallery, next);
    if ((counts.get(file) ?? 0) > 0) continue;

    const poster = next[file].poster;
    delete next[file];
    remove.push(file);
    if (poster) queue.push(poster);
  }

  return { assets: next, remove };
}

/** Delete pool files. Best effort — a stranded file shows up as an orphan. */
export async function removeFiles(files: string[]): Promise<string[]> {
  const deleted: string[] = [];
  for (const file of files) {
    try {
      await fs.rm(poolPath(file), { force: true });
      deleted.push(file);
    } catch {
      // The registry is the source of truth; a leftover file is inert.
    }
  }
  return deleted;
}

// ---------------------------------------------------------------------------
// Profile (pinned top)
// ---------------------------------------------------------------------------

export function updateProfile(cv: CvFile, patch: Record<string, unknown>): CvFile {
  return { ...cv, profile: mergePatch(cv.profile, patch, ['photo']) };
}

// ---------------------------------------------------------------------------
// Sections (orderable)
// ---------------------------------------------------------------------------

export function reorderSections(cv: CvFile, order: string[]): CvFile {
  return { ...cv, sections: applyOrder(cv.sections ?? [], order, (s) => s.key) };
}

/** A bare identifier keeps its casing, so "sideProjects" stays camelCase. */
/**
 * Labels become camelCase keys, matching the ones already in cv.json. A
 * single-word label used to be returned verbatim, so "Writing" produced the key
 * `Writing` while "Case Studies" produced `caseStudies` — the same generator
 * disagreeing with itself about case.
 */
function toSectionKey(label: string): string {
  const trimmed = String(label || '').trim();
  const camel = /^[A-Za-z][A-Za-z0-9]*$/.test(trimmed)
    ? trimmed
    : slugify(trimmed, '').replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
  return camel.charAt(0).toLowerCase() + camel.slice(1);
}

export function createSection(cv: CvFile, label: string): { cv: CvFile; key: string } {
  const trimmed = String(label || '').trim();
  if (!trimmed) throw new StudioError('Section name is required');

  const key = toSectionKey(trimmed);
  if (!key) throw new StudioError('Section name is required');
  if ((cv.sections ?? []).some((s) => s.key.toLowerCase() === key.toLowerCase())) {
    throw new StudioError(`A section with key "${key}" already exists`);
  }

  const section: CvSection = { key, label: trimmed, items: [] };
  return { cv: { ...cv, sections: [...(cv.sections ?? []), section] }, key };
}

export function renameSection(cv: CvFile, key: string, label: string): CvFile {
  const trimmed = String(label || '').trim();
  if (!trimmed) throw new StudioError('Section label is required');
  findSection(cv, key);
  return {
    ...cv,
    sections: cv.sections.map((s) => (s.key === key ? { ...s, label: trimmed } : s)),
  };
}

/** Returns the files the section referenced, as garbage-collection candidates. */
export function deleteSection(cv: CvFile, key: string): { cv: CvFile; freed: string[] } {
  const section = findSection(cv, key);
  // Icons as well as attachments — both are pool references, so both stop being
  // referenced when the items holding them go.
  const freed = (section.items ?? []).flatMap((i) => itemFiles(i));
  return { cv: { ...cv, sections: cv.sections.filter((s) => s.key !== key) }, freed };
}

/**
 * Every pool file an item names — attachments, inline heading icons, and each icon's `-dark`
 * sibling. These are `freed` *candidates*, and `planGarbage` skips any name that is not in the
 * registry, so listing a variant that does not exist costs nothing and forgetting one would
 * strand it.
 */
function itemFiles(item: CvItem): string[] {
  const icons = headingIconFiles(item.heading);
  const dark = icons.map(darkVariant).filter((f): f is string => f !== null);
  return [...(item.media ?? []), ...icons, ...dark];
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export function reorderItems(cv: CvFile, sectionKey: string, order: string[]): CvFile {
  const section = findSection(cv, sectionKey);
  const items = applyOrder(section.items ?? [], order, (i) => i.id);
  return {
    ...cv,
    sections: cv.sections.map((s) => (s.key === sectionKey ? { ...s, items } : s)),
  };
}

export function createItem(
  cv: CvFile,
  sectionKey: string,
  data: Record<string, unknown>
): { cv: CvFile; itemId: string } {
  const section = findSection(cv, sectionKey);
  const id = uniqueId(cv, slugify(String(data.heading ?? ''), 'item'));
  const item = mergePatch({ id } as unknown as Record<string, unknown>, data) as unknown as CvItem;
  return {
    cv: {
      ...cv,
      sections: cv.sections.map((s) =>
        s.key === sectionKey ? { ...s, items: [...(section.items ?? []), item] } : s
      ),
    },
    itemId: id,
  };
}

export function updateItem(
  cv: CvFile,
  sectionKey: string,
  itemId: string,
  patch: Record<string, unknown>
): CvFile {
  const section = findSection(cv, sectionKey);
  findItem(section, itemId);
  return {
    ...cv,
    sections: cv.sections.map((s) =>
      s.key !== sectionKey
        ? s
        : {
            ...s,
            items: s.items.map((i) =>
              i.id !== itemId
                ? i
                : (mergePatch(
                    i as unknown as Record<string, unknown>,
                    patch
                  ) as unknown as CvItem)
            ),
          }
    ),
  };
}

export function deleteItem(
  cv: CvFile,
  sectionKey: string,
  itemId: string
): { cv: CvFile; freed: string[] } {
  const section = findSection(cv, sectionKey);
  const item = findItem(section, itemId);
  return {
    cv: {
      ...cv,
      sections: cv.sections.map((s) =>
        s.key !== sectionKey ? s : { ...s, items: s.items.filter((i) => i.id !== itemId) }
      ),
    },
    freed: itemFiles(item),
  };
}

// ---------------------------------------------------------------------------
// Contact (pinned bottom — position fixed, its items are not)
// ---------------------------------------------------------------------------

function contactOf(cv: CvFile) {
  return cv.contact ?? { label: 'Contact', items: [] };
}

export function updateContactLabel(cv: CvFile, label: string): CvFile {
  const trimmed = String(label || '').trim();
  if (!trimmed) throw new StudioError('Contact label is required');
  return { ...cv, contact: { ...contactOf(cv), label: trimmed } };
}

export function reorderContactItems(cv: CvFile, order: string[]): CvFile {
  const contact = contactOf(cv);
  return {
    ...cv,
    contact: { ...contact, items: applyOrder(contact.items ?? [], order, (i) => i.id) },
  };
}

export function createContactItem(
  cv: CvFile,
  data: Record<string, unknown>
): { cv: CvFile; itemId: string } {
  const contact = contactOf(cv);
  const id = uniqueId(cv, `contact-${slugify(String(data.platform ?? ''), 'row')}`);
  const item = mergePatch(
    { id, platform: '', handle: '' } as unknown as Record<string, unknown>,
    data
  ) as unknown as ContactItem;
  return {
    cv: { ...cv, contact: { ...contact, items: [...(contact.items ?? []), item] } },
    itemId: id,
  };
}

export function updateContactItem(
  cv: CvFile,
  itemId: string,
  patch: Record<string, unknown>
): CvFile {
  const contact = contactOf(cv);
  if (!(contact.items ?? []).some((i) => i.id === itemId)) {
    throw new StudioError(`No contact row "${itemId}"`, 404);
  }
  return {
    ...cv,
    contact: {
      ...contact,
      items: contact.items.map((i) =>
        i.id !== itemId
          ? i
          : (mergePatch(
              i as unknown as Record<string, unknown>,
              patch
            ) as unknown as ContactItem)
      ),
    },
  };
}

export function deleteContactItem(cv: CvFile, itemId: string): CvFile {
  const contact = contactOf(cv);
  return {
    ...cv,
    contact: { ...contact, items: (contact.items ?? []).filter((i) => i.id !== itemId) },
  };
}

// ---------------------------------------------------------------------------
// Gallery — its own tab, so it is a peer of the CV rather than a section
// ---------------------------------------------------------------------------

function galleryItems(gallery: GalleryFile): GalleryEntry[] {
  return gallery.items ?? [];
}

function findEntry(gallery: GalleryFile, id: string): GalleryEntry {
  const entry = galleryItems(gallery).find((e) => e.id === id);
  if (!entry) throw new StudioError(`No gallery entry "${id}"`, 404);
  return entry;
}

export function reorderGallery(gallery: GalleryFile, order: string[]): GalleryFile {
  return { ...gallery, items: applyOrder(galleryItems(gallery), order, (e) => e.id) };
}

/**
 * Add an entry pointing at an asset already in the pool. Ids are derived from
 * the filename but stay authored afterwards, so reordering never changes them.
 */
export function createGalleryEntry(
  gallery: GalleryFile,
  assets: Record<string, MediaAsset>,
  file: string,
  data: Record<string, unknown> = {}
): { gallery: GalleryFile; itemId: string } {
  assertSafeSegment(file, 'filename');
  if (!assets[file]) {
    throw new StudioError(
      `"${file}" is not in content/media.json — upload it or pick an existing asset.`
    );
  }

  const taken = new Set(galleryItems(gallery).map((e) => e.id));
  let id = slugify(file.replace(/\.[^.]+$/, ''), 'item');
  if (taken.has(id)) {
    let n = 2;
    while (taken.has(`${id}-${n}`)) n++;
    id = `${id}-${n}`;
  }

  const entry = mergePatch(
    { id, file } as unknown as Record<string, unknown>,
    data,
    ['id', 'file']
  ) as unknown as GalleryEntry;

  return { gallery: { ...gallery, items: [...galleryItems(gallery), entry] }, itemId: id };
}

export function updateGalleryEntry(
  gallery: GalleryFile,
  id: string,
  patch: Record<string, unknown>
): GalleryFile {
  findEntry(gallery, id);
  return {
    ...gallery,
    items: galleryItems(gallery).map((e) =>
      e.id !== id
        ? e
        : (mergePatch(e as unknown as Record<string, unknown>, patch, [
            'id',
            'file',
          ]) as unknown as GalleryEntry)
    ),
  };
}

/** Point an entry at a different pooled asset. Frees the previous one. */
/**
 * Point an entry at a different asset. The one it pointed at before stays in the
 * pool — repointing an entry is not a licence to delete what it used to show.
 */
export function setGalleryFile(
  gallery: GalleryFile,
  assets: Record<string, MediaAsset>,
  id: string,
  file: string
): GalleryFile {
  assertSafeSegment(file, 'filename');
  if (!assets[file]) throw new StudioError(`"${file}" is not in content/media.json`);
  findEntry(gallery, id);
  return {
    ...gallery,
    items: galleryItems(gallery).map((e) => (e.id === id ? { ...e, file } : e)),
  };
}

/**
 * Drop a gallery entry. The asset stays in the pool: an entry is a *reference*
 * plus a caption, so removing one is the same act as detaching a thumbnail from
 * a CV item — see `removeMediaRef`. Collecting the file here destroyed two
 * gallery-only assets before this was fixed.
 */
export function deleteGalleryEntry(gallery: GalleryFile, id: string): GalleryFile {
  findEntry(gallery, id);
  return { ...gallery, items: galleryItems(gallery).filter((e) => e.id !== id) };
}

// ---------------------------------------------------------------------------
// Registry entries — editable, so a video's real dimensions can be recorded
// ---------------------------------------------------------------------------

/**
 * Correct an asset's intrinsic facts. This is what makes an uploaded video
 * fixable in the UI: sharp cannot measure video, so uploads land on a 16:9
 * placeholder that has to be replaced with the real numbers.
 */
export function updateAsset(
  assets: Record<string, MediaAsset>,
  file: string,
  patch: {
    width?: unknown;
    height?: unknown;
    poster?: unknown;
    framed?: unknown;
    floating?: unknown;
  }
): Record<string, MediaAsset> {
  assertSafeSegment(file, 'filename');
  const asset = assets[file];
  if (!asset) throw new StudioError(`"${file}" is not in content/media.json`, 404);

  const next: MediaAsset = { ...asset };

  for (const key of ['width', 'height'] as const) {
    if (patch[key] === undefined) continue;
    const value = Number(patch[key]);
    if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
      throw new StudioError(`${key} must be a positive whole number`);
    }
    next[key] = value;
  }

  if (patch.poster !== undefined) {
    if (patch.poster === '' || patch.poster === null) delete next.poster;
    else {
      const poster = assertSafeSegment(patch.poster, 'poster filename');
      if (!assets[poster]) throw new StudioError(`Poster "${poster}" is not in the pool`);
      next.poster = poster;
    }
  }

  if (patch.framed !== undefined) {
    if (typeof patch.framed !== 'boolean') throw new StudioError('framed must be true or false');
    // Omitted means matted, so the default state is written as nothing at all rather than as
    // `true` — the flag only appears in the file when it is turning the treatment off.
    if (patch.framed) delete next.framed;
    else next.framed = false;
  }

  if (patch.floating !== undefined) {
    if (typeof patch.floating !== 'boolean') {
      throw new StudioError('floating must be true or false');
    }
    // The mirror of `framed`: this one defaults to *off*, so it is the `true` case that gets
    // written and the default that is written as nothing at all. Same rule either way — the
    // file only records the flag when it departs from the default.
    if (patch.floating) next.floating = true;
    else delete next.floating;
  }

  return { ...assets, [file]: next };
}

// ---------------------------------------------------------------------------
// Media — cv.json holds the order, media.json holds the facts
// ---------------------------------------------------------------------------

export function reorderMedia(
  cv: CvFile,
  sectionKey: string,
  itemId: string,
  order: string[]
): CvFile {
  const section = findSection(cv, sectionKey);
  const item = findItem(section, itemId);
  const media = applyOrder(item.media ?? [], order, (file) => file);
  return updateItem(cv, sectionKey, itemId, { media });
}

/**
 * Detach one reference. The file stays in the pool and in media.json even when
 * nothing else uses it, so it can be attached to another item later — detaching
 * is not deleting. Garbage collection is left to the operations that say
 * "delete" on the tin (item, section and gallery-entry deletion).
 */
export function removeMediaRef(
  cv: CvFile,
  sectionKey: string,
  itemId: string,
  file: string
): CvFile {
  assertSafeSegment(file, 'filename');
  const section = findSection(cv, sectionKey);
  const item = findItem(section, itemId);
  const media = (item.media ?? []).filter((f) => f !== file);
  return updateItem(cv, sectionKey, itemId, { media: media.length ? media : undefined });
}

export function appendMedia(
  cv: CvFile,
  sectionKey: string,
  itemId: string,
  files: string[]
): CvFile {
  const section = findSection(cv, sectionKey);
  const item = findItem(section, itemId);
  const next = [...(item.media ?? [])];
  for (const file of files) if (!next.includes(file)) next.push(file);
  return updateItem(cv, sectionKey, itemId, { media: next });
}

/**
 * Write an uploaded file into the pool and return its registry entry.
 *
 * Identical bytes already in the pool resolve to the existing asset instead of a
 * second copy — this is what stops the CV and the gallery from each carrying
 * their own copy of the same video.
 */
export async function writeToPool(
  originalName: string,
  bytes: Buffer,
  assets: Record<string, MediaAsset>
): Promise<{ file: string; asset: MediaAsset; deduped: boolean }> {
  const ext = (originalName.split('.').pop() ?? '').toLowerCase();
  const base = slugify(originalName.replace(/\.[^.]+$/, ''), 'media');
  if (inferMediaType(`${base}.${ext}`) === null) {
    throw new StudioError(`Unsupported media type: ${originalName}`);
  }

  await fs.mkdir(POOL_ROOT, { recursive: true });

  const incoming = createHash('sha256').update(bytes).digest('hex');
  for (const existing of Object.keys(assets)) {
    try {
      const current = createHash('sha256')
        .update(await fs.readFile(poolPath(existing)))
        .digest('hex');
      if (current === incoming) {
        return { file: existing, asset: assets[existing], deduped: true };
      }
    } catch {
      // Registered but missing from disk — surfaced separately as an orphan.
    }
  }

  let file = `${base}.${ext}`;
  let n = 2;
  while (assets[file] || (await exists(poolPath(file)))) {
    file = `${base}-${n}.${ext}`;
    n++;
  }

  const absolute = poolPath(file);
  await fs.writeFile(absolute, bytes);

  const type = inferMediaType(file)!;
  const measured = type === 'image' ? await measureImage(absolute) : null;
  // Video cannot be measured here; 16:9 keeps the layout sane and the route
  // reports it so the author can correct the numbers.
  const asset: MediaAsset = measured ?? { width: 1600, height: 900 };
  assets[file] = asset;

  return { file, asset, deduped: false };
}

/**
 * Pool files absent from the registry, and registry entries nothing references.
 * Both are inert rather than broken, so they are surfaced, never auto-deleted.
 */
export async function findOrphans(doc: Doc): Promise<{
  unregistered: string[];
  unreferenced: string[];
}> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(POOL_ROOT, { withFileTypes: true }))
      .filter((e) => e.isFile() && inferMediaType(e.name) !== null)
      .map((e) => e.name);
  } catch {
    // No pool yet.
  }

  const counts = collectReferences(doc.cv, doc.gallery, doc.assets);
  return {
    unregistered: files.filter((f) => !doc.assets[f]),
    unreferenced: Object.keys(doc.assets).filter((f) => (counts.get(f) ?? 0) === 0),
  };
}

async function measureImage(path: string): Promise<{ width: number; height: number } | null> {
  try {
    const sharp = await import('sharp');
    const { width, height } = await sharp.default(path).metadata();
    return width && height ? { width, height } : null;
  } catch {
    return null;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export { POOL_ROOT };
