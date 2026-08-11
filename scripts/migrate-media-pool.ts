/**
 * Second content migration: collapse public/media/{cv/<itemId>,gallery,profile}
 * into one flat pool, and move per-asset facts into content/media.json.
 *
 *   npx tsx scripts/migrate-media-pool.ts --dry-run
 *   npx tsx scripts/migrate-media-pool.ts
 *
 * Why a registry and not just one folder: a file used by both the CV and the
 * gallery previously had TWO dimension records — one in cv.json, one in
 * gallery.json — and they drifted. The awards video was recorded as 1920x1080
 * on the CV side (sharp cannot measure video, so it took the 16:9 fallback)
 * while the gallery side carried the true 1254x704. Merging the folders alone
 * dedups the bytes and leaves that bug class alive; a registry retires it,
 * because each asset has exactly one description.
 *
 * Files are COPIED, so the old subdirectories can be deleted in a separate
 * reviewable commit.
 */

import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { join, dirname, extname } from 'path';

const ROOT = process.cwd();
const CONTENT = join(ROOT, 'content');
const MEDIA = join(ROOT, 'public', 'media');
const DRY_RUN = process.argv.includes('--dry-run');

/** Dimension pairs the old pipeline wrote when it could not measure a file. */
const KNOWN_FALLBACKS = new Set(['1920x1080', '1600x900']);

type Asset = {
  /** Absolute source path. */
  from: string;
  /** Filename in the new pool. */
  name: string;
  width: number;
  height: number;
  poster?: string;
  /** Where this asset was referenced from, for reporting. */
  origins: string[];
};

const warnings: string[] = [];
const renames: [string, string][] = [];

function slugify(input: string, fallback = 'media'): string {
  const slug = String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || fallback;
}

/** Measure an image so no dimension is ever fabricated. */
async function measureImage(path: string): Promise<{ width: number; height: number } | null> {
  try {
    const sharp = await import('sharp');
    const { width, height } = await sharp.default(path).metadata();
    return width && height ? { width, height } : null;
  } catch {
    return null;
  }
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256').update(await fs.readFile(path)).digest('hex');
}

