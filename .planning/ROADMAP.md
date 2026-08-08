# Roadmap: ReadCV — Milestone v1.1 Tabs & Gallery

**Created:** 2026-08-08
**Revised:** 2026-08-08 — Phase 1 split into a load-bearing phase and a repo-hygiene phase; phases renumbered (6 → 7)
**Milestone goal:** Split the site into two tabbed views — the existing CV and a new Gallery — so visual work can be browsed as a standalone masonry grid instead of only as per-item attachments.
**Requirements covered:** 36 / 36 v1.1 requirements

## How This Roadmap Is Ordered

Seven phases, derived from the 36 v1.1 requirements. This is the research-recommended 8-phase sequence restructured: the filter-chip phase is gone entirely (FILT-01/02 were deferred to v1.2), the polish/regression sweep is not a phase — it is folded into the phases that touch shared code, because this project has no test framework and a dedicated end-of-milestone sweep would let regressions sit undetected for five phases — and the pre-work has been split in two.

**Why the pre-work is two phases, not one.** The nine build-hygiene requirements are two different kinds of work wearing the same category prefix. BUILD-01, BUILD-02, BUILD-03, and BUILD-09 are **load-bearing**: later phases cannot be built, verified, or trusted without them. The remaining four — BUILD-05, BUILD-06, BUILD-07, BUILD-08 — are **repo hygiene**: they have no dependency on feature work and no feature work depends on them. Bundling eight requirements spanning two real bug fixes, a CDN dev bypass, a 41MB deletion, a gated git operation, doc corrections, and authoring a checklist into one phase made a single phase carry more distinct kinds of risk than any other phase in the milestone.

**Why hygiene is Phase 2 rather than deferred to the end.** This was a real judgement call, and it goes to early:

- **BUILD-07 only pays off forward.** `out/` is 99MB across 118 tracked paths and is *currently desynced* — the working tree shows old Webpack chunks deleted and new Turbopack chunks untracked, so the committed build output does not correspond to the committed source right now. Untracking it (or, under the gated alternative, formalising a rebuild-as-a-separate-commit convention) before the feature phases means Phases 3–7 each produce a clean, readable diff. Deferring it to the end forfeits that benefit entirely for five phases and then does the mechanical work anyway. There is no version of "do it later" that is cheaper.
- **BUILD-08 actively misleads until it is fixed.** CLAUDE.md claims Next.js 15 (actual: 16.3 with a pinned Turbopack workspace root), Inter via `next/font/google` (actual: Switzer via a Fontshare `<link>`), and lists client components that do not declare `"use client"`. Every later phase reads that file before touching exactly those surfaces. Wrong facts there compound; correcting them early is the cheapest correction available.
- **BUILD-05 makes the Phase 6 byte budget measurable.** `backup-media.bak/` ships to production because everything under `public/` is served verbatim — roughly half the deployed media payload. The video phase sets a per-asset byte budget against total page weight; measuring that against a baseline still carrying 41MB of dead files gives a number that means nothing.

The argument for deferring is that BUILD-07 is gated on a Cloudflare dashboard confirmation the owner may not have to hand. That does not justify pushing the phase later, because the gate resolves either way *within* the phase: if Pages deploys a prebuilt directory, `out/` stays tracked, the decision gets written down, and the phase proceeds. The gate can never block the milestone — only decide which branch of one criterion is taken.

The order is not stylistic. Five constraints are load-bearing:

1. **Phase 1 must come first** because `/cdn-cgi/image/...` paths 404 under `next dev`. Verification on this project is manual and visual — until thumbnails render locally, nothing downstream can be checked at all. BUILD-01 is therefore in the first phase, no exceptions.
2. **BUILD-02 (Phase 1) lands before BUILD-04 (Phase 3).** `Lightbox.tsx` currently writes inline `overflow: unset` on close, which permanently defeats the `globals.css` overflow rule for the rest of the session. Verifying sticky on a fresh load, after a lightbox has never been opened, passes for the wrong reason. Phase 3 therefore verifies sticky *both* before and after a full lightbox open/close cycle.
3. **BUILD-03 (Phase 1) lands before LBOX-01 (Phase 7).** `Lightbox.tsx` has no `"use client"` and works only by inheriting the boundary from `Attachments.tsx`. Mounting it from a new gallery parent without that fix fails `next build` — so Phase 1 proves the fix by building it from a module graph that does not already establish a client boundary, rather than asserting it.
4. **CONT-04 (Phase 4) lands before GRID-01/GRID-02 (Phase 5).** Masonry *is* aspect ratio. `contentLoader.ts` hardcodes 1920×1080 for every video, so the grid would place every video wrong and then reflow.
5. **Content model → grid → video → lightbox.** Lightbox integration comes last so index correctness is established against a stable, finished array rather than a moving one.

