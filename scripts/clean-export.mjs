// Post-build fixups for the static export. Two jobs, both things `next build` cannot do itself.
//
//  1. `output: 'export'` requires generateStaticParams() to yield at least one route, so
//     app/[slug]/page.tsx emits a synthetic `__placeholder__` slug when there are no case
//     studies. That page calls notFound(), but the export still writes the rendered error
//     page to disk — and Cloudflare Pages would serve /__placeholder__ as a real 200 URL.
//     Remove those files so the deployed site has no reachable placeholder route.
//
//  2. Off the production branch, add `X-Robots-Tag: noindex, nofollow` to `out/_headers` — see
//     `markNoindex` below for why a meta tag alone is not enough.

import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getGitBranch, isProductionBranch } from './branch.mjs';

const outDir = join(process.cwd(), 'out');

const targets = [
  '__placeholder__',
  '__placeholder__.html',
  '__placeholder__.txt',
];

for (const target of targets) {
  await rm(join(outDir, target), { recursive: true, force: true });
}

console.log('cleaned placeholder route from static export');

/**
 * Serve `noindex` from the edge on every non-production deploy.
 *
 * **This is not a duplicate of the `robots` meta tag `layout.tsx` emits — it reaches what a meta
 * tag cannot.** `sitemap.xml`, `404.html` and every file in the media pool are indexable URLs with
 * nowhere to put a `<meta>`, and dev's sitemap lists the *production* URLs (because `SITE_URL` is
 * hardcoded), so a crawler reading it from a preview host is being handed the real site's map by
 * something that must not be in the index at all. A header covers all of it in one rule. Confirmed
 * against the live deploy that `_headers`' `/*` block does reach `/`: `Referrer-Policy`,
 * `X-Frame-Options` and `Permissions-Policy` are all present on `https://dev.haythem.cv/`.
 *
 * **Injected here rather than committed**, because `public/_headers` is one file copied verbatim
 * into every build and this rule must appear in exactly one kind of them. The branch is read the
 * same way `next.config.ts` reads it, from the same module, so the two cannot come to disagree
 * about what "production" is.
 *
 * **The line goes *inside* the existing `/*` block rather than into a second `/*` block of its
 * own.** Appending would work only if Cloudflare Pages applies every matching rule cumulatively
 * rather than stopping at the first match — true as documented, but the whole point of this
 * function is that a silent failure here is invisible until something is already indexed, so it
 * does not rest on that. One block, one match, no ambiguity.
 *
 * It throws when the block is missing. The file's shape is the contract, and a rewrite that
 * quietly wrote nothing is the exact failure mode being guarded against.
 */
async function markNoindex() {
  const path = join(outDir, '_headers');
  const original = await readFile(path, 'utf-8');

  // Anchored to a line of its own, so a future `/*.png` or `/*.webm` rule cannot be mistaken for
  // the catch-all block.
  const block = /^\/\*[ \t]*$/m;
  if (!block.test(original)) {
    throw new Error(
      `clean-export: no "/*" block found in out/_headers, so X-Robots-Tag could not be added. ` +
      `The branch is "${getGitBranch()}", which must not be indexed — refusing to ship it ` +
      `crawlable. Check public/_headers still carries a bare "/*" line.`,
    );
  }

  const updated = original.replace(block, '/*\n  X-Robots-Tag: noindex, nofollow');
  await writeFile(path, updated, 'utf-8');
}

if (isProductionBranch()) {
  console.log('production branch — export left indexable');
} else {
  await markNoindex();
  console.log(`branch "${getGitBranch()}" is not production — added X-Robots-Tag: noindex, nofollow`);
}
