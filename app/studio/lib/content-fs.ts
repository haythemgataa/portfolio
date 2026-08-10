import { promises as fs } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { CONTENT_ROOT, StudioError, assertSafeSegment, contentPath } from './paths';
import { getMediaType, humanizeSectionName } from './schema';

const PREFIX_RE = /^(\d{3})-(.+)$/;
const TMP_PREFIX = '__studio_tmp_';

export interface DirEntry {
  /** Full directory name on disk, e.g. "002-workExperience" */
  dir: string;
  /** Numeric prefix, e.g. 2 */
  prefix: number;
  /** Name without the prefix, e.g. "workExperience" */
  key: string;
}

export interface MediaFile {
  filename: string;
  type: 'image' | 'video';
  width: number;
  height: number;
  /** Whether this file is listed in item.json's attachments array. */
  attached: boolean;
}

export interface ItemNode extends DirEntry {
  data: Record<string, any>;
  media: MediaFile[];
}

export interface SectionNode extends DirEntry {
  displayName: string;
  items: ItemNode[];
}

function pad(n: number): string {
  return String(n).padStart(3, '0');
}

function splitPrefix(dirName: string): { prefix: number; key: string } | null {
  const match = dirName.match(PREFIX_RE);
  if (!match) return null;
  return { prefix: parseInt(match[1], 10), key: match[2] };
}

/** Turn free text into a directory-safe slug matching the existing naming. */
export function slugify(input: string, fallback = 'item'): string {
  const slug = String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug || fallback;
}

/** Firebase-style 20-char id, matching the ids already in the content files. */
function generateId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(20);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** List prefixed child directories of `parentSegments`, ordered by prefix. */
async function listPrefixed(parentSegments: string[]): Promise<DirEntry[]> {
  const abs = contentPath(...parentSegments);
  let entries;
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    throw new StudioError(`Directory not found: ${parentSegments.join('/') || 'content'}`, 404);
  }
  const dirs: DirEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const parsed = splitPrefix(entry.name);
    if (!parsed) continue;
    dirs.push({ dir: entry.name, prefix: parsed.prefix, key: parsed.key });
  }
  return dirs.sort((a, b) => a.prefix - b.prefix);
}

/**
 * Rewrite the numeric prefixes of `parentSegments`' children so they run
 * 001..N in the given order.
 *
 * Renaming in place would clobber siblings (moving 003 to 001 overwrites the
 * existing 001), so every directory moves to a scratch name first and only
 * then to its final name. If the second pass fails partway, the scratch names
 * are rolled back to the originals.
 */
async function renumber(parentSegments: string[], orderedDirs: string[]): Promise<string[]> {
  const parentAbs = contentPath(...parentSegments);
  const current = await listPrefixed(parentSegments);

  // `orderedDirs` must be exactly the set on disk — no additions, no drops.
  const currentSet = new Set(current.map((d) => d.dir));
  if (orderedDirs.length !== currentSet.size || !orderedDirs.every((d) => currentSet.has(d))) {
    throw new StudioError(
      'Reorder list does not match the directories on disk — reload the Studio and try again.'
    );
  }

  const staged: { tmp: string; original: string }[] = [];
  try {
    for (let i = 0; i < orderedDirs.length; i++) {
      const original = assertSafeSegment(orderedDirs[i], 'directory');
      const tmp = `${TMP_PREFIX}${i}`;
      await fs.rename(join(parentAbs, original), join(parentAbs, tmp));
      staged.push({ tmp, original });
    }
  } catch (error) {
    await rollback(parentAbs, staged);
    throw error;
  }

  const finalNames: string[] = [];
  try {
    for (let i = 0; i < staged.length; i++) {
      const { key } = splitPrefix(staged[i].original)!;
      const finalName = `${pad(i + 1)}-${key}`;
      await fs.rename(join(parentAbs, staged[i].tmp), join(parentAbs, finalName));
      finalNames.push(finalName);
    }
  } catch (error) {
    // Roll back only what has not been finalised yet.
    await rollback(parentAbs, staged.slice(finalNames.length));
    throw error;
  }

  return finalNames;
}

