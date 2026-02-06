# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start dev server (localhost:3000)
- `npm run build` — Build static export to `out/`
- `npm run lint` — Run ESLint
- `npm run migrate` — Run content structure migration (`tsx scripts/migrate-content.ts`)

No test framework is configured.

## Architecture

This is a **static portfolio/CV site** built with Next.js 15 (App Router) + React 19 + TypeScript. It uses `output: 'export'` in next.config.ts to produce a fully static site deployed to **Cloudflare Pages**.

### Routing

- `/` — Home page renders the `Profile` component with all CV sections
- `/[slug]` — Dynamic case study pages generated from markdown files in `public/content/case-studies/`
- All pages are statically generated at build time via `generateStaticParams()`

### Data Layer

There is no database or CMS. Content lives entirely in `public/content/` as a directory-based file system structure:

```
public/content/
  001-general/          → general.json + media/
  002-workExperience/   → item subdirectories with item.json + media/
  003-education/        → ...
  ...
  case-studies/         → markdown files (*.md)
```

**Key conventions:**
- Directories use `NNN-name` prefixes for ordering (e.g., `001-general`, `002-workExperience`)
- Items within sections follow the same pattern (e.g., `001-product-designer-at-company/`)
- Each item directory contains `item.json` and an optional `media/` folder
- Media files in `media/` are auto-detected if not explicitly listed in `item.json` attachments
- The content loader (`app/lib/contentLoader.ts`) reads this structure at build time and returns a unified data object

**Section mapping** is defined in `SECTION_MAP` in `contentLoader.ts` — directory names map to JSON keys (e.g., `speaking` → `talks`).

### Component Patterns

- **Server components** (async): `layout.tsx`, `page.tsx`, `[slug]/page.tsx` — handle data loading
- **Client components** (`"use client"`): `Profile.tsx`, `Attachments.tsx`, `Lightbox.tsx`, `Scrollbar.tsx`, `RichText.tsx`
- Lightbox uses React Portal to render to `document.body`
- `Attachments.tsx` references Cloudflare Image Resizing via `/cdn-cgi/image/...` paths in `getThumbnailUrl()`

### Styling

- **CSS Modules** for component-scoped styles (`.module.css` files)
- **CSS custom properties** in `globals.css` for theming (light/dark via `prefers-color-scheme`)
- Font: Inter (loaded via `next/font/google`)
- No UI component library — all custom components

### Key Dependencies

- `framer-motion` — Lightbox and carousel animations
- `react-markdown` — Renders markdown descriptions and case studies
- `react-scrollbooster` — Horizontal gallery scrolling on desktop
- `sharp` (dev only) — Image dimension detection during build

### Deployment

Static export (`out/`) deployed to Cloudflare Pages. Cache headers configured in `public/_headers`. Images are unoptimized by Next.js (Cloudflare handles optimization via CDN).
