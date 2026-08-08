# Architecture Research

**Domain:** Static Next.js App Router portfolio — adding hash-based tabs + a curated masonry gallery to a shipped v1.0 site
**Researched:** 2026-08-08
**Confidence:** HIGH (all integration points read from source; two external claims verified by search and marked inline)

> Every file path, function name, prop name and line reference below was read from the working tree at commit `4f0e729` (branch `dev`). Nothing here is assumed from CLAUDE.md — see "Documentation drift found" for where CLAUDE.md is wrong.

---

## Verified Baseline (read, not assumed)

| Fact | Evidence |
|------|----------|
| Only **two** files carry `"use client"` | `app/Profile.tsx:1`, `app/Attachments.tsx:1`. `Lightbox.tsx`, `Scrollbar.tsx`, `RichText.tsx`, `isMobile.tsx` have **no** directive — they join the client graph transitively. CLAUDE.md claims otherwise. |
| `loadProfileData()` is called from **3** places | `app/page.tsx:6`, `app/layout.tsx:6` (`generateMetadata`), `app/[slug]/page.tsx:45`. No memoization (`React.cache` is not used) — it re-walks the whole content tree each call. |
| `Lightbox` props | `app/Lightbox.tsx:8-12` — `{ attachments: Array<any>, startingIndex: number, close: () => void }`. Per-item fields consumed: `media.url` (key + `src`), `media.type` (`"image"` \| `"video"`), `media.width`, `media.height`. |
| `Lightbox` touches `window` **during render** | `app/Lightbox.tsx:198` — `useState((window.innerWidth - 48) / (window.innerHeight - 96))` inside `LightboxImage`. Safe today only because it is conditionally mounted (`Attachments.tsx:71-80`). |
| Thumbnails go through Cloudflare | `Attachments.tsx:16-20` `getThumbnailUrl()` → `/cdn-cgi/image/width=180,height=180,quality=50,format=auto/content/...`. Confirmed baked into `out/index.html`. |
| `sharp` path is *barely* exercised | `detectAttachments()` (`contentLoader.ts:114-160`) only runs when `item.attachments` is absent/empty (`contentLoader.ts:185`). Exactly **one** item in the repo hits it: `004-awards/001-best-website-design-.../` (empty `attachments`, 3 media files). Everything else has hand-authored `width`/`height` in `item.json`. |
| Videos get **fake** dimensions from the loader | `contentLoader.ts:135-136` defaults `1920x1080`; `getImageDimensions` is only called for `mediaType === 'image'` (line 139). The one auto-detected `.mp4` is currently rendered at a wrong aspect ratio. |
| Unknown section dirs are skipped with a warning | `contentLoader.ts:290-294` — `SECTION_MAP[sectionDir.name]` miss → `console.warn('Unknown section: …')` → `continue`. |
| `allCollections` drives the CV render | `contentLoader.ts:300-305` builds it; `Profile.tsx:48-66` maps it into `<section>`s. Anything added to `SECTION_MAP` **renders as a CV section**. |
| `001-general` already uses a flat-manifest shape | `001-general/general.json` + `001-general/media/` — no per-item dirs. Loaded by a dedicated branch (`contentLoader.ts:262-281`), not by `loadSection`. |
| Global `overflow-x: hidden` on `html, body` | `app/globals.css:55-59`. This is a **sticky-positioning hazard** (see Anti-Pattern 1). |
| Layout widths | `page.module.css` `.page { padding: 0 24px }`; `Profile.module.css:1-6` `.profile { max-width: 540px; margin: 0 auto }`. The 540px cap lives *inside* `Profile`. |

---

## Standard Architecture

### System Overview (target state)

