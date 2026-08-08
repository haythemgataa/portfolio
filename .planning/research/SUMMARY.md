# Project Research Summary

**Project:** ReadCV — v1.1 Tabs & Gallery
**Domain:** Static Next.js App Router portfolio site — adding hash-based tabs and a curated masonry media gallery to a shipped v1.0 CV site
**Researched:** 2026-08-08
**Confidence:** HIGH

## Executive Summary

This milestone adds a sticky, hash-backed tab bar and a curated masonry gallery to a static Next.js 16 / React 19 site that already ships a working CV, Lightbox, and Cloudflare-proxied image pipeline. The headline finding across all four research tracks is that **this requires zero new runtime dependencies** — CSS multi-column, `position: sticky`, `IntersectionObserver`, `window.location.hash`, and a hand-rolled WAI-ARIA tablist cover every new capability, backed by dimensions `sharp` already computes at build time. The real work is roughly a dozen new/modified files and CSS, not a dependency decision.

The recommended approach is a straight-line build order: fix a small number of pre-existing repo defects first (most importantly one CSS line and a scroll-lock cleanup bug), then build the tab shell, then the gallery content model, then the grid, then video, then filtering, then Lightbox reuse, then a full regression sweep. This order is not arbitrary — three of the highest-confidence findings in this research are **ordering constraints**, not independent bugs: the `overflow-x: hidden` → `clip` fix must land before the tab bar is built; the Lightbox's scroll-lock cleanup bug (`overflow: unset` on close) must be fixed in the *same* phase, because it silently and permanently undoes the `overflow-x` fix the first time a visitor opens the lightbox — meaning a naive test plan that checks sticky before ever opening the lightbox will pass and still ship broken; and Lightbox reuse for the gallery must be sequenced after filtering is stable, so index correctness isn't established against a moving target.

The main risk in this milestone is not the tab/masonry mechanics — those are well-covered by platform CSS and converge cleanly across all four research files — it is **video in the grid**: iOS autoplay is gated by both a documented React bug (the `muted` DOM property not reliably reaching SSR HTML) and undocumented, device-dependent decode-concurrency limits, and the existing codebase already has the fragile, ungated pattern (`Attachments.tsx`) that must not simply be copied 30 times. Mitigation is a shared `IntersectionObserver`, imperative `muted` assignment, a byte budget, and a hard `prefers-reduced-motion`/autoplay-failure fallback — all zero-dependency, all sized correctly in this research.

## Key Findings

### Recommended Stack

Every one of the five new capabilities (masonry, sticky bar, video-in-grid, tab hash state, filter chips) is covered by platform CSS/browser APIs or a dependency already in `package.json`. **Total new packages: 0.** The one mandatory *existing-code* change is `app/globals.css`'s `overflow-x: hidden` → `overflow-x: clip` — without it, `position: sticky` cannot work anywhere on the site, because `overflow-x: hidden` makes `body` a scroll container that never itself scrolls, so nothing can stick relative to it.

**Core technologies:**
- CSS multi-column (`columns` / `break-inside: avoid`) — masonry layout — zero JS, zero CLS, tiles get `aspect-ratio` from build-time `sharp` dimensions so layout is correct on first paint of the static export
- CSS `position: sticky` + the `overflow-x: clip` fix — sticky tab bar — no library improves on this; the only blocker is the one CSS line above
- `IntersectionObserver` (one shared instance) — video play/pause gating — brings Chrome/Firefox in line with WebKit's native offscreen-autoplay-pause behavior, prevents ~30 simultaneous video decodes
- `window.location.hash` + `hashchange` + `history.replaceState` — tab state in the URL — Next.js exposes no hash-reading hook (`usePathname()` is pathname-only, `useSearchParams()` is query-string-only and forces a Suspense boundary); the hash never reaches the server so it's automatically compatible with `output: 'export'`
- Hand-rolled WAI-ARIA APG tablist and `aria-pressed` chip toggles — no component library (Radix, React Aria, Headless UI) is proportionate for a two-tab widget in a project with a stated "no UI component library" constraint

**Supporting/reused:** `framer-motion@11.14.4` (tab crossfade only — explicitly do not use `layout`/`layoutId`/`<Reorder>` on the grid, and do not bump to v13 in this milestone), `sharp` (already a devDependency, images only, cannot read video), plain `<img>` with a hand-built Cloudflare `srcset` (not `next/image`, which is a pass-through no-op under `images.unoptimized: true`).

