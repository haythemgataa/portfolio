# ReadCV — Personal CV & Portfolio Site

## What This Is

A static personal CV and portfolio site for Haythem Gataa, a Software Designer & Engineer in Tunisia. It renders a structured CV (work experience, education, awards, speaking, certifications, features, volunteering, contact) from a file-based content directory, with inline media attachments viewable in a lightbox. Built with Next.js App Router and exported as a fully static site to Cloudflare Pages.

## Core Value

A visitor can understand who Haythem is and see the quality of his work within seconds of landing — the presentation itself is part of the portfolio.

## Current Milestone: v1.1 Tabs & Gallery

**Goal:** Split the site into two tabbed views — the existing CV and a new Gallery — so visual work can be browsed as a standalone masonry grid instead of only as per-item attachments.

**Target features:**
- Sticky tab bar below the profile header, with the header persisting across both tabs
- Client-side tab switching backed by a URL hash (`#gallery`) so a tab is shareable
- New independently-curated `010-gallery/` content section with caption and tags per entry
- Masonry grid preserving each asset's aspect ratio; videos autoplay muted and loop inline
- Filter chips to narrow the grid by tag
- Clicking an item opens the existing Lightbox with next/prev across the gallery
- Seeded with a sample set of assets so the feature is verifiable end-to-end

## Requirements

### Validated

<!-- Shipped and confirmed valuable. Inferred from the existing codebase at v1.0. -->

- ✓ Visitor can view a structured CV rendered from file-based content — v1.0
- ✓ Visitor can view media attachments inline per CV item — v1.0
- ✓ Visitor can open attachments fullscreen in a lightbox with next/prev — v1.0
- ✓ Visitor can scroll attachment galleries horizontally on desktop — v1.0
- ✓ Visitor can read markdown-formatted descriptions with links — v1.0
- ✓ Site adapts to light and dark via `prefers-color-scheme` — v1.0
- ✓ Content author can add CV items by creating `NNN-name/item.json` directories — v1.0
- ✓ Content author can add media by dropping files in an item's `media/` folder (auto-detected) — v1.0
- ✓ Case study pages generate statically from markdown at `/[slug]` — v1.0 (mechanism built, no content authored yet)
- ✓ Site deploys as a static export to Cloudflare Pages with CDN image resizing — v1.0

### Active

<!-- Current scope. Building toward these. See REQUIREMENTS.md for REQ-IDs. -->

- [ ] Visitor can switch between a CV tab and a Gallery tab
- [ ] Visitor can share a link that opens directly on the Gallery tab
- [ ] Visitor can browse work as a masonry grid of images and videos
- [ ] Visitor can filter the gallery by tag
- [ ] Visitor can open any gallery item in the lightbox
- [ ] Content author can curate gallery entries independently of CV items

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Separate `/gallery` route — hash-based tabs chosen to keep the single-page static export intact and switching instant
- Gallery auto-aggregating existing CV item media — gallery is deliberately a curated set, not a mirror of CV attachments
- Grouping the gallery by project — a flat stream with tag filters covers the same need at ~30 items without adding a content nesting level
- Full gallery curation — building the system is this milestone; choosing the final asset set is the owner's editorial call, done after ship
- Per-item external links and year metadata in the gallery — caption and tags are enough for v1.1; revisit if the grid feels thin

## Context

- **No prior planning history.** This project reached v1.0 without GSD. PROJECT.md was bootstrapped from the existing codebase on 2026-08-08; the Validated requirements above are inferred from shipped code, not from historical planning documents.
- **Content is the database.** No CMS, no API. `public/content/` holds `NNN-name/` directories with `item.json` + `media/`, read at build time by `app/lib/contentLoader.ts`. `SECTION_MAP` in that file maps directory names to JSON keys.
- **Live content today:** 28 images and 2 videos, all attached to CV items across work experience, awards, speaking, and volunteering. No case studies authored. A `backup-media.bak/` folder holds 30 more legacy files.
- **Existing components to reuse, not rebuild:** `Lightbox.tsx` (React Portal + framer-motion), `Attachments.tsx` (thumbnail sizing, Cloudflare `/cdn-cgi/image/...` paths), `Scrollbar.tsx`, `RichText.tsx`.
- **`sharp` is already a devDependency** and used for build-time image dimension detection — masonry layout depends on having real dimensions available at build.
- **CLAUDE.md drift:** it documents Next.js 15, but `package.json` pins `next: ^16.3.0` and the build uses Turbopack with a pinned workspace root. Worth correcting during this milestone.
- **The `out/` build output is committed to the repo**, so any change produces a large secondary diff of generated assets.
- A `beta` badge renders in the header when `NEXT_PUBLIC_GIT_BRANCH === "dev"`.

## Constraints

- **Tech stack**: Next.js 16 App Router, React 19, TypeScript, CSS Modules — established; no UI component library, all components custom
- **Deployment**: `output: 'export'` static export to Cloudflare Pages — no server runtime, no API routes, no server-side data fetching at request time
- **Images**: `images.unoptimized: true`; optimization is delegated to Cloudflare Image Resizing via `/cdn-cgi/image/...` URLs — the gallery must follow this pattern, not `next/image` optimization
- **Testing**: no test framework configured — verification is manual/visual via the dev server
- **Styling**: CSS Modules per component plus custom properties in `globals.css` for light/dark theming — the gallery must theme through those variables

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hash-based tabs over separate routes | Keeps the single-page static export intact and tab switching instant, while `#gallery` stays shareable | — Pending |
| Gallery as a new curated content section, not aggregated CV media | The gallery is an editorial view of best work; auto-aggregation would couple it to CV structure and surface everything indiscriminately | — Pending |
| Masonry with autoplay-muted video | Preserves each asset's aspect ratio and makes motion work read as motion in the grid | — Pending |
| Tags on gallery entries | Required by the filter-chips decision; caption alone can't drive filtering | — Pending |
| Reuse existing Lightbox rather than a gallery-specific viewer | Consistent interaction across the site, less code to maintain | — Pending |
| File-based content, no CMS | Owner edits content in the repo alongside code; keeps deployment a pure static build | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-08 after bootstrapping from existing codebase and starting milestone v1.1*