```
┌───────────────────────────────────────────────────────────────────────┐
│  BUILD TIME (Node, fs + sharp)                                        │
│  ┌──────────────────────────┐   ┌──────────────────────────────────┐  │
│  │ app/lib/contentLoader.ts │   │ app/lib/galleryLoader.ts  (NEW)  │  │
│  │  loadProfileData()       │   │  loadGalleryData()               │  │
│  │  ← 001..009 NNN-item dirs│   │  ← 010-gallery/gallery.json      │  │
│  │                          │──▶│    + 010-gallery/media/*         │  │
│  │  exports (NEW):          │   │    (imports the two helpers)     │  │
│  │   getImageDimensions()   │   └──────────────────────────────────┘  │
│  │   getMediaType()         │                                         │
│  └──────────────────────────┘                                         │
├───────────────────────────────────────────────────────────────────────┤
│  SERVER COMPONENTS (async, RSC)                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ app/page.tsx   const [cv, gallery] = await Promise.all([...])   │  │
│  │   <TabbedView                                                    │ │
│  │      header ={<ProfileHeader general={cv.general}/>}   ← slots   │ │
│  │      cvPanel={<Profile cv={cv}/>}                                │ │
│  │      galleryPanel={<Gallery items={gallery}/>} />                │ │
│  └─────────────────────────────────────────────────────────────────┘  │
├───────────────────────────────────────────────────────────────────────┤
│  CLIENT COMPONENTS ("use client")                                     │
│  ┌───────────────────────────────────────────────────────────────┐    │
│  │ TabbedView (NEW)  — activeTab state + #hash sync              │    │
│  │   └── Tabs (NEW)  — sticky bar, CV | Gallery                  │    │
│  └───────────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────┐   ┌──────────────────────────────────┐  │
│  │ Profile (MODIFIED)       │   │ Gallery (NEW)                    │  │
│  │  └── Attachments (MOD)   │   │  ├── FilterChips (NEW)           │  │
│  │        └── Lightbox ◀────┼───┼──┤  ├── GalleryItem (NEW)        │  │
│  └──────────────────────────┘   │  └── Lightbox  (REUSED AS-IS)    │  │
│                                 └──────────────────────────────────┘  │
├───────────────────────────────────────────────────────────────────────┤
│  SHARED, CLIENT-SAFE                                                  │
│  app/lib/mediaUrl.ts (NEW) — getThumbnailUrl(), no `fs` import        │
└───────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | New/Modified | Server or Client | Responsibility |
|-----------|--------------|------------------|----------------|
| `app/lib/galleryLoader.ts` | **NEW** | build-time (server only) | Read `010-gallery/gallery.json`, resolve URLs, fill image dims via `sharp`, normalize tags, validate. Exports `loadGalleryData()` + `GalleryItem` type. |
| `app/lib/mediaUrl.ts` | **NEW** | isomorphic (no `fs`) | `getThumbnailUrl(url, { width, height?, quality? })`. Single home for the `/cdn-cgi/image/...` contract + dev passthrough. |
| `app/TabbedView.tsx` | **NEW** | **client** | Owns `activeTab`, syncs `#gallery`, renders header + `Tabs` + the active slot. ~50 lines. |
| `app/Tabs.tsx` | **NEW** | client (inside TabbedView) | Presentational sticky tab bar. Props `tabs`, `active`, `onChange`. No state. |
| `app/ProfileHeader.tsx` | **NEW** (extracted) | no directive → server-capable | Photo + name + beta badge + byline. Lifted verbatim from `Profile.tsx:17-37`. |
| `app/Gallery.tsx` | **NEW** | **client** | Owns `activeTag` + `lightboxState`, derives tag list + `visibleItems`, renders grid + `<AnimatePresence>{lightbox}</AnimatePresence>`. Co-locates `GalleryItem` (mirrors how `Attachments.tsx` co-locates `Attachment`). |
| `app/FilterChips.tsx` | **NEW** | client | Presentational chip row. Props `tags: {tag, count}[]`, `active`, `onChange`. |
| `app/page.tsx` | **MODIFIED** | server (async) | Loads both datasets, wires slots. |
| `app/Profile.tsx` | **MODIFIED** | client (keep directive) | Header block removed; `.profile` wrapper + sections only. |
| `app/lib/contentLoader.ts` | **MODIFIED** | server | `export` `getImageDimensions` + `getMediaType`; explicitly skip `gallery` in the section loop. |
| `app/Attachments.tsx` | **MODIFIED** | client | Delete local `getThumbnailUrl` (lines 16-20), import from `app/lib/mediaUrl.ts`. |
| `app/Lightbox.tsx` | **MODIFIED (1 line)** | client | Add `"use client"` defensively. Optional additive caption support. |
| `app/globals.css` | **MODIFIED** | — | `overflow-x: hidden` → `overflow-x: clip` (sticky fix). |
| `Scrollbar.tsx`, `RichText.tsx`, `isMobile.tsx`, `Arrow12.tsx`, `app/[slug]/*`, `app/layout.tsx`, `next.config.ts` | **UNTOUCHED** | — | No changes required. |

---

## Decision 1 — Content model for `public/content/010-gallery/`

### Recommendation: flat `media/` + a single `gallery.json` manifest. Do **not** use per-item directories.

```
public/content/010-gallery/
  gallery.json          ← ordered array; the single source of truth
  media/
    reactor-ui-01.png
    logo-motion.mp4
    poster-series-03.jpg
```

```jsonc
// gallery.json
{
  "items": [
    { "file": "reactor-ui-01.png", "caption": "Reactor dashboard", "tags": ["Product", "UI"] },
    { "file": "logo-motion.mp4",   "caption": "Logosystems ident", "tags": ["Motion", "Branding"],
      "width": 1080, "height": 1080 }   // REQUIRED for video — sharp cannot read video
  ]
}
```

**Why this and not `010-gallery/001-foo/item.json + media/`:**

1. **Authoring cost per entry.** Per-item dirs cost the owner 2 `mkdir`s + 1 JSON file + a file move for *one image with a caption and two tags*. The manifest costs 1 file move + 3 lines. For ~30 entries that is ~90 filesystem objects versus ~31.
2. **Reordering is the common edit.** A curated gallery gets reshuffled far more often than the CV. With `NNN-` prefixes, moving an item from position 20 to position 2 means renaming 19 directories. In a JSON array it is a cut-and-paste. This is the decisive ergonomic argument.
3. **It is not a new pattern in this repo.** `001-general/` is already exactly this shape — a single JSON next to a flat `media/` folder, loaded by its own branch at `contentLoader.ts:262-281` rather than by `loadSection`. Adopting it for `010-gallery` adds zero conceptual surface.
4. **The per-item convention exists to carry per-item *structure*** — `year`, `heading`, `url`, `description`, `collaborators`, plus an ordered *set* of attachments (`002-workExperience/001-.../item.json` has 4). A gallery entry is one asset with two scalar fields. The directory machinery buys nothing.
5. **Curation is explicit, per PROJECT.md.** Manifest-as-source-of-truth means an asset only appears if the owner listed it — which is the stated intent ("gallery is deliberately a curated set, not a mirror of CV attachments"). The CV's auto-detect affordance would work *against* that here.

**Loader validation rules (build-time `console.warn`, never throw):**
- `file` listed in `gallery.json` but missing on disk → warn, drop the entry.
- File present in `media/` but absent from `gallery.json` → warn ("orphan, not curated in"). Do **not** auto-append: silent inclusion defeats curation.
- Duplicate `file` values → warn and dedupe. `Lightbox.tsx:109` and `:140` key on `media.url`; duplicates produce React key collisions.
- Video entry without explicit `width`/`height` → warn loudly and fall back to 16:9. This is a real gap, not theoretical: the existing `004-awards/001-…` mp4 is already being rendered at a bogus 1920×1080 because `contentLoader.ts:139` only calls `getImageDimensions` for images.