### Expected Features

**Must have (table stakes):** unambiguous active-tab indicator (≥2 signals per NN/g); sticky tab bar; browser back returns to the previous tab; `#gallery` deep-links correctly; masonry preserving true aspect ratio; zero-CLS reserved tile space with the existing `--wash2` placeholder; lazy loading below the fold; click-to-Lightbox with next/prev; muted/looped/inline video matching the site's existing convention; single-select filter chips with an "All" default; keyboard-operable tabs/chips; captions surfaced as `alt` text.

**Should have (differentiators):** build-time balanced column assignment (the recommended default is plain CSS `columns`, see Architecture Approach below for the reconciled recommendation); aspect-ratio clamp (0.6–2.0) so one portrait screenshot can't dominate a column; IntersectionObserver video gating; autoplay-failure fallback for iOS Low Power Mode; `prefers-reduced-motion` handling (shares an implementation with the autoplay fallback — build together); dominant-color tile placeholders (~7 bytes via `sharp.stats()`).

**Defer (v1.x/v2+):** caption+tags rendered inside the Lightbox itself; `content-visibility: auto`; desktop hover-caption overlay; chip result counts; a wider desktop gallery breakout (>540px) — deliberately deferred because it's a design call best made against real curated content, not resolvable from code; per-item external links/year metadata; gallery grouping or pagination (only relevant past ~50 items). Explicitly out of scope per PROJECT.md: separate `/gallery` route, auto-aggregated CV media, project grouping, multi-select filters, sort controls, infinite scroll, scroll-triggered entry animations, custom cursor, parallax, hover-zoom.

Notably, two of the four reference-lineage sites checked (rauno.me/craft, paco.me/craft) ship **no filter chips at all** — this is corroborating evidence, not a reason to cut them (tags are already a committed PROJECT.md decision and single-select is cheap), but it is the reason chips are the first thing to demote if scope needs cutting under time pressure.

### Architecture Approach

The target architecture composes a server `page.tsx` that loads both the CV and gallery datasets and hands rendered `Profile`/`Gallery` subtrees into a new client `TabbedView` component as `ReactNode` slot props — this keeps `Profile` and `Gallery` on whatever server/client boundary they already declare, rather than forcing both through `TabbedView`'s module graph. The gallery gets its own content-loading path (`app/lib/galleryLoader.ts`, reusing `contentLoader.ts`'s exported `getImageDimensions`/`getMediaType` helpers) rather than being folded into `loadProfileData()`, because that function has three call sites with no memoization and the gallery's `sharp` reads would otherwise tax every one of them.

**Major components:**
1. `app/lib/galleryLoader.ts` (new, build-time only) — reads a single `gallery.json` manifest + flat `media/` folder (explicitly *not* per-item directories — reordering ~30 curated entries in a JSON array beats renaming N `NNN-` directories), validates/normalizes tags, requires explicit `width`/`height` on video entries
2. `TabbedView`/`Tabs` (new, client) — owns tab state, hash sync, sticky presentational bar; `ProfileHeader` extracted from `Profile.tsx` so it can persist above both tab panels
3. `Gallery`/`FilterChips` (new, client) — owns `activeTag` + Lightbox state, derives tag list and `visibleItems` via `useMemo`, renders the CSS-columns grid
4. `app/lib/mediaUrl.ts` (new, isomorphic, no `fs`) — the single home for the Cloudflare `/cdn-cgi/image/` URL contract, shared by `Attachments` and `Gallery`, with a required dev-mode passthrough since that path 404s under `next dev`
5. `Lightbox.tsx` — reused with **zero interface changes** (see Critical Pitfalls below for the one real caveat)

`010-gallery/` must explicitly bypass `SECTION_MAP` (mirroring how `001-general/` is already handled) rather than being added to it — adding it to `SECTION_MAP` would render the gallery as a CV `<section>` and route it through the per-item-directory loader, which a flat manifest can't satisfy.

### Critical Pitfalls

Four of the following were each found **independently by three or four of the four researchers** — treat that convergence as the highest-confidence signal in this research:

