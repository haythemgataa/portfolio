# Feature Research

**Domain:** Designer/engineer personal portfolio — tabbed CV site with a curated masonry work gallery
**Researched:** 2026-08-08
**Confidence:** MEDIUM-HIGH (technical claims verified against MDN/spec/vendor sources; design conventions verified against live portfolio sites and NN/g, marked per-claim)

---

## Scope Note

This is a **subsequent milestone**. Existing shipped features (structured CV, per-item attachments, Lightbox, markdown, light/dark, static export) are treated as fixed infrastructure and are not re-scoped here. Every feature below is new to v1.1.

Two site-specific constraints shape almost every recommendation, and were read from the codebase rather than assumed:

| Constraint | Source | Consequence |
|---|---|---|
| Content column is `max-width: 540px`, page has `padding: 0 24px` | `app/Profile.module.css:3`, `app/page.module.css` | The gallery has **327px usable width at 375px viewport, 540px at desktop**. This alone settles the column-count question. |
| `html, body { overflow-x: hidden }` | `app/globals.css` | **This breaks `position: sticky` sitewide.** The sticky tab bar cannot work until this is changed to `overflow-x: clip`. See Dependency Notes. |

---

## Resolved Questions (Decisive Answers)

These are the direct answers to the questions asked. Rationale and complexity are expanded in the tables that follow.

