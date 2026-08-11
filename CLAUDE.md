# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start dev server (localhost:3000)
- `npm run build` — Build static export to `out/`, then strip the placeholder route (`scripts/clean-export.mjs`)
- `npm run lint` — Run ESLint (flat config in `eslint.config.mjs`)

`scripts/migrate-to-json.ts` (supports `--dry-run`) is the one-shot migration that produced the
current `content/cv.json` from the old `NNN-` directory tree. It has already been run and the old
tree is gone, so it is kept for provenance rather than reuse.

No test framework is configured.

`out/` is gitignored — Cloudflare Pages runs `npm run build` on deploy, so the export is never committed.

### Content Studio (`localhost:3000/studio`)

A dev-only editor for `content/cv.json` + `content/media.json` — reorder/add/rename/delete
sections and items, edit profile, item and contact fields, and manage media. Every mutation is a
read-modify-write of those files; `git checkout -- content public/media` is the undo.

Two guards make whole-file rewrites safe, and both are load-bearing:

- **Atomic write** — `cv.json.tmp` then `fs.rename`, so no reader sees a partial file.
- **Stale-write rejection** — the UI sends the content hash it loaded and the route
  refuses a mismatch with a 409. The hash covers `cv.json` *and* `media.json`, so a change
  to either invalidates a pending edit. Without it, a tab left open would silently revert
  the whole CV on its next keystroke.

`Studio.module.css` positions the tool `fixed; inset: 0` because `/studio` sits under
the site's root layout and would otherwise render below `ProfileHeader` and the tab bar.

It exists only in `npm run dev`, enforced two ways in `next.config.ts`:

- Its files are named `page.studio.tsx` / `route.studio.ts`, which only resolve
  as routes via the dev-only `pageExtensions`.
- `output: 'export'` is applied to production builds only, because it rejects
  non-static route handlers even when merely running `next dev`. The tradeoff is
  that static-export violations now surface at `npm run build` rather than in dev.

Route handlers refuse to run outside development and reject non-localhost `Host`
headers (`next dev` listens on 0.0.0.0).

## Architecture

This is a **static portfolio/CV site** built with Next.js 16 (App Router) + React 19 + TypeScript. It uses `output: 'export'` in next.config.ts to produce a fully static site deployed to **Cloudflare Pages**.

### Routing

- `/` — Home page renders the `Profile` component with all CV sections
- `/gallery` — Standalone media gallery (see **Gallery** below)
- `/[slug]` — Dynamic case study pages generated from markdown files in `content/case-studies/`
- All pages are statically generated at build time via `generateStaticParams()`

**No case studies exist yet.** `content/case-studies/` is absent, but `output: 'export'` requires
`generateStaticParams()` to return at least one route, so `[slug]/page.tsx` emits a synthetic
`__placeholder__` slug that calls `notFound()`. The export still writes that page to disk, so
`scripts/clean-export.mjs` deletes it after every build — otherwise Cloudflare would serve
`/__placeholder__` as a real 200 URL. Once real case studies are added, the placeholder path is
unused and the cleanup step becomes a no-op.

### Data Layer

There is no database or CMS. Content is **two JSON files plus a media tree**:

```
content/                      # build-time input — NOT served
  cv.json                     # sections, items, order
  gallery.json                # gallery entries and captions
  media.json                  # per-asset facts, keyed by filename
  case-studies/<slug>.md      # markdown stays as files
public/media/<file>           # ONE flat pool, shared by the CV and the gallery
```

`content/` sits outside `public/` deliberately: it is compiler input, not a static asset.
Keeping it in `public/` shipped 27 never-requested JSON files to the CDN and made the whole
CV fetchable at `/content/.../item.json`. Media has to stay under `public/`.

The schema and its rationale are documented in **`CONTENT-SCHEMA.md`**; the types are in
`app/lib/contentTypes.ts`. Key rules:

- **Array order is display order.** There are no `NNN-` filename prefixes anywhere. Reordering
  is a pure JSON edit, which is what lets the Studio avoid renaming directories.
