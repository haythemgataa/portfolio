import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import type {
  ContactItem,
  CvFile,
  CvItem,
  CvSection,
  MediaEntry,
} from '../../lib/contentTypes';
import { inferMediaType } from '../../lib/contentTypes';
import {
  CV_MEDIA_ROOT,
  CV_PATH,
  StudioError,
  assertSafeSegment,
  itemMediaPath,
} from './paths';

/**
 * All Studio mutations are read-modify-write on content/cv.json.
 *
 * Two guards make a whole-file rewrite safe (see CONTENT-SCHEMA.md):
 *   1. the write is atomic — temp file then rename;
 *   2. a stale write is rejected by comparing the caller's content hash.
 * Without (2), a tab left open overnight would silently revert the whole CV.
 */

export type Doc = { cv: CvFile; hash: string };

function hashOf(contents: string): string {
  return createHash('sha256').update(contents).digest('hex').slice(0, 16);
}

export async function readDoc(): Promise<Doc> {
  let contents: string;
  try {
    contents = await fs.readFile(CV_PATH, 'utf8');
  } catch {
    throw new StudioError('content/cv.json not found — run the migration first', 404);
  }
  let cv: CvFile;
  try {
    cv = JSON.parse(contents) as CvFile;
  } catch (error) {
    throw new StudioError(`content/cv.json is not valid JSON: ${error}`);
  }
  return { cv, hash: hashOf(contents) };
}

export async function writeDoc(cv: CvFile, expectedHash?: string): Promise<string> {
  if (expectedHash) {
    const { hash } = await readDoc();
    if (hash !== expectedHash) {
      throw new StudioError(
        'content/cv.json changed since this page loaded. Reload the Studio and redo this edit.',
        409
      );
    }
  }

  const contents = JSON.stringify(cv, null, 2) + '\n';
  const tmp = `${CV_PATH}.tmp`;
  await fs.writeFile(tmp, contents, 'utf8');
  // rename is atomic within a filesystem, so no reader sees a partial file.
  await fs.rename(tmp, CV_PATH);
  return hashOf(contents);
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

/** Every id in the document — ids name media folders, so they must be unique. */
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
function mergePatch<T extends Record<string, any>>(
  target: T,
  patch: Record<string, unknown>,
  protectedKeys: string[] = ['id']
): T {
  const next: Record<string, any> = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (protectedKeys.includes(key)) continue;
    if (value === '' || value === null || value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as T;
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

export function createSection(cv: CvFile, label: string): { cv: CvFile; key: string } {
  const trimmed = String(label || '').trim();
  if (!trimmed) throw new StudioError('Section name is required');

  // Keep a bare identifier's casing so "sideProjects" stays camelCase.
  const key = /^[A-Za-z][A-Za-z0-9]*$/.test(trimmed)
    ? trimmed
    : slugify(trimmed, '').replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
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

/** Returns the ids whose media folders should be removed alongside the section. */
export function deleteSection(cv: CvFile, key: string): { cv: CvFile; removedIds: string[] } {
  const section = findSection(cv, key);
  return {
    cv: { ...cv, sections: cv.sections.filter((s) => s.key !== key) },
    removedIds: (section.items ?? []).map((i) => i.id),
  };
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
  const item = mergePatch({ id } as CvItem, data);
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
              i.id !== itemId ? i : mergePatch(i, patch)
            ),
          }
    ),
  };
}

export function deleteItem(cv: CvFile, sectionKey: string, itemId: string): CvFile {
  const section = findSection(cv, sectionKey);
  findItem(section, itemId);
  return {
    ...cv,
    sections: cv.sections.map((s) =>
      s.key !== sectionKey ? s : { ...s, items: s.items.filter((i) => i.id !== itemId) }
    ),
  };
}

