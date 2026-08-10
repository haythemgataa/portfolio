// Post-build cleanup for the static export.
//
// `output: 'export'` requires generateStaticParams() to yield at least one route, so
// app/[slug]/page.tsx emits a synthetic `__placeholder__` slug when there are no case
// studies. That page calls notFound(), but the export still writes the rendered error
// page to disk — and Cloudflare Pages would serve /__placeholder__ as a real 200 URL.
// Remove those files so the deployed site has no reachable placeholder route.

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