- **`profile` is pinned first, `contact` pinned last**, and neither lives in `sections[]`.
  `sections[]` therefore holds only the homogeneous, timeline-shaped sections — every entry
  renders identically, which is *why* reordering it is safe. This replaced a `kind` discriminator:
  a flag that can be wrong became a shape that cannot. It also killed two
  `collection.name === "Contact"` string comparisons in `Profile.tsx` that silently broke the
  contact layout if the section was renamed.
- **`section.key` is machine-facing and stable; `section.label` is free text** and safe to rename.
  This replaced the hardcoded `SECTION_MAP`, so adding a section needs no code change.
- **`item.id` is stable and unique across the whole document.** It no longer names anything on
  disk, but it is still a React key and the Studio's addressing scheme, so `contentLoader.ts`
  throws on a duplicate rather than shipping it.
- **Media lives in one flat pool, described once in `media.json`.** `cv.json` and `gallery.json`
  reference filenames only. This replaced per-item folders because a file used by both tabs had
  two dimension records that drifted — the awards video was recorded 1920x1080 (the 16:9 fallback,
  since `sharp` cannot measure video) against a true 1254x704. Dedup saved 6.5 MB of 51.7 MB, but
  the point is that an asset can no longer disagree with itself.
- **Deleting media is reference-counted.** A file goes only when nothing references it — CV items,
  the profile photo, gallery entries and poster frames all count, so the Studio reads `gallery.json`
  even though it never writes it. `planGarbage()` is pure and the route writes JSON *before*
  deleting files, so a rejected write cannot destroy media.
- **Dimensions are always authored**, so the build never runs `sharp`; `type` is inferred from the
  extension rather than stored, so there is one source of truth for it.
- Optional fields are **omitted, not written as `""`**.

One naming seam to know about: media is authored under `media` but the loader resolves it to
`attachments`, because that is the prop `Attachments.tsx` already takes. Renaming the component
prop was deliberately kept separate from migrating the data.

`loadProfileData()` returns `{ profile, sections, contact }`. The previous loader also spread
per-section keys onto its return value (`cv.talks`, `cv.workExperience`); nothing ever read them,
so they are gone.

### Gallery

The `/gallery` tab is a vertical list — one item per row at the same 540px column width as
the CV — with captions below each item. It has its own content pipeline, independent of
the CV sections:

- `content/gallery.json` — an **ordered** `items` array; array order is display order.
- `app/lib/galleryLoader.ts` — resolves entries to `GalleryItem`s, typed in
  `app/lib/galleryTypes.ts`. Entries reference the shared pool; dimensions come from
  `media.json` via `app/lib/mediaRegistry.ts`, which both loaders share.
- Each entry carries a **required, authored `id`**. It used to be derived from the array index
  (`${index}-${entry.file}`), which meant every id changed whenever the gallery was reordered.
- `width`/`height` are **required**, not measured. This retires a live footgun: `sharp` cannot
  measure video, so an undeclared video used to fall back silently to 16:9 and shift the layout.
  Now the migration and the Studio always write real numbers and images and videos behave alike.
- Missing files listed in `gallery.json` are skipped with a build warning rather than
  failing the build.
- An absent/empty `gallery.json` renders a neutral empty state, so the route always builds.
  While the gallery has no media, `page.tsx` calls `hasGalleryItems()` and the CV page
  hides the tab bar entirely — visitors are never offered an empty tab, and the Gallery tab
  appears on its own once media is added. `/gallery` stays reachable directly.

Videos autoplay muted when scrolled into view and pause when they leave, via
`IntersectionObserver`, so only one video decodes at a time. Under
`prefers-reduced-motion: reduce` they stay paused and expose native controls instead
(`app/usePrefersReducedMotion.ts`).

Each item is wrapped in an aspect-ratio box derived from its intrinsic dimensions, which
holds the row's height before the media loads — verified at CLS 0.

`Tabs.tsx` switches between `/` and `/gallery`. They are real routes, not client-side tab
state, so the tabs are `<Link>`s with `aria-current="page"` rather than `role="tab"`.

