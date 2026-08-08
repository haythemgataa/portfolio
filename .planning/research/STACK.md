# Stack Research

**Domain:** Tabbed static portfolio site — sticky tab bar, masonry media grid with inline video, tag filter chips
**Researched:** 2026-08-08
**Confidence:** HIGH (all recommendations verified against official docs / MDN / Next.js 16.3 docs / npm registry)

---

## Headline: Zero new runtime dependencies

**Every one of the five new capabilities is covered by platform CSS, browser APIs, or a dependency already in `package.json`.**

This is not a default-to-nothing answer — each candidate library was evaluated and rejected for a specific, project-grounded reason (see [What NOT to Use](#what-not-to-use)). The only changes to the repo's dependency surface are **zero additions**. The real work is CSS and ~150 lines of hand-rolled component code.

There is, however, **one mandatory change to existing CSS** (`globals.css` `overflow-x: hidden` → `overflow-x: clip`) without which `position: sticky` cannot work at all. That is the single highest-risk item in this milestone and it is a one-line fix.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| CSS multi-column (`columns` / `column-count` / `break-inside`) | Platform, universally supported | Masonry grid layout | Zero JS, zero measurement, zero CLS. Tiles get `aspect-ratio` from the dimensions `sharp` already computes at build, so the layout is correct on first paint of the static HTML — no hydration flash, which matters because this is a prerendered static export. |
| CSS `position: sticky` | Platform, universally supported | Sticky tab bar | No library exists that does this better. The only blocker is an existing `overflow-x: hidden` in `globals.css` (see [Critical Fix](#critical-fix-globalscss-currently-breaks-position-sticky)). |
| `IntersectionObserver` | Platform, universally supported | Play/pause + lazy-attach grid videos | Chrome and Firefox will happily decode ~30 videos simultaneously. WebKit already auto-pauses offscreen autoplay video, so IO exists to bring Chrome/Firefox in line with what Safari does natively. ~30 lines, one shared observer instance for all tiles. |
| `window.location.hash` + `hashchange` + `history.replaceState` | Platform | Tab state in URL (`#gallery`) | Next.js exposes **no** hook that reads the hash (`usePathname()` returns pathname only — verified in the v16.3 API reference return-value table). `useSearchParams()` is for `?query`, is empty during prerender, and demands a Suspense boundary. Hash never reaches the server, so it is fully compatible with `output: 'export'` and needs no config. |
| Hand-rolled ARIA tablist (WAI-ARIA APG Tabs pattern) | — | Tab bar | Two tabs, no existing component library, and no design-system ambitions. ~40 lines of exactly-specified behaviour beats the first dependency of a component library you are not building. |
| Hand-rolled `aria-pressed` toggle buttons | — | Tag filter chips | Filter chips are **not** tabs and must not reuse `role="tab"`. `<button aria-pressed>` inside `role="group"` is the correct primitive and has no library equivalent worth installing. |

### Supporting Libraries (already installed — reuse, do not add)

| Library | Installed Version | Purpose in this milestone | When to Use |
|---------|-------------------|---------------------------|-------------|
| `framer-motion` | `^11.14.4` (keep) | Lightbox enter/exit (already), optional opacity crossfade on tab switch | Use for the tab crossfade and nothing else. **Do not** use `layout`/`layoutId`/`<Reorder>` for grid filtering — see [Pitfalls](#framer-motion-scope-limit). **Do not upgrade to 13.0.0 in this milestone.** |
| `sharp` | `^0.35.3` (devDependency) | Build-time dimensions → `aspect-ratio` per tile | Already wired into `contentLoader.ts`. **Images only** — it cannot read video dimensions (see [Critical Gap](#critical-gap-video-dimensions-default-to-1920x1080)). |
| `react-markdown` | `^9.0.1` | Only if gallery captions need links/emphasis | Reuse `RichText.tsx`. If captions are plain text, skip it — plain text keeps the grid light. |
| `use-resize-observer` | `^9.1.0` | Not needed | CSS multicol is self-responsive. Do not reach for this. |
| `react-scrollbooster` | `^0.1.2` | Not needed | Gallery scrolls vertically with the page. This is for the horizontal CV attachment strips only. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `next dev` + manual visual check | Only verification available | No test framework is configured. Budget explicit manual checks for: iOS Safari video autoplay, sticky behaviour after Lightbox close, hash deep-link on hard refresh, and light/dark rendering. |
| Chrome DevTools → Rendering → "Emulate CSS prefers-reduced-motion" | Verify reduced-motion video/animation fallback | Reduced-motion path is the easiest thing to ship broken. |
| DevTools Network throttling | Verify `preload="none"` + IO lazy-attach actually defers video bytes | Confirm ~30 videos are not all requested on load. |

---

## Installation

```bash
# Core — nothing to install
# Supporting — nothing to install
# Dev dependencies — nothing to install
```

Total new packages: **0**.

---

## Detailed Answers to the Posed Questions

### 1. Masonry — CSS `columns`, no library

**Recommendation: CSS multi-column.** A ~30-item curated grid where every tile's aspect ratio is known at build time is precisely the case where multicol is strictly better than a JS masonry library.

```css
.grid {
  columns: 3;              /* or `columns: 280px;` for intrinsic responsiveness */
  column-gap: 16px;
}
@media (max-width: 900px) { .grid { columns: 2; } }
@media (max-width: 560px) { .grid { columns: 1; } }

.tile {
  break-inside: avoid;
  -webkit-column-break-inside: avoid;  /* older WebKit */
  page-break-inside: avoid;            /* older Blink */
  display: block;
  margin-bottom: 16px;                 /* multicol `gap` maps to column-gap only —
                                          vertical rhythm must come from item margin */
}
.tile > img,
.tile > video { display: block; width: 100%; height: auto; }
```

Each tile carries `aspect-ratio: {width}/{height}` from `contentLoader`, so height is reserved before the asset loads — no cumulative layout shift and no column re-balancing mid-load.

**What breaks: DOM order vs visual order.** With `columns`, content flows *down* column 1, then down column 2. This is worth being precise about, because the usual blanket warning overstates the problem here:

- **Accessibility is fine.** DOM order and visual order *agree* — the visual layout genuinely is columns, and focus moves down each column exactly as it appears. WCAG 2.4.3 (Focus Order) requires a *meaningful and predictable* order, which this satisfies. The commonly cited failure case is long-form prose split across columns, or `order`-based reordering where focus jumps around unpredictably. Neither applies to a flat set of independent image tiles.
- **The real cost is editorial.** A curated "best first" ordering puts items 1–10 in column 1 rather than spread across the top row. For a personal portfolio where the owner controls the order, this is a genuine but small annoyance.
- **Verdict:** ship multicol. If editorial ordering later proves load-bearing, the escape hatch is still zero-dependency: because dimensions are known at build time, `contentLoader` can greedily pack items into N explicit column arrays (shortest-column-first) per breakpoint and render explicit column `<div>`s in a flex row. Do not reach for a library for that either.

**Native CSS masonry is not an option yet.** MDN flags it **Experimental** with an explicit "do not use in production without extensive browser testing" warning. The syntax only stabilised as `display: grid-lanes` in a CSSWG resolution around December 2025; Chromium shipped an earlier `display: masonry` spelling behind a flag in 140 and is mid-migration, Firefox and Safari likewise. Revisit in a future milestone — the multicol implementation degrades to it cleanly.

**CSS Grid + `grid-auto-rows` + row spans was considered and rejected.** It preserves row-major order, but the span count depends on the *rendered* column pixel width, which is `1fr` and therefore unknown at build time. Making it work requires either JS measurement (defeating the point) or `cqw`-based row units with accumulating rounding error across gaps. Too much machinery for a 30-item personal gallery.

### 2. Video in the grid — hand-rolled, with two non-obvious traps

**Attributes.** `muted` + `playsinline` are both mandatory on iOS; without `playsinline` Safari forces fullscreen playback. `loop` for the loop.

**Trap A — React does not reliably emit `muted` into SSR HTML.** [facebook/react#10389](https://github.com/facebook/react/issues/10389) is still open: React sets `muted` as a DOM *property*, not an HTML *attribute*, so the prerendered static HTML can ship a `<video autoplay loop>` with no `muted` attribute. Safari sees an unmuted autoplay video and blocks it — before hydration ever runs. **This affects the existing `Attachments.tsx`, which uses `<video src autoPlay loop muted playsInline>` today.**

**Recommended shape — this fixes both traps at once:**

```tsx
// Do NOT put autoPlay in JSX. Start playback imperatively from the IO callback.
<video
  ref={ref}
  poster={item.poster}
  loop
  muted            /* keep for correctness, but do not rely on it */
  playsInline
  preload="none"   /* no bytes until the tile nears the viewport */
  // no src until IO fires
/>
```

In the shared `IntersectionObserver` callback: set `el.muted = true` imperatively (guaranteeing the property regardless of what SSR emitted), assign `el.src` on first intersection, then `el.play().catch(() => {})`. On leaving the viewport, `el.pause()`.

**Trap B — 30 videos decoding at once.** IO is required. WebKit already does this for you: its documented policy is that muted autoplay video "will only begin playing when visible… and will pause if scrolled out of the viewport." Chrome and Firefox make no such guarantee, so the IO handler brings them to parity. `preload="none"` plus deferred `src` assignment also prevents ~30 concurrent range requests on load.

**Use one observer instance for all tiles** (`observer.observe(el)` per tile), with `rootMargin: '200px 0px'` so playback starts just before the tile scrolls in. `threshold: 0` is sufficient; `intersectionRatio`-based thresholds are unnecessary here.

**Reduced motion.** Under `prefers-reduced-motion: reduce`, do not autoplay. Show the poster with a visible play affordance. This is a one-line `matchMedia` guard in the IO callback and is the cheapest accessibility win in the milestone.

**Posters.** `sharp` cannot decode video. Rather than adding an ffmpeg/ffprobe binary (~70 MB devDependency) to extract first frames, **require the content author to drop a poster image alongside each gallery video** and reference it in the entry JSON. Zero deps, and the author gets to pick a good frame.

**Cloudflare constraints on video.** Cloudflare Image Resizing (`/cdn-cgi/image/...`) transforms images only — gallery videos are served as raw static assets. Cloudflare Pages enforces a hard **25 MiB per-file limit** that cannot be raised. Keep gallery videos short H.264 MP4s (target well under 3 MB each); 30 tiles × large files is both a deploy risk and a bandwidth problem.

**Cloudflare on images — reuse and extend the existing pattern.** `Attachments.tsx#getThumbnailUrl` already builds `/cdn-cgi/image/width=…,height=…,quality=50,format=auto{url}`. Extract this into a shared helper (`app/lib/cfImage.ts`) that both `Attachments` and the gallery import, and hand-build a `srcset`/`sizes` pair from it (e.g. widths 400/800/1200) — a real win across the gallery's three breakpoints, still zero dependencies. Two things to verify while doing this: (a) `/cdn-cgi/image/` paths 404 in `next dev`, so the helper likely needs a dev passthrough; (b) the path does not work on `*.pages.dev` URLs, only on the custom domain with Transformations enabled for the zone.

**Use plain `<img>`, not `next/image`.** With `images.unoptimized: true` the `Image` component is a pass-through wrapper that adds client bundle weight and no srcset. A plain `<img>` with explicit `width`/`height`, `loading="lazy"`, `decoding="async"` and a hand-built Cloudflare `srcset` gives strictly more control for strictly less code.

**Accessibility improvement while you are here:** make each grid tile a `<button>` (or add `tabIndex`/`onKeyDown`) rather than the `div onClick` pattern used in `Attachments.tsx`. Gallery tiles are the primary interaction of the new tab; they should be keyboard-reachable.

### 3. Tabs — hand-rolled, not Radix / React Aria / Base UI / Headless UI

**Recommendation: hand-roll.** The correctness risk is small and fully enumerable; the dependency cost is disproportionate.

The complete contract (WAI-ARIA APG Tabs pattern, verified at w3.org/WAI/ARIA/apg):

- Container `role="tablist"` with `aria-label` (e.g. "View").
- Each tab `role="tab"`, `aria-selected="true"` on exactly one, `aria-controls` → its panel id.
- Each panel `role="tabpanel"`, `aria-labelledby` → its tab id.
- **Roving tabindex:** selected tab `tabIndex={0}`, the other `tabIndex={-1}`. Tab key enters the tablist at the selected tab and then exits to the panel.
- **Arrow keys:** `ArrowLeft`/`ArrowRight` move focus with wraparound; `Home`/`End` jump to first/last.
- **Automatic activation** — APG explicitly recommends it when panels display without noticeable latency, which holds here since both panels are static and already in the DOM.

Against that, the alternatives:

| Option | Latest version | Why rejected for this project |
|--------|----------------|-------------------------------|
| `@radix-ui/react-tabs` | 1.1.21 (2026-07-31) | Pulls ~6 transitive `@radix-ui/*` primitives for a two-tab widget. This project has **no** component library by deliberate constraint; adding one primitive establishes a pattern of adding more. Radix also styles via data attributes, which is fine with CSS Modules but adds an indirection for zero payoff at n=2. |
| `react-aria-components` | 1.20.0 (2026-08-06) | Heaviest of the three. Justified when building a design system with many complex widgets; wildly disproportionate for two tabs. |
| `@headlessui/react` | 2.2.10 | Tailwind-ecosystem oriented; this project uses CSS Modules. No advantage over hand-rolling. |
| `@base-ui-components/react` | 1.0.0-rc.0 | Still release-candidate. Do not put a pre-1.0 dependency in the critical path of a shipped personal site with no test suite. |

**Tabs must be `<button>`, not `<a href="#gallery">`.** An anchor with `role="tab"` gives assistive tech contradictory semantics and triggers the browser's native scroll-to-anchor. Use buttons and update the URL separately via `history.replaceState` (next section).

### 4. Sticky positioning — pure CSS, plus one mandatory repo fix

#### Critical fix: `globals.css` currently breaks `position: sticky`

```css
/* app/globals.css lines 55–59 — as shipped today */
html, body {
  max-width: 100vw;
  overflow-x: hidden;   /* ← this makes position: sticky impossible below it */
}
```

`overflow-x: hidden` turns the element into a **scroll container**, and it additionally forces `overflow-y` to compute to `auto` (per spec, `visible` paired with `hidden`/`scroll`/`auto` computes to `auto`). A sticky element sticks relative to its nearest scroll container — which is now `body`, which never scrolls relative to itself — so it never sticks.

**Fix:** change to `overflow-x: clip`. Per MDN, `clip` "forbids all scrolling, including programmatic scrolling" and "the element box is **not** a scroll container." It also does not force the other axis to `auto`, so `overflow-x: clip` with `overflow-y: visible` is a valid pair that preserves sticky while still preventing horizontal overflow. `overflow: clip` is Baseline and safe in production.

**Other sticky pitfalls specific to this codebase:**

- **No ancestor of the tab bar may have `transform`, `filter`, `perspective`, `will-change`, or `contain: paint`.** Any of these creates a containing block and silently breaks sticky. **framer-motion sets inline `transform` while animating** — so if you wrap the header/tab region in a `motion.div` for a tab transition, sticky will break intermittently and only during the animation, which is a miserable bug to diagnose. Animate *inside* the panels, never around the sticky bar.
- **`Lightbox.tsx` mutates `document.body.style.overflow` and `document.documentElement.style.overflow`** on open (`'hidden'`) and resets to `'unset'` on close. `'unset'` restores the stylesheet value, so this composes correctly with the `clip` change — but include "open lightbox from gallery, close it, confirm the tab bar still sticks" in the manual verification checklist.
- The sticky bar needs an opaque background (`var(--backgroundColor)`) and a defined `z-index` so grid tiles scroll under it, not through it.

No library. `react-sticky`, `stickybits`, and similar are polyfills for a problem that no longer exists.

### 5. URL hash state — `window.location.hash`, not a router API

**Recommendation: plain browser APIs.**

Verified against the Next.js 16.3 docs:

- `usePathname()` returns the **pathname only** — the documented return-value table shows `/dashboard?v=2` → `'/dashboard'`. There is no hash hook in `next/navigation`.
- `useSearchParams()` reads the query string, not the hash. It is empty during prerender and forces client-side rendering up to the nearest `Suspense` boundary. Wrong tool, and it would add a Suspense boundary to a page that currently needs none.
- `router.push('#gallery')` / `<Link href="#gallery">` would route through the App Router navigation machinery with its scroll behaviour (`{ scroll: false }` exists as an escape hatch) and gain you nothing over `history.replaceState`.
- Static export compatibility: the hash is never transmitted to a server, so it is trivially compatible with `output: 'export'` on Cloudflare Pages. Nothing on the [unsupported features list](https://nextjs.org/docs/app/guides/static-exports) is touched.

**Implementation:**
- Read: `window.location.hash === '#gallery'`.
- Write: `history.replaceState(null, '', tab === 'gallery' ? '#gallery' : ' ')` — `replaceState` (not `pushState`) so tab switching does not pollute the back button. Note `''` as the third argument leaves the hash intact; use `location.pathname + location.search` to clear it.
- Listen: `window.addEventListener('hashchange', …)` so browser back/forward and pasted links both work.

**Avoiding the first-paint flash.** The page is prerendered with the CV tab active; a visitor arriving at `/#gallery` would see the CV flash before an effect swaps tabs. Next.js 16.3 documents the exact fix in [Preventing flash before hydration](https://nextjs.org/docs/app/guides/preventing-flash-before-hydration): a synchronous inline `<script>` in the root layout `<head>` that reads `location.hash` and sets `document.documentElement.dataset.tab` **before first paint**, with CSS keyed off `[data-tab="gallery"]`. Pair it with a lazy `useState(() => …)` initialiser reading the same source, and `suppressHydrationWarning` on `<html>`. Two caveats from that same doc: React StrictMode's dev-only remount clears attributes the script set (re-apply in a `useLayoutEffect`), and inline scripts require a CSP nonce if a strict CSP is ever added.

If the flash is judged acceptable for v1.1, the simpler `useState('cv')` + `useEffect` version is a legitimate call — but state it as a decision rather than discovering it as a bug.

**Render both panels in the DOM** and toggle visibility rather than conditionally mounting. Deep-link is then instant, tab switching preserves each panel's scroll position, and it costs nothing: hidden video tiles never intersect, so the IO never fires and no video bytes are requested.

### 6. framer-motion scope limit

**Keep `framer-motion@^11.14.4`. Do not bump to 13.0.0 in this milestone.** Both `framer-motion` and `motion` are at 13.0.0 as of 2026-08-05, so the package rename does not force your hand. A major-version bump would touch the shipped `Lightbox.tsx` and `Attachments.tsx` in a repo with **no test framework** — pure downside risk for a milestone that needs none of v12/v13's features.

**Use it for:** an opacity crossfade between tab panels (`AnimatePresence` + `initial/animate/exit` opacity). Cheap, two elements.

**Do not use it for grid filtering.** `layout` / `layoutId` / `<Reorder>` run FLIP: every element is measured and transformed each frame. At ~30 tiles inside a CSS multicol container, *every* item's position changes when the column balancer re-runs after a filter — so you get 30 simultaneous measure-and-transform cycles against a container that is itself relayouting. That is where the jank you asked about would come from.

**Do this instead:** keep all tiles mounted, toggle a `data-hidden` attribute, and let CSS `display: none` handle it. Multicol reflows in one pass; at 30 items it is imperceptible. If a fade is wanted, a CSS `transition: opacity` on the tile is enough. Anything more animated should be gated behind `prefers-reduced-motion: no-preference`.

---

## Critical Gap: video dimensions default to 1920×1080

`app/lib/contentLoader.ts` (lines ~135–145) hardcodes:

```ts
let width = 1920;  // Default dimensions
let height = 1080;
if (mediaType === 'image') { /* sharp reads real dimensions */ }
```

`sharp` is only invoked for images, so **every video in the content tree is currently reported as 16:9 regardless of its actual shape.** In the CV attachment strips this is invisible (fixed-height 90px tiles). In a masonry grid, where aspect ratio *is* the layout, a portrait video would be laid out as landscape and render letterboxed or cropped.

**Recommended fix (zero dependencies):** make `width` and `height` **required fields in the gallery entry JSON for video entries**, and have `contentLoader` prefer explicit values over the 1920×1080 default. The content author already has to write a caption and tags per entry, so this is one more field in a file they are already editing.

**Rejected alternatives:** `ffprobe-static` / `ffmpeg-static` add a ~70 MB platform-specific binary to a repo that already commits its `out/` build output. A hand-rolled MP4 `tkhd`-box parser (~50 lines, zero deps) is a reasonable *later* enhancement if manual dimension entry becomes annoying, but it is unnecessary machinery for ~30 curated assets.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| CSS `columns` | Build-time greedy column packing into explicit column `<div>`s | If editorial "best first" ordering must read left-to-right across the top row. Still zero dependencies — dimensions are already known at build. This is the designated escape hatch, not a separate library. |
| CSS `columns` | `display: grid-lanes` (native CSS masonry) | Once it reaches Baseline in stable browsers. Currently Experimental with an explicit MDN production warning. Revisit in a later milestone. |
| CSS `columns` | `masonic@4.1.0` | If the gallery ever grows past a few hundred items and virtualisation genuinely pays for itself. At ~30 items it costs a client-only render, measurement pass, and CLS on a page that is otherwise correct on first paint. |
| Hand-rolled tablist | `@radix-ui/react-tabs@1.1.21` | If this project later grows a real component library (dialogs, popovers, dropdowns, selects). Then adopt Radix wholesale rather than piecemeal — and revisit the hand-rolled tabs at that point. |
| Hand-rolled IntersectionObserver | `react-intersection-observer` | Only if IO usage spreads to many unrelated components. For one shared observer in one component, the hook wrapper is more code than the observer. |
| Plain `<img>` + Cloudflare `srcset` | `next/image` | Never here — `images.unoptimized: true` makes `next/image` a pass-through with bundle cost and no srcset benefit. |
| `framer-motion@11` | `motion@13` / `framer-motion@13` | A separate, deliberate upgrade milestone with manual regression passes over the Lightbox. Not bundled into a feature milestone in a repo with no tests. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `react-masonry-css` | Last published **2022-05-14** — over four years stale, unmaintained, no stated React 19 support. It also just distributes items across column `<div>`s in JS, i.e. it reproduces the same DOM-order characteristic as CSS `columns` while adding a client-render pass and a dependency. | CSS `columns` |
| `masonic` | Virtualisation + `ResizeObserver` measurement, client-only positioning. Overkill at 30 items, and it defeats the "correct on first paint of prerendered HTML" property that makes the static export worth having. | CSS `columns` |
| `masonry-layout` / `isotope` / `packery` | jQuery-era imperative DOM libraries that fight React's reconciler. `isotope`/`packery` are additionally non-free for commercial use. | CSS `columns` |
| `display: grid-lanes` / `grid-template-rows: masonry` | MDN flags it Experimental with an explicit production warning. Syntax only resolved in late 2025; all three engines are mid-migration from earlier spellings. Shipping it means shipping a layout that changes under you. | CSS `columns`, revisit later |
| `@radix-ui/react-tabs`, `react-aria-components`, `@headlessui/react` | Disproportionate dependency for two tabs in a project whose stated constraint is "no UI component library, all components custom." | Hand-rolled APG tablist |
| `@base-ui-components/react` | Still `1.0.0-rc.0`. Pre-1.0 API churn in a repo with no test suite. | Hand-rolled APG tablist |
| `react-sticky`, `stickybits`, `sticky-kit` | Polyfills for `position: sticky`, which has been universally supported for years. The problem here is one line of existing CSS, not missing browser support. | `position: sticky` + `overflow-x: clip` fix |
| `next/link` or `router.push` for tab switching | Runs App Router navigation + scroll behaviour for what is a client-side visibility toggle. Also pushes history entries you do not want. | `history.replaceState` + `hashchange` |
| `useSearchParams()` for tab state | Reads `?query`, not `#hash`. Empty during prerender, forces a `Suspense` boundary onto a page that currently needs none. | `window.location.hash` |
| framer-motion `layout` / `layoutId` / `<Reorder>` on the grid | FLIP measure-and-transform on ~30 tiles inside a relayouting multicol container. This is the specific jank risk you asked about. | Toggle `display: none` via a data attribute; optional CSS `opacity` transition |
| Wrapping the sticky tab bar in an animating `motion.div` | framer-motion sets inline `transform`, which creates a containing block and breaks `position: sticky` — intermittently, only during animation. | Animate inside the panels only |
| `role="tab"` on filter chips | Chips are multi-select toggles, not a single-selection tablist. Reusing tab semantics misleads screen readers about how many views exist. | `<button aria-pressed>` inside `role="group"` with an `aria-label`, plus `aria-live="polite"` on a result count |
| `<a href="#gallery" role="tab">` | Anchor + tab role gives assistive tech contradictory semantics and triggers native scroll-to-anchor. | `<button role="tab">` + `history.replaceState` |
| `content-visibility: auto` on grid tiles | Baseline only since 2025-09, and inside a multicol container it fights the column balancer, which needs heights to balance. Unnecessary at 30 items. | Nothing — `loading="lazy"` on images and `preload="none"` on videos already cover it |
| `ffmpeg-static` / `ffprobe-static` for video dimensions or posters | ~70 MB platform-specific binary in a repo that already commits its `out/` build output. | Explicit `width`/`height` + author-supplied `poster` in the gallery entry JSON |
| `next/image` in the gallery | `images.unoptimized: true` makes it a pass-through with client bundle cost and no srcset generation. | Plain `<img>` + hand-built Cloudflare `/cdn-cgi/image/` `srcset` |

---

## Integration Points with Existing Code

| Existing file | Change needed | Notes |
|---------------|---------------|-------|
| `app/globals.css` | **`overflow-x: hidden` → `overflow-x: clip`** on `html, body` | **Mandatory.** Without it `position: sticky` cannot work anywhere in the app. Verify horizontal-overflow behaviour is unchanged after the switch. |
| `app/globals.css` | Add gallery/tab/chip custom properties alongside the existing `--wash1`/`--grey*` set | Both light and dark blocks. Chips especially need a selected state in both schemes. |
| `app/lib/contentLoader.ts` | Add `'gallery': { displayName: 'Gallery', jsonKey: 'gallery' }` to `SECTION_MAP`, map `010-gallery/` | `SECTION_MAP` currently has 13 entries; the pattern is established. |
| `app/lib/contentLoader.ts` | Prefer explicit `width`/`height` from entry JSON over the 1920×1080 default | Required for correct video aspect ratios in the grid. See [Critical Gap](#critical-gap-video-dimensions-default-to-1920x1080). |
| `app/Lightbox.tsx` | **No change.** | It consumes `{ url, type, width, height }`. Gallery entries are a superset (`+ caption, tags`), so the array can be passed straight through. Only requirement: pass `startingIndex` relative to the **filtered** array you hand it, not the unfiltered one — an easy off-by-N when chips are active. |
| `app/Attachments.tsx` | Extract `getThumbnailUrl` into a shared `app/lib/cfImage.ts` | So gallery and CV strips share one Cloudflare URL builder. Add a `next dev` passthrough (the `/cdn-cgi/image/` path 404s locally) and a `srcset` helper while you are in there. Optional: also fix the `<video>` `muted`-attribute trap in `Attachments.tsx` at the same time. |
| `app/Profile.tsx` | Becomes the CV tab panel | Already a client component. |
| `app/layout.tsx` | Optional inline `<head>` script for pre-paint hash read | Only if the tab flash on `/#gallery` is judged unacceptable. `suppressHydrationWarning` on `<html>` if adopted. |
| `out/` | Will produce a large generated diff | Pre-existing repo characteristic; not a stack decision, but budget for noisy PRs. |
| `CLAUDE.md` | Says Next.js 15; `package.json` pins `^16.3.0` | Worth correcting during this milestone, as PROJECT.md notes. |

---

## Stack Patterns by Variant

**If gallery grows past ~150 items:**
- Revisit `masonic@4.x` for virtualisation, or add `content-visibility: auto` with `contain-intrinsic-size` on tiles.
- Because at that scale the "correct on first paint" property of prerendered multicol stops outweighing the cost of ~150 mounted tiles.

**If editorial ordering must read left-to-right across the top row:**
- Move to build-time greedy column packing in `contentLoader` (shortest-column-first per breakpoint), rendering explicit column `<div>`s inside a flex row.
- Because dimensions are known at build time, this stays zero-dependency and zero-CLS. Do not install a library for it.

**If a third tab is ever added:**
- The hand-rolled tablist scales fine (the roving-tabindex logic is already n-agnostic). Reconsider Radix only if the site simultaneously grows dialogs, popovers, and selects.

**If a strict Content Security Policy is ever added:**
- The pre-paint inline hash script needs a nonce, and Cloudflare Pages `public/_headers` is where the CSP would live.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next@^16.3.0` | `output: 'export'` + `images.unoptimized: true` | Verified against the Next.js 16.3 static-export guide. Nothing recommended here appears on the unsupported-features list. |
| `next@^16.3.0` | `window.location.hash` / `history.replaceState` | Hash is never sent to the server; static export is unaffected. `router.bfcacheId` docs explicitly acknowledge "hash-only navigations" as a first-class case. |
| `framer-motion@^11.14.4` | `react@^19` | Already running in production at v1.0. `framer-motion@13.0.0` exists (2026-08-05) but is out of scope for this milestone. |
| `sharp@^0.35.3` | Images only | Cannot read video dimensions. This is the root cause of the 1920×1080 default. |
| `overflow-x: clip` | All modern browsers (Baseline) | Chrome 90+, Firefox 81+, Safari 16+. Does not create a scroll container; safe pairing with `overflow-y: visible`. |
| `aspect-ratio`, `break-inside`, `columns`, `position: sticky`, `IntersectionObserver` | All modern browsers | No polyfills required. |
| Cloudflare Pages | 25 MiB per-file hard limit, 20,000 files max | Gallery videos are the only realistic risk. Image Resizing requires Transformations enabled on the zone and does not work on `*.pages.dev` URLs. |

---

## Confidence Assessment

| Claim | Confidence | Basis |
|-------|------------|-------|
| Native CSS masonry is not production-ready | HIGH | MDN Experimental banner + CSSWG `grid-lanes` resolution (Dec 2025) |
| `overflow-x: hidden` breaks sticky; `clip` fixes it | HIGH | MDN `overflow-x` (clip is not a scroll container) + multiple corroborating write-ups; directly observable in this repo's `globals.css` |
| `usePathname` does not expose the hash | HIGH | Next.js 16.3 API reference return-value table |
| `useSearchParams` needs Suspense / is empty on prerender | HIGH | Next.js 16.3 docs |
| Inline pre-paint script is the sanctioned flash fix | HIGH | Next.js 16.3 "Preventing flash before hydration" guide |
| WebKit auto-pauses offscreen autoplay video | HIGH | WebKit official `<video>` policy post |
| React may omit `muted` from SSR HTML | MEDIUM | facebook/react#10389 (open) + corroborating reports; not verified against React 19 specifically in this repo — **worth a 5-minute check of the rendered `out/index.html` for the existing videos** |
| Chrome/Firefox do not auto-pause offscreen video | MEDIUM | Absence of a documented guarantee; IO is recommended defensively regardless |
| Cloudflare Pages 25 MiB file limit | MEDIUM | Cloudflare community + docs references; verify against current Cloudflare Pages limits page before sizing videos |
| Library version numbers | HIGH | npm registry, queried 2026-08-08 |

---

## Sources

- `/vercel/next.js` (Context7) — static export config, unsupported-feature enforcement in `config.ts` / `export/index.ts`
- https://nextjs.org/docs/app/guides/static-exports (v16.3.0, updated 2026-07-21) — supported/unsupported feature list under `output: 'export'` — HIGH
- https://nextjs.org/docs/app/api-reference/functions/use-pathname (v16.3.0, updated 2026-06-09) — confirmed pathname-only return, no hash — HIGH
- https://nextjs.org/docs/app/api-reference/functions/use-router (v16.3.0, updated 2026-07-01) — `scroll: false`, `bfcacheId` and hash-only navigations — HIGH
- https://nextjs.org/docs/app/guides/preventing-flash-before-hydration (v16.3.0, updated 2026-07-29) — inline pre-paint script pattern, `suppressHydrationWarning`, StrictMode dev caveat — HIGH
- https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Masonry_layout — Experimental status, `display: grid-lanes` syntax — HIGH
- https://css-tricks.com/masonry-layout-is-now-grid-lanes/ (2025-12-19) — CSSWG resolution and per-engine migration status — MEDIUM
- https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-x — `clip` is not a scroll container; `visible` → `auto` coercion rules — HIGH
- https://www.terluinwebdesign.nl/en/blog/position-sticky-not-working-try-overflow-clip-not-overflow-hidden/ — the `hidden` → `clip` fix — MEDIUM
- https://polypane.app/blog/getting-stuck-all-the-ways-position-sticky-can-fail/ — transform/filter/will-change containing-block traps — MEDIUM
- https://webkit.org/blog/6784/new-video-policies-for-ios/ — muted autoplay requires `playsinline`; offscreen autoplay video pauses — HIGH
- https://github.com/facebook/react/issues/10389 — `muted` set as property, not attribute; SSR HTML may omit it — MEDIUM (issue open, not re-verified against React 19)
- https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ — full roles/states/keyboard contract; automatic activation recommendation — HIGH
- https://developers.cloudflare.com/images/optimization/transformations/rewrite-rules/ and Cloudflare community threads — `/cdn-cgi/image/` format, Transformations must be enabled, does not work on `pages.dev`, 25 MiB per-file limit — MEDIUM
- npm registry (queried 2026-08-08) — `react-masonry-css@1.0.16` (published 2022-05-14), `masonic@4.1.0`, `framer-motion@13.0.0`, `motion@13.0.0`, `@radix-ui/react-tabs@1.1.21`, `react-aria-components@1.20.0`, `@headlessui/react@2.2.10`, `@base-ui-components/react@1.0.0-rc.0` — HIGH
- Direct source inspection: `app/globals.css`, `app/Lightbox.tsx`, `app/Attachments.tsx`, `app/lib/contentLoader.ts`, `next.config.ts`, `package.json` — HIGH

---
*Stack research for: tabbed static portfolio with masonry media gallery*
*Researched: 2026-08-08*
