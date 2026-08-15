import { promises as fs } from 'fs';
import { join } from 'path';
import type { MetadataRoute } from 'next';
import { hasGalleryItems } from './lib/galleryLoader';
import { SITE_URL } from './lib/site';

/**
 * Derived from the same sources the routes are, so it cannot list a page that does not exist or
 * miss one that does.
 *
 * `lastModified` is the build time, evaluated once here, which is the same reasoning as
 * `SiteFooter`'s "Last updated": for a static site, publishing *is* rebuilding, so the build
 * clock is the only date that cannot go stale. A hand-authored date would have to be remembered.
 */
const BUILD_TIME = new Date();

/** Required by `output: 'export'` for a metadata route — see the note in `robots.ts`. */
export const dynamic = 'force-static';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: BUILD_TIME, changeFrequency: 'monthly', priority: 1 },
  ];

  // Gated on the gallery actually having media, the same question `layout.tsx` asks before it
  // offers the tab. The route always builds and always answers 200 — that is deliberate, so a
  // direct link keeps working — but while it is empty the page is one line of "Nothing here
  // yet.", which is not something to invite a crawler to index.
  if (await hasGalleryItems()) {
    entries.push({
      url: `${SITE_URL}/gallery`,
      lastModified: BUILD_TIME,
      changeFrequency: 'monthly',
      priority: 0.8,
    });
  }

  for (const slug of await caseStudySlugs()) {
    entries.push({
      url: `${SITE_URL}/${slug}`,
      lastModified: BUILD_TIME,
      changeFrequency: 'yearly',
      priority: 0.6,
    });
  }

  return entries;
}

/**
 * The real case-study routes. `generateStaticParams` emits a synthetic `__placeholder__` slug
 * when there are none, because `output: 'export'` requires at least one — that page calls
 * `notFound()` and `scripts/clean-export.mjs` deletes it after the build, so it must never
 * appear here. Reading the directory directly rather than importing `generateStaticParams`
 * keeps the placeholder out by construction instead of by filtering for its name.
 */
async function caseStudySlugs(): Promise<string[]> {
  try {
    const files = await fs.readdir(join(process.cwd(), 'content', 'case-studies'));
    return files.filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
  } catch {
    // No case studies yet — the directory is absent, which is the normal state today.
    return [];
  }
}
