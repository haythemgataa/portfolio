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

/**
 * Whether this build is the dev deploy.
 *
 * `NEXT_PUBLIC_GIT_BRANCH` is set in next.config.ts from `CF_PAGES_BRANCH` (Cloudflare builds in
 * detached HEAD, so the branch cannot be read from git there) falling back to the local branch.
 * `env` inlines it at build time, so this is a literal in the output rather than a lookup — which
 * is what lets the production export contain no trace of the decoration below.
 *
 * **It tests `=== 'dev'`, where `THEME_SWITCH_ENABLED` tests `!== PRODUCTION_BRANCH`, and the
 * difference is deliberate.** The theme switch is a working tool that should exist anywhere that
 * is not production — a feature-branch preview and local dev included. This marks *the* dev
 * deploy, the one at a known URL that gets looked at alongside the real site, which is exactly
 * what the `beta` badge in `ProfileHeader` marks. The two share this constant rather than each
 * carrying their own `'dev'` literal, so they cannot come to disagree about what they are marking.
 */
export const IS_DEV_BRANCH = process.env.NEXT_PUBLIC_GIT_BRANCH === 'dev';

/**
 * A page's `<title>`, suffixed on the dev deploy so a tab is identifiable at a glance when it is
 * open beside the real site.
 *
 * Every route that declares a title goes through this — `/`, `/gallery` and the 404 — so there is
 * no page where the dev build is indistinguishable from production in the tab strip.
 *
 * **Only the `<title>`, never `og:title` or `twitter:title`.** Those are what a link preview
 * renders, and they describe the *site* rather than the build it was served from; a card that
 * announced itself as "… | Dev" would be wrong the moment anything from a preview URL got shared
 * or scraped. The tab is the surface where knowing which build you are looking at is useful.
 */
export function pageTitle(title: string): string {
  return IS_DEV_BRANCH ? `${title} | Dev` : title;
}
