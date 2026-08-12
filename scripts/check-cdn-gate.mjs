// Asserts the Cloudflare Image Resizing gate points the right way in both directions.
//
// /cdn-cgi/image/ only exists on Cloudflare's edge, so app/lib/cloudflareImage.ts emits
// variant URLs *only* for production-branch Pages builds and the original URL everywhere
// else. Both failure modes are invisible locally — `npm run build` passes either way:
//
//   gate stuck on   -> every thumbnail 404s in dev and on *.pages.dev previews
//   gate stuck off  -> production serves full-size originals, unresized
//
// There is no test framework, so this is the check. Run it after touching
// cloudflareImage.ts, next.config.ts, or anything that renders a thumbnail.
//
//   node scripts/check-cdn-gate.mjs
//
// It runs two real builds (~1 min) and leaves out/ holding a plain one, so the working
// tree is never left with a production-flagged export.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const INDEX = join(process.cwd(), 'out', 'index.html');
const MARKER = '/cdn-cgi/image/';

function build(env, label) {
  process.stdout.write(`  building (${label})… `);
  execFileSync('npm', ['run', 'build'], {
    stdio: 'ignore',
    env: { ...process.env, ...env },
  });
  const count = readFileSync(INDEX, 'utf8').split(MARKER).length - 1;
  console.log(`${count} ${MARKER} URLs`);
  return count;
}

console.log('Checking the Cloudflare image gate…');

// Production branch on Pages: next.config.ts sets NEXT_PUBLIC_CDN_IMAGES from these.
const prod = build({ CF_PAGES: '1', CF_PAGES_BRANCH: 'main' }, 'simulated production');

// Reset last, so a failure never leaves a production-flagged export behind.
const plain = build({ CF_PAGES: '', CF_PAGES_BRANCH: '' }, 'plain');

const failures = [];
if (prod === 0) {
  failures.push(
    `production build emitted no ${MARKER} URLs — the gate is stuck off, so the ` +
      `deployed site would serve unresized originals`
  );
}
if (plain !== 0) {
  failures.push(
    `plain build emitted ${plain} ${MARKER} URLs — the gate is stuck on, so images ` +
      `would 404 in dev and on preview branches`
  );
}

if (failures.length) {
  console.error('\nFAIL');
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}

console.log(`\nPASS — ${prod} variant URLs in production, 0 outside it.`);