### SECTION_MAP: gallery must **bypass** it

Adding `'gallery'` to `SECTION_MAP` (`contentLoader.ts:20-34`) would be actively wrong for two independent reasons:

1. Every `SECTION_MAP` hit is pushed into `allCollections` (`contentLoader.ts:300-305`), which `Profile.tsx:48` maps into `<section><h3>{collection.name}</h3>` — the gallery would render as a CV section titled "Gallery".
2. `SECTION_MAP` membership routes the directory into `loadSection()` → `loadItem()`, which requires `NNN-item/item.json` sub-directories. A flat `010-gallery/` yields zero items.

Instead, mirror the `general` handling. Change `contentLoader.ts:288`:

```ts
// before
if (sectionDir.name === 'general') continue;
// after
if (sectionDir.name === 'general' || sectionDir.name === 'gallery') continue;
```

Without this the directory is skipped anyway (via the `Unknown section` warning at line 292) — it works *by accident*. Make it explicit so the build log stays clean and the intent is readable.

---

## Decision 2 — `contentLoader.ts` changes and where gallery data lives

### Recommendation: separate top-level key, loaded by a separate function, in a separate file.

`app/page.tsx`:
```ts
import { loadProfileData } from "./lib/contentLoader";
import { loadGalleryData } from "./lib/galleryLoader";

export default async function Home() {
  const [cv, gallery] = await Promise.all([loadProfileData(), loadGalleryData()]);
  ...
}
```

**Why not fold gallery into the object `loadProfileData()` returns:**

- `loadProfileData()` has **three** call sites (`page.tsx:6`, `layout.tsx:6`, `[slug]/page.tsx:45`) and **no memoization**. Only `page.tsx` needs the gallery. Merging makes `generateMetadata` and every case-study page pay for the gallery's `sharp` metadata reads. `sharp().metadata()` per image is the slowest thing in the build.
- The returned object is spread (`contentLoader.ts:309-313`) and consumed as `any` by `Profile.tsx` and `[slug]/CaseStudy.tsx`. Leaving its shape byte-identical means **zero regression surface** on the shipped CV.
- The gallery can be strongly typed from day one (`GalleryItem[]`) instead of inheriting the `any` soup.

### Exact edits to `app/lib/contentLoader.ts` (three, all additive)

1. `export` line 5: `export async function getImageDimensions(...)` — `galleryLoader` needs the same `sharp` dynamic-import + graceful-null behaviour. Do **not** re-implement it.
2. `export` line 101: `export function getMediaType(filename)` — same image/video extension table must classify gallery files.
3. Line 288: add the explicit `gallery` skip shown above.

That is the whole diff. No behavioural change to existing output.

### How dimensions get attached

`getImageDimensions()` (`contentLoader.ts:5-17`) does exactly what masonry needs and is **reusable as-is**: dynamic `import('sharp')`, returns `{width, height} | null`, swallows failures. `galleryLoader` calls it per image entry.

But note the two gaps the existing usage papers over:
- **Videos are unsupported.** `sharp` cannot read `.mp4`/`.webm`. The gallery manifest must require `width`/`height` on video entries (see above). Do not add `ffprobe` — it is not a dependency and would make the build environment-sensitive.
- **The `1920x1080` default (`contentLoader.ts:135-136`) is a silent aspect-ratio lie.** In a masonry grid a wrong ratio produces a visible gap or crop. `galleryLoader` should warn rather than default silently.

Recommended shape:
```ts
export type GalleryItem = {
  id: string;          // slugified filename — stable React key
  type: 'image' | 'video';
  url: string;         // "/content/010-gallery/media/<file>"
  width: number;
  height: number;
  caption?: string;
  tags: string[];      // normalized, deduped
};
```
Note `type` / `url` / `width` / `height` are named to match exactly what `Lightbox` reads. That is deliberate — see Decision 4.

---

## Decision 3 — Component boundary: where tab state lives

### Recommendation: **(a′)** a new client component `TabbedView` that receives Profile and Gallery as **rendered `ReactNode` slots** from the server `page.tsx`.

```tsx
// app/page.tsx — stays an async SERVER component
export default async function Home() {
  const [cv, gallery] = await Promise.all([loadProfileData(), loadGalleryData()]);
  return (
    <div className={styles.page}>
      <TabbedView
        header={<ProfileHeader general={cv.general} />}
        cvPanel={<Profile cv={cv} />}
        galleryPanel={<Gallery items={gallery} />}
      />
    </div>
  );
}
```

**Why this beats the alternatives:**

| Option | Verdict |
|--------|---------|
| (b) tabs inside `Profile.tsx` | **Reject.** `Profile` is the CV renderer; putting the Gallery under it inverts the hierarchy, and every tab toggle re-renders the entire CV tree (`allCollections` → all `ProfileItem`s → all `Attachments`, each of which owns `useScrollBoost` + two `useResizeObserver`s). Also can't satisfy "header persists across both tabs" without the header living above the tab switch anyway. |
| (c) make `page.tsx` a client component | **Reject — hard failure.** `page.tsx:6` awaits `loadProfileData()`, which imports `fs` (`contentLoader.ts:1`). A `"use client"` page cannot do that. |
| (a) `TabbedView` importing `Profile`/`Gallery` directly | Workable but strictly worse than (a′): direct imports force both subtrees through the client boundary at `TabbedView`. |
| **(a′) slot props** | **Recommended.** The parent-server / child-client composition pattern. `TabbedView`'s own client bundle is ~50 lines of tab + hash logic. `Profile` and `Gallery` keep whatever boundary they declare themselves — `TabbedView` never imports them, so it does not pull them into its module graph. |

