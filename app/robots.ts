import type { MetadataRoute } from 'next';
import { IS_PRODUCTION_DEPLOY, SITE_URL } from './lib/site';

/**
 * robots.txt.
 *
 * **Nothing is disallowed on any branch, and on a non-production build that is the deliberate,
 * load-bearing half of keeping it out of the index.** The obvious move for a preview host is
 * `Disallow: /`, and it is the wrong one: a path a crawler is forbidden to fetch is a path whose
 * `noindex` it can never read, so anything already listed keeps its stale entry indefinitely.
 * Serving `noindex` on a *crawlable* page is the documented removal path, so the directives stay
 * permissive and the work is done by the two things that actually deindex — a `robots` meta tag
 * from `layout.tsx`, and `X-Robots-Tag` headers declared per hostname in `public/_headers`, which
 * are what cover `sitemap.xml` and the media pool, neither of which a meta tag can reach.
 *
 * Those headers were briefly injected into `out/_headers` by `scripts/clean-export.mjs` instead,
 * gated on this same constant. That never reached a deploy — Cloudflare's build command is
 * `npx next build`, so no npm lifecycle script runs there — and stating them by hostname is the
 * better answer anyway, since a branch gate could not cover the pages.dev hosts.
 *
 * On production there is nothing to hide either: the export contains exactly the routes in the
 * sitemap plus the media pool they reference. The Studio is not part of a production build at all
 * — its files are named `page.studio.tsx` / `route.studio.ts` and only resolve as routes under the
 * dev-only `pageExtensions` — so there is no `/studio` to hide, and naming one here would
 * advertise a path that does not exist.
 *
 * **The `Sitemap:` line is the one thing that does change per branch.** `SITE_URL` is hardcoded to
 * the production origin (deliberately — it is also what makes a dev page's canonical point at the
 * real one), so a dev robots.txt would otherwise invite every crawler that read it to go and
 * re-fetch production's sitemap from a host that must not be indexed at all. Omitted rather than
 * rewritten to the preview's own origin, because a preview has no sitemap worth submitting.
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
    ...(IS_PRODUCTION_DEPLOY ? { sitemap: `${SITE_URL}/sitemap.xml` } : {}),
  };
}