BUILD-09 sits in Phase 1 rather than Phase 2 because it is the regression net every later phase leans on. Four of the highest-value fixes in this milestone touch code the shipped CV depends on — `globals.css`, `Lightbox.tsx`, `contentLoader.ts`, and the CDN helper — and there is no automated test suite. The checklist must exist before shared code is touched, and it is named explicitly in the success criteria of every phase that touches those four surfaces.

## Phases

- [ ] **Phase 1: Verifiable Baseline** - Fix the load-bearing defects that make every later phase checkable, and write the regression net
- [ ] **Phase 2: Repo Hygiene** - Stop shipping and tracking what the site does not need, and make the docs true
- [ ] **Phase 3: Tab Shell** - Sticky, hash-backed, keyboard-operable CV/Gallery tabs with a persistent header
- [ ] **Phase 4: Gallery Content Model** - A curated `010-gallery/` manifest with captions, tags, and true dimensions
- [ ] **Phase 5: Masonry Grid** - Two-column aspect-ratio-preserving grid that is correct on first paint
- [ ] **Phase 6: Video in the Grid** - Muted looping autoplay that degrades safely on iOS and under reduced motion
- [ ] **Phase 7: Lightbox Integration** - Gallery tiles open fullscreen with next/prev, without regressing the CV lightbox

## Phase Details

### Phase 1: Verifiable Baseline

**Goal**: A developer can see what they are building and can tell when they have broken the shipped CV
**Depends on**: Nothing (first phase)
**Requirements**: BUILD-01, BUILD-02, BUILD-03, BUILD-09
**Success Criteria** (what must be TRUE):

  1. Running `npm run dev` and loading `localhost:3000` shows every CV attachment thumbnail as a real image rather than a broken-image icon, while a production build still emits `/cdn-cgi/image/...` URLs.
  2. `Lightbox.tsx` declares its own client boundary and reads no browser global during render — proven by an `npm run build` that succeeds while importing Lightbox from a module graph that does not already establish a client boundary, not by inspection alone.
  3. After a full lightbox open/close cycle, `document.body.getAttribute('style')` is empty, so the page's own overflow rules are back in force for the rest of the session.
  4. A CV-regression checklist exists in the repo and a developer can walk it end to end in a few minutes; it is walked at this phase's exit with zero failures. This phase edits `Lightbox.tsx` and the CDN helper, so it is the first phase the checklist has to catch.

**Plans**: 5 plans in 4 waves

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Gate the CDN prefix on Cloudflare production builds; extract `getThumbnailUrl` into `app/lib/cdnImage.ts` with byte-identical output (wave 1)
- [x] 01-04-PLAN.md — Author `CV-REGRESSION.md`, the repo's permanent CV-regression checklist (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 01-02-PLAN.md — Lightbox: capture-and-restore y-axis scroll lock, `useIsMobile()` swap, container-measured aspect ratio (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-03-PLAN.md — Prove the client boundary with a throwaway probe: negative control, `"use client"`, positive proof, teardown (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 01-05-PLAN.md — Walk the checklist with zero failures, take the phase's final plain build, write the verification record (wave 4)

### Phase 2: Repo Hygiene

**Goal**: The repo ships only what the site needs, produces readable diffs, and its documentation matches reality
**Depends on**: Phase 1
**Requirements**: BUILD-05, BUILD-06, BUILD-07, BUILD-08
**Success Criteria** (what must be TRUE):

  1. A production build no longer contains `backup-media.bak/`, the deployed payload is measurably smaller than before this phase, and no CV item references a removed file — confirmed by walking the CV-regression checklist from Phase 1.
  2. **The Cloudflare Pages build configuration is confirmed to build from source before `out/` is untracked.** If it is confirmed, `out/` is untracked from git and a one-line source change thereafter produces a diff containing only source files. If Pages deploys a prebuilt directory instead, `out/` stays tracked, that decision and its reason are written down in the repo, and the rebuild-as-a-separate-commit convention is recorded instead. The live site is reachable and serving current content after this phase either way.
  3. `npm run lint` completes without error, or it no longer appears in the documented commands.
  4. Every claim in CLAUDE.md matches the repo — framework version, bundler, font, the actual list of client components, the available commands — plus the two facts this milestone surfaces: the CDN dev bypass from Phase 1, and why `globals.css` must not use `overflow-x: hidden`.

