# Requirements: ReadCV — Milestone v1.1 Tabs & Gallery

**Defined:** 2026-08-08
**Core Value:** A visitor can understand who Haythem is and see the quality of his work within seconds of landing — the presentation itself is part of the portfolio.

## v1.1 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase.

### Build Hygiene

Pre-existing defects. The first four are load-bearing — the milestone's features cannot be built or verified without them. The rest are repo hardening the owner chose to include.

- [ ] **BUILD-01**: Developer can see content thumbnails when running `next dev` locally
- [ ] **BUILD-02**: Lightbox restores the previous `overflow` value on close instead of writing `unset`
- [ ] **BUILD-03**: Lightbox declares its own client boundary and does not read `window` during render
- [ ] **BUILD-04**: `position: sticky` functions anywhere in the app
- [ ] **BUILD-05**: Repo no longer ships unused backup media to production
- [ ] **BUILD-06**: `npm run lint` completes successfully, or is removed from the documented commands
- [ ] **BUILD-07**: Build output is no longer tracked in git — **gated**: requires confirming the Cloudflare Pages project builds from source before acting
- [ ] **BUILD-08**: CLAUDE.md accurately describes the current stack, client components, font, and available commands
- [ ] **BUILD-09**: A written CV-regression checklist exists in the repo and is walked at each phase boundary

### Tabs

- [ ] **TABS-01**: Visitor can switch between a CV tab and a Gallery tab
- [ ] **TABS-02**: Tab bar remains visible at the top of the viewport while scrolling a long tab
- [ ] **TABS-03**: Visitor can share a URL ending in `#gallery` that opens directly on the Gallery tab
- [ ] **TABS-04**: Profile header remains visible across both tabs
- [ ] **TABS-05**: Visitor can operate the tabs by keyboard with correct roles and focus behavior
- [ ] **TABS-06**: Switching tabs returns the visitor to the top of the newly shown content
- [ ] **TABS-07**: Opening a `#gallery` link does not briefly show the CV before switching

### Gallery Content

- [ ] **CONT-01**: Content author can add a gallery entry by placing a file in the gallery media folder and listing it in the manifest
- [ ] **CONT-02**: Content author can give each gallery entry a caption
- [ ] **CONT-03**: Content author can give each gallery entry tags
- [ ] **CONT-04**: Every gallery entry carries accurate width and height, including videos
- [ ] **CONT-05**: Content author controls gallery display order by reordering the manifest
- [ ] **CONT-06**: Build surfaces a warning when a media file exists but is absent from the manifest
- [ ] **CONT-07**: Gallery ships seeded with a sample set of entries so the feature is demonstrable

### Grid

- [ ] **GRID-01**: Visitor sees gallery items in a two-column masonry grid that preserves each item's aspect ratio
- [ ] **GRID-02**: Grid renders at correct proportions on first paint, without items shifting as media loads
- [ ] **GRID-03**: Gallery media below the fold loads only as the visitor approaches it
- [ ] **GRID-04**: Gallery grid occupies the same column width as the CV content

### Video

- [ ] **VID-01**: Videos in the grid play automatically without sound and loop
- [ ] **VID-02**: Visitor sees a still frame rather than a blank tile when autoplay is blocked by the browser or device
- [ ] **VID-03**: Visitor who prefers reduced motion does not get autoplaying video
- [ ] **VID-04**: Videos outside the viewport do not consume decoding resources
- [ ] **VID-05**: Videos are muted in the initially served HTML, before any JavaScript runs

### Lightbox

- [ ] **LBOX-01**: Visitor can open any gallery item fullscreen by clicking it
- [ ] **LBOX-02**: Visitor can move to the next and previous gallery item while fullscreen
- [ ] **LBOX-03**: Opening the gallery lightbox on mobile does not load every gallery item at once
- [ ] **LBOX-04**: Existing CV attachment lightbox behavior is unchanged

## v1.2 Requirements

Deferred. Tracked but not in this roadmap.

### Filtering