| Question | Answer | Confidence |
|---|---|---|
| Scroll position on tab switch — preserve or reset? | **Reset to the top of the tab content region.** Per-tab scroll memory is a feed convention (X/Twitter), not a portfolio convention, and lands the visitor mid-grid with no context. If the tab bar is already stuck to the top, keep it stuck and scroll the content to its top; if the visitor is already at page top, do nothing. | MEDIUM |
| Tab state on browser back/forward | **Back must return to the previous tab, not exit the site.** `history.pushState` on tab change + `popstate` listener. With 2 tabs this never produces a back-button trap. Non-negotiable — hash in the URL creates the expectation. | HIGH |
| Tab bar at 375px | **Left-aligned inline text tabs at the body type size (14px), 44px tap height, underline or subtle pill for active.** Not a full-width segmented control (app convention, not web-portfolio convention), not a scrollable chip rail (that's for 5+ tabs — NN/g explicitly warns overflow carousels hide tabs). Two tabs fit trivially in 327px. | MEDIUM-HIGH |
| Masonry column count | **2 columns at every breakpoint**, because the grid lives inside the existing 540px column. 3 columns at 540px yields ~170px tiles, which reads as a contact sheet. 2 on mobile matches Savee/Cosmos; 3 (Instagram) is too dense for mixed-aspect work. | MEDIUM |
| Gutter and density | **Uniform 12px gutter (row = column), 8px radius, 1px `--transparentBorder` inset ring** — reusing the exact `.media` treatment from `Attachments.module.css`. Uniform gutter is the single strongest "designed vs dumped" signal. Clamp tile aspect ratio to **0.6–2.0** so one portrait screenshot can't eat 900px of column. 24–36 items is the sweet spot; below ~12 a masonry looks accidental. | MEDIUM |
| Lazy loading at ~30 items | **Table stakes, not premature.** ~30 images at 2× tile width is ~2–3MB. Native `loading="lazy"` + `decoding="async"`, eager for the first 4 (first viewport). Cost is one attribute. Video is the real load problem and needs IntersectionObserver, not just `loading`. | HIGH |
| Blur-up vs dominant color placeholder | **Dominant color — build it. Blur-up — defer.** Dominant color costs ~7 bytes/item via `sharp.stats()` (already a devDependency) and extends the existing `background-color: var(--wash2)` tile placeholder. Blur-up LQIP costs ~600 bytes/item inlined and, with aspect-ratio boxes already reserving space, buys little. Neither is table stakes; **reserved aspect-ratio boxes are** (zero CLS). | MEDIUM-HIGH |
| Filter chips: single or multi-select? | **Single-select with an "All" chip, default "All".** Multi-select on ~30 items with a handful of tags is a control surface larger than the content it filters, and it introduces AND/OR ambiguity a visitor has to guess at. | MEDIUM |
| Filter empty state | **With single-select + tags derived from real content, an empty result is structurally impossible** — every chip is guaranteed ≥1 match. Ship a one-line fallback as a safety net, but do not design an empty state. This is a further argument for single-select; multi-select AND-logic is what creates the empty state in the first place. | HIGH |
| Grid behaviour on filter | **Instant re-layout with a 150ms container crossfade.** Per-item FLIP animation is an anti-feature here: masonry column reassignment makes items teleport across columns, which reads as a bug. | MEDIUM |
| Autoplaying video in a grid — premium or noisy? | **Premium, and already this site's established behaviour** — `Attachments.tsx:157-166` already autoplays muted looping video inline. Consistency wins. The risk is not taste, it's *simultaneity*: 4+ decoding videos on a mid-range Android is a real stall. Gate with IntersectionObserver (play in view, pause out). | MEDIUM-HIGH |
| Hover-to-play instead? | **No.** Hover has no mobile equivalent, so roughly half the audience would see only static frames. Also inconsistent with the CV tab. | MEDIUM |
| Video affordance in the grid | **No play badge on autoplaying video** — the motion is the affordance and a badge is redundant chrome. **Do** show a play affordance in the fallback state (autoplay blocked by iOS Low Power Mode, or `prefers-reduced-motion: reduce`). | MEDIUM-HIGH |
| Captions: always / hover / lightbox? | **Lightbox only.** The grid is for scanning visual quality; the caption is for the one item chosen. Always-visible captions add ~20px per tile and turn a masonry into a catalogue. Hover-reveal is desktop-only, so it fails half the audience. Carry the caption into `alt` for a11y/SEO regardless. | MEDIUM |

---

## Feature Landscape

### Table Stakes (Visitor Assumes These Exist)

Missing any of these makes the gallery feel broken rather than minimal.

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Tab bar with an unambiguously active tab | NN/g: use **at least two** selection indicators (e.g. weight + underline). One indicator alone reads as ambiguous. | LOW | Type is 14px `--type-size`; use `--grey1` active / `--grey3` inactive plus a 1px underline. |
| Tab bar sticky on vertical scroll | Stated milestone goal; a gallery 3–4 screens tall needs a way back without scrolling up. | LOW-MEDIUM | **Blocked** by `html, body { overflow-x: hidden }` in `globals.css`. Change to `overflow-x: clip` — verified same visual clipping, does not create a formatting context, does not break sticky. |
| Browser back returns to the previous tab | Once `#gallery` is in the URL, visitors expect history to track it. Back exiting the site is a bug, not minimalism. | LOW | `pushState` + `popstate`. Do **not** give any element `id="gallery"` — the browser would auto-scroll to it on hash load. |
| `#gallery` deep link opens on the Gallery tab | Explicit milestone requirement; the point of hash tabs. | LOW | Static export renders CV first, so expect a one-frame flash. Mitigate with a tiny inline `<head>` script setting `data-tab` on `<html>`, or accept it. |
| Masonry preserving each asset's true aspect ratio | A designer-audience grid that crops work to squares signals the author didn't care. | MEDIUM | Dimensions already available at build via `sharp` in `contentLoader.ts`. |
| Reserved space per tile before load (zero CLS) | Grid reflowing under the cursor while scrolling is the most-noticed gallery defect. | LOW | `aspect-ratio` on the tile wrapper — same technique already used in `Attachments.tsx:172`. |
| Neutral tile placeholder while loading | The site already does this (`.media { background-color: var(--wash2) }`); the gallery must not regress. | LOW | Free — reuse the class treatment. |
| Lazy loading below the fold | ~30 assets. Not premature at this count. | LOW | `loading="lazy"` + `decoding="async"`; eager for first 4. |
| Click opens the existing Lightbox with next/prev across the gallery | Explicit requirement; the CV tab already behaves this way. | LOW-MEDIUM | See Dependency Notes — `Lightbox.tsx:99` renders **all** items on mobile, which is fine for 3 attachments and not fine for 30. |
| Videos autoplay muted, looped, inline | Established site behaviour (`Attachments.tsx`). Also the "craft page" norm. | LOW | `autoPlay muted loop playsInline` + `preload="none"`. |
| Filter chips with an "All" default | A tag row with no "All" leaves no way back to the full set without a reload. | LOW | |
| Chips horizontally scrollable at 375px | Chips work best in a horizontally scrollable row near the top; wrapping to 3 lines eats the first screen. | LOW | Reuse the existing edge-bleed idiom from `Attachments.module.css` (`left: -40px; right: -24px` at ≤480px). |
| Cloudflare-resized tile URLs | Constraint: `images.unoptimized: true`, optimization is delegated to `/cdn-cgi/image/...`. | LOW | **Do not copy `getThumbnailUrl` verbatim** — it passes both `width` and `height` (correct for fixed-height strip thumbs, wrong for aspect-preserving tiles) and `quality=50` (fine at 90px, visibly soft at 266px). Use `width=<2×tile>,fit=scale-down,quality=75,format=auto`. |
| Keyboard-operable tabs and chips | Real `<button>`/`<a>` elements, visible focus. | LOW | Free if not built from `<div onClick>`. |
| Meaningful `alt` on gallery images | ~30 images with `alt=""` is an accessibility and SEO hole. The caption already exists in content. | LOW | Use the caption as `alt`. |

### Differentiators (Worth Building, Set the Site Apart)

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| Build-time balanced column assignment | CSS `column-count` fills **column-major** — with 30 items the visitor's 2nd-best piece lands halfway down the page. A greedy shortest-column-first pass over known aspect ratios preserves editorial order *and* balances column heights. This is the difference between "curated" and "dumped". | MEDIUM | Pure arithmetic on aspect ratios; render as two flex columns. Recompute in `useMemo` on filter change (30 items, trivially fast). No layout library, no JS measurement, no CLS. |
| Aspect-ratio clamp (0.6–2.0) for tiles | Stops one 9:19.5 phone screenshot from occupying an entire column height and wrecking the balance. Direct precedent: `Attachments.tsx:129-140` already clamps. | LOW | Tighter clamp than Attachments (which allows 0.21–2.33 for a fixed-height strip). |
| IntersectionObserver video gating | Play in view, pause out of view. Protects battery and prevents multi-decode stalls on mid-range Android — the actual failure mode of video-in-grid. | MEDIUM | Also lets `preload="none"` upgrade to `auto` only on approach. |
| Autoplay-failure fallback (poster + play affordance) | **iOS Low Power Mode blocks muted autoplay regardless of attributes** — system-level, not overridable from CSS or JS. Without a fallback, iPhone visitors on low battery see black rectangles. | MEDIUM | Catch the rejected `play()` promise → reveal poster + play control. Poster frame extractable at build. |
| `prefers-reduced-motion` handling | WCAG 2.2.2 (Pause/Stop/Hide) applies to auto-starting motion; muted autoplay passes 1.4.2 but motion sensitivity is a separate axis. A design-engineer portfolio that ignores it is making a statement. | LOW-MEDIUM | On `reduce`: render poster + explicit play control instead of autoplaying. Reuses the fallback path above — build them together. |
| Dominant-color tile placeholder | ~7 bytes per item via `sharp.stats()`. Makes load feel intentional rather than grey-boxy, especially on slow mobile. | LOW | `sharp` is already a devDependency used for dimensions — same build pass. |
| 150ms container crossfade on filter change | Signals "the set changed" without the jank of per-item motion. | LOW | `framer-motion` already a dependency. |
| Caption + tags shown in the Lightbox | Gives the one item the visitor chose its context, at zero cost to grid density. | LOW-MEDIUM | Requires a small additive change to `Lightbox.tsx` (render optional `media.caption` / `media.tags`). Purely additive — CV attachments simply omit the fields. |
| Chip reflects live counts of the filtered set | Only if it's free from the data pass. Mild credibility signal. | LOW | Optional; drop it if it makes chips wrap at 375px. |
| `content-visibility: auto` on off-screen tiles | Cuts style/layout/paint cost for a long grid at near-zero implementation cost. | LOW | Pair with `contain-intrinsic-size` derived from the known tile height, or it reintroduces CLS. |

### Anti-Features (Do Not Build — With Reasons)

| Feature | Surface Appeal | Why Problematic Here | Do Instead |
|---|---|---|---|
| Infinite scroll / "Load more" | Feels modern, "scales" | ~30 items is **two screens of scroll at 2 columns**. Paginating 30 items adds a control, a loading state, and a scroll-restoration bug class to solve a problem that does not exist. Also kills Cmd-F and breaks the shareable-page premise. | Render all 30. Lazy-load the images, not the DOM. |
| Staggered scroll-triggered entry animations | Reads as "premium" in isolation | Every tile animating in on scroll makes a 30-item grid feel slow and prevents fast scanning — the exact thing a portfolio grid exists for. Compounds badly with masonry, where a late-animating tile shifts its column. Also directly conflicts with reserved-space/zero-CLS. | Static grid. Spend the motion budget on the Lightbox transition, which already exists and is where attention actually is. |
| Per-item FLIP / layout animation on filter | Looks impressive in a demo | Filtering reassigns items to different columns, so FLIP produces items flying diagonally across the grid. Reads as a rendering bug, not a transition. | 150ms crossfade of the grid container. |
| Custom cursor | Signature move on award-site portfolios | Zero mobile presence, breaks pointer affordance for links and controls, and is stylistically at odds with a 14px-type read.cv-lineage document site. Actively hurts a11y. | Normal cursor; a subtle tile hover state at most. |
| Parallax on gallery tiles | Depth, "crafted" feel | Fights masonry: parallax offsets desynchronise from the reserved layout boxes and cause overlap/gaps mid-scroll. Also a motion-sickness trigger. | Nothing. Flat scroll. |
| Hover scale/zoom on tiles | Standard on template portfolios | With a 12px gutter, a 1.03 scale makes neighbours collide. Also creates continuous repaints while the cursor traverses a 30-item grid. No mobile equivalent. | Subtle opacity or border-color change on hover — consistent with the site's existing restraint. |
| Always-visible captions under every tile | "More information is better" | Turns a 2-column masonry into a catalogue, breaks the visual rhythm the grid exists to create, and on mobile the caption is often taller than the tile is interesting. | Caption in the Lightbox; caption in `alt`. |
| Hover-reveal caption overlay | Feels polished on desktop | Invisible to every touch visitor — the caption effectively doesn't exist for ~half the audience. | Same as above. Optional desktop enhancement at most, never the only surface. |
| Multi-select filter chips | "More powerful" | Introduces AND/OR ambiguity the visitor must guess, creates a reachable empty state that then needs designing, and offers combinatorial control over a set small enough to scan whole. | Single-select + "All". |
| Sort dropdown (date / type / project) | "Give the visitor control" | The gallery is an **editorial sequence** — order is the author's statement. Offering sort undermines the curation, and at 30 items nobody wants it. | Fixed authored order via the `NNN-` prefix convention. |
| Grid / list view toggle | Ubiquitous in galleries | Two layouts to design, test, and persist state for, on 30 items. Nobody switches. | One layout, done well. |
| Grouping the gallery by project | Feels more organised | Already ruled Out of Scope in PROJECT.md. Adds a content nesting level to solve what tags already solve at this scale. | Flat stream + tag chips. |
| Separate `/gallery` route | "Proper" URLs | Already ruled Out of Scope. Breaks instant switching and doubles the static-export surface. | Hash tabs. |
| Lightbox zoom / pan / pinch | Expected of "image viewers" | The Lightbox already fits the image to viewport with correct aspect ratio. Pinch-zoom conflicts with the existing horizontal swipe carousel on mobile (`Lightbox.tsx` scroll-snap). High risk of breaking a shipped, working component. | Leave the Lightbox interaction model alone. |
| Ambient audio / unmuted video | "Immersive" | Violates WCAG 1.4.2 and is universally hated. Muted autoplay is only permitted *because* it's muted. | Muted, always. |
| Masonry via `grid-template-rows: masonry` / CSS Grid Lanes | Native, no JS | Ships in Safari 26 only; Chrome and Firefox remain behind flags as of early 2026, and the CSS WG is still debating `masonry` vs `item-flow` naming. Shipping production layout on it means most visitors get the fallback. | Build-time column assignment + flex columns. Deterministic in every browser, works in static export. |
| A masonry JS library (Masonry/Isotope/react-masonry-css) | "Solved problem" | Adds a dependency, measures in the browser (CLS + layout thrash), and is unnecessary when every aspect ratio is already known at build time from `sharp`. | ~30 lines of greedy column assignment. |

---

## Feature Dependencies

```
Sticky tab bar
    └──requires──> globals.css: overflow-x: hidden  ->  overflow-x: clip
                   (hard blocker — sticky is inert until this changes)

Tab bar (CV / Gallery)
    └──requires──> hash routing (pushState + popstate + hashchange)
                       └──requires──> no element with id="gallery"
                                      (browser hash auto-scroll)

Masonry grid
    └──requires──> gallery content section (010-gallery/) with caption + tags
    └──requires──> build-time width/height per asset  ──already exists──> sharp in contentLoader.ts
    └──requires──> gallery-specific Cloudflare URL builder
                   (NOT Attachments.getThumbnailUrl — wrong fit + quality)

Filter chips ──requires──> tags on gallery entries
             ──requires──> column reassignment on filtered set (useMemo)

Lightbox from grid
    └──requires──> gallery items shaped as { url, type, width, height }
                   (the shape Lightbox.tsx already consumes)
    └──requires──> Lightbox mobile render budget fix   [SEE NOTE]

Caption/tags in Lightbox ──enhances──> Lightbox from grid   (additive prop, optional fields)

prefers-reduced-motion handling ──shares implementation with──> autoplay-failure fallback
    (both resolve to: poster frame + explicit play control)

IntersectionObserver video gating ──enhances──> videos autoplay in grid

Per-item FLIP on filter ──conflicts with──> build-time column assignment
    (column reassignment makes FLIP read as a bug)

Scroll-triggered entry animation ──conflicts with──> zero-CLS reserved tile space
```

### Dependency Notes

- **Sticky tab bar requires the `overflow-x` change.** `app/globals.css` sets `html, body { overflow-x: hidden }`. Any non-`visible` overflow value makes the element a scroll container, and a sticky element is confined to its nearest scroll-container ancestor — so this one line disables sticky positioning sitewide. `overflow-x: clip` produces identical visual clipping without establishing a formatting context, and sticky continues to work. This must land before or with the tab bar, and warrants a quick regression check on the Lightbox and the Attachments edge-bleed at ≤480px, both of which rely on current overflow behaviour.

- **Lightbox mobile render budget is a real risk, not a theoretical one.** `Lightbox.tsx:99` computes `shouldRender = isVisible || isAdjacent || isMobile()` — on mobile it renders **every** attachment, because the mobile Lightbox is a horizontally scroll-snapped carousel that needs real DOM to scroll through. With 2–5 CV attachments that's correct and cheap. With ~30 full-resolution gallery assets it means ~30 unoptimized `<img src={media.url}>` (note: the Lightbox uses **original** URLs, not `/cdn-cgi/image/` ones) plus every video element mounted at once. This needs a windowing fix (render a ±2 window and pad with sized spacers to keep scroll-snap geometry) before the Lightbox is fed a 30-item array on mobile. **Flag this to the requirements step as a scoped sub-task of "open gallery item in Lightbox", not as a free reuse.**

- **Gallery items must conform to the Lightbox `media` shape.** `Lightbox.tsx` reads `media.url`, `media.type`, `media.width`, `media.height`. Extra fields (`caption`, `tags`) are ignored today, so the gallery array can be passed as-is and caption rendering added later without coupling. This makes "reuse the Lightbox" genuinely cheap on the data side — the cost is entirely in the mobile render budget above.

- **Do not reuse `Attachments.getThumbnailUrl`.** It emits `width=H*2,height=H*2,quality=50` — correct for a fixed-90px-height horizontal strip, wrong for aspect-preserving masonry tiles (it constrains both axes) and too soft at 266px tile width. The gallery needs its own `width`-only, `fit=scale-down`, `quality≈75` builder. Small, but it is a new function, not a shared one.

- **`prefers-reduced-motion` and autoplay-failure share one code path.** Both end in "show a poster frame with an explicit play control." Building them separately doubles the work; building them together makes the reduced-motion support nearly free once the fallback exists. Scope them as one item.

- **Filter chips require tags, and tags require the content schema decision first.** PROJECT.md already logs "Tags on gallery entries" as a decision. The chip set should be **derived from the content**, not hardcoded — that is what makes the empty state structurally impossible.

---

## Mobile Behaviour (375px) — Explicit

Usable content width at 375px is **327px** (`page.module.css` gives `padding: 0 24px`).

| Element | 375px behaviour | Rationale |
|---|---|---|
| Tab bar | Left-aligned inline text, 14px, 44px tap height, 24px gap between tabs, active = `--grey1` + 1px underline, inactive = `--grey3`. Sticky with an opaque `--backgroundColor` (not blur — cheaper, and the site has no glass language). | Two tabs need no chrome. A full-width segmented control imports an app idiom into a document site. NN/g warns that overflow tab carousels hide tabs — irrelevant at 2, but the same restraint applies. |
| Masonry | **2 columns**, 12px gutter → ~157px tiles. | 1 column reads as a feed and quadruples scroll length; 3 columns at 327px gives ~100px tiles, which is a thumbnail sheet. Savee and Cosmos both settle at 2 on phones. |
| Scroll length | 30 items / 2 columns ≈ 15 rows ≈ 3–4 screens. | Comfortable. This is the number that makes infinite scroll unnecessary. |
| Filter chips | Single horizontal scroll row, edge-bleeding past the 24px page padding, first chip inset to align with content. | Reuse the exact edge-bleed idiom already in `Attachments.module.css` at ≤480px — visual consistency for free. Do not wrap to multiple lines; that consumes the first screen. |
| Video | Autoplay muted inline **with the Low Power Mode fallback**. | Low Power Mode is a phone state, so the fallback is a *mobile-first* requirement, not an edge case. |
| Captions | Lightbox only. | Hover doesn't exist here; per-tile captions at 157px width would often be taller than the tile. |
| Tap target | Whole tile is the target (already ≥157px). | Fine. |
| Lightbox | Existing horizontal scroll-snap carousel — **subject to the windowing fix above**. | This is where a 30-item gallery will actually hurt on mobile. |

---

## MVP Definition

### Launch With (v1.1)

- [ ] **Tab bar, sticky, hash-backed, back-button correct** — the organising feature; everything else hangs off it
- [ ] **`overflow-x: clip` fix in globals.css** — hard prerequisite for sticky
- [ ] **`010-gallery/` content section with caption + tags** — the data the rest depends on
- [ ] **2-column masonry, build-time balanced column assignment, aspect-ratio preserved and clamped 0.6–2.0** — the feature itself; the build-time assignment is what makes it read as curated
- [ ] **Reserved tile space + `--wash2` placeholder (zero CLS)** — non-negotiable quality bar for a site whose value prop is "the presentation is part of the portfolio"
- [ ] **Lazy loading below the fold, gallery-specific Cloudflare URL builder** — cheap, and the alternative is a 3MB mobile first load
- [ ] **Video autoplay muted/loop + IntersectionObserver gating + Low Power Mode / reduced-motion fallback** — autoplay without the fallback ships black rectangles to iPhone users
- [ ] **Single-select filter chips with "All", derived from content, 150ms crossfade on change** — explicit milestone requirement, and single-select removes an entire empty-state design problem
- [ ] **Lightbox from grid + mobile windowing fix** — the reuse is only safe once this is done
- [ ] **Captions as `alt` text** — a11y floor for 30 images

### Add After Validation (v1.x)

- [ ] **Caption + tags rendered inside the Lightbox** — trigger: the grid ships and the captions feel like wasted content
- [ ] **Dominant-color tile placeholders** — trigger: load feels grey on a throttled mobile connection
- [ ] **`content-visibility: auto`** — trigger: scroll performance measurably degrades, or item count grows past ~50
- [ ] **Desktop hover caption overlay** — trigger: only if Lightbox captions prove insufficient; never as the sole caption surface
- [ ] **Chip counts** — trigger: only if it doesn't cause chip wrap at 375px
- [ ] **Wider gallery breakout (3 columns above ~900px)** — trigger: the 540px 2-column grid feels cramped once real curated content is in. Deliberately deferred: a wide grid under a 540px header creates a visual discontinuity that needs design attention, not a media query.

### Future Consideration (v2+)

- [ ] **Per-item external links / year metadata** — already Out of Scope in PROJECT.md; revisit only if the grid reads thin
- [ ] **Gallery grouping or pagination** — only past ~50 items, where the flat stream genuinely stops working
- [ ] **Native CSS masonry (`item-flow` / Grid Lanes)** — revisit when Chrome and Firefox ship stable and the spec naming settles; a drop-in replacement for the build-time column assignment at that point

---

## Feature Prioritization Matrix

| Feature | Visitor Value | Implementation Cost | Priority |
|---|---|---|---|
| `overflow-x: clip` fix | (invisible, but blocks P1) | LOW | **P1** |
| Tab bar + active state | HIGH | LOW | **P1** |
| Sticky tab bar | MEDIUM | LOW | **P1** |
| Hash routing + back/forward | MEDIUM | LOW | **P1** |
| Scroll reset to content top on switch | MEDIUM | LOW | **P1** |
| `010-gallery/` content section | HIGH | MEDIUM | **P1** |
| 2-column masonry, aspect preserved | HIGH | MEDIUM | **P1** |
| Build-time balanced column assignment | HIGH | MEDIUM | **P1** |
| Aspect-ratio clamp 0.6–2.0 | MEDIUM | LOW | **P1** |
| Reserved space / zero CLS | HIGH | LOW | **P1** |
| Lazy loading + gallery CDN URL builder | HIGH | LOW | **P1** |
| Video autoplay muted/loop | HIGH | LOW | **P1** |
| IntersectionObserver video gating | MEDIUM | MEDIUM | **P1** |
| Autoplay-failure + reduced-motion fallback | HIGH | MEDIUM | **P1** |
| Single-select chips + "All" | HIGH | LOW | **P1** |
| Chips edge-bleed scroll at ≤480px | MEDIUM | LOW | **P1** |
| Crossfade on filter change | MEDIUM | LOW | **P1** |
| Lightbox from grid | HIGH | LOW | **P1** |
| Lightbox mobile windowing fix | HIGH | MEDIUM | **P1** |
| Captions as `alt` | MEDIUM | LOW | **P1** |
| Caption + tags in Lightbox | MEDIUM | LOW-MEDIUM | P2 |
| Dominant-color placeholder | LOW-MEDIUM | LOW | P2 |
| `content-visibility: auto` | LOW | LOW | P2 |
| Chip counts | LOW | LOW | P3 |
| Wider desktop breakout / 3 columns | MEDIUM | MEDIUM | P3 |
| Hover caption overlay (desktop) | LOW | MEDIUM | P3 |

**Priority key:** P1 = required for the milestone to be shippable · P2 = add once P1 is stable · P3 = defer

---

## Reference Site Analysis

Sites in this lineage, checked directly where possible.

| Aspect | Rauno Freiberg (`rauno.me/craft`) | Paco Coursey (`paco.me/craft`) | Savee / Cosmos (moodboard grids) | Read.cv (platform) | **Our approach** |
|---|---|---|---|---|---|
| Layout | Multi-column masonry, 2–3 cols, spacious, varied aspect ratios | Vertical list grouped by category, no grid | Dense masonry, 2 cols mobile / 3–5 desktop | Fixed minimal template, platform-controlled layout | 2-col masonry inside the 540px column |
| Captions | Title + date visible, minimal | Title + one-line caption, always visible (it's a list) | Hover / detail view | Platform-supplied | Lightbox only; caption → `alt` |
| Video in grid | Not in the grid itself | None | Yes, autoplay muted | Limited | Yes, autoplay muted + gated + fallback |
| Filters / tags | None | Category **headings**, not filters | Tag filters | None | Single-select chips + "All" |
| Item density | Spacious, breathing room per item | Very sparse | Very dense | Sparse | Moderate — 12px uniform gutter, ~30 items |
| Entry animation | None observed — static layout, items don't animate on hover | None | None | None | None |
| Grouping | Flat | Grouped by category | Flat | Flat | Flat (per PROJECT.md) |

**The pattern that holds across all of them:** flat, static, spacious, no entry animation, no custom cursor, no infinite scroll. The differentiation is in *what is shown and in what order*, never in the chrome around it. Read.cv's own guidance — a focused 5–10 item highlight reel beats an exhaustive archive; the constraint of the format helps focus on substance — is the same instinct.

Notably, **Rauno's craft grid shows no filters and Paco groups with headings rather than chips.** This is a mild signal that filter chips are closer to a differentiator than table stakes at 30 items. They're worth building because tags are already a committed decision in PROJECT.md and single-select is cheap — but if scope needs cutting, **chips are the first P1 to demote**, not the masonry or the video fallback.

---

## Sources

**Technical (HIGH / MEDIUM-HIGH confidence):**
- MDN — [Masonry layout (CSS Grid)](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Masonry_layout) — experimental, check compat before production
- Smashing Magazine — [Masonry In CSS: Should Grid Evolve Or Stand Aside?](https://www.smashingmagazine.com/2025/05/masonry-css-should-grid-evolve-stand-aside-new-module/) — ongoing `masonry` vs `item-flow` spec debate
- DEV — [CSS Grid Lanes (Masonry Layout): A Complete Guide for 2026](https://dev.to/bean_bean/css-grid-lanes-masonry-layout-is-here-a-complete-guide-for-2026-4686) — Safari 26 shipped; Chrome/Firefox behind flags
- Terluin Web Design — [`position: sticky` not working? Try `overflow: clip`, not `overflow: hidden`](https://www.terluinwebdesign.nl/en/blog/position-sticky-not-working-try-overflow-clip-not-overflow-hidden/)
- Ben Frain — [Yes! You can use `position: sticky` and overflow together](https://benfrain.com/yes-you-can-use-position-sticky-and-overflow-together/)
- Go Make Things — [The `overflow: hidden` property and sticky headers](https://gomakethings.com/the-overflow-hidden-property-and-sticky-headers/)
- Apple Developer Forums — [Muted video play: NotAllowedError](https://developer.apple.com/forums/thread/727855) — Low Power Mode blocks muted autoplay at system level
- Rafal Lesniak — [Enabling autoplay in Safari's Low Power Mode](https://lesniakrafal.com/en/how-to-enable-video-autoplay-in-low-power-mode-on-ios-and-macos/)
- thoughtbot — [Can auto-playing videos be accessible?](https://thoughtbot.com/blog/can-auto-playing-videos-be-accessible)
- Accessibility Craft — [WCAG Pause, Stop, Hide & prefers-reduced-motion](https://accessibilitycraft.com/104-wcag-pause-stop-hide-prefers-reduced-motion-fallout-nuka-cola-quantum/)
- Scrutia — [Auto-playing media, WCAG 1.4.2](https://scrutia.io/en/issues/auto-playing-media)
- Mux — [A clear look at blurry image placeholders on the web](https://www.mux.com/blog/blurry-image-placeholders-on-the-web) — LQIP ~624 bytes vs dominant color ~a few bytes; benefit is modest
- Lean Rada — [Minimal CSS-only blurry image placeholders](https://leanrada.com/notes/css-only-lqip/)
- Next.js issue [#13653](https://github.com/vercel/next.js/issues/13653) — hash + back-button scroll behaviour

**UX convention (MEDIUM confidence):**
- Nielsen Norman Group — [Tabs, Used Right](https://www.nngroup.com/articles/tabs-used-right/) — ≥2 active-state indicators, 1–2 word labels, avoid overflow carousels, keep the current view
- PatternFly — [Filters design guidelines](https://www.patternfly.org/patterns/filters/design-guidelines/)
- Setproduct — [Chip UI design](https://www.setproduct.com/blog/chip-ui-design) — chip sets should be uniformly single- or multi-select; horizontally scrollable rows near the top
- Hack Design — [Read.cv: portfolio platform as living resume](https://www.hackdesign.org/toolkit/read-cv/) — 5–10 item highlight reel; constraint aids focus

**Live sites (MEDIUM confidence — fetched directly):**
- [rauno.me/craft](https://rauno.me/craft) — 2–3 col masonry, title + date, no filters, **no hover animation**
- [paco.me/craft](https://paco.me/craft) — categorised list, title + one-line caption, no tags/filters/video
- Savee.it, Cosmos.so — dense masonry conventions (LOW-MEDIUM: JS-rendered, not directly fetched; conventions from general familiarity — validate if the column-count decision is contested)

**Codebase (HIGH confidence — read directly):**
- `app/Profile.module.css`, `app/page.module.css` — 540px column, 24px page padding, 480px breakpoint
- `app/globals.css` — `overflow-x: hidden` blocker, `--wash1/2`, `--transparentBorder`, 14px type
- `app/Attachments.tsx` / `.module.css` — existing autoplay video, aspect clamping, `getThumbnailUrl`, edge-bleed idiom
- `app/Lightbox.tsx` — `media` shape, mobile render-all behaviour, original-URL image loading
- `app/lib/contentLoader.ts` — `sharp` dimension detection at build, `SECTION_MAP`

---

## Known Gaps

- **Savee/Cosmos column counts were not verified directly** (JS-rendered SPAs, WebFetch returns no rendered grid). The 2-column-on-mobile recommendation rests primarily on the 327px arithmetic, which is solid on its own; the reference-site claim is corroboration, not the load-bearing argument.
- **No user data on whether visitors actually use filter chips at this scale.** Rauno and Paco both ship without them, which is the main reason chips are flagged as the first P1 to demote if scope tightens.
- **Whether the gallery should break out wider than 540px on desktop is an aesthetic call**, deliberately deferred to v1.x rather than resolved here. Research supports either; the deciding factor is how the real curated set looks, which does not exist yet.
- **The exact Lightbox windowing approach** (spacer padding vs virtualisation vs disabling scroll-snap for large sets) needs a phase-level implementation decision — this research establishes that the problem exists and sizes it, not how to solve it.

---
*Feature research for: tabbed CV site with curated masonry gallery (milestone v1.1)*
*Researched: 2026-08-08*