**Plans**: TBD

### Phase 3: Tab Shell

**Goal**: A visitor can move between the CV and the Gallery, and share a link that opens on either
**Depends on**: Phase 2
**Requirements**: BUILD-04, TABS-01, TABS-02, TABS-03, TABS-04, TABS-05, TABS-06, TABS-07
**Success Criteria** (what must be TRUE):

  1. A visitor can click between a CV tab and a Gallery tab, the profile header stays visible above both, and the active tab is marked by more than colour alone.
  2. The tab bar stays pinned to the top of the viewport through a full scroll of the CV — verified on a fresh load **and again after opening and closing a CV attachment lightbox in the same session**, since those two states are the ones that historically disagree.
  3. Hard-reloading `/#gallery` lands on the Gallery tab without the CV appearing first, hard-reloading `/` lands on the CV, and both hydrate with a clean console; Back/Forward behaviour after a tab switch matches what the phase wrote down.
  4. A keyboard-only visitor can reach the tab bar, move between tabs with arrow keys, and hear the tab name plus its selected state announced by a screen reader.
  5. Switching to a tab shows that tab's content from its top rather than dropped mid-scroll, and the CV-regression checklist still passes — this phase edits `globals.css` and `Lightbox.tsx`, the two files the shipped CV is most exposed to.

**Plans**: TBD
**UI hint**: yes

### Phase 4: Gallery Content Model

**Goal**: The owner can curate the gallery by editing files, and every entry carries what the grid needs to lay it out
**Depends on**: Phase 3
**Requirements**: CONT-01, CONT-02, CONT-03, CONT-04, CONT-05, CONT-06, CONT-07
**Success Criteria** (what must be TRUE):

  1. A content author can add a gallery entry by dropping a file in the gallery media folder and adding a line to the manifest giving it a caption and tags, and after a rebuild that entry appears in the loaded gallery data with those values intact.
  2. Every loaded entry — video as well as image — reports its true intrinsic width and height; no entry silently reports 1920×1080, and a missing or unreadable dimension produces a loud build warning rather than a silent default.
  3. Reordering entries in the manifest reorders them in the loaded data, with no file or directory renaming required.
  4. Placing a file in the gallery media folder without listing it in the manifest produces a visible warning in the build log.
  5. The repo ships a seeded sample set — including at least one video and at least one portrait-shaped asset — so the grid can be judged against real content rather than placeholders, and the CV-regression checklist still passes (this phase edits `contentLoader.ts`, which the CV depends on).

**Plans**: TBD

### Phase 5: Masonry Grid

**Goal**: A visitor can browse the curated work as a grid that looks right the instant it appears
**Depends on**: Phase 4
**Requirements**: GRID-01, GRID-02, GRID-03, GRID-04
**Success Criteria** (what must be TRUE):

  1. The Gallery tab shows gallery items in a two-column masonry grid, and each tile's shape matches its source asset's real aspect ratio — portrait assets read as portrait.
  2. On a throttled connection the tiles occupy their final positions from first paint; nothing collapses, jumps, or reshuffles as media arrives.
  3. Opening the Gallery tab requests only the media at or near the viewport; the rest is requested as the visitor scrolls toward it.
  4. The grid occupies the same column width as the CV content at 320px, 480px, 768px, and 1440px, with no horizontal scrollbar at any of them, and the CV-regression checklist still passes — this phase extends the CDN helper the CV attachments also use.

**Plans**: TBD
**UI hint**: yes

### Phase 6: Video in the Grid