- **FILT-01**: Visitor can narrow the gallery to a single tag via filter chips
- **FILT-02**: Visitor can return to the unfiltered grid via an "All" chip

Deferred because both reference craft portfolios surveyed in research ship without filters, and at ~30 items filtering is arguably decorative. `CONT-03` still captures tags now so content authored during v1.1 does not need re-authoring when filtering arrives.

### Presentation

- **PRES-01**: Visitor sees a dominant-color placeholder while gallery media loads
- **PRES-02**: Gallery uses additional viewport width on large screens
- **PRES-03**: Visitor sees captions in the grid, not only in the lightbox

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Separate `/gallery` route | Hash-based tabs keep the single-page static export intact and switching instant; a route adds a full page transition for no gain |
| Gallery auto-aggregating CV item media | The gallery is a curated editorial view; auto-aggregation would couple it to CV structure and surface everything indiscriminately |
| Grouping the gallery by project | A flat stream covers the same need at ~30 items without adding a content nesting level |
| Full gallery curation | Building the system is this milestone; choosing the final asset set is the owner's editorial call, done after ship |
| Per-entry external links and year metadata | Caption and tags are sufficient for v1.1; revisit if the grid feels thin |
| Multi-select filter chips | Multi-select AND-logic is what creates an empty state that would then need designing; single-select makes it structurally impossible |
| Filter state in the URL | Ephemeral filter state is sufficient; the tab itself is the shareable unit |
| Adding a test framework | Project has deliberately had none; a written CV-regression checklist (BUILD-09) was chosen instead |
| Upgrading framer-motion to 13.x | Bumping a major animation dependency inside a feature milestone in a repo with no tests is unnecessary risk |
| Adding a masonry library | `react-masonry-css` is unmaintained since 2022; client-measuring libraries defeat the static-export correct-first-paint property that build-time dimensions provide |
| Adding a headless UI component library for tabs | Pulls transitive dependencies for a two-tab widget in a project whose stated constraint is no component library |
| Infinite scroll, staggered entry animations, custom cursor, parallax, hover zoom, sort dropdown, grid/list toggle, lightbox zoom/pan | Identified in research as portfolio anti-features — they add motion and controls that make a ~30-item gallery worse, not better |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BUILD-01 | TBD | Pending |
| BUILD-02 | TBD | Pending |
| BUILD-03 | TBD | Pending |
| BUILD-04 | TBD | Pending |
| BUILD-05 | TBD | Pending |
| BUILD-06 | TBD | Pending |
| BUILD-07 | TBD | Pending |
| BUILD-08 | TBD | Pending |
| BUILD-09 | TBD | Pending |
| TABS-01 | TBD | Pending |
| TABS-02 | TBD | Pending |
| TABS-03 | TBD | Pending |
| TABS-04 | TBD | Pending |
| TABS-05 | TBD | Pending |
| TABS-06 | TBD | Pending |
| TABS-07 | TBD | Pending |
| CONT-01 | TBD | Pending |
| CONT-02 | TBD | Pending |
| CONT-03 | TBD | Pending |
| CONT-04 | TBD | Pending |
| CONT-05 | TBD | Pending |
| CONT-06 | TBD | Pending |
| CONT-07 | TBD | Pending |
| GRID-01 | TBD | Pending |
| GRID-02 | TBD | Pending |
| GRID-03 | TBD | Pending |
| GRID-04 | TBD | Pending |
| VID-01 | TBD | Pending |
| VID-02 | TBD | Pending |
| VID-03 | TBD | Pending |
| VID-04 | TBD | Pending |
| VID-05 | TBD | Pending |
| LBOX-01 | TBD | Pending |
| LBOX-02 | TBD | Pending |
| LBOX-03 | TBD | Pending |
| LBOX-04 | TBD | Pending |

**Coverage:**
- v1.1 requirements: 36 total
- Mapped to phases: 0 (roadmap not yet created)
- Unmapped: 36 ⚠️

---
*Requirements defined: 2026-08-08*
*Last updated: 2026-08-08 after initial definition*