async function rollback(parentAbs: string, staged: { tmp: string; original: string }[]) {
  for (const { tmp, original } of staged.reverse()) {
    try {
      await fs.rename(join(parentAbs, tmp), join(parentAbs, original));
    } catch {
      // Best effort — surfaced to the user by the original error.
    }
  }
}

async function readImageDimensions(path: string): Promise<{ width: number; height: number } | null> {
  try {
    const sharp = await import('sharp');
    const metadata = await sharp.default(path).metadata();
    return metadata.width && metadata.height
      ? { width: metadata.width, height: metadata.height }
      : null;
  } catch {
    return null;
  }
}

async function readItemJson(sectionDir: string, itemDir: string): Promise<Record<string, any>> {
  const path = contentPath(sectionDir, itemDir, 'item.json');
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {
    return {};
  }
}

async function writeItemJson(sectionDir: string, itemDir: string, data: Record<string, any>) {
  const path = contentPath(sectionDir, itemDir, 'item.json');
  await fs.writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Media files present on disk for an item, in attachment order. */
async function listMedia(
  sectionDir: string,
  itemDir: string,
  data: Record<string, any>
): Promise<MediaFile[]> {
  const mediaAbs = contentPath(sectionDir, itemDir, 'media');
  let filenames: string[];
  try {
    filenames = await fs.readdir(mediaAbs);
  } catch {
    return [];
  }

  const usable = filenames.filter((f) => getMediaType(f) !== null).sort();

  // Attachment order wins; anything on disk but unlisted is appended.
  const attachedNames: string[] = Array.isArray(data.attachments)
    ? data.attachments
        .map((a: any) => String(a?.url || '').split('/').pop() || '')
        .filter((name: string) => usable.includes(name))
    : [];
  const ordered = [...attachedNames, ...usable.filter((f) => !attachedNames.includes(f))];

  const files: MediaFile[] = [];
  for (const filename of ordered) {
    const type = getMediaType(filename)!;
    let width = 1920;
    let height = 1080;
    if (type === 'image') {
      const dims = await readImageDimensions(join(mediaAbs, filename));
      if (dims) {
        width = dims.width;
        height = dims.height;
      }
    }
    files.push({ filename, type, width, height, attached: attachedNames.includes(filename) });
  }
  return files;
}

/**
 * Rewrite item.json's `attachments` from what is actually on disk.
 *
 * contentLoader only auto-detects media when `attachments` is empty, so once an
 * item has an explicit list, uploads would otherwise never show up. Keeping the
 * list authoritative is what makes the media panel's ordering meaningful.
 */
export async function syncAttachments(
  sectionDir: string,
  itemDir: string,
  order?: string[]
): Promise<MediaFile[]> {
  const data = await readItemJson(sectionDir, itemDir);

  if (order) {
    for (const filename of order) assertSafeSegment(filename, 'filename');
    // Seed listMedia's ordering with the requested order.
    data.attachments = order.map((filename) => ({ url: filename }));
  }

  const media = await listMedia(sectionDir, itemDir, data);
  data.attachments = media.map(({ type, width, height, filename }) => ({
    type,
    width,
    height,
    url: filename,
  }));
  await writeItemJson(sectionDir, itemDir, data);
  return media.map((m) => ({ ...m, attached: true }));
}

/** Read the whole content tree for the Studio UI. */
export async function readTree(): Promise<SectionNode[]> {
  const sectionDirs = (await listPrefixed([])).filter((s) => s.key !== 'case-studies');
  const sections: SectionNode[] = [];

  for (const section of sectionDirs) {
    // 001-general holds general.json, not items — out of scope for v1.
    if (section.key === 'general') continue;

    const itemDirs = await listPrefixed([section.dir]);
    const items: ItemNode[] = [];
    for (const item of itemDirs) {
      const data = await readItemJson(section.dir, item.dir);
      items.push({ ...item, data, media: await listMedia(section.dir, item.dir, data) });
    }
    sections.push({ ...section, displayName: humanizeSectionName(section.key), items });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Reorder the sections the Studio manages.
 *
 * readTree() hides 001-general (it holds general.json, not items), so `order`
 * covers only a subset of what is on disk. Slot the hidden directories back
 * into the positions they already occupy, otherwise renumber() rejects the
 * list as not matching the filesystem.
 */
export async function reorderSections(order: string[]): Promise<string[]> {
  const current = await listPrefixed([]);
  const managed = new Set(order);
  const queue = order.slice();

  const full = current.map((entry) =>
    managed.has(entry.dir) ? queue.shift()! : entry.dir
  );

  return renumber([], full);
}

/**
 * Normalise a user-typed section name to a directory key.
 *
 * A bare identifier keeps its casing so typing "sideProjects" matches
 * SECTION_MAP exactly; anything else is slugified and camelCased.
 */
function toSectionKey(input: string): string {
  const trimmed = String(input || '').trim();
  if (/^[A-Za-z][A-Za-z0-9]*$/.test(trimmed)) return trimmed;
  return slugify(trimmed, '').replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

export async function createSection(key: string): Promise<string> {
  const safeKey = toSectionKey(key);
  if (!safeKey) throw new StudioError('Section name is required');

  const existing = await listPrefixed([]);
  if (existing.some((s) => s.key.toLowerCase() === safeKey.toLowerCase())) {
    throw new StudioError(`A section named "${safeKey}" already exists`);
  }

  const nextPrefix = existing.reduce((max, s) => Math.max(max, s.prefix), 0) + 1;
  const dir = `${pad(nextPrefix)}-${safeKey}`;
  await fs.mkdir(contentPath(dir), { recursive: false });
  return dir;
}

export async function renameSection(sectionDir: string, key: string): Promise<string> {
  const safeKey = toSectionKey(key);
  if (!safeKey) throw new StudioError('Section name is required');

  const parsed = splitPrefix(assertSafeSegment(sectionDir, 'section'));
  if (!parsed) throw new StudioError(`Not a section directory: ${sectionDir}`);
  if (parsed.key === safeKey) return sectionDir;

  const existing = await listPrefixed([]);
  if (existing.some((s) => s.dir !== sectionDir && s.key.toLowerCase() === safeKey.toLowerCase())) {
    throw new StudioError(`A section named "${safeKey}" already exists`);
  }

  const nextDir = `${pad(parsed.prefix)}-${safeKey}`;
  await fs.rename(contentPath(sectionDir), contentPath(nextDir));
  return nextDir;
}

export async function deleteSection(sectionDir: string): Promise<void> {
  assertSafeSegment(sectionDir, 'section');
  if (sectionDir.replace(PREFIX_RE, '$2') === 'general') {
    throw new StudioError('The general section cannot be deleted');
  }
  await fs.rm(contentPath(sectionDir), { recursive: true, force: true });
  const remaining = await listPrefixed([]);
  await renumber([], remaining.map((s) => s.dir));
}

export async function reorderItems(sectionDir: string, order: string[]): Promise<string[]> {
  assertSafeSegment(sectionDir, 'section');
  return renumber([sectionDir], order);
}

export async function createItem(
  sectionDir: string,
  data: Record<string, any>
): Promise<string> {
  assertSafeSegment(sectionDir, 'section');
  const sectionKey = splitPrefix(sectionDir)?.key ?? sectionDir;
  const label = sectionKey === 'contact' ? data.platform : data.heading;

  const existing = await listPrefixed([sectionDir]);
  const nextPrefix = existing.reduce((max, i) => Math.max(max, i.prefix), 0) + 1;

  let slug = slugify(label, 'item');
  // Sibling slugs must stay unique — contentLoader derives item ids from them.
  const usedSlugs = new Set(existing.map((i) => i.key));
  if (usedSlugs.has(slug)) {
    let n = 2;
    while (usedSlugs.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }

  const itemDir = `${pad(nextPrefix)}-${slug}`;
  await fs.mkdir(contentPath(sectionDir, itemDir), { recursive: false });
  await writeItemJson(sectionDir, itemDir, { id: generateId(), ...data });
  return itemDir;
}

/**
 * Merge `patch` into the existing item.json rather than replacing it, so
 * legacy fields the form doesn't show are preserved.
 */
export async function updateItem(
  sectionDir: string,
  itemDir: string,
  patch: Record<string, any>,
  replace = false
): Promise<Record<string, any>> {
  assertSafeSegment(sectionDir, 'section');
  assertSafeSegment(itemDir, 'item');

  const existing = await readItemJson(sectionDir, itemDir);
  const next = replace ? { ...patch } : { ...existing, ...patch };

  // Clearing a field in the form means "unset", so drop it rather than writing
  // "". Only fields this call actually touched are considered — otherwise
  // editing one field would strip every unrelated empty key already in the
  // file, producing a large diff for a one-word change.
  for (const key of Object.keys(replace ? next : patch)) {
    const value = next[key];
    if (value === '' || value === null || value === undefined) delete next[key];
  }
  if (!next.id) next.id = existing.id || generateId();

  await writeItemJson(sectionDir, itemDir, next);
  return next;
}

export async function renameItem(
  sectionDir: string,
  itemDir: string,
  label: string
): Promise<string> {
  assertSafeSegment(sectionDir, 'section');
  const parsed = splitPrefix(assertSafeSegment(itemDir, 'item'));
  if (!parsed) throw new StudioError(`Not an item directory: ${itemDir}`);

  let slug = slugify(label, 'item');
  if (slug === parsed.key) return itemDir;

  const siblings = await listPrefixed([sectionDir]);
  const usedSlugs = new Set(siblings.filter((i) => i.dir !== itemDir).map((i) => i.key));
  if (usedSlugs.has(slug)) {
    let n = 2;
    while (usedSlugs.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }

  const nextDir = `${pad(parsed.prefix)}-${slug}`;
  await fs.rename(contentPath(sectionDir, itemDir), contentPath(sectionDir, nextDir));
  return nextDir;
}

export async function deleteItem(sectionDir: string, itemDir: string): Promise<void> {
  assertSafeSegment(sectionDir, 'section');
  assertSafeSegment(itemDir, 'item');
  await fs.rm(contentPath(sectionDir, itemDir), { recursive: true, force: true });
  const remaining = await listPrefixed([sectionDir]);
  await renumber([sectionDir], remaining.map((i) => i.dir));
}

export async function deleteMedia(
  sectionDir: string,
  itemDir: string,
  filename: string
): Promise<MediaFile[]> {
  assertSafeSegment(filename, 'filename');
  await fs.rm(contentPath(sectionDir, itemDir, 'media', filename), { force: true });
  return syncAttachments(sectionDir, itemDir);
}

/** Write an uploaded file into the item's media/ folder, avoiding collisions. */
export async function writeMedia(
  sectionDir: string,
  itemDir: string,
  originalName: string,
  bytes: Buffer
): Promise<string> {
  assertSafeSegment(sectionDir, 'section');
  assertSafeSegment(itemDir, 'item');

  const ext = (originalName.split('.').pop() || '').toLowerCase();
  const base = slugify(originalName.replace(/\.[^.]+$/, ''), 'media');
  const candidate = `${base}.${ext}`;
  if (getMediaType(candidate) === null) {
    throw new StudioError(`Unsupported media type: ${originalName}`);
  }

  const mediaAbs = contentPath(sectionDir, itemDir, 'media');
  await fs.mkdir(mediaAbs, { recursive: true });

  let filename = candidate;
  let n = 2;
  while (await exists(join(mediaAbs, filename))) {
    filename = `${base}-${n}.${ext}`;
    n++;
  }

  await fs.writeFile(join(mediaAbs, filename), bytes);
  return filename;
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export { CONTENT_ROOT };