1. **`overflow-x: hidden` on `html`/`body` silently kills the sticky tab bar** *(found independently by Stack, Features, Architecture, and Pitfalls)* — fix by changing both to `overflow-x: clip`, which clips identically without creating a scroll container. This is the single highest-risk item in the milestone and the fix is one word.
2. **The Lightbox's scroll-lock cleanup permanently defeats that same fix** — `Lightbox.tsx` sets `document.body.style.overflow = 'hidden'` on open and restores `'unset'` on close; `'unset'` on the `overflow` shorthand resolves to `visible` as an *inline* style, which beats the stylesheet's `overflow-x: clip` from the first lightbox close onward. **This must be fixed before or together with pitfall #1, and sticky must be verified both before and after a lightbox open/close cycle** — verifying only on fresh load produces a false pass.
3. **Video dimensions default to 1920×1080** *(found independently by Architecture, Stack, and Pitfalls)* — `contentLoader.ts` only calls `sharp` for images; every video is reported as 16:9 regardless of actual shape. Invisible on the CV's fixed-height strips, visibly wrong (letterboxed/cropped, then reflowing) in a masonry grid where aspect ratio *is* the layout. Fix: require explicit `width`/`height` on video entries in `gallery.json`, warn loudly (not silently) on fallback.
4. **React does not reliably reflect `muted` into SSR/DOM output** *(found independently by Stack and Pitfalls; `facebook/react#10389`, open)* — React sets `muted` as a DOM property, not an HTML attribute, so a prerendered `<video autoplay loop>` can ship without `muted`, and Safari blocks autoplay before hydration ever runs. The existing `Attachments.tsx`/`Lightbox.tsx` already carry this latent bug. Fix: set `el.muted = true` imperatively in the same IntersectionObserver callback that starts playback.
5. **`/cdn-cgi/image/` 404s in local dev and does not work on `*.pages.dev` preview URLs** *(found independently by Architecture and Pitfalls)* — it only works on the production custom domain with Transformations enabled. Without a dev-mode passthrough, the gallery (and the existing CV thumbnails) are unverifiable locally and broken on preview deploys.
6. **`Lightbox.tsx` has no `"use client"` directive and calls `window` during render** *(found independently by Architecture and Pitfalls)* — it survives today only because its sole importer is itself a client component. Any gallery design that mounts it earlier, or unconditionally, breaks the static build with `window is not defined`. Fix: add the directive defensively now, and keep mounting it conditionally after user interaction, exactly as `Attachments.tsx` does.

## Reconciled Disagreements

Two apparent conflicts between research files are not real conflicts, and one is a real technical disagreement resolved below — flagged explicitly so the roadmapper doesn't mistake convergence for contradiction or vice versa.

**Lightbox reuse — "free" and "not free" are both true, about different things.** Architecture and Stack conclude the Lightbox needs **no interface change**: it reads only `{url, type, width, height}`, and gallery entries are a superset of that shape, so the array can be passed through as-is. Features separately warns that reuse is "not free" because `Lightbox.tsx`'s `shouldRender = isVisible || isAdjacent || isMobile()` mounts **every** item on mobile — correct and cheap for 2–5 CV attachments, expensive for ~30 gallery assets (full-resolution, non-CDN-proxied `<img>`/`<video>` elements all at once). These are not in conflict: the prop interface is free; the mobile render-volume behavior needs a windowing fix (a bounded render window with sized spacers to preserve scroll-snap geometry). Scope the windowing fix as an explicit sub-task of "open gallery item in Lightbox," not as a red flag against reuse itself.

**Masonry technique — recommendation: CSS `columns`, with a named escape hatch.** Stack and Architecture recommend CSS multi-column (`columns` + `break-inside: avoid`) with build-time `aspect-ratio` per tile — zero JS, zero dependencies, correct on first paint. Features recommends build-time greedy shortest-column-first packing rendered as explicit flex columns, to preserve editorial "best-first" reading order (CSS `columns` fills column-major, so item 2 lands halfway down the page rather than in the top row). **Recommendation: ship CSS `columns` as the default.** It is simpler, is what two of the four researchers independently landed on as primary, and Architecture notes the column-major order is actually coherent with the Lightbox (next/prev advances to the item visually below in the same column). If the owner finds column-major ordering genuinely undermines the curation once real content is in, the escape hatch — also zero-dependency, since dimensions are already known at build time — is the greedy column-packing approach Features describes; Stack independently names this exact technique as "the designated escape hatch, not a separate library." **Do not** take Pitfalls' third suggestion (CSS Grid with build-time-computed `grid-row: span N`) — Stack's research shows this is unreliable in practice because the span count depends on the *rendered* column pixel width (`1fr`), which is unknown at build time without a JS measurement pass, defeating the entire point of a build-time-only approach.

