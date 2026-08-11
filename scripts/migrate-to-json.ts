/**
 * One-shot migration from the NNN-prefixed directory tree to the single-JSON
 * content model described in CONTENT-SCHEMA.md.
 *
 *   npx tsx scripts/migrate-to-json.ts --dry-run
 *   npx tsx scripts/migrate-to-json.ts
 *
 * Reads   public/content/**
 * Writes  content/cv.json, content/gallery.json, public/media/**
 *
 * The old tree is COPIED, never moved, so this is re-runnable and deleting the
 * old tree stays a separate reviewable commit.
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';

const ROOT = process.cwd();
const OLD_CONTENT = join(ROOT, 'public', 'content');
const NEW_CONTENT = join(ROOT, 'content');
const NEW_MEDIA = join(ROOT, 'public', 'media');

const DRY_RUN = process.argv.includes('--dry-run');

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp'];
const VIDEO_EXTS = ['mp4', 'webm', 'ogg', 'mov', 'avi'];

/** Fields whose information is already denormalized into `heading`. */
const ROLE_SOURCES = ['title', 'degree', 'name'] as const;
const ORG_SOURCES = ['company', 'school', 'presenter', 'event', 'organization', 'publisher'] as const;
/** Dead outright: empty on every item, or a duplicate of the section key. */
const DROP_FIELDS = ['collaborators', 'type', 'attachments', 'id'] as const;

const KNOWN_ITEM_FIELDS = new Set<string>([
  'id', 'year', 'heading', 'url', 'location', 'description', 'attachments',
  'platform', 'handle',
  ...ROLE_SOURCES, ...ORG_SOURCES, ...DROP_FIELDS,
]);

/** Display labels for the section keys that exist today. */
const SECTION_LABELS: Record<string, string> = {
  workExperience: 'Work Experience',
  education: 'Education',
  awards: 'Awards',
  speaking: 'Speaking',
  certifications: 'Certifications',
  features: 'Features',
  volunteering: 'Volunteering',
  contact: 'Contact',
};

const warnings: string[] = [];
const actions: string[] = [];

function warn(message: string) {
  warnings.push(message);
}

function extensionOf(filename: string): string {
  return filename.toLowerCase().split('.').pop() ?? '';
}

function inferMediaType(filename: string): 'image' | 'video' | null {
  const ext = extensionOf(filename);
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  return null;
}

