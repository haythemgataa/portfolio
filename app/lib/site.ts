/**
 * The site's public origin, in one place.
 *
 * Three things need it and they must agree: `metadataBase` in the root layout (which is what
 * lets every other route write `canonical: '/gallery'` as a path rather than a URL), the
 * `Sitemap:` line in robots.txt, and the `<loc>` of every sitemap entry. A second copy would
 * drift, and the failure is quiet — a sitemap pointing at the wrong host is still valid XML.
 *
 * Hardcoded rather than read from an environment variable, for the same reason
 * `PRODUCTION_BRANCH` is hardcoded in next.config.ts: this is a single-origin static site, and
 * a value that only ever has one correct setting is clearer as a constant than as configuration
 * that could be missing at build time. Change it here if the domain changes.
 */
export const SITE_URL = 'https://haythem.cv';

/**
 * The social card, as a served path.
 *
 * The artwork itself is `app/opengraph-image.png`, a Next file convention: the root layout gets
 * its `og:image` — with the type and the real pixel dimensions read off the file, and a
 * cache-busting hash in the query — without naming it anywhere. This constant exists only for
 * routes that declare their own `openGraph`, because metadata is **replaced wholesale, never
 * deep-merged**: a child that sets `openGraph` to change its title drops the inherited image
 * with it, and a child that sets nothing inherits the parent's `og:url` and title too, so
 * /gallery would announce itself as the CV at the site root. Neither is right on its own, so a
 * child overriding the block has to name the image again — this is that name, in one place.
 */
export const OG_IMAGE = '/opengraph-image.png';

/** The artwork's filename inside `app/`, so the served path and the file cannot disagree. */
export const OG_IMAGE_FILE = 'opengraph-image.png';