**Panel mounting — flagged, not fully resolved.** Stack and Architecture recommend rendering both tab panels in the DOM from first paint and toggling visibility (instant deep-link, no video bytes requested by hidden IO-gated tiles, preserves per-panel scroll). Pitfalls' performance-traps table warns against this specifically ("both tabs' DOM always mounted... do not keep it mounted from first paint... this is a regression to the CV view's load time") and recommends mounting the Gallery panel lazily on first tab activation. Given the gallery's images are `loading="lazy"` regardless and IO gates video playback either way, the byte-transfer argument for lazy-mounting is weaker than it first appears — but DOM node count and the flight-payload size (~30 entries' worth of JSON) are shipped either way since `page.tsx` loads both datasets up front. Resolve this at Phase 1/3 by watching `wc -c out/index.html` against a budget (already a Pitfalls-recommended check) rather than guessing; default to "both mounted, toggle visibility" unless that measurement shows a real regression.

## Pre-Existing Repo Defects (Separate From New Feature Work)

These already exist independent of tabs/gallery and were surfaced only because the research read the whole shared surface. The roadmapper should decide what belongs in this milestone's Phase 0 versus what gets logged as out-of-scope/future work — they are listed here so they aren't silently folded into feature phases:

- **The committed `out/` build output is 99 MB across 118 tracked paths and is currently desynced** — the working tree shows a mid-migration Webpack→Turbopack chunk mismatch (old chunks deleted, new ones untracked), meaning the committed `out/` does not correspond to the committed source *right now*. Needs a clean rebuild-and-commit before any feature work, plus a policy decision (keep committing `out/`, or stop — depends on whether Cloudflare Pages builds from source or deploys a prebuilt directory; verify before deciding).
- **`public/content/backup-media.bak/`** (~30 legacy files) ships to production because anything under `public/` is served verbatim — roughly halves the deployed payload if removed/relocated.
- **`npm run lint` has no ESLint config or dependency** — the script will error if run; either add ESLint properly or remove the script.
- **CLAUDE.md drift**: claims Next.js 15 (actual: `^16.3.0` with a pinned Turbopack workspace root), claims Inter via `next/font/google` (actual: Switzer via Fontshare `<link>`, no `next/font` usage anywhere), and lists `Lightbox.tsx`/`Scrollbar.tsx`/`RichText.tsx` as client components when only `Profile.tsx` and `Attachments.tsx` actually declare `"use client"` (the rest are transitive).
- **Zero `prefers-reduced-motion` handling anywhere in the codebase**, and framer-motion springs run unconditionally in the existing Lightbox — this predates the milestone but the new video-heavy gallery makes it a WCAG 2.2.2 concern rather than a latent one.
- **Other pre-existing Lightbox bugs** worth batching into the same touch: no focus trap/restoration, unlabelled close/nav buttons, a `window`-level keydown listener with no scoping (will conflict with new tab/chip roving-tabindex arrow keys), a divide-by-zero in the mobile scroll handler when there's exactly one item, and a dead CSS variable (`--transparent-border` referenced, `--transparentBorder` defined).

## Implications for Roadmap

Based on combined research, an 8-phase structure (P0–P7) is recommended. This mirrors what Pitfalls independently proposed as phase vocabulary and what Architecture independently proposed as a build order — both converged on essentially the same sequence from different angles, which is itself a confidence signal.

### Phase 0: Build Hygiene & Repo Hardening
**Rationale:** Several pre-existing defects block *visual verification* of every later phase (CDN images 404 locally) or corrupt every later diff (`out/` desync). Fixing them first establishes a clean, verifiable baseline before any feature code is written.
**Delivers:** clean rebuilt `out/` matching `HEAD` + a policy decision on whether to keep committing it; `backup-media.bak/` removed or relocated out of `public/`; `app/lib/mediaUrl.ts` with a `NODE_ENV`-aware dev passthrough for `/cdn-cgi/image/`; defensive `"use client"` added to `Lightbox.tsx`; CLAUDE.md corrected (Next 16.3/Turbopack, Switzer, accurate client-component list, lint script fixed or removed); a CV-view manual regression checklist authored (to be re-run at the exit of every subsequent phase).
**Addresses:** pre-existing repo defects listed above — explicitly separated from feature work.
**Avoids:** Pitfalls #3, #5 (CDN), #13, #17.

### Phase 1: Tab Shell — Sticky Bar, Hash Routing, Header Persistence
**Rationale:** Everything else in the milestone hangs off the tab shell, and its two prerequisite fixes have a load-bearing order: the sticky fix and the Lightbox scroll-lock fix must land together, verified in both sequences (before *and* after a lightbox open/close), or the verification is a false positive.
**Delivers:** `overflow-x: hidden` → `overflow-x: clip` in `globals.css`; `Lightbox.tsx`'s scroll-lock cleanup rewritten to capture/restore `overflowY` rather than blanket-resetting `overflow` to `'unset'`; `TabbedView`/`Tabs` client components with hash state read via `useSyncExternalStore`/`useEffect` (never during render — that's a hydration-mismatch/build-crash trap on a static export), `history.replaceState` + `hashchange`, and a properly-implemented WAI-ARIA roving-tabindex tablist; `ProfileHeader` extracted from `Profile.tsx` so it persists above both panels.
**Addresses:** "switch between a CV tab and a Gallery tab," "share a link that opens directly on the Gallery tab."
**Avoids:** Pitfalls #1, #2, #4, #15a — #1 is the four-way convergent finding; #1 and #2 must be treated as one combined fix, not two.

