import type { MetadataRoute } from 'next';
import { SITE_URL } from './lib/site';

/**
 * robots.txt, generated so the `Sitemap:` line cannot drift from the origin the sitemap
 * actually uses — both read `SITE_URL`.
 *
 * Nothing is disallowed, and that is correct rather than lazy: the export contains exactly the
 * routes in the sitemap plus the media pool they reference. The Studio is not part of a
 * production build at all — its files are named `page.studio.tsx` / `route.studio.ts` and only
 * resolve as routes under the dev-only `pageExtensions` — so there is no `/studio` to hide, and
 * naming one here would advertise a path that does not exist.
 */
/**
 * Required by `output: 'export'`. A metadata route is a Route Handler underneath, and the
 * exporter refuses one that has not committed to being static — even though this function reads
 * nothing request-shaped. It surfaces at `npm run build` rather than in dev, which is the
 * documented tradeoff of applying `output: 'export'` to production builds only.
 */
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
