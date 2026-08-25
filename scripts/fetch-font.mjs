// Fetches the Switzer webfont into app/fonts/ so the binary never has to live in git.
//
// The font is self-hosted (see app/layout.tsx) and the file is served from our own origin, which
// the ITF Free Font License explicitly permits and recommends. What it does *not* permit is
// making the Font Software available through a "repository" or "publicly accessible servers" —
// so once this repo is public, a committed .woff2 would be redistribution. Fetching it per
// checkout keeps every benefit of self-hosting and hands no one a copy.
//
// This moves a Fontshare dependency from every visitor's critical rendering path to the build
// machine, once. That is the better place for it: an outage now fails a deploy you can retry
// rather than delaying first paint for real readers.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'app/fonts/Switzer-Variable.woff2');

// The stylesheet is asked for the *family*; the woff2's own URL is read back out of it rather
// than hardcoded, because that hashed CDN path is Fontshare's to rotate and a pinned one would
// break silently on the day it does.
const CSS_URL = 'https://api.fontshare.com/v2/css?f[]=switzer@1';

// Pinned so an upstream re-cut fails the build loudly instead of shipping different metrics.
// `adjustFontFallback` is off precisely because the fallback was measured against *these* bytes
// (see app/layout.tsx), so a changed file is a reason to re-measure, not to carry on.
const EXPECTED_SHA256 = 'd1bf801ffb1a6096def70a7c532255722ad87d948b13a8a586e342f7091f8ee4';

// postinstall passes this: a transient network blip should not fail `npm install`, but it must
// still fail a build, so `prebuild`/`predev` call the strict form.
const optional = process.argv.includes('--optional');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const fail = (message) => {
  if (optional) {
    console.warn(`fetch-font: ${message}`);
    console.warn('fetch-font: skipping — run `npm run fetch:font` before building.');
    process.exit(0);
  }
  console.error(`fetch-font: ${message}`);
  process.exit(1);
};

// Already correct? Then never touch the network — offline dev keeps working after first install.
try {
  if (sha256(await readFile(TARGET)) === EXPECTED_SHA256) {
    console.log('fetch-font: Switzer already present and matching');
    process.exit(0);
  }
  console.log('fetch-font: existing file does not match the pinned hash, refetching');
} catch {
  // Missing is the normal case on a fresh checkout.
}

let css;
try {
  const res = await fetch(CSS_URL);
  if (!res.ok) fail(`stylesheet request failed (HTTP ${res.status})`);
  css = await res.text();
} catch (error) {
  fail(`could not reach Fontshare: ${error.message}`);
}

const match = css.match(/url\(['"]?((?:https:)?\/\/[^'")]+\.woff2)['"]?\)/);
if (!match) fail('no .woff2 URL found in the stylesheet — the response format may have changed');

// Fontshare emits protocol-relative URLs, which `fetch` will not take.
const fontUrl = match[1].startsWith('//') ? `https:${match[1]}` : match[1];

let bytes;
try {
  const res = await fetch(fontUrl);
  if (!res.ok) fail(`font request failed (HTTP ${res.status})`);
  bytes = Buffer.from(await res.arrayBuffer());
} catch (error) {
  fail(`could not download the font: ${error.message}`);
}

const digest = sha256(bytes);
if (digest !== EXPECTED_SHA256) {
  fail(
    `hash mismatch — Switzer has changed upstream.\n` +
      `  expected ${EXPECTED_SHA256}\n` +
      `  received ${digest}\n` +
      `  Re-measure the fallback (app/layout.tsx) against the new file, then re-pin EXPECTED_SHA256 here.`,
  );
}

await mkdir(dirname(TARGET), { recursive: true });
await writeFile(TARGET, bytes);
console.log(`fetch-font: wrote app/fonts/Switzer-Variable.woff2 (${bytes.length} bytes)`);