### Phase 2: Gallery Content Model
**Rationale:** Masonry, video, and filtering all depend on correct dimensions, stable ids, and clean tags existing first — get the content model right once here rather than patching it under three later phases.
**Delivers:** `010-gallery/gallery.json` + flat `media/` manifest (not per-item directories — reordering ~30 curated entries beats renaming N directories); `galleryLoader.ts` reusing `contentLoader.ts`'s exported `getImageDimensions`/`getMediaType`; explicit `SECTION_MAP` bypass for `gallery` (mirroring `general`); required `width`/`height` on video entries with a loud build warning on fallback (fixes the hardcoded 1920×1080 default); stable per-entry ids (mirroring the existing `generateItemId` pattern — never key on array index or on `media.url`, which collides if an asset is reused); tag normalization/dedup; orphan-file and missing-file build warnings; a deliberately lean schema (`id, url, type, width, height, caption, tags`) to bound flight-payload growth.
**Addresses:** "content author can curate gallery entries independently of CV items."
**Avoids:** Pitfall #5 (video dimensions — Architecture/Stack/Pitfalls convergent), #12a (stable ids), #16 (payload bloat).

### Phase 3: Masonry Grid (images only)
**Rationale:** Prove the grid layout and the CDN pipeline on the simpler asset type before adding video's concurrency and autoplay complexity.
**Delivers:** CSS `columns` masonry (2 columns at every breakpoint per the 540px/327px-usable-width arithmetic) with `break-inside: avoid` and build-time `aspect-ratio` per tile (see Reconciled Disagreements for the escape hatch if column-major ordering proves unacceptable — and do *not* use CSS Grid + computed row-spans); a gallery-specific CDN URL builder (width-only + `fit=scale-down`, not `Attachments.getThumbnailUrl`'s square `width=height,quality=50` shape, which is wrong for aspect-preserving tiles); lazy loading below the fold with the first ~4–6 eager; zero-CLS reserved tile space using the existing `--wash2` placeholder convention; aspect-ratio clamp (0.6–2.0).
**Open decision surfaced here, not resolved by research:** gallery container width — stay at 540px (visual consistency with the CV) or break out wider (~1200px, better masonry) — this is a design call that depends on how the real curated set looks; flag to the owner rather than guess.
**Addresses:** "browse work as a masonry grid of images and videos" (image half).
**Avoids:** Pitfall #6 (CDN dev-visibility — apply the Phase 0 helper here), Pitfall #11 (masonry CLS).

### Phase 4: Video in the Grid
**Rationale:** The highest-risk new feature — iOS autoplay gating, undocumented device-dependent decode limits, and accessibility — depends on Phase 2's real dimensions and Phase 3's grid shell being in place first.
**Delivers:** one shared `IntersectionObserver` gating play/pause with a concurrency cap (~3–4 playing at once); imperative `el.muted = true` set in the same IO callback (fixes the React `muted`-property bug latent in `Attachments.tsx`/`Lightbox.tsx` too — worth backporting the fix there in this phase); `preload="none"` + deferred `src`; author-supplied poster images (do not add ffmpeg/ffprobe — `sharp` cannot read video and a ~70MB platform binary is disproportionate for ~30 curated assets); handled `play().catch()` rejections; an autoplay-failure fallback (poster + play affordance) for iOS Low Power Mode; a hard `prefers-reduced-motion` gate on autoplay (shares one code path with the failure fallback — build together, not separately); a byte budget (~2MB per video, well under Cloudflare Pages' 25MiB hard per-file limit — the existing repo already has a 6.5MB source video that would need re-encoding if curated in).
**Avoids:** Pitfalls #7, #8, #9 — #8 (muted DOM bug) is the Stack/Pitfalls convergent finding.

### Phase 5: Filter Chips
**Rationale:** Filtering interacts with masonry column reassignment and Lightbox indexing, both of which need to be stable (ids from Phase 2, grid from Phase 3) before this phase touches them.
**Delivers:** single-select chips with an "All" default, tag list derived from content via `useMemo` (never hardcoded — this is what makes an empty result structurally impossible); `display: none` toggling rather than unmounting or framer-motion `layout` animation (native reflow, no video teardown/recreate, no per-item FLIP jank); explicit `.pause()` of hidden videos (CSS `display: none` does not stop playback or byte transfer on its own); a 150ms container crossfade; `aria-pressed` + `role="group"` (chips are not tabs — do not reuse `role="tab"`); an `aria-live` result count.
**Decision to make explicit, not silently default:** filter state ephemeral (React state only) vs. reflected in the URL (`#gallery/branding`). Recommendation: ephemeral — PROJECT.md only requires `#gallery` itself to be shareable, and extending the hash grammar adds parsing/validation cost against no stated requirement.
**Addresses:** "filter the gallery by tag."
**Avoids:** Pitfall #12 (filter reconciliation/thrash), #15b.

### Phase 6: Lightbox Integration
**Rationale:** Reuse is only safe once mobile render-volume and index/key issues are addressed, and this is deliberately sequenced *after* filtering (not before) so lightbox index correctness is established against a stable, already-filterable array — doing it the other way round conflates two distinct bug sources.
**Delivers:** the gallery array fed to `Lightbox` as-is (confirmed zero interface change by Architecture and Stack); the mobile render-volume fix from the Reconciled Disagreements section above (bounded render window + sized spacers, scoped as an explicit sub-task); the **filtered** array and an index within it passed to the Lightbox, not the full unfiltered set (reset lightbox state on tag change); stable `media.id` keys, never `media.url` or array index; the keydown handler scoped off `window` onto the Lightbox root with `stopPropagation` (prevents future conflicts with tab/chip roving-tabindex arrow keys); the mobile scroll divide-by-zero guarded for the single-result-after-filtering case; a focus trap, focus restoration on close, and `aria-label`s on the close/nav buttons (pre-existing gaps worth closing now that the Lightbox becomes the gallery's primary interaction, not an incidental one).
**Addresses:** "open any gallery item in the lightbox."
**Avoids:** Pitfall #10 (four distinct, all-confirmed-in-repo defects).

### Phase 7: Polish & Regression Sweep
**Rationale:** Closes the milestone by re-verifying the CV view wasn't regressed by changes to shared surface area — `globals.css`, `Lightbox.tsx`, `contentLoader.ts`, and the CDN URL builder were all touched across prior phases, and this is the largest shared-surface risk in the whole milestone.
**Delivers:** global `prefers-reduced-motion` CSS fallback plus a visible pause-all-motion control (satisfies WCAG 2.2.2 for visitors without the OS preference set); `:focus-visible` styling sitewide; `public/_headers` extended to cover real gallery media paths and missing extensions (`.mov`, `.webm`, `.jpeg`); captions surfaced as `alt` text; the full manual regression checklist re-run (light + dark, 320/480/768/1440px, a real mobile device, an axe sweep); a final `out/` rebuild and commit.
**Avoids:** the global-fallback portion of Pitfall #9, Pitfall #14 (regression), and the full "Looks Done But Isn't" checklist from Pitfalls research.

### Phase Ordering Rationale

- Phase 0 before Phase 1 because the CDN dev-visibility fix is what makes *any* subsequent phase visually verifiable at all, and the `out/` desync will corrupt every diff from here on if not resolved first.
- Phase 1's two CSS/JS fixes (sticky + scroll-lock) are bundled and ordered together deliberately — this is the single most important sequencing constraint in the research, called out by name in Pitfalls and confirmed in Architecture's independent build order.
- Phase 2 (content model) precedes Phases 3–6 because masonry, video, and filtering all consume its output (dimensions, ids, tags); fixing the video-dimension and stable-id problems once here is cheaper than fixing them under three feature phases.
- Phase 3 (images) precedes Phase 4 (video) so the grid mechanics and CDN pipeline are proven before video's autoplay/concurrency risk is layered on top.
- Phase 5 (filters) precedes Phase 6 (Lightbox) — not the intuitive order — because Architecture explicitly found that establishing Lightbox index correctness against an already-filterable array avoids conflating two bug sources (index bugs vs. filter-reconciliation bugs).
- Phase 7 is a dedicated close-out phase because four of the highest-value fixes in this milestone (globals.css, Lightbox.tsx, contentLoader.ts, the CDN helper) touch code the shipped CV view depends on, and there is no automated test suite to catch a regression otherwise.

### Research Flags

Needs deeper research during planning:
- **Phase 4 (video in the grid):** iOS-specific autoplay/decode behavior and concurrency thresholds are device-dependent and not authoritatively documented (Pitfalls rates this MEDIUM confidence); worth a `--research-phase` pass focused on real-device verification steps rather than more source-reading.
- **Phase 6 (Lightbox integration):** the exact mobile windowing approach (spacer padding vs. virtualization vs. disabling scroll-snap for large sets) is explicitly flagged by Features as unresolved — "this research establishes that the problem exists and sizes it, not how to solve it."

Standard patterns (well-documented, skip research-phase):
- **Phase 0:** mechanical fixes with direct precedent in the repo.
- **Phase 1:** the WAI-ARIA APG Tabs pattern is fully specified at w3.org, and the sticky/`overflow-x` mechanism is well-documented in MDN and multiple corroborating sources.
- **Phase 2:** mirrors the existing `001-general/` flat-manifest pattern already in the codebase — not a new pattern.
- **Phase 3:** CSS multi-column masonry with build-time `aspect-ratio` is a well-documented, Baseline-safe technique.
- **Phase 5:** single-select chip UX is decisively resolved by Features research; the ARIA contract (`aria-pressed`/`role="group"`) is standard.
- **Phase 7:** checklist execution, not new implementation.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations verified against official Next.js 16.3 docs, MDN, and npm registry; only 2 claims (React `muted` bug re: React 19 specifically, Cloudflare's 25MiB limit) marked MEDIUM pending a quick empirical check |
| Features | MEDIUM-HIGH | Technical claims (CLS, lazy-loading, WCAG) verified against MDN/spec/vendor sources; live-portfolio-site conventions (Savee/Cosmos column counts) could not be directly verified (JS-rendered SPAs) and rest primarily on the 327px viewport-width arithmetic, which is solid on its own |
| Architecture | HIGH | Every integration point read directly from source at a specific commit with file/line citations; only 2 external claims (native CSS masonry status, sticky/overflow mechanism) verified by search rather than vendor release notes |
| Pitfalls | HIGH for repo-specific findings (nine pitfalls confirmed by direct source read with line citations); MEDIUM for performance thresholds (iOS video-concurrency limits are heuristic, not documented by Apple) |

**Overall confidence:** HIGH — the research is unusually well-grounded because all four tracks read the same source files independently and converged on the same defects (see Critical Pitfalls above), which is a stronger signal than any single track's confidence rating alone.

### Gaps to Address

These are open questions all four research tracks flagged, deduplicated, and they need an owner decision before or during planning rather than further research:

- **Gallery container width** — stay at 540px (matches the CV's visual rhythm, may feel cramped for masonry) or break out wider (~1200px, better grid, breaks the column rhythm under a 540px header). Deliberately deferred by Features/Architecture to be judged against real curated content; surfaced again at Phase 3.
- **Manual video dimensions in `gallery.json`** — is requiring the content author to hand-enter `width`/`height` for each video acceptable (recommended by all three tracks that addressed it — zero dependencies, ~30 curated assets), or is a build-time MP4-box parser or `ffprobe` dependency worth the added build-environment fragility? Recommendation: manual entry with a loud build warning on omission.
- **Whether `out/` should stay committed** — depends entirely on whether Cloudflare Pages is configured to build from source or to deploy a prebuilt directory; this must be confirmed with the deployment configuration before deciding, and the current desync must be resolved regardless of which way the decision goes.
- **Filter state in the URL** — PROJECT.md requires only `#gallery` to be shareable; extending the hash grammar to carry the active tag adds parsing/validation cost against no stated requirement. Recommendation: keep filter state ephemeral (React state only), but write this down as a decision rather than defaulting into it silently.
- **Whether any test tooling is in scope** — no test framework exists today and PROJECT.md states verification is manual/visual. Pitfalls suggests 3–4 Playwright screenshot tests against `out/` as a well-fitted, roughly half-day addition for this milestone or an explicit v1.2 follow-up; the roadmapper should decide which, rather than let it default to "none" by omission.
- **One-frame CV flash on a `#gallery` deep link** — structural to a single-artifact static export (the fragment never reaches the server). Pitfalls' explicit recommendation is to accept it rather than engineer around it with a pre-paint `<head>` script; Stack/Architecture describe the script as available but optional polish. Worth a one-line decision in Phase 1's acceptance criteria either way.

## Sources

### Primary (HIGH confidence)
- Direct source inspection at commit `4f0e729` (branch `dev`): `app/globals.css`, `app/Lightbox.tsx`, `app/Lightbox.module.css`, `app/Attachments.tsx`, `app/Attachments.module.css`, `app/lib/contentLoader.ts`, `app/Profile.tsx`, `app/Profile.module.css`, `app/page.tsx`, `app/page.module.css`, `app/layout.tsx`, `app/isMobile.tsx`, `app/[slug]/*`, `next.config.ts`, `package.json`, `public/_headers`, `public/content/**/item.json`, `out/index.html`
- https://nextjs.org/docs/app/guides/static-exports, /api-reference/functions/use-pathname, /api-reference/functions/use-router, /guides/preventing-flash-before-hydration (Next.js 16.3.0 docs)
- https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-x, /CSS_grid_layout/Masonry_layout
- https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
- npm registry (queried 2026-08-08) — all dependency version checks

### Secondary (MEDIUM confidence)
- https://github.com/facebook/react/issues/10389, #22045, #32975 — `muted` DOM-property bug and React 19 `suppressHydrationWarning` behavior
- https://webkit.org/blog/6784/new-video-policies-for-ios/ — offscreen autoplay-pause and `playsinline` requirement
- https://www.terluinwebdesign.nl/en/blog/position-sticky-not-working-try-overflow-clip-not-overflow-hidden/ and https://polypane.app/blog/getting-stuck-all-the-ways-position-sticky-can-fail/ — sticky/overflow mechanism
- https://developers.cloudflare.com/images/optimization/transformations/rewrite-rules/ and Cloudflare community threads — `/cdn-cgi/image/` custom-domain requirement, 25MiB per-file limit
- Nielsen Norman Group — "Tabs, Used Right"; PatternFly/Setproduct — filter/chip UI guidance
- Live-site review: rauno.me/craft, paco.me/craft (fetched directly)

### Tertiary (LOW confidence — flagged for validation)
- Savee.it/Cosmos.so column-count conventions (JS-rendered, not directly fetched — corroborating only, not load-bearing)
- CSS Grid Lanes / native masonry timeline claims (community posts, not vendor release notes — used only to justify *not* depending on it yet)

---
*Research completed: 2026-08-08*
*Ready for roadmap: yes*
