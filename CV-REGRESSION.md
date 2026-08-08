# CV-REGRESSION.md

This is the CV-view regression checklist, walked at the exit of every phase that touches `globals.css`, `Lightbox.tsx`, `contentLoader.ts`, or the CDN helper — there is no test framework and none is being added, so this file is the substitute.

Target: a few minutes, start to finish. Console open, filter set to "All levels", before you start.

## Core pass — walk every time

### Setup

```bash
npm run dev
```

Load `http://localhost:3000`. Keep DevTools console open with the filter set to "All levels" for the rest of this pass.

### All CV sections render

Visual scan. Every section (general, work experience, education, awards, speaking, certifications, features, volunteering, contact) shows content, nothing is blank or missing.

### Year column aligned

Visual. This is fragile: `Profile.module.css`'s `.year::before` aligns the column with a hidden `content: "0000 — 0000"` ghost-text trick (`visibility: hidden`), which breaks on any font or type-size change. If the years look ragged, suspect a font/size edit before suspecting layout code.

### Thumbnails load

Dev-side grep — with `npm run dev` still running:

```bash
curl -s http://localhost:3000/ | grep -c "/cdn-cgi/image/"
```

Must print `0`. Plus a visual confirmation: scan every attachment strip for a broken-image icon. Both checks are needed — image decode success is not observable from HTML or an HTTP status, only the grep tells you the URL shape is right and only the visual scan tells you the image actually decoded.

### Production still emits CDN URLs

```bash
CF_PAGES=1 CF_PAGES_BRANCH=main npm run build
grep -c '/cdn-cgi/image/' out/index.html
```

Must be non-zero. Then reset immediately, in the same step:

```bash
npm run build
```

Warning: skipping the reset leaves the working tree holding a simulated-production build. The *next* walk's dev-side grep (above) will then fail — for the wrong reason, since the checked-in `out/index.html` was never rebuilt from a plain `npm run build`.

### Attachment strips scroll on desktop

Prose. Drag an attachment strip horizontally with the mouse; it scrolls (react-scrollbooster).

### Attachment strips swipe on mobile

Prose. With DevTools device emulation and touch enabled, swipe an attachment strip; it scrolls.

Sharpened sub-step — with touch still enabled, open the lightbox from an attachment at **index 3 or higher** and confirm the item shown is the one you tapped, not the first one. Why: mobile detection returns `false` on the first render while its module cache is cold, and the carousel is only scrollable while `data-mobile="true"`, so a failed scroll-restore silently lands on index 0 instead of the tapped item.

### Full lightbox cycle

Prose. Open the lightbox from a CV attachment, arrow left and right through the set, press Esc to close, reopen it, then close it by clicking the backdrop.

### No inline style residue after that cycle

Immediately after the cycle above, paste into the console:

```js
(() => {
  const empty = v => v === '' || v === null;
  const h = document.documentElement.getAttribute('style');
  const b = document.body.getAttribute('style');
  console.log('html style:', JSON.stringify(h), '| body style:', JSON.stringify(b));
  console.log('overflow-x now:',
    getComputedStyle(document.documentElement).overflowX,
    '/', getComputedStyle(document.body).overflowX);
  console.log(empty(h) && empty(b) ? 'PASS — no residue' : 'FAIL — inline style left behind');
})();
```

Both `''` and `null` count as empty — a page that has never opened the lightbox reports `null` for `getAttribute('style')`, a clean page that has completed a cycle reports `""`, and the old bug reported `"overflow: unset;"`. Expect `PASS`.

### Overflow guard back in force

From the same snippet's output, read `getComputedStyle(document.body).overflowX` and confirm it matches the `overflow-x` value declared for `html, body` in `app/globals.css` — do not compare it to a hardcoded `hidden` here. Phase 3 changes that declaration to `clip`; this file never needs an edit for that change because the assertion is relative, not literal.

### No horizontal scrollbar at 320 / 480 / 768 / 1440

In DevTools responsive mode, set the viewport to each of `320`, `480`, `768`, and `1440` in turn and paste this at each width:

```js
(() => {
  const d = document.documentElement;
  console.log(`${window.innerWidth}px:`, d.scrollWidth <= d.clientWidth ? 'PASS' : `FAIL (${d.scrollWidth} > ${d.clientWidth})`);
})();
```

Expect `PASS` at all four widths.

### Light and dark

Prose. DevTools → Rendering → Emulate CSS media feature `prefers-color-scheme`, check both `light` and `dark`.

Known non-regression — do **not** log this as a new bug: `Lightbox.module.css` line **46** references a dead `var(--transparent-border)` while `globals.css` defines `--transparentBorder`, so the lightbox image border is invisible in *both* themes today. This is pre-existing, not something this phase or any later one introduced.

### Zero console errors and warnings

Prose. With the console filter still at "All levels", confirm it is empty on page load, and empty again after one full lightbox cycle.

Known non-regression: `Attachments.tsx`'s `quality={50}` prop on the `next/image` call is a no-op under `images.unoptimized: true` — do not "discover" it as a bug.

## Flagged extras — skip unless the named phase is in play

- **Real-iPhone pass — Phase 6 only.** A checklist that always demands a physical device stops being walked; skip this step on every other phase's exit.
- **Network-panel bounded-request check — Phase 7 only.** Skip on every other phase's exit.

## A note on static spot-checks

Do not reach for `npx` to spin up a static server for `out/` — the `serve` package is not installed, and `npx` would auto-download an unverified package from the registry. If a static spot check of the built `out/` directory is ever wanted:

```bash
cd out && python3 -m http.server 8080
```

Caveat: a plain static server does not replicate Cloudflare's `trailingSlash: false` routing, so this is only good for spot-checking `/`.

## Template discipline

This file is a template and is never mutated with results. Each phase records its own walk — date, result, what failed and how it was resolved — in that phase's own verification artifacts, not here. Where an expected value could change in a later phase (for example the `overflow-x` value above), it is written as a relative assertion on purpose, so no future phase ever has to edit this file to keep it accurate.
