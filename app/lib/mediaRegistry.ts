import { createHash } from 'crypto';
import { promises as fs, readFileSync } from 'fs';
import { join } from 'path';
import type { MediaAsset, MediaRegistry, ResolvedMedia } from './contentTypes';
import { resolveMedia } from './resolveContent';

/**
 * content/media.json is the single description of every file in the
 * public/media/ pool. Both loaders resolve through here so a shared asset
 * cannot end up with two different dimension records — which is exactly how the
 * awards video came to be recorded as 16:9 on one side and 1254x704 on the
 * other before the pool existed.
 */

const REGISTRY_PATH = join(process.cwd(), 'content', 'media.json');

/** Every asset is served from one flat directory. */
export const MEDIA_BASE = '/media';

export async function loadMediaRegistry(): Promise<Record<string, MediaAsset>> {
  let parsed: MediaRegistry;
  try {
    parsed = JSON.parse(await fs.readFile(REGISTRY_PATH, 'utf8')) as MediaRegistry;
  } catch (error) {
    throw new Error(`Failed to read content/media.json: ${error}`);
  }
  if (!parsed.assets || typeof parsed.assets !== 'object') {
    throw new Error('content/media.json: expected an "assets" object');
  }
  return parsed.assets;
}

const MEDIA_DIR = join(process.cwd(), 'public', 'media');

/**
 * Enough hex to make a collision irrelevant and short enough to read in a network panel. It is
 * a cache key, not a checksum — the only question asked of it is "are these the same bytes".
 */
const VERSION_LENGTH = 8;

/** One read per file per build process; every URL for a given file asks for the same hash. */
const versions = new Map<string, string | null>();

/**
 * A content hash for a pool file, or null if it is not on disk.
 *
 * **Derived from the bytes rather than authored**, and that is the whole point. A hash written
 * into `media.json` by hand is a hash that can disagree with the file it describes, which is the
 * failure this exists to prevent — the same reasoning that made `type` inferred from the
 * extension instead of stored. It also means the Studio needs no part in this: it writes files
 * and `media.json`, and the version follows from what it wrote.
 *
 * Not the file's mtime, which would be the cheap version and is wrong: git does not preserve
 * mtimes, so every fresh clone and every CI checkout would invent new URLs and throw away a
 * warm cache for bytes that never changed. A content hash is stable across checkouts by
 * construction and moves only when the bytes do.
 *
 * Reading the whole pool costs ~0.15s for 34 MB, which is why this is affordable at all; the map
 * above keeps it to once per file. A missing file returns null rather than throwing — the
 * loaders already warn about broken references, and an unversioned URL is exactly the behaviour
 * that predates this.
 */
function assetVersion(file: string): string | null {
  const cached = versions.get(file);
  if (cached !== undefined) { return cached }

  let version: string | null = null;
  try {
    version = createHash('sha256')
      .update(readFileSync(join(MEDIA_DIR, file)))
      .digest('hex')
      .slice(0, VERSION_LENGTH);
  } catch {
    version = null;
  }

  versions.set(file, version);
  return version;
}

/**
 * The pool file's URL, carrying the content hash that makes it cacheable.
 *
 * `_headers` gives `/media/*` a year of `immutable`, and the filename is the entire cache key —
 * so re-cutting a clip in place published new bytes at a URL every cache had already promised
 * never to re-check. Measured on the dev host after exactly that: `Cf-Cache-Status: HIT` with an
 * 18-hour age serving the previous encode, and the regenerated posters with it, while the origin
 * had the new files all along. The query is what changes when the bytes do, so the year of
 * `immutable` becomes correct rather than a trap.
 *
 * It is the same mechanism `app/opengraph-image.png` already gets for free from Next's file
 * convention, which is what made this the shape to copy rather than shortening the cache policy.
 *
 * Two things this depends on, both verified against the live edge rather than assumed:
 *
 * - **A query is part of Cloudflare's cache key**, so a new hash is a new object (measured: the
 *   second hash came back `MISS`).
 * - **`/cdn-cgi/image/<options>/<source>` tolerates a query on its source.** Every image here is
 *   wrapped by `cloudflareImageUrl`, so a transform that choked on `?v=` would 404 the whole
 *   site's imagery — and that endpoint exists only on Cloudflare's edge, so nothing local would
 *   catch it. Fetched both forms from production: 200 either way, byte-identical output.
 */
export function assetUrl(file: string): string {
  const version = assetVersion(file);
  return version ? `${MEDIA_BASE}/${file}?v=${version}` : `${MEDIA_BASE}/${file}`;
}

/**
 * Turn a filename reference into something a component can render, with the URL carrying the
 * file's content hash.
 *
 * The logic itself lives in `resolveContent.ts`, which touches no filesystem — this binds it to
 * `assetUrl`, the half that does. The Studio binds the same function to a plain `/media/` URL so
 * its canvas resolves content the identical way without reading the pool. See the note at the
 * top of that module.
 */
export function resolveAsset(
  file: string,
  assets: Record<string, MediaAsset>,
  referrer: string
): ResolvedMedia | null {
  return resolveMedia(file, assets, assetUrl, referrer);
}