function slugify(input: string, fallback = 'item'): string {
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

function humanize(name: string): string {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

/** Prefixed child directories of `dir`, ordered by their numeric prefix. */
async function listPrefixed(dir: string): Promise<{ dir: string; key: string; prefix: number }[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: { dir: string; key: string; prefix: number }[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^(\d{3})-(.+)$/);
    if (!match) continue;
    out.push({ dir: entry.name, key: match[2], prefix: parseInt(match[1], 10) });
  }
  return out.sort((a, b) => a.prefix - b.prefix);
}

async function readJson(path: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function writeFileMaybe(path: string, contents: string) {
  actions.push(`write  ${path.replace(ROOT + '/', '')}`);
  if (DRY_RUN) return;
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, contents, 'utf8');
}

async function copyFileMaybe(from: string, to: string) {
  actions.push(`copy   ${from.replace(ROOT + '/', '')} -> ${to.replace(ROOT + '/', '')}`);
  if (DRY_RUN) return;
  await fs.mkdir(dirname(to), { recursive: true });
  await fs.copyFile(from, to);
}

/**
 * Resolve an item's media folder into authored entries, measuring every image
 * once so the runtime loader never needs sharp.
 */
async function collectMedia(
  itemPath: string,
  declared: any[] | undefined,
  label: string
): Promise<{ file: string; width: number; height: number; poster?: string }[]> {
  const mediaDir = join(itemPath, 'media');
  let filenames: string[];
  try {
    filenames = (await fs.readdir(mediaDir)).filter((f) => inferMediaType(f) !== null);
  } catch {
    return [];
  }

  // The old loader used the explicit attachments array when present and fell
  // back to a sorted readdir otherwise. Reproduce that order exactly so the
  // rendered output does not change.
  const declaredNames = Array.isArray(declared)
    ? declared
        .map((a) => String(a?.url ?? '').split('/').pop() ?? '')
        .filter((name) => filenames.includes(name))
    : [];
  const ordered =
    declaredNames.length > 0
      ? [...declaredNames, ...filenames.filter((f) => !declaredNames.includes(f)).sort()]
      : filenames.sort();

  const out: { file: string; width: number; height: number }[] = [];
  for (const file of ordered) {
    const type = inferMediaType(file)!;
    const absolute = join(mediaDir, file);

    let dims = type === 'image' ? await measureImage(absolute) : null;
    if (!dims) {
      // Mirror the old loader's defaults so the markup is unchanged.
      const declaredEntry = Array.isArray(declared)
        ? declared.find((a) => String(a?.url ?? '').endsWith(file))
        : undefined;
      if (declaredEntry?.width && declaredEntry?.height) {
        dims = { width: declaredEntry.width, height: declaredEntry.height };
      } else {
        dims = { width: 1920, height: 1080 };
        warn(
          `${label}: could not measure "${file}"${
            type === 'video' ? ' (video cannot be measured)' : ''
          } — wrote 1920x1080, verify by hand`
        );
      }
    }
    out.push({ file, width: dims.width, height: dims.height });
  }
  return out;
}

async function migrateCv() {
  const sectionDirs = await listPrefixed(OLD_CONTENT);

  // ---- profile -----------------------------------------------------------
  const generalDir = sectionDirs.find((s) => s.key === 'general');
  if (!generalDir) throw new Error('001-general not found');

  const general = await readJson(join(OLD_CONTENT, generalDir.dir, 'general.json'));
  if (!general) throw new Error('general.json could not be read');

  const photoFile = String(general.profilePhoto ?? 'profilePhoto.jpg').split('/').pop()!;
  await copyFileMaybe(
    join(OLD_CONTENT, generalDir.dir, 'media', photoFile),
    join(NEW_MEDIA, 'profile', photoFile)
  );

  const droppedGeneral = Object.keys(general).filter(
    (k) => !['profilePhoto', 'displayName', 'byline', 'about'].includes(k)
  );
  if (droppedGeneral.length) {
    console.log(`  general.json: dropping unread fields — ${droppedGeneral.join(', ')}`);
  }

  const profile = {
    displayName: general.displayName,
    byline: general.byline,
    about: general.about,
    photo: photoFile,
  };

  // ---- sections and contact ---------------------------------------------
  const sections: any[] = [];
  let contact: { label: string; items: any[] } | null = null;
  const usedIds = new Set<string>();

  for (const section of sectionDirs) {
    if (section.key === 'general') continue;

    const itemDirs = await listPrefixed(join(OLD_CONTENT, section.dir));
    const isContact = section.key === 'contact';
    const label = SECTION_LABELS[section.key] ?? humanize(section.key);
    const items: any[] = [];

    for (const itemDir of itemDirs) {
      const itemPath = join(OLD_CONTENT, section.dir, itemDir.dir);
      const raw = await readJson(join(itemPath, 'item.json'));
      if (!raw) {
        warn(`${section.dir}/${itemDir.dir}: item.json unreadable, skipped`);
        continue;
      }

      for (const key of Object.keys(raw)) {
        if (!KNOWN_ITEM_FIELDS.has(key)) {
          warn(`${section.dir}/${itemDir.dir}: unrecognized field "${key}" was not migrated`);
        }
      }

      // Contact directories are named 001-item-0.., so derive a real id.
      let id = isContact
        ? `contact-${slugify(raw.platform ?? itemDir.key)}`
        : itemDir.key;
      if (usedIds.has(id)) {
        const scoped = `${section.key}-${id}`;
        warn(`duplicate id "${id}" — renamed to "${scoped}"`);
        id = scoped;
      }
      usedIds.add(id);

      if (isContact) {
        items.push({
          id,
          platform: raw.platform,
          handle: raw.handle,
          ...(raw.url ? { url: raw.url } : {}),
        });
        continue;
      }

      const role = ROLE_SOURCES.map((k) => raw[k]).find((v) => v);
      const org = ORG_SOURCES.map((k) => raw[k]).find((v) => v);
      const media = await collectMedia(
        itemPath,
        raw.attachments,
        `${section.dir}/${itemDir.dir}`
      );

      const item: Record<string, unknown> = { id };
      // Insertion order here is the key order in the emitted JSON.
      if (raw.year) item.year = raw.year;
      if (raw.heading) item.heading = raw.heading;
      if (role) item.role = role;
      if (org) item.org = org;
      if (raw.url) item.url = raw.url;
      if (raw.location) item.location = raw.location;
      if (raw.description) item.description = raw.description;
      if (media.length) item.media = media;

      for (const entry of media) {
        await copyFileMaybe(
          join(itemPath, 'media', entry.file),
          join(NEW_MEDIA, 'cv', id, entry.file)
        );
      }

      items.push(item);
    }

    if (isContact) {
      contact = { label, items };
    } else {
      sections.push({ key: section.key, label, items });
    }
  }

  if (!contact) {
    warn('no contact section found — emitting an empty one');
    contact = { label: 'Contact', items: [] };
  }

  const cv = { version: 1, profile, sections, contact };
  await writeFileMaybe(join(NEW_CONTENT, 'cv.json'), JSON.stringify(cv, null, 2) + '\n');

  return {
    sectionCount: sections.length,
    itemCount: sections.reduce((n, s) => n + s.items.length, 0),
    contactCount: contact.items.length,
    mediaCount: sections.reduce(
      (n, s) => n + s.items.reduce((m: number, i: any) => m + (i.media?.length ?? 0), 0),
      0
    ),
  };
}

async function migrateGallery() {
  const galleryDir = join(OLD_CONTENT, 'gallery');
  const parsed = await readJson(join(galleryDir, 'gallery.json'));
  if (!parsed || !Array.isArray(parsed.items)) {
    warn('gallery.json missing or has no items array — nothing to migrate');
    return { count: 0 };
  }

  const usedIds = new Set<string>();
  const items: any[] = [];

  for (const [index, entry] of parsed.items.entries()) {
    if (!entry?.file) {
      warn(`gallery.json: entry ${index} has no "file", skipped`);
      continue;
    }
    const type = entry.type ?? inferMediaType(entry.file);
    if (!type) {
      warn(`gallery.json: cannot type "${entry.file}", skipped`);
      continue;
    }

    const absolute = join(galleryDir, 'media', entry.file);
    try {
      await fs.access(absolute);
    } catch {
      warn(`gallery.json: "${entry.file}" listed but missing on disk, skipped`);
      continue;
    }

    let id = slugify(entry.file.replace(/\.[^.]+$/, ''), `item-${index}`);
    if (usedIds.has(id)) {
      id = `${id}-${index}`;
      warn(`gallery.json: duplicate id, renamed to "${id}"`);
    }
    usedIds.add(id);

    let width = entry.width;
    let height = entry.height;
    if (!width || !height) {
      const measured = type === 'image' ? await measureImage(absolute) : null;
      if (measured) {
        width = measured.width;
        height = measured.height;
      } else {
        width = 1600;
        height = 900;
        warn(
          `gallery.json: "${entry.file}" has no dimensions${
            type === 'video' ? ' and video cannot be measured' : ''
          } — wrote 1600x900, verify by hand`
        );
      }
    }

    const item: Record<string, unknown> = { id, file: entry.file, width, height };
    if (entry.title) item.title = entry.title;
    if (entry.caption) item.caption = entry.caption;
    if (entry.date) item.date = entry.date;
    if (entry.poster) item.poster = entry.poster;
    if (entry.type) item.type = entry.type;
    items.push(item);

    await copyFileMaybe(absolute, join(NEW_MEDIA, 'gallery', entry.file));
    if (entry.poster) {
      await copyFileMaybe(
        join(galleryDir, 'media', entry.poster),
        join(NEW_MEDIA, 'gallery', entry.poster)
      );
    }
  }

  await writeFileMaybe(
    join(NEW_CONTENT, 'gallery.json'),
    JSON.stringify({ version: 1, items }, null, 2) + '\n'
  );
  return { count: items.length };
}

async function migrateCaseStudies() {
  const from = join(OLD_CONTENT, 'case-studies');
  let files: string[];
  try {
    files = (await fs.readdir(from)).filter((f) => f.endsWith('.md'));
  } catch {
    return { count: 0 };
  }
  for (const file of files) {
    await copyFileMaybe(join(from, file), join(NEW_CONTENT, 'case-studies', file));
  }
  return { count: files.length };
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN — nothing will be written ===\n' : '=== MIGRATING ===\n');

  const cv = await migrateCv();
  const gallery = await migrateGallery();
  const caseStudies = await migrateCaseStudies();

  console.log(`\n  cv.json       ${cv.sectionCount} sections, ${cv.itemCount} items, ${cv.mediaCount} media`);
  console.log(`  contact       ${cv.contactCount} rows (pinned, not in sections[])`);
  console.log(`  gallery.json  ${gallery.count} items`);
  console.log(`  case studies  ${caseStudies.count} markdown files`);
  console.log(`  file ops      ${actions.length}`);

  if (warnings.length) {
    console.log(`\n  ${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`    - ${w}`);
  } else {
    console.log('\n  no warnings');
  }

  if (DRY_RUN) {
    console.log('\n  planned operations:');
    for (const a of actions.slice(0, 12)) console.log(`    ${a}`);
    if (actions.length > 12) console.log(`    … and ${actions.length - 12} more`);
    console.log('\n  re-run without --dry-run to apply.');
  } else {
    console.log('\n  done. The old public/content tree was left untouched.');
  }
}

main().catch((error) => {
  console.error('\nMigration failed:', error);
  process.exit(1);
});