async function readJson(path: string) {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

async function writeJson(path: string, value: unknown) {
  console.log(`  write  ${path.replace(ROOT + '/', '')}`);
  if (DRY_RUN) return;
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function copy(from: string, to: string) {
  if (DRY_RUN) return;
  await fs.mkdir(dirname(to), { recursive: true });
  await fs.copyFile(from, to);
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN — nothing will be written ===\n' : '=== MIGRATING ===\n');

  const cv = await readJson(join(CONTENT, 'cv.json'));
  const gallery = await readJson(join(CONTENT, 'gallery.json'));

  /** hash -> Asset. Deduplication happens here, by content. */
  const byHash = new Map<string, Asset>();
  /** Names already claimed in the pool. */
  const taken = new Set<string>();

  function claim(preferred: string): string {
    const ext = extname(preferred);
    const base = slugify(preferred.slice(0, -ext.length) || preferred, 'media');
    let name = `${base}${ext}`;
    let n = 2;
    while (taken.has(name)) {
      name = `${base}-${n}${ext}`;
      n++;
    }
    taken.add(name);
    return name;
  }

  /**
   * Register a source file under a preferred name. If the same bytes are
   * already registered, reuse that asset and record the extra origin instead of
   * copying a second time.
   */
  async function register(
    from: string,
    preferredName: string,
    dims: { width: number; height: number } | null,
    origin: string
  ): Promise<string> {
    try {
      await fs.access(from);
    } catch {
      warnings.push(`${origin}: missing on disk, skipped — ${from.replace(ROOT + '/', '')}`);
      return '';
    }

    const hash = await sha256(from);
    const existing = byHash.get(hash);

    if (existing) {
      existing.origins.push(origin);
      // Two records for one file: keep the one that is not a known fallback.
      if (dims) {
        const current = `${existing.width}x${existing.height}`;
        const incoming = `${dims.width}x${dims.height}`;
        if (current !== incoming) {
          const currentIsFallback = KNOWN_FALLBACKS.has(current);
          const incomingIsFallback = KNOWN_FALLBACKS.has(incoming);
          if (currentIsFallback && !incomingIsFallback) {
            existing.width = dims.width;
            existing.height = dims.height;
            warnings.push(
              `${existing.name}: records disagreed (${current} vs ${incoming}); kept ${incoming}, ${current} was a known fallback`
            );
          } else if (!incomingIsFallback) {
            warnings.push(
              `${existing.name}: records disagree (${current} vs ${incoming}) and neither is a known fallback — kept ${current}, verify by hand`
            );
          }
        }
      }
      return existing.name;
    }

    if (!dims) {
      // Not recorded anywhere (posters, the avatar) — measure rather than guess.
      dims = await measureImage(from);
      if (!dims) {
        warnings.push(
          `${origin}: unmeasurable and no dimensions recorded, wrote 1600x900 — verify by hand`
        );
        dims = { width: 1600, height: 900 };
      }
    }

    const name = claim(preferredName);
    renames.push([from.replace(MEDIA + '/', ''), name]);
    byHash.set(hash, { from, name, width: dims.width, height: dims.height, origins: [origin] });
    return name;
  }

  // ---- gallery first, so its shorter names win for shared assets ----------
  // Posters are registered before their video so the video can reference the
  // poster's final pool name.
  const galleryNames = new Map<number, string>();
  const galleryPosters = new Map<number, string>();

  for (const [index, entry] of gallery.items.entries()) {
    if (entry.poster) {
      const posterName = await register(
        join(MEDIA, 'gallery', entry.poster),
        entry.poster,
        null,
        `gallery/${entry.id}#poster`
      );
      if (posterName) galleryPosters.set(index, posterName);
    }
    const name = await register(
      join(MEDIA, 'gallery', entry.file),
      entry.file,
      { width: entry.width, height: entry.height },
      `gallery/${entry.id}`
    );
    if (name) galleryNames.set(index, name);
  }

  // ---- profile ------------------------------------------------------------
  const photoName = await register(
    join(MEDIA, 'profile', cv.profile.photo),
    `profile${extname(cv.profile.photo)}`,
    null, // measured below — the avatar's size is not recorded in cv.json
    'profile.photo'
  );

  // ---- cv items -----------------------------------------------------------
  for (const section of cv.sections) {
    for (const item of section.items ?? []) {
      const media = item.media ?? [];
      // Short names come from `org` where present, falling back to the heading.
      const stem = slugify(item.org || item.heading || item.id, item.id);
      const names: string[] = [];

      for (const [i, entry] of media.entries()) {
        const ext = extname(entry.file);
        const preferred = media.length > 1 ? `${stem}-${i + 1}${ext}` : `${stem}${ext}`;
        const name = await register(
          join(MEDIA, 'cv', item.id, entry.file),
          preferred,
          { width: entry.width, height: entry.height },
          `${section.key}/${item.id}`
        );
        if (name) names.push(name);
      }
      if (names.length) item.media = names;
      else delete item.media;
    }
  }

  // ---- copy every canonical asset into the flat pool ----------------------
  for (const asset of byHash.values()) {
    await copy(asset.from, join(MEDIA, asset.name));
  }

  // ---- registry -----------------------------------------------------------
  // Attach posters after all names are final.
  for (const [index, posterName] of galleryPosters) {
    const videoName = galleryNames.get(index);
    const asset = [...byHash.values()].find((a) => a.name === videoName);
    if (asset) asset.poster = posterName;
  }

  const assets: Record<string, { width: number; height: number; poster?: string }> = {};
  for (const name of [...byHash.values()].map((a) => a.name).sort()) {
    const asset = [...byHash.values()].find((a) => a.name === name)!;
    assets[name] = asset.poster
      ? { width: asset.width, height: asset.height, poster: asset.poster }
      : { width: asset.width, height: asset.height };
  }

  await writeJson(join(CONTENT, 'media.json'), { version: 1, assets });

  // ---- rewrite cv.json and gallery.json ----------------------------------
  cv.profile.photo = photoName;
  await writeJson(join(CONTENT, 'cv.json'), cv);

  gallery.items = gallery.items.map((entry: Record<string, unknown>, index: number) => {
    const next: Record<string, unknown> = { id: entry.id, file: galleryNames.get(index) };
    if (entry.title) next.title = entry.title;
    if (entry.caption) next.caption = entry.caption;
    if (entry.date) next.date = entry.date;
    return next;
  });
  await writeJson(join(CONTENT, 'gallery.json'), gallery);

  // ---- report -------------------------------------------------------------
  const shared = [...byHash.values()].filter((a) => a.origins.length > 1);
  console.log(`\n  pool assets     ${byHash.size}`);
  console.log(`  shared assets   ${shared.length} (were duplicated on disk)`);
  for (const a of shared) console.log(`      ${a.name}  <-  ${a.origins.join(' + ')}`);

  const changed = renames.filter(([from, to]) => from.split('/').pop() !== to);
  console.log(`\n  renamed ${changed.length} of ${renames.length} assets:`);
  for (const [from, to] of changed) console.log(`      ${from}\n        -> ${to}`);

  if (warnings.length) {
    console.log(`\n  ${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`      - ${w}`);
  } else {
    console.log('\n  no warnings');
  }

  console.log(
    DRY_RUN
      ? '\n  re-run without --dry-run to apply.'
      : '\n  done. public/media/{cv,gallery,profile}/ left in place for a separate commit.'
  );
}

main().catch((error) => {
  console.error('\nMigration failed:', error);
  process.exit(1);
});
