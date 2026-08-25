# haythem.cv

My personal CV and portfolio site — [haythem.cv](https://haythem.cv).

The layout and interaction design started as a rebuild of [Read.cv](https://read.cv). What
it is now differs in three substantial ways:

- **Restructured data.** Content is three JSON files plus one flat, shared media pool
  (`content/cv.json`, `gallery.json`, `media.json` → `public/media/`) instead of
  per-item folders. Array order is display order, media is described once and
  reference-counted, and an asset can no longer disagree with itself about its own
  dimensions. The authoring contract is in [CONTENT-SCHEMA.md](CONTENT-SCHEMA.md).
- **Content is managed through `/studio`**, a dev-only editor that *is* the site, made
  editable: the canvas renders the real CV and gallery from the site's own components and
  CSS, and every string a visitor can read is edited by clicking it where it sits. Writes
  are atomic, guarded against stale overwrites, and reversible with
  `git checkout -- content public/media`.
- **It went static.** No database, no CMS, no server at runtime — `output: 'export'`
  produces a fully static build deployed to Cloudflare Pages, which also handles image
  resizing at the edge.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · CSS Modules · framer-motion · Cloudflare Pages

## Getting started

```bash
npm install
npm run dev
```

The site runs at `localhost:3000`, the editor at `localhost:3000/studio` (dev only — it does
not exist in a production build).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on `127.0.0.1:3000` |
| `npm run build` | Static export to `out/`, then strips the placeholder route |
| `npm run lint` | ESLint |
| `npm run fetch:font` | Download the Switzer woff2 (also wired to install/dev/build) |
| `npm run check:cdn` | Assert the Cloudflare image gate is on in production builds and off outside them |

There is no test framework.

## Layout

```
app/                 components, routes, and app/lib (loaders, content types, resolution)
app/studio/          the dev-only editor
content/             cv.json, gallery.json, media.json — build-time input, never served
public/media/        the shared media pool
scripts/             font fetch, export cleanup, CDN gate check
```

## Deployment

Cloudflare Pages runs `npm run build` and serves `out/`; that directory is gitignored, so the
export is never committed. Cache and security headers are in `public/_headers`. Images are
resized at the edge via `/cdn-cgi/image/...`, which only exists on Cloudflare — the transform
is applied to production builds only, and every pool URL carries a content hash so re-cutting
a file in place actually busts the cache.

## Notes

- The font binary is **not** in git. The ITF Free Font License permits self-hosting but not
  redistribution through a public repository, so `scripts/fetch-font.mjs` pulls
  `app/fonts/Switzer-Variable.woff2` per checkout (on `postinstall`, `predev` and `prebuild`).
  The licence and README beside it are committed.
- [CLAUDE.md](CLAUDE.md) is the long-form engineering record — why things are built the way
  they are, and which of them are load-bearing. It is considerably more detailed than this file.
- The content, writing, and media are mine; the code is here to read.