**Goal**: Motion work reads as motion in the grid, without being hostile to the device or the visitor
**Depends on**: Phase 5
**Requirements**: VID-01, VID-02, VID-03, VID-04, VID-05
**Success Criteria** (what must be TRUE):

  1. Videos in the grid start playing on their own, silently, and loop — confirmed on desktop and on a real iPhone.
  2. The built HTML served to the browser carries `muted` as an attribute on every gallery video before any JavaScript runs, confirmed by inspecting the served markup and the DOM node in Safari's inspector.
  3. When the browser or device refuses autoplay — iOS Low Power Mode, a blocked play attempt — the tile shows a still frame instead of a blank box, and the console shows no unhandled rejection.
  4. With the OS "reduce motion" preference on, no gallery video plays; every video tile shows its still frame instead.
  5. Scrolling the full gallery leaves only the videos near the viewport playing; the rest are paused, and a sustained scroll does not leave the device hot or the page stuttering.

**Plans**: TBD
**UI hint**: yes

### Phase 7: Lightbox Integration

**Goal**: A visitor can open any gallery item fullscreen and move through the set, with the CV lightbox untouched
**Depends on**: Phase 6
**Requirements**: LBOX-01, LBOX-02, LBOX-03, LBOX-04
**Success Criteria** (what must be TRUE):

  1. Clicking any gallery tile opens that exact item fullscreen — including the second and third tile opened in the same session, and including a tile opened after a CV attachment lightbox was already used.
  2. Next and previous move through the gallery in grid order, by keyboard, by on-screen control, and by swipe on mobile; Esc closes and focus returns to the tile that was clicked.
  3. Opening the gallery lightbox on a real phone does not request every gallery asset at once — the network panel shows a bounded set around the current item.
  4. The full CV-regression checklist passes: the CV attachment lightbox opens, navigates, and closes exactly as it did before this milestone, leaves no inline style on `body`, and does so in both light and dark mode with a clean console.

**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Verifiable Baseline | 2/5 | In Progress|  |
| 2. Repo Hygiene | 0/TBD | Not started | - |
| 3. Tab Shell | 0/TBD | Not started | - |
| 4. Gallery Content Model | 0/TBD | Not started | - |
| 5. Masonry Grid | 0/TBD | Not started | - |
| 6. Video in the Grid | 0/TBD | Not started | - |
| 7. Lightbox Integration | 0/TBD | Not started | - |

## Requirement Coverage

| Phase | Requirements | Count |
|-------|--------------|-------|
| 1. Verifiable Baseline | BUILD-01, BUILD-02, BUILD-03, BUILD-09 | 4 |
| 2. Repo Hygiene | BUILD-05, BUILD-06, BUILD-07, BUILD-08 | 4 |
| 3. Tab Shell | BUILD-04, TABS-01, TABS-02, TABS-03, TABS-04, TABS-05, TABS-06, TABS-07 | 8 |
| 4. Gallery Content Model | CONT-01, CONT-02, CONT-03, CONT-04, CONT-05, CONT-06, CONT-07 | 7 |
| 5. Masonry Grid | GRID-01, GRID-02, GRID-03, GRID-04 | 4 |
| 6. Video in the Grid | VID-01, VID-02, VID-03, VID-04, VID-05 | 5 |
| 7. Lightbox Integration | LBOX-01, LBOX-02, LBOX-03, LBOX-04 | 4 |
| **Total** | | **36 / 36** |

No requirement is unmapped. No requirement appears in two phases.

## Open Decisions Carried Into Planning

Surfaced by research, not resolvable from code — each needs an owner call at the phase that hits it:

| Decision | Phase | Note |
|----------|-------|------|
| Does Cloudflare Pages build from source, or deploy a prebuilt directory? | 2 | **Gates BUILD-07.** Untracking `out/` under a prebuilt-deploy configuration takes the live site down. Confirm in the CF dashboard before touching the file. Either answer lets the phase proceed; only one of them untracks `out/`. |
| `pushState` or `replaceState` on tab switch (does Back undo a tab switch?) | 3 | Pick one and put it in the phase's acceptance criteria; `replaceState` keeps the back stack clean. |
| Are hand-entered video `width`/`height` in the manifest acceptable? | 4 | Recommended by research — `sharp` cannot read video, and `ffprobe` adds a build-environment dependency. ~30 curated assets makes manual entry cheap. |
| Gallery container width — stay at the CV's 540px, or break out wider | 5 | A design call best made against the real seeded content from Phase 4. GRID-04 currently commits to matching the CV column; revisit only if the grid reads as cramped. |

---
*Roadmap created: 2026-08-08*
*Roadmap revised: 2026-08-08 — Phase 1 split into Phase 1 (load-bearing) and Phase 2 (repo hygiene); phases 2–6 renumbered to 3–7*
