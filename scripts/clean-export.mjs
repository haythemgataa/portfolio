// Post-build cleanup for the static export.
//
// `output: 'export'` requires generateStaticParams() to yield at least one route, so
// app/[slug]/page.tsx emits a synthetic `__placeholder__` slug when there are no case
// studies. That page calls notFound(), but the export still writes the rendered error
// page to disk — and Cloudflare Pages would serve /__placeholder__ as a real 200 URL.
// Remove those files so the deployed site has no reachable placeholder route.
//
// **Read that last sentence as an intention rather than a guarantee: this script does not
// currently run on a deploy.** Cloudflare Pages' build command for this project is
// `npx next build`, not `npm run build`, and npm lifecycle scripts only run for the latter — so
// neither this nor `prebuild` executes there. (The font still arrives, because `postinstall` runs
// during `npm clean-install`.) Verified against the live site: `https://haythem.cv/__placeholder__`
// answers 200 with a 44 KB page. It is not an indexing problem — Next stamps
// `<meta name="robots" content="noindex">` on that render, and the route is in no sitemap and
// linked from nowhere — but it is a URL that should not exist answering as though it does, and it
// renders Next's default not-found UI inside the root layout rather than the designed
// `global-not-found` page.
//
// The fix is the build command, not this file. Until it changes, treat `npm run build` as a local
// pipeline only, and **do not add anything here that the deployed site depends on** — an
// `X-Robots-Tag` injection lived here briefly and was silently a no-op on every deploy, which is
// why the preview hosts are now noindexed by hostname rules in `public/_headers` instead.

import { rm } from 'node:fs/promises';
import { join } from 'node:path';

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