The styling is shadcn/ui's Tabs ported into `Tabs.module.css` against this project's tokens
(muted track, 3px padding, raised active pill) — the actual component is not used because it
is Tailwind-based and Radix Tabs switches panels within one document rather than navigating.

The bar is sticky at `top: 0`. The bar itself spans the content column, but its sticky
wrapper is full-bleed — pulled out to the viewport edges with negative margins and pushed
back in with equal padding — so the opaque background covers the full width. Anything wider
than the column (below 480px the attachment carousel bleeds past both edges) would otherwise
stay visible beside the bar as it scrolls under. Below the wrapper, a `::after` continues the
background as a downward fade, so content dissolves into the page instead of being cut flat
at the bar's edge; it is shorter than the 36px gap that follows the bar, so nothing is dimmed
at rest. Three things it depends on:

- `ProfileHeader.tsx` is shared by both routes so the bar lands at the same vertical
  position on each — otherwise switching tabs would make the sticky bar jump.
- `.profile` and `.gallery` are both centred (`margin: 0 auto`), which is what makes the
  full-bleed `calc(50% - 50vw)` margins land symmetrically on either route.
- `globals.css` uses `overflow-x: clip` (not `hidden`) on `html, body`. `hidden` makes them
  scroll containers, which silently breaks `position: sticky`. `hidden` is still declared
  first as a fallback for browsers without `clip` support.

### Component Patterns

- **Server components** (async): `layout.tsx`, `page.tsx`, `[slug]/page.tsx` — handle data loading
- **Client components** (`"use client"`): `Profile.tsx`, `Attachments.tsx`, `Lightbox.tsx`, `Scrollbar.tsx`, `RichText.tsx`, `Gallery.tsx`, `Tabs.tsx`
- Lightbox uses React Portal to render to `document.body`
- `Attachments.tsx` references Cloudflare Image Resizing via `/cdn-cgi/image/...` paths in `getThumbnailUrl()`

### Styling

- **CSS Modules** for component-scoped styles (`.module.css` files)
- **CSS custom properties** in `globals.css` for theming (light/dark via `prefers-color-scheme`)
- Font: **Switzer**, loaded as a third-party stylesheet from `api.fontshare.com` via a `<link>` in
  `layout.tsx` (not `next/font`), with `--default-font` in `globals.css` pointing at it
- No UI component library — all custom components

### Key Dependencies

- `framer-motion` — Lightbox and carousel animations
- `react-markdown` — Renders markdown descriptions and case studies
- `react-scrollbooster` — Horizontal gallery scrolling on desktop
- `sharp` (dev only) — Image dimension detection during build

### Deployment

Static export (`out/`) deployed to Cloudflare Pages. Cache headers and baseline security headers are
configured in `public/_headers`. Images are unoptimized by Next.js (Cloudflare handles optimization
via CDN).

`app/lib/cloudflareImage.ts` builds Cloudflare Image Resizing URLs (`/cdn-cgi/image/...`) for
both `Attachments.tsx` and `Gallery.tsx`. That endpoint only exists on Cloudflare's edge, so it
is applied in production builds only — in development the original URL is used, otherwise every
image 404s.

Two things there are easy to get wrong:

- **Request the real displayed box, not a square.** Cloudflare's default `fit=scale-down` fits
  *inside* the requested box, so asking for `width=180,height=180` on a 4:3 thumbnail returns
  180x135 — fewer pixels than the 240x180 the layout needs, and the browser upscales it. The
  helper takes CSS dimensions and multiplies by `DPR`, and callers pass `fit: 'cover'` to mirror
  `object-fit: cover`. Measured across all 28 CV thumbnails, fixing this was worth ~9 dB PSNR,
  far more than any quality change.
- **`quality` applies to whatever `format=auto` negotiates** (AVIF for most current browsers,
  WebP otherwise). It is 80 by default; 50 was visibly soft on UI screenshots, where fine text
  degrades first.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