**Prerequisite: extract the header.** PROJECT.md requires the profile header to persist across both tabs, but it currently lives at `Profile.tsx:17-37` inside `.profile` (max-width 540px). Move that JSX verbatim into `app/ProfileHeader.tsx` taking `general`. It has no hooks; `process.env.NEXT_PUBLIC_GIT_BRANCH` (`Profile.tsx:31`) is inlined at build by `next.config.ts:26-28` and works on either side of the boundary.

**Width containers move too.** `.profile { max-width: 540px }` currently caps the header. Once the header and tab bar move up into `TabbedView`, introduce `TabbedView.module.css .shell { max-width: 540px; margin: 0 auto }` for header + tabs, and give the gallery its own wider container (suggest `max-width: 1200px`). **Open design decision for the roadmapper:** does the gallery grid stay at 540px (visually consistent, feels cramped for masonry) or go wide (better grid, breaks the column rhythm)? Flag it, don't guess.

**Hash sync — the concrete mechanism:**

```tsx
"use client";
const [tab, setTab] = useState<'cv' | 'gallery'>('cv');          // must match SSR HTML

useEffect(() => {
  const read = () => setTab(window.location.hash === '#gallery' ? 'gallery' : 'cv');
  read();                                     // deep-link on mount
  window.addEventListener('hashchange', read);
  return () => window.removeEventListener('hashchange', read);
}, []);

const select = (next: 'cv' | 'gallery') => {
  setTab(next);
  window.history.replaceState(null, '', next === 'gallery' ? '#gallery' : window.location.pathname);
};
```

Non-obvious constraints, all load-bearing:
- **Initial state must be `'cv'`.** The fragment is never sent to the server, so the prerendered `out/index.html` always reflects the CV tab. Reading `window.location.hash` during render is a hydration mismatch. Deep-linking to `#gallery` costs one frame of CV. If that flash is unacceptable, the fix is an inline `<script>` in `app/layout.tsx`'s `<head>` setting `document.documentElement.dataset.tab`, plus CSS attribute selectors to hide the inactive panel — treat as optional polish, not milestone scope.
- **Use `history.replaceState`, not `location.hash = 'gallery'`.** Assigning `location.hash` makes the browser scroll to any element whose `id` matches. `pushState` is the alternative if per-tab back-button behaviour is wanted; `replaceState` keeps history clean. Do **not** use `next/navigation`'s `router.push('#gallery')` — it triggers App Router navigation machinery for a purely local UI toggle.
- `useSyncExternalStore` with `getServerSnapshot: () => 'cv'` is the idiomatic React 19 alternative and encodes the SSR snapshot explicitly. Either is fine; `useEffect` is simpler to read.

---

## Decision 4 — Lightbox reuse

### Verdict: gallery items feed `Lightbox` **as-is**. Zero interface changes required.

`Lightbox.tsx:8-12` declares `attachments: Array<any>` and reads only:

| Field | Used at | Purpose |
|-------|---------|---------|
| `media.url` | `:102`, `:109`, `:140` (React keys), `:203`, `:211` (`src`) | source + key |
| `media.type === "image"` | `:201` | `<img>` vs `<video>` |
| `media.width`, `media.height` | `:199`, `:206-207`, `:217-218`, `:260` | aspect ratio + intrinsic size |

A `GalleryItem` shaped `{ type, url, width, height, ... }` satisfies all of it. Extra fields (`id`, `caption`, `tags`) are ignored — the prop is `Array<any>`.

**Mandatory usage constraints (from reading, not guessing):**

1. **Mount conditionally.** `Lightbox.tsx:198` calls `window.innerWidth` in a `useState` initializer — i.e. during render. It survives today only because `Attachments.tsx:71-80` mounts it behind `if (lightboxState.open === true)`. If `Gallery` renders `<Lightbox>` unconditionally (even hidden), `next build` with `output: 'export'` will fail with `window is not defined`. Copy the `Attachments` pattern exactly.
2. **Wrap in `<AnimatePresence>`.** `Attachments.tsx:110-112`. Without it the framer-motion `exit` transitions on `:126`, `:158`, `:176` never fire.
3. **`Lightbox.tsx` has no `"use client"` directive.** It inherits the boundary from `Attachments.tsx:1`. `Gallery.tsx` must therefore be `"use client"`. Recommended defensive one-liner: add `"use client"` to the top of `Lightbox.tsx`. Purely additive, no behavioural change.
4. **Pass the *filtered* array.** When a tag filter is active, pass `visibleItems` (not the full set) and an index into `visibleItems`, so next/prev stays inside the current filter. Index bookkeeping against the wrong array is the single most likely bug in this feature.
5. **Distinct `url`s required.** Keys are `media.url` (`:109`) and `media.url + "dot"` (`:140`).

