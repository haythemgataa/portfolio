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