// ---------------------------------------------------------------------------
// Contact (pinned bottom — position is fixed, its items are not)
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
  const item = mergePatch({ id, platform: '', handle: '' } as ContactItem, data);
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
      items: contact.items.map((i) => (i.id !== itemId ? i : mergePatch(i, patch))),
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
// Media — the JSON's `media` array is authoritative; disk follows it
// ---------------------------------------------------------------------------

export function reorderMedia(
  cv: CvFile,
  sectionKey: string,
  itemId: string,
  order: string[]
): CvFile {
  const section = findSection(cv, sectionKey);
  const item = findItem(section, itemId);
  const media = applyOrder(item.media ?? [], order, (m) => m.file);
  return updateItem(cv, sectionKey, itemId, { media });
}

export async function deleteMedia(
  cv: CvFile,
  sectionKey: string,
  itemId: string,
  file: string
): Promise<CvFile> {
  assertSafeSegment(file, 'filename');
  const section = findSection(cv, sectionKey);
  const item = findItem(section, itemId);
  const media = (item.media ?? []).filter((m) => m.file !== file);
  await fs.rm(itemMediaPath(itemId, file), { force: true });
  return updateItem(cv, sectionKey, itemId, { media: media.length ? media : undefined });
}

/**
 * Write an uploaded file into the item's media folder and return the authored
 * entry, measuring images so dimensions are always stored.
 */
export async function writeMedia(
  itemId: string,
  originalName: string,
  bytes: Buffer
): Promise<MediaEntry> {
  assertSafeSegment(itemId, 'item id');

  const ext = (originalName.split('.').pop() ?? '').toLowerCase();
  const base = slugify(originalName.replace(/\.[^.]+$/, ''), 'media');
  if (inferMediaType(`${base}.${ext}`) === null) {
    throw new StudioError(`Unsupported media type: ${originalName}`);
  }

  const dir = itemMediaPath(itemId);
  await fs.mkdir(dir, { recursive: true });

  let file = `${base}.${ext}`;
  let n = 2;
  while (await exists(join(dir, file))) {
    file = `${base}-${n}.${ext}`;
    n++;
  }

  const absolute = join(dir, file);
  await fs.writeFile(absolute, bytes);

  const type = inferMediaType(file)!;
  const measured = type === 'image' ? await measureImage(absolute) : null;
  if (!measured) {
    // Video cannot be measured here. 16:9 keeps the layout sane, and the route
    // reports it so the author can correct the numbers.
    return { file, width: 1600, height: 900 };
  }
  return { file, width: measured.width, height: measured.height };
}

export function appendMedia(
  cv: CvFile,
  sectionKey: string,
  itemId: string,
  entries: MediaEntry[]
): CvFile {
  const section = findSection(cv, sectionKey);
  const item = findItem(section, itemId);
  const existing = item.media ?? [];
  const byFile = new Map(existing.map((m) => [m.file, m]));
  for (const entry of entries) byFile.set(entry.file, entry);
  return updateItem(cv, sectionKey, itemId, { media: [...byFile.values()] });
}

/** Remove media folders for deleted items. Best effort — never blocks a write. */
export async function removeMediaFolders(itemIds: string[]): Promise<void> {
  for (const id of itemIds) {
    try {
      await fs.rm(itemMediaPath(id), { recursive: true, force: true });
    } catch {
      // The JSON is the source of truth; a stranded folder is harmless.
    }
  }
}

/** Files on disk that the JSON does not list, per item id. */
export async function findOrphanMedia(cv: CvFile): Promise<Record<string, string[]>> {
  const orphans: Record<string, string[]> = {};
  for (const section of cv.sections ?? []) {
    for (const item of section.items ?? []) {
      let files: string[];
      try {
        files = await fs.readdir(itemMediaPath(item.id));
      } catch {
        continue;
      }
      const listed = new Set((item.media ?? []).map((m) => m.file));
      const extra = files.filter((f) => inferMediaType(f) !== null && !listed.has(f));
      if (extra.length) orphans[item.id] = extra;
    }
  }
  return orphans;
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

export { CV_MEDIA_ROOT };