**If captions are wanted in the lightbox** (not required by PROJECT.md's Active list): the change is **additive and safe** — render `{media.caption ? <figcaption>{media.caption}</figcaption> : null}` inside `LightboxImage`. CV attachments have no `caption` field (verified across all `item.json` files), so the branch is dead for existing usage. No `LightboxProps` change needed.

**Pre-existing bug worth knowing about:** `Lightbox.tsx:27-32` sets `document.body.style.overflow = 'hidden'` on open and restores it to `'unset'` on close. `'unset'` on the `overflow` shorthand resolves `overflow-x` to its initial value `visible`, wiping the `overflow-x: hidden` that `globals.css:55-59` sets. So `html`/`body` overflow behaviour differs before vs. after the first lightbox open. This interacts directly with the sticky tab bar (Anti-Pattern 1). Restoring to `''` instead of `'unset'` is the correct fix.

---

## Decision 5 — Where the filter-chip tag list comes from

### Recommendation: **derive at runtime** in `Gallery.tsx` via `useMemo`; **normalize at build time** in `galleryLoader.ts`.

```tsx
const tags = useMemo(() => {
  const counts = new Map<string, number>();
  for (const it of items) for (const t of it.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count }));   // Map preserves insertion order
}, [items]);

const visibleItems = useMemo(
  () => (activeTag ? items.filter(i => i.tags.includes(activeTag)) : items),
  [items, activeTag]
);
```

**Rationale:**
- The full `items` array is already serialized into the client payload for the grid. Emitting a separate `tags` array from the loader duplicates data and creates a drift class of bug (chip exists, zero matching items) for no payload saving.
- `Map` insertion order gives chips a **deterministic order = first appearance in the curated array**. Ordering is therefore controlled editorially by the item order in `gallery.json` — no `tagOrder` config needed. This is the ergonomic win.
- Counts come free and make chips more useful.

**What *must* happen at build time instead:** tag **normalization** in `galleryLoader.ts` — trim whitespace, collapse case-variants to a canonical display form (first-seen casing wins), dedupe within an item. Otherwise `"Branding"` and `"branding"` produce two chips and the owner has no way to notice. Warn on near-duplicates (case-insensitive collision) so typos surface in the build log.

**Do not put the active filter in the URL hash.** PROJECT.md only requires `#gallery` to be shareable. Adding `#gallery/branding` grammar means parsing, validating and reconciling unknown tags — cost with no stated requirement. Keep `activeTag` in React state.

---

## Recommended Project Structure

```
app/
├── page.tsx                    # MODIFIED — loads both datasets, wires slots
├── layout.tsx                  # untouched
├── globals.css                 # MODIFIED — overflow-x: clip
├── page.module.css             # untouched
│
├── TabbedView.tsx              # NEW  "use client"  — tab state + hash sync
├── TabbedView.module.css       # NEW  — .shell (540px), .panel, wide gallery container
├── Tabs.tsx                    # NEW  — presentational sticky bar
├── Tabs.module.css             # NEW
│
├── ProfileHeader.tsx           # NEW (extracted from Profile.tsx:17-37)
├── ProfileHeader.module.css    # NEW (moved from Profile.module.css:8-50)
├── Profile.tsx                 # MODIFIED — header removed
├── Profile.module.css          # MODIFIED — header rules removed
│
├── Gallery.tsx                 # NEW  "use client"  — Gallery + GalleryItem co-located
├── Gallery.module.css          # NEW  — CSS-columns masonry
├── FilterChips.tsx             # NEW  — presentational
├── FilterChips.module.css      # NEW
│
├── Attachments.tsx             # MODIFIED — import getThumbnailUrl
├── Lightbox.tsx                # MODIFIED — add "use client"
├── Scrollbar.tsx  RichText.tsx  isMobile.tsx  Arrow12.tsx   # untouched
│
└── lib/
    ├── contentLoader.ts        # MODIFIED — export 2 helpers, skip 'gallery'
    ├── galleryLoader.ts        # NEW — server-only
    └── mediaUrl.ts             # NEW — client-safe URL builder

public/content/010-gallery/     # NEW
├── gallery.json
└── media/
```

### Structure Rationale

- **`GalleryItem` co-located in `Gallery.tsx`** rather than its own file — mirrors `Attachments.tsx`, which keeps `Attachment` (lines 117-179) in the same module, and `Lightbox.tsx`, which keeps `LightboxImage` (lines 185-277). Consistency with the codebase beats file-per-component dogma at this size. `FilterChips` gets its own file because it is genuinely independent and reusable.
- **`app/lib/mediaUrl.ts` separate from `app/lib/contentLoader.ts`** because `contentLoader.ts:1` imports `fs`. A client component importing anything from that module risks pulling `node:fs` into the browser graph. Physical separation makes the constraint structural rather than a comment.

---

## Architectural Patterns

### Pattern 1: Server-rendered slots into a client shell

**What:** `page.tsx` (server) renders `Profile` and `Gallery` and hands them to `TabbedView` (client) as `ReactNode` props.
**When:** Any time client-only interactivity (tab state) must wrap trees that should stay server-rendered.
**Trade-offs:** Both panels ship in the HTML/RSC payload regardless of active tab — page weight is the sum of both, always. That is inherent to hash-based tabs (which PROJECT.md chose deliberately over routes) and is also the reason deep-linking `#gallery` has no loading state. Acceptable at ~30 gallery items.

```tsx
// TabbedView.tsx
type Props = { header: React.ReactNode; cvPanel: React.ReactNode; galleryPanel: React.ReactNode };
export default function TabbedView({ header, cvPanel, galleryPanel }: Props) {
  const [tab, setTab] = useState<'cv' | 'gallery'>('cv');
  /* hash effect */
  return (
    <>
      <div className={s.shell}>{header}<Tabs active={tab} onChange={select} /></div>
      {tab === 'cv' ? cvPanel : galleryPanel}
    </>
  );
}
```

### Pattern 2: Zero-CLS masonry from build-time dimensions

**What:** CSS multi-column (`columns`) + `break-inside: avoid`, with each tile carrying `style={{ aspectRatio: item.width / item.height }}`.
**When:** Known intrinsic dimensions (which the loader guarantees) + static export + no JS layout pass.
**Trade-offs:** Reading order is **column-major** (items 1..k fill column 1, then k+1..2k fill column 2), not row-major. For a curated flat stream this is acceptable — and it is actually *coherent with the Lightbox*, because pressing "next" advances to the item visually below in the same column. Columns are height-balanced by the browser automatically.

```tsx
<div className={s.grid}>                       {/* columns: 3; column-gap: 12px */}
  {visibleItems.map((item, i) => (
    <div key={item.id} className={s.tile}       /* break-inside: avoid; margin-bottom: 12px */
         style={{ aspectRatio: item.width / item.height }}
         onClick={() => setLightboxState({ open: true, startingIndex: i })}>
      {item.type === 'image'
        ? <img src={getThumbnailUrl(item.url, { width: 800 })} loading={i < 6 ? 'eager' : 'lazy'}
               width={item.width} height={item.height} alt={item.caption ?? ''} />
        : <video src={item.url} autoPlay muted loop playsInline preload={i < 6 ? 'auto' : 'metadata'} />}
    </div>
  ))}
</div>
```

**Why not native CSS masonry:** the spec settled on `grid-lanes`, and as of 2026 it ships only in Safari 26 — Chrome and Firefox remain behind flags. A progressive-enhancement fallback would be required anyway, so build the fallback and skip the enhancement. (MEDIUM confidence — web sources, not vendor release notes; verify before relying on it.)

**Why not a JS column-balancer:** column count is viewport-dependent, so a JS balancer either needs client-only width (hydration mismatch on a statically exported page) or a `useEffect` layout pass (visible reflow). Not worth it at ~30 items.

### Pattern 3: One URL contract for Cloudflare Image Resizing

**What:** `getThumbnailUrl` moves out of `Attachments.tsx:16-20` into `app/lib/mediaUrl.ts` and gains options.

```ts
// app/lib/mediaUrl.ts — no `fs`, safe in client components
type Opts = { width: number; height?: number; quality?: number };
export function getThumbnailUrl(url: string, { width, height, quality = 50 }: Opts): string {
  if (process.env.NODE_ENV === 'development') return url;   // /cdn-cgi/* does not exist locally
  const parts = [`width=${width}`, height ? `height=${height}` : null, `quality=${quality}`, 'format=auto']
    .filter(Boolean).join(',');
  return `/cdn-cgi/image/${parts}${url}`;
}
```

**Two things this fixes:**
- The current signature takes `maxHeight` and emits `width=${h*2},height=${h*2}` (a square box). The gallery needs a width-only constraint to preserve tall/wide ratios. Passing `height` optionally covers both call sites; `Attachments` calls `getThumbnailUrl(media.url, { width: 180, height: 180 })` and behaves identically.
- **The dev passthrough is not cosmetic.** `/cdn-cgi/image/...` is a Cloudflare edge path; there is no rewrite, no middleware, and no `public/cdn-cgi/` directory in this repo (verified). It 404s under `next dev`. Since PROJECT.md states verification is "manual/visual via the dev server", this must be fixed *before* the gallery is visually verifiable at all. Note that `rewrites` cannot be used with `output: 'export'`, so the env check is the right mechanism.

---

## Data Flow

### Build-time flow

```
public/content/010-gallery/gallery.json  +  media/*
        │
        ▼  loadGalleryData()            [app/lib/galleryLoader.ts]
   ├─ read + JSON.parse gallery.json
   ├─ per entry: getMediaType(file)                    ← contentLoader.ts (now exported)
   ├─ image?  getImageDimensions(abs path)  via sharp  ← contentLoader.ts (now exported)
   ├─ video?  require entry.width/height, else warn + 16:9
   ├─ url  = `/content/010-gallery/media/${file}`
   ├─ tags = normalize(trim, case-canonicalize, dedupe)
   └─ validate: missing files, orphan files, duplicate urls
        │
        ▼  GalleryItem[]
   app/page.tsx (async server component)
        │
        ▼  RSC payload → prerendered into out/index.html
   <Gallery items={...} />   ("use client")
```

### Runtime flow

```
GalleryItem[]  ──useMemo──▶  tags: {tag,count}[]  ──▶  <FilterChips>
      │                                                      │ onChange
      └──useMemo(activeTag)──▶  visibleItems  ◀──────────────┘
                                    │
                                    ├──▶ grid tiles (CSS columns, aspectRatio inline)
                                    │
                                    └──▶ onClick(i) → setLightboxState({open:true, startingIndex:i})
                                              │
                                              ▼
                                    <AnimatePresence>
                                      {open && <Lightbox
                                          attachments={visibleItems}   ← FILTERED, not all
                                          startingIndex={i}
                                          close={...} />}
                                    </AnimatePresence>
```

### Tab state flow

```
mount ──▶ tab='cv' (matches prerendered HTML — no mismatch)
   │
   ├─ useEffect: read window.location.hash ──▶ '#gallery' ? setTab('gallery') : noop
   ├─ 'hashchange' listener (back/forward, pasted link)
   └─ user clicks Tabs ──▶ setTab(next) + history.replaceState(null,'', '#gallery' | pathname)
```

---

## Anti-Patterns

### Anti-Pattern 1: Making the tab bar sticky without touching `globals.css`

**What people do:** add `position: sticky; top: 0` to `Tabs.module.css` and move on.
**Why it's wrong:** `app/globals.css:55-59` sets `overflow-x: hidden` on `html, body`. An ancestor with `overflow` other than `visible` establishes the scroll container that sticky resolves against, which is a well-documented cause of sticky silently not sticking. It is made worse by `Lightbox.tsx:31-32` resetting `overflow` to `'unset'` on close, so behaviour changes after the first lightbox open.
**Do this instead:** change both to `overflow-x: clip` — it clips identically but does not create a scroll container. Fix `Lightbox`'s restore to `''` rather than `'unset'`. Verify sticky **before and after** opening/closing the lightbox once. (MEDIUM-HIGH confidence: mechanism verified against multiple CSS references; verify empirically in Safari and Chrome — it is a 30-second check.)

### Anti-Pattern 2: Adding `'gallery'` to `SECTION_MAP`

**What people do:** treat it as "just another content section".
**Why it's wrong:** `SECTION_MAP` membership → `allCollections` (`contentLoader.ts:300-305`) → rendered as a CV `<section>` by `Profile.tsx:48-66`; and it routes through `loadSection`, which requires per-item directories.
**Do this instead:** skip it explicitly at `contentLoader.ts:288`, load it via `loadGalleryData()`.

### Anti-Pattern 3: Mounting `<Lightbox>` unconditionally

**What people do:** render it always and toggle visibility with CSS.
**Why it's wrong:** `Lightbox.tsx:198` reads `window.innerWidth` during render. `next build` with `output: 'export'` prerenders every page — this throws `window is not defined` and fails the build.
**Do this instead:** `{lightboxState.open && <Lightbox .../>}` inside `<AnimatePresence>`, exactly as `Attachments.tsx:71-80` and `:110-112`.

### Anti-Pattern 4: Passing the unfiltered array to the Lightbox while a filter is active

**What people do:** keep `items` as the lightbox source and map the clicked index back.
**Why it's wrong:** next/prev then walks into hidden items, and the index mapping desynchronizes on every filter change.
**Do this instead:** `attachments={visibleItems}` and index into `visibleItems`. Reset `lightboxState` on `activeTag` change.

### Anti-Pattern 5: Deriving the initial tab from `window.location.hash` during render

**What people do:** `useState(() => location.hash === '#gallery' ? 'gallery' : 'cv')`.
**Why it's wrong:** the prerendered `out/index.html` is always the CV tab (fragments never reach the server) — this is a hydration mismatch, and it also crashes at build time.
**Do this instead:** initialize to `'cv'`, correct in `useEffect`. Accept the one-frame flash, or add the optional `<head>` script + CSS treatment.

### Anti-Pattern 6: Relying on auto-detected media for the gallery

**What people do:** copy `detectAttachments()` (`contentLoader.ts:114-160`) so files in `media/` appear automatically.
**Why it's wrong:** PROJECT.md explicitly rejects auto-aggregation — the gallery is curated. Auto-detect also cannot supply captions or tags, and produces bogus 16:9 aspect ratios for video (`contentLoader.ts:135-136`), which is visible in a masonry grid.
**Do this instead:** manifest is authoritative; warn on orphan files.

---

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `page.tsx` (server) ↔ `TabbedView` (client) | `ReactNode` slot props | `cv` is `JSON.parse` output → serializable. Slots keep `Profile`/`Gallery` out of `TabbedView`'s module graph. |
| `galleryLoader.ts` ↔ `contentLoader.ts` | named imports of `getImageDimensions`, `getMediaType` | Both server-only. Requires adding `export` to two existing functions — additive. |
| `Gallery.tsx` ↔ `Lightbox.tsx` | `attachments` / `startingIndex` / `close` props | Shape-compatible with `GalleryItem` as designed. `Lightbox` must sit inside a client boundary. |
| `Attachments.tsx` / `Gallery.tsx` ↔ `mediaUrl.ts` | `getThumbnailUrl()` | Must never import `contentLoader.ts` (pulls `fs`). |
| `Profile.tsx` ↔ `ProfileHeader.tsx` | none after extraction | `Profile` loses `cv.general.*` header usage; still consumes `cv.general.about` (`Profile.tsx:39-46`). Keep About in `Profile`. |

### External Services

| Service | Integration Pattern | Gotchas |
|---------|---------------------|---------|
| Cloudflare Image Resizing | `/cdn-cgi/image/<opts>/<path>` prefix built by `getThumbnailUrl` | **Does not exist in `next dev`** — 404s locally. Needs the `NODE_ENV` passthrough. `rewrites` are unavailable under `output: 'export'`. Videos must not be routed through it. |
| Cloudflare Pages `_headers` | `public/_headers` | `/content/media/*` (line 5) does **not** match `/content/010-gallery/media/*`. The `/*.jpg`, `/*.png`, `/*.mp4`, `/*.webp` splats do cover gallery assets — but `.webm` and `.jpeg` are missing. Add them if used. |
| Git-branch beta badge | `NEXT_PUBLIC_GIT_BRANCH` via `next.config.ts:26-28` | Moves with `ProfileHeader`; inlined at build, works either side of the boundary. |

---

## Build Order (each step independently verifiable in `next dev`)

| # | Step | Files | Verification in dev server |
|---|------|-------|----------------------------|
| **0** | **Dev-visibility prerequisite.** Create `app/lib/mediaUrl.ts` with the `NODE_ENV` passthrough; point `Attachments.tsx` at it. | NEW `lib/mediaUrl.ts`; MOD `Attachments.tsx` | CV attachment thumbnails **render** at `localhost:3000` (today they 404). Everything downstream is visually unverifiable without this. |
| **1** | **Content model + loader.** Seed `010-gallery/gallery.json` + 5–6 assets incl. 1 video. Write `loadGalleryData()`. Export the two helpers, add the `gallery` skip. Temporarily render `<pre>{JSON.stringify(gallery,null,2)}</pre>` in `page.tsx`. | NEW `lib/galleryLoader.ts`, `010-gallery/*`; MOD `lib/contentLoader.ts`, `page.tsx` | JSON dump on the page shows real `width`/`height` per image, correct `/content/010-gallery/media/...` URLs, normalized tags. Build log clean (no "Unknown section"). Warns on a deliberately-orphaned file. CV page otherwise unchanged. |
| **2** | **Header extraction (pure refactor).** `ProfileHeader.tsx` + `ProfileHeader.module.css`, still rendered from inside `Profile.tsx`. | NEW `ProfileHeader.*`; MOD `Profile.tsx`, `Profile.module.css` | Home page is **pixel-identical**. Beta badge still appears on `dev`. Zero-risk checkpoint. |
| **3** | **Tab shell.** `TabbedView` + `Tabs`; gallery panel is a placeholder `<div>Gallery</div>`. Move header render up. Fix `globals.css` `overflow-x: clip` and `Lightbox`'s `'unset'` restore. | NEW `TabbedView.*`, `Tabs.*`; MOD `page.tsx`, `Profile.tsx`, `globals.css`, `Lightbox.tsx` | Click switches panels; header persists; tab bar **sticks on scroll** (test in Chrome *and* Safari, and again after opening+closing a CV lightbox); `localhost:3000/#gallery` deep-links; back/forward and reload behave; `npm run build` succeeds. |
| **4** | **Grid, images only.** `Gallery.tsx` + `Gallery.module.css`, CSS-columns masonry, `aspectRatio` from build dims, no filters, no lightbox. | NEW `Gallery.*` | Grid renders at correct ratios; **no layout shift** on load (throttle network); columns rebalance at breakpoints; commit to the 540px-vs-wide container decision here. |
| **5** | **Video tiles.** `<video autoPlay muted loop playsInline>` branch + explicit dims + `prefers-reduced-motion` guard. | MOD `Gallery.tsx` | Video autoplays muted on desktop and iOS Safari (`playsInline` is required there); correct aspect ratio; no CLS; loader warns if `width`/`height` omitted. |
| **6** | **Lightbox wiring.** Conditional mount inside `<AnimatePresence>`, `attachments={items}` (unfiltered for now). | MOD `Gallery.tsx`; MOD `Lightbox.tsx` (add `"use client"`) | Click opens at the right index; ←/→/Esc work; mobile swipe works; page scroll locks and **restores**; `npm run build` still succeeds (this is where the `window` trap would bite). |
| **7** | **Filter chips.** `FilterChips.tsx`; switch to `visibleItems`; reset lightbox state on tag change. | NEW `FilterChips.*`; MOD `Gallery.tsx` | Chips reflect real tags with counts, ordered by first appearance; filtering rebalances columns; **lightbox next/prev stays inside the filtered set**; "All" restores. |
| **8** | **Polish & housekeeping.** Captions, empty state, `_headers` extensions, CLAUDE.md drift fix. | MOD `public/_headers`, `CLAUDE.md`, `Gallery.module.css` | Visual pass in light + dark (`prefers-color-scheme`); `npm run build`; commit the regenerated `out/`. |

**Ordering rationale:** step 0 unblocks *all* visual verification. Step 1 proves the data layer with zero UI risk. Step 2 is a pure refactor checkpoint that isolates any header regression from the tab work. Step 6 deliberately precedes step 7 so lightbox index correctness is established against a stable array before filtering changes the index basis — the reverse order conflates two bug sources.

---

## Documentation drift found (fix during this milestone)

| Claim in `CLAUDE.md` | Reality |
|----------------------|---------|
| "Next.js 15 (App Router)" | `package.json` pins `next: ^16.3.0`; `next.config.ts:23-25` pins a Turbopack workspace root. |
| "Client components: `Profile.tsx`, `Attachments.tsx`, `Lightbox.tsx`, `Scrollbar.tsx`, `RichText.tsx`" | Only `Profile.tsx` and `Attachments.tsx` declare `"use client"`. The rest are transitive. |
| "Font: Inter (loaded via `next/font/google`)" | `app/layout.tsx:21` loads **Switzer** from Fontshare via `<link>`; `globals.css:6` sets `--default-font: "Switzer"`. No `next/font` usage anywhere. |
| "Media files in `media/` are auto-detected if not explicitly listed" | True but nearly unused — exactly one item (`004-awards/001-…`) relies on it. |
| Not documented | `010-gallery/` manifest convention (add once built). |

---

## Open Questions for the Roadmapper

1. **Gallery container width** — 540px (matches CV rhythm) or wide (~1200px, better masonry)? Affects `TabbedView.module.css` and step 4. Not resolvable from code; it is a design call.
2. **Video dimensions in `gallery.json`** — accepted as a manual authoring requirement (recommended), or is an `ffprobe`-based build step worth the environment fragility? Recommendation: manual, with a loud build warning.
3. **Deep-link flash** — is one frame of CV before switching to `#gallery` acceptable, or is the `<head>` script + CSS treatment in scope?
4. **`out/` diff noise** — `out/` is committed and already dirty in the working tree. Decide whether to keep committing build output or `.gitignore` it before this milestone starts adding to the noise.

---

## Sources

- Source files read at `/Users/haythem/Developer/ReadCV` (branch `dev`, `4f0e729`): `app/lib/contentLoader.ts`, `app/page.tsx`, `app/layout.tsx`, `app/Profile.tsx`, `app/Attachments.tsx`, `app/Lightbox.tsx`, `app/RichText.tsx`, `app/isMobile.tsx`, `app/Profile.module.css`, `app/page.module.css`, `app/globals.css`, `app/[slug]/page.tsx`, `app/[slug]/CaseStudy.tsx`, `scripts/migrate-content.ts`, `next.config.ts`, `package.json`, `public/_headers`, `public/content/**/item.json`, `out/index.html` — **HIGH confidence**
- [Making a Masonry Layout That Works Today — CSS-Tricks](https://css-tricks.com/making-a-masonry-layout-that-works-today/) — MEDIUM
- [Masonry layout — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout/Masonry_layout) — MEDIUM
- [CSS Grid Lanes (Masonry Layout): A Complete Guide for 2026 — DEV](https://dev.to/bean_bean/css-grid-lanes-masonry-layout-is-here-a-complete-guide-for-2026-4686) — LOW (community post; the "Safari 26 only" claim should be re-verified before relying on it)
- ["position: sticky" not working? Try "overflow: clip" — Terluin Webdesign](https://www.terluinwebdesign.nl/en/blog/position-sticky-not-working-try-overflow-clip-not-overflow-hidden/) — MEDIUM
- [Getting stuck: all the ways position:sticky can fail — Polypane](https://polypane.app/blog/getting-stuck-all-the-ways-position-sticky-can-fail/) — MEDIUM

---
*Architecture research for: tabs + curated masonry gallery on a static Next.js App Router site*
*Researched: 2026-08-08*
