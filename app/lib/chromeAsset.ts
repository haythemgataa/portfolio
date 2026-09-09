import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * A content-hashed URL for a file at the **`public/` root** — site chrome, as opposed to the
 * reference-counted media pool.
 *
 * Two separate rules meet here and both point at this module existing.
 *
 * - **Chrome does not belong in `public/media/`.** That pool is reference-counted against
 *   `content/media.json`, so a file in it with no content record reads as an orphan and can be
 *   swept. A favicon has no content record and never will, so it lives at the `public/` root —
 *   the placement the note in CLAUDE.md's Data Layer already prescribes for exactly this case.
 * - **`public/_headers` gives `/*.png` a year of `immutable`.** So the filename *is* the cache
 *   key and nothing ever re-checks it. Publishing new bytes at a path a cache has promised not to
 *   look at again is the bug the pool's `?v=` hashes were introduced to fix — observed live on
 *   `dev.haythem.cv`, serving a previous encode with `Cf-Cache-Status: HIT`. A redrawn favicon at
 *   a fixed path would repeat it exactly.
 *
 * So why not `assetUrl` from `mediaRegistry`? Because that function is *about the pool*: it
 * resolves against `public/media/` and its neighbours in that module are the registry and the
 * reference counting. Teaching it a second root would blur the one distinction that keeps chrome
 * out of the sweep's way.
 *
 * **Not the mtime**, for the reason the pool gives: git does not preserve mtimes, so every fresh
 * clone and CI checkout would invent new URLs and discard a warm cache for bytes that never
 * changed. A content hash is stable across checkouts by construction.
 *
 * Server-only — it reads from disk, so it must not be imported by a client component. That is why
 * it is not in `lib/site.ts` beside `SITE_URL` and `pageTitle()`, which `ProfileHeader` pulls
 * into the browser.
 */

const PUBLIC_DIR = join(process.cwd(), 'public');

/** Matches the pool's `VERSION_LENGTH`: a cache key, not a checksum. */
const VERSION_LENGTH = 8;

/** Memoised per file per build process, the same as the pool's hashes. */
const versions = new Map<string, string | null>();

function version(file: string): string | null {
  const cached = versions.get(file);
  if (cached !== undefined) return cached;

  let hash: string | null = null;
  try {
    hash = createHash('sha256')
      .update(readFileSync(join(PUBLIC_DIR, file)))
      .digest('hex')
      .slice(0, VERSION_LENGTH);
  } catch {
    // A missing file is not worth failing a build over: the URL still resolves to the right
    // path, it simply carries no cache key. The same call the pool's `assetVersion` makes.
    hash = null;
  }

  versions.set(file, hash);
  return hash;
}

/**
 * `chromeAssetUrl('favicon-light.png')` → `/favicon-light.png?v=1a2b3c4d`.
 *
 * The argument is the path relative to `public/`, with no leading slash.
 */
export function chromeAssetUrl(file: string): string {
  const v = version(file);
  return v ? `/${file}?v=${v}` : `/${file}`;
}

/**
 * The two favicons, as a `Metadata['icons']` block: one per theme, chosen by the browser from a
 * `media` query rather than swapped by script.
 *
 * **Declared here rather than at each of the two callers**, because there are two and a second
 * copy would be the copy that goes stale — the same reason `OG_IMAGE` lives in `lib/site.ts`.
 * `app/layout.tsx` needs it, and so does `app/global-not-found.tsx`, which replaces the root
 * layout instead of rendering inside it and so inherits nothing from it.
 *
 * Four things about the shape:
 *
 * - **The config export, not the `app/icon.png` file convention.** That convention hashes its own
 *   URL, which is most of what `chromeAssetUrl` is for — but it has no way to express a media
 *   query, and one favicon per theme is the whole request. So: config for the `media`, and the
 *   hash by hand.
 * - **`app/favicon.ico` stays**, and Next emits it alongside these from its own file convention.
 *   It is the unconditional fallback, for anything that ignores `media` on an icon link or wants
 *   an `.ico` — and because a bookmark bar with no colour scheme to report should still get a
 *   mark.
 * - **`prefers-color-scheme` on both, rather than `dark` alone.** Naming only the dark one leaves
 *   the light PNG unconditional, so a browser that honours `media` would have two candidates
 *   matching in light mode and the choice would come down to document order. Two exclusive
 *   queries make the pair unambiguous.
 * - **`sizes` and `type` are stated** so a browser can pick without fetching, which is the whole
 *   point of declaring an icon in markup.
 */
export function faviconIcons() {
  return {
    icon: [
      {
        url: chromeAssetUrl('favicon-light.png'),
        media: '(prefers-color-scheme: light)',
        type: 'image/png',
        sizes: '48x48',
      },
      {
        url: chromeAssetUrl('favicon-dark.png'),
        media: '(prefers-color-scheme: dark)',
        type: 'image/png',
        sizes: '48x48',
      },
    ],
  };
}
