# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start dev server (localhost:3000)
- `npm run build` — Build static export to `out/`, then strip the placeholder route (`scripts/clean-export.mjs`)
- `npm run lint` — Run ESLint (flat config in `eslint.config.mjs`)
- `npm run check:cdn` — Assert the Cloudflare image gate emits `/cdn-cgi/image/` URLs for
  production builds and none outside them. Runs two builds; not part of `npm run build`.

`scripts/` holds only `clean-export.mjs`, which `npm run build` runs. The one-shot migrations that
produced the current content model are gone — see git history if you need them.

No test framework is configured.

`out/` is gitignored — Cloudflare Pages runs `npm run build` on deploy, so the export is never committed.

### Content Studio (`localhost:3000/studio`)

A dev-only editor for all three content files — reorder/add/rename/delete sections and items,
edit profile, item and contact fields, manage media, and edit the gallery. Every mutation is a
read-modify-write; `git checkout -- content public/media` is the undo.

The left pane mirrors the document's shape: **Profile** pinned top, the orderable **sections**,
**Contact** pinned bottom, and **Gallery** as a peer tab rather than a CV section. Selecting any
pooled asset — a gallery entry's file, or a clicked CV thumbnail — opens an editor for its
`media.json` entry, which is how a video's real dimensions get recorded (`sharp` cannot measure
video, so uploads land on a 1600x900 placeholder).

**No native dialogs.** Every confirmation and every name prompt is an in-app dialog
(`AskDialog` in `Studio.tsx`), and that is a fix rather than a preference. Chrome offers a
"Prevent this page from creating additional dialogs" checkbox once a page has produced a few in
a row, and the Studio produced one for every add, rename and delete — easy to tick without
meaning to. From then on `confirm()` and `prompt()` return immediately with nothing shown, so
every one of those buttons became a silent no-op: clicking `×` did nothing at all, for the rest
of the page's life, with no error and no way to tell it from a broken button. Some embedded
webviews no-op dialogs the same way. Both halves had to go — the confirmations are the ones that
failed dangerously, and the prompts are what got the checkbox ticked.

Two guards make whole-file rewrites safe, and both are load-bearing:

- **Atomic write** — `cv.json.tmp` then `fs.rename`, so no reader sees a partial file.
- **Stale-write rejection** — the UI sends the content hash it loaded and the route
  refuses a mismatch with a 409. The hash covers all three content files, so a change to
  any of them invalidates a pending edit. Without it, a tab left open would silently revert
  the whole CV on its next keystroke.
- **Selective writes** — only files whose serialization actually changed are rewritten, so a
  CV-only edit leaves `gallery.json` untouched and out of the diff.

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

There is no database or CMS. Content is **three JSON files plus a flat media pool**:

```
content/                      # build-time input — NOT served
  cv.json                     # sections, items, order
  gallery.json                # gallery entries and captions
  media.json                  # per-asset facts, keyed by filename
  case-studies/<slug>.md      # markdown stays as files
public/media/<file>           # ONE flat pool, shared by the CV and the gallery
```

The top-of-page glow is **drawn in CSS, not loaded** — see `.topGradient` in
`layout.module.css`. It began as a 127 KB webp; that file's alpha field turned out to be
separable (`alpha(x, y) = fx(x) * fy(y)` to within 4/255), so it is reproduced by one hue
sweep multiplied by two measured 1-D ramps, matching the original to within 10/255 on the
worst pixel with a median difference of 0. It is also sized against the content column rather
than the viewport, so it looks the same at every browser width.

`--glow-fraction` is the one knob for its size: it is the share of the box the original's
colour spanned, so *lowering* it widens the glow. The ramps inside are expressed in
percentages of that box, which is why the glow also gets proportionally taller — widening it
without that would mean re-deriving both transcribed ramps.

Behind the glow, `.dotTexture` is a full-bleed dot grid masked to fade out down the page —
page grain rather than part of the content column, at `z-index: -2` so the glow reads over it.

Should site chrome ever need a real image file, note that it does **not** belong in
`public/media/`. That pool is reference-counted against `content/media.json`, and anything in
it that nothing references is reported as an orphan and can be swept; chrome has no content
record to be referenced by, so it belongs at the `public/` root instead.

The first case to come up — the footer's signature — took a third option and needed no file at
all. It is a single monochrome path, so `Signature.tsx` inlines it the way `Arrow12.tsx` does,
which also solves the theming: it has to be near-black on the light ground and near-white on the
dark one, and `currentColor` only sees the page's colour when the SVG is part of the document. An
`<img>` is an independent document, so a file would have meant either a second `-dark` copy or a
filter, plus a request for one path. Inline chrome is the default worth reaching for first.

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
- **Detaching is not deleting.** The `×` on an item's thumbnail drops the reference and nothing
  else: the file stays in `public/media/` and in `media.json` so it can be attached to another
  item from `+ From pool`. It surfaces as an unreferenced orphan until it is, which is the
  reminder that it is still there. Only the operations that say *delete* — item, section, and
  gallery-entry deletion — collect garbage.
- **That collection is reference-counted.** A file goes only when nothing references it — CV item
  media, item icons, the profile photo, gallery entries and poster frames all count, so an item
  deleted out from under a thumbnail leaves it alone if the gallery still shows it (and vice versa).
  `planGarbage()` is pure and the route writes JSON *before* deleting files, so a rejected write
  cannot destroy media. `collectReferences()` is the **only** counter — `planGarbage` and
  `findOrphans` both read it — so a whole *kind* of reference missing from it is not a small bug:
  the assets it protects get reported as unreferenced and can be swept while still in use. Anything
  new that can name a pool file has to be counted there, and mirrored in the Studio's `cvUses`.
- **`[filename]` in a heading renders that pool image inline, where the token sits** — a tool's app
  icon, a company's logo mid-title (see CONTENT-SCHEMA.md). The loader splits the heading into
  `headingSegments` server-side and also hands back `heading` as the token-stripped plain string,
  which is what accessible names and the attachment row's label use — neither wants a filename in
  it. Three consequences to keep in mind:
  - **The pool reference lives inside free text**, so `collectReferences()` parses headings via
    `headingIconFiles()`. That parser is in `app/lib/contentTypes.ts` precisely because both the
    loader and the Studio's counter need it, and it builds its regex per call — a shared `g` regex
    carries `lastIndex` and would skip tokens depending on who ran it last.
  - **The icon is `inline-block` inside `.title`, which stays a plain block.** Making it a flex row
    would pull every token onto one line; as an inline box the icon behaves like a word, wraps with
    the text, and leaves the link-arrow's `&#xfeff;` + `nowrap` trick beside it alone. It carries no
    horizontal margin on purpose — the authored spaces around the token are the gaps, so adding any
    would silently widen what was typed.
  - **`ICON_SIZE` lives in `Profile.tsx`** because the Cloudflare request and the CSS box both derive
    from it. `.titleIcon`'s `vertical-align` is tuned to it (half the box less half the cap height),
    so changing the size means revisiting that offset.
  - **A `-dark` sibling is swapped by `<picture>`, not by JavaScript.** Dark mode here is
    `prefers-color-scheme` on a static export — there is no theme state to read, so a scripted swap
    would paint the light file and correct itself after hydration, and do nothing with JS off. A
    `<source media="(prefers-color-scheme: dark)">` is resolved before the request, so one file is
    downloaded and the right one paints on the first frame. `next/image` cannot emit a `<picture>`,
    which is why the icon is a plain `<img>` (and why `no-img-element` stays quiet — the rule
    accepts an `<img>` inside a `<picture>`).
  - **The dark variant is found by convention, so the counter has to derive it.** A heading only ever
    names the light file; `darkVariant()` produces the sibling and `collectReferences` counts it as
    referenced exactly when the light one is — the same rule as a video's poster. Without that it
    reads as unreferenced and the sweep deletes it. It is also added to `itemFiles`, where a
    non-existent name is harmless because `planGarbage` skips anything absent from the registry.
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

The page sits on a slightly muted ground rather than the CV's paper white
(`--galleryBackground`, `#f3f4f6` light / `#111` dark). It is applied by swapping
`--backgroundColor` itself, on `body:has([data-page="gallery"])` in `globals.css`, and that
indirection is the point: the tab bar's stuck background and the fade hanging below it are
both derived from `--backgroundColor` and are rendered by the *root layout* as siblings of
the page, so a variable set inside the gallery would never reach them and they would keep
painting the CV's white against the gallery's grey. `body` is the nearest common ancestor.
The zero-alpha twin (`--galleryBackgroundFade`) has to be authored alongside it, since the
fade interpolates through the background hue rather than through transparent black.

Two things follow from the ground differing per route. `body` transitions `background-color` over
`--ground-fade`, so clicking a tab cross-fades the page instead of snapping — the transition
fires because the *computed* value of `background-color` changes when the variable is swapped on
`body` itself, not because a custom property is animating. And the unselected pills come from
`--tabInactiveBackground`, which the gallery overrides to white: `--wash2` is only a couple of
values off the gallery ground, so there the pills stopped reading as raised. They cross-fade on
the same duration, so the bar and the page change as one surface. The dark theme keeps its wash
there — `#2c2c2c` on `#111` already has the separation the light theme was buying.

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

Hovering a video shows its playback position. Three things about it are deliberate. The value is
read in a `requestAnimationFrame` loop **gated on hover**, not from `timeupdate` — that event
fires about four times a second, which is visible as a bar that steps rather than travels, and the
gate is what keeps six idle loops from running down the page. The bar's element is far taller than
the 5px bar and carries a scrim in its own background: these are UI screencasts, often near-white
at the bottom edge, where a white bar alone disappears; the scrim is a background on that element
rather than a `::before` because an absolutely positioned pseudo-element paints *over* an in-flow
child whatever the source order says, and the inset is padding there rather than a margin on the
track so the scrim still runs full-bleed behind it. And the fill is sized by `width`, not the
cheaper `scaleX` it started with: a transform squashes the radius along with the box, so at 5%
played a 999px radius comes out about a twentieth as wide as it is tall and the pill cap reads as a
hard edge. Laying out a 5px-tall element in a three-node subtree 60 times a second is not the
expensive part of a page decoding video. The whole bar is skipped under reduced motion, where the
native controls already show progress.

**Both images and videos open in the lightbox**, with one exception: a video under
`prefers-reduced-motion` is showing native controls, and wrapping those in a button means every
press on the scrubber also opens the lightbox — so there the video stays put and the controls win.
The lightbox is handed exactly that openable subset rather than the full list, because it
arrow-keys through whatever array it is given and an index into `items` would step onto something
with no opened form. `Gallery` tracks the open item by **id**, not index: the subset depends on a
media query, so it changes shape one commit after mount and a stored index would then point at
whatever moved into that slot. Captions are deliberately not passed along — the text that
introduced an item stays on the page behind it.

Each item is wrapped in an aspect-ratio box derived from its intrinsic dimensions, which
holds the row's height before the media loads — verified at CLS 0.

`Tabs.tsx` switches between `/` and `/gallery`. They are real routes, not client-side tab
state, so the tabs are `<Link>`s with `aria-current="page"` rather than `role="tab"`.

The styling started as shadcn/ui's Tabs ported into `Tabs.module.css` against this project's
tokens and has since diverged — the actual component was never used because it is
Tailwind-based and Radix Tabs switches panels within one document rather than navigating.

There is no track surface left: the track is transparent and each tab is its own fully
rounded pill carrying the wash and hairline the track used to. The selection is a pill that
**travels** between them — black on the light theme, white on the dark one
(`--tabActiveBackground` / `--tabActiveForeground`), so in both cases it inverts the wash the
unselected pills carry rather than reading as a hole in the bar. The way it is built is the
point:

- `.pillLayer` holds one `.pillCell` per tab, on the same grid as the tabs themselves. Three
  nested boxes, each with exactly one job: `.pillCell` is the static mask, fixed in the shape
  of its own tab; `.pillWindow` is the moving mask, slid to sit over the active tab; and
  `.pillTravel` is a full-width copy of the row — opaque ground, inverted labels —
  counter-slid so it stays put in the bar while the window crosses it.
- **Two masks, and both are needed.** Their intersection is `travelling pill ∩ pill shapes`,
  so crossing the gap the ground is cut off at one pill's edge and picks up at the next
  instead of sliding through the space between them. One cell per tab because a single
  rectangular window cannot be in two places.
- **The travel is a `transform`, and used to be an animated `clip-path`.** That is what the
  window/counter-window pair buys: a `clip-path: inset(… round 999px)` is repainted on the
  main thread every frame, where a transform is handed to the compositor. The construction is
  otherwise unchanged. The counter-translation must be the window's exactly negated — same
  variable, same easing, same duration, so every frame's pair sums to zero — or the labels
  slide under their own pill.
- Only the mask moves. So the pill's movement and the labels' colour flip are the same
  operation: a label is inverted exactly where the pill has reached it and normal everywhere
  else. Animating a background and a colour separately would cross-fade instead, and drift.
- **The pill starts moving on the click, not on the route change.** `usePathname()` only
  updates once the router has the new route, so driving the pill off it alone left the pill
  sitting still and then jumping — short on a static export, still long enough to read as
  unresponsive. `Tabs.tsx` keeps a `pendingHref` set by the click and discards it *during
  render* when the pathname changes (React's adjust-state-on-input pattern, not an effect,
  which would let a stale frame paint). `data-active` follows the pill; `aria-current` follows
  the real pathname, because that is a claim about which page is open.
- Geometry is derived, never measured: tabs are `flex: 1 1 0` with a known `--tab-inner-gap`,
  so tab *n* starts at `n x (width + gap)`. Exact at any column width, no ResizeObserver. Each
  copy is pulled back into the bar's coordinates, which is why all of them mask to the same
  rect. Watch the percentages: in `left` one resolves against the containing block and in
  `transform` against the element's own width, which is why `--tab-width` is written on
  `.pillTravel` — the box it must resolve against — and not on the window.
- `.pillFill::after` reflects the page glow onto the pill, drawn with the same
  `--glow-sweep` at the same `--glow-fraction` scale — both in `globals.css` precisely so the
  reflection cannot drift from the glow. Its strength is `--tabReflectionOpacity` rather than a
  literal, because the same sweep that reads as a highlight on black reads as a colour cast on
  the dark theme's white pill, so that one is dialled back. It is fixed in the bar's coordinates rather than the
  pill's, so the pill travels *through* it the way a reflection of something stationary
  behaves, and it is masked to fade downwards so it reads as light caught on a surface. It
  fades out on `data-stuck`, on the same 160ms as the bar's background: once the bar has left
  the top of the page there is no glow overhead to reflect.
- The copy is `aria-hidden` (the real links stay the accessible ones) and click-through.
  `.pillLabel` must keep `.tab`'s box metrics exactly — including a transparent 1px border —
  or the light label lands a pixel off its dark twin and the handover smears. It also needs
  `position: relative`: `.pillFill` is absolutely positioned, and positioned descendants
  paint above in-flow content whatever the source order, so in-flow labels end up *under*
  their own black ground.

The bar is sticky at `top: 0`. The bar itself spans the content column, but its sticky
wrapper is full-bleed — pulled out to the viewport edges with negative margins and pushed
back in with equal padding — so the opaque background covers the full width. Anything wider
than the column (below 480px the attachment carousel bleeds past both edges) would otherwise
stay visible beside the bar as it scrolls under. Below the wrapper, a separate `.fade`
element continues the background downwards, so content dissolves into the page instead of
being cut flat at the bar's edge; it is only shown once the bar is stuck, so nothing is
dimmed at rest.

The bar's full-bleed background is transparent until it is actually stuck. At rest it has no
content to hide, and staying transparent is what lets `.topGradient` and `.dotTexture` run
behind it instead of being cut by a full-width band. The track inside is transparent in both
states; what paints there are the tab pills. Its stuck background comes from
`--backgroundColor`, which is what makes it follow the gallery's muted ground automatically.

The fade is a sibling of the bar rather than the bar's own `::after`, and that matters: the
CV's sticky section headers park inside the fade's band and have to paint over it, which a
pseudo-element could not allow because the bar's `z-index: 20` makes it a stacking context.
The stack is fade (12) < section header (15) < bar (20) — so a header still slides *under*
the bar on its way out. `--sticky-top` in `globals.css` is where the headers park; the
layout overrides it to `0` when the tab bar is not rendered at all.

Three things it depends on:

- `ProfileHeader.tsx` is shared by both routes so the bar lands at the same vertical
  position on each — otherwise switching tabs would make the sticky bar jump. This is why
  `profile.about` renders *there* rather than in `Profile.tsx`: it sits above the bar, and
  anything above the bar has to be identical on both routes. It is consequently visible on
  the gallery route too, and it carries no visible title — a sticky title parked above the
  tab bar has nothing to pin below and would simply scroll away. Without a heading of its own
  the text belongs to the byline above it, which is why the gap above it is 20px rather than
  the 40px it needed when it was labelled; the `<section>` keeps its accessible name from
  `aria-label`.
- `.profile` and `.gallery` are both centred (`margin: 0 auto`), which is what makes the
  full-bleed `calc(50% - 50vw)` margins land symmetrically on either route.
- `globals.css` uses `overflow-x: clip` (not `hidden`) on `html, body`. `hidden` makes them
  scroll containers, which silently breaks `position: sticky`. `hidden` is still declared
  first as a fallback for browsers without `clip` support.

### CV interactions

Three behaviours in `Profile.tsx` / `Attachments.tsx` that are easy to break by accident:

- **Sticky section titles.** Each `.sectionHeader` pins at `--sticky-top`, directly below the
  tab bar. This is why section spacing in `Profile.module.css` is `padding-bottom`, not
  `margin`: a sticky element is confined to its own section box, so margins would leave a
  60px window between sections with no title pinned. With padding, consecutive section boxes
  touch and each title is pushed out exactly where the next one arrives. The title carries
  **no background** — the fade hanging off the tab bar already covers that band, so an opaque
  strip did the work twice and cut the fade off flat where the two met. Content is therefore
  faintly visible behind a pinned title; the fade's height in `Tabs.module.css` is the knob.
- **Details are shown by default and collapse page-wide.** The Show/Hide Details control is
  repeated in every section's sticky header, but there is one piece of state in `Profile`, so
  any one of them collapses all of them. "Details" means `item.description` and nothing else
  — media and subheadings are always visible, which is why sections whose items carry no
  description get no control at all (they still follow the shared state, they just have
  nothing to show). Open by default because the control is intentionally quiet: a reader who
  never notices it should still get the CV's substance. The collapse animates
  `grid-template-rows` from `0fr` to `1fr`, the only way to transition to a
  content-determined height, and uses `inert` rather than `aria-hidden` so links inside a
  closed description leave the tab order too. The button renames itself instead of carrying
  `aria-pressed` — doing both makes a screen reader announce the state twice — and its
  accessible name says "in every section" rather than naming one, which would promise a
  scope it does not have.
- **`--hover-room` is padding on `.images`, never on `.scrollableArea`.** The hover state paints
  outside a thumbnail's own box (the tilt lifts two corners, the shadow falls further), and
  `.scrollableArea` is a scroll container that clips both axes — `overflow-y: scroll` forces the x
  axis to `auto` even where it is declared `visible` — so the room has to exist inside it. Which
  element owns it is load-bearing, because Scrollbooster bounds a drag at
  `content.offsetWidth - viewport.clientWidth`: `clientWidth` includes padding on the container
  but `offsetWidth` cannot, so with the room on the container every drag stopped
  `2 x --hover-room` short of the native maximum and the row visibly sprang back at the end.
  Owned by `.images`, the 20px is inside its own border-box `offsetWidth` and the two maxima agree
  exactly. `min-width: 100%` still resolves to the container's full width with the padding inside
  it, so the row's content area is unchanged either way — which is what makes the mistake quiet.
- **Edge arrows are siblings of the scroll container, not children**, and they step the row via
  Scrollbooster's `scrollTo` rather than the native one. Children would scroll away with the row
  and be dimmed by the very fade they sit in; `.scrollableArea`'s `mask-image` also makes it a
  stacking context, so a hovered thumbnail's `z-index` stays inside it and the arrows paint over
  cleanly. Going through `scrollTo` keeps Scrollbooster's idea of the position and the real
  `scrollLeft` in agreement — it eases with the same friction a flick does, and its `onUpdate` is
  what writes `scrollLeft`. It deliberately does *not* clamp during a target scroll, so the
  target is clamped at the call site or a press at either end sails past the edge and bounces.
  Each arrow renders only when its side has something hidden past it, off the same flags as the
  fades, and is `display: none` under `hover: none` so touch is not left with two permanently
  invisible tab stops.
- **Scrollbooster is configured with `inputsFocus: false`, and it has to be.** Its default aborts
  `pointerdown` outright when the target is one of input/textarea/button/select/label — and every
  thumbnail *is* a `<button>`. On a matted thumbnail the mat is a 14px band of button surface
  around the print, so a grab that landed there started no drag at all while one on the picture
  worked: the row appeared to drag only *sometimes*, depending on where the press happened to
  fall. Nothing in this row wants focus-on-press instead of dragging. Clicking to open the
  lightbox is unaffected — Scrollbooster suppresses the click only once the drag has passed its
  own threshold.
- **Thumbnail images set `draggable={false}` and `-webkit-user-drag: none`.** A second, separate
  cause of the same symptom: images are draggable by default, and a native image drag pre-empts
  the pointer-move scroll — press, move, and the browser carries a ghost of the picture instead of
  scrolling. Both declarations are needed: Safari honours the CSS, the others the attribute.
- **The row's edges dissolve rather than being cut flat**, the same treatment the tab bar's fade
  gives content passing under it — a horizontal `mask-image` on `.scrollableArea`. It is gated the
  same way too: each side is only softened while it actually has something hidden past it, so a
  row that fits is untouched and the leading edge of a scrollable one is sharp at rest.
  `Attachments.tsx` sets `data-fade-start` / `data-fade-end`, and a zero-width fade collapses
  every gradient stop onto position 0, which renders as fully opaque from the edge. The test
  compares the row's rectangle against the container's *border box* — where the mask actually
  fades — rather than `scrollLeft` against `scrollWidth - clientWidth`: that formula has to agree
  with wherever `--hover-room` currently lives, and it did not when the room was padding on the
  container, which left the trailing edge faded with nothing behind it. Both rectangles include
  the room whoever owns it, so the comparison cannot go stale.
- **A thumbnail has two treatments, chosen per asset by `framed` in `media.json`.** Matted is
  a print in a mat: wash, inset, shadow, and a frame locked to `MATTED_RATIO` (14:9) whatever
  the media's own shape, so a row of them reads as a set. Unmatted is the image edge to edge at
  its own (clamped) ratio. The white rim is on **both** — it began as the mat's outer edge, but
  it reads just as well unmatted and it is what gives the hover shadow an edge to lift. In the dark
  theme (`prefers-color-scheme: dark`) it is still there at rest but wears
  `--backgroundColor` instead, so it reads as a margin of ground held around the image rather than
  as a light edge — `--thumbnailFrame` on every thumbnail at once is the loudest thing on a dark
  page, which is why it was already dimmed there — and takes `--thumbnailFrame` on hover. That
  colour change *is* the dark hover state, because the lift's shadow is dark on a dark page and
  barely registers, where in the light theme it carries the hover on its own. It was previously
  hidden outright at rest, which left the image sitting straight on the ground with nothing between
  them. The variable rather than a literal, so it follows the gallery route's ground too. Only the
  *colour* ever changes — the widths are constant, because the width calculation and the hairline's
  radius are both measured against them. **Only the `:hover` half is gated on `hover: hover`**, and
  the split is the fix for a real bug: with the whole block gated, a touch device fell through to
  the base rule and showed the light theme's white rim on a dark page. The rest colour is the dark
  theme's *treatment*, not a state waiting to be revealed, so it applies whatever the pointer is;
  `:hover` stays behind the gate because on touch it sticks after a tap, which would leave a
  thumbnail lit behind the lightbox it just opened. The `::after` hairline is unconditional in both
  themes: it is the edge between the rim and the image, and the rim needs an inside whichever
  colour it is wearing. Two consequences of the rim
  existing on unmatted thumbnails, and both are about `box-sizing: border-box` making it eat into
  the width the component sets: the resize request asks for the frame *minus the border on each
  side* (asking for the whole frame would over-fetch and, with `fit: cover`, crop by two pixels),
  and `thumbnailWidth` applies the media's ratio to the **inner** height and adds the border back,
  because the box that has to match the media's shape is the one the image fills. Applying it to
  the outer height instead leaves the inner box slightly the wrong shape and `object-fit` answers
  with a ~1.4px bar down each side. Unmatted also uses `object-fit: cover` rather than `contain`,
  which absorbs the half-pixel rounding leaves and makes dev match production, where the
  `fit=cover` request already delivers a bitmap cropped to exactly that box. **Omitting the flag means matted** — that was
  every thumbnail's behaviour before it existed, so only an explicit `false` opts out and no
  existing asset changed. It lives on the asset, not the reference, because it follows from
  what the file is: screenshots want the mat, photographs want to bleed. The Studio's asset
  panel has the checkbox, and `updateAsset()` writes nothing at all for the default rather than
  `true`, so the flag only appears in the file when it is turning the treatment off.
  `THUMBNAIL_BORDER` and `THUMBNAIL_PADDING` live in `Attachments.tsx` and reach the stylesheet
  as inline custom properties, because three things derive from them — the frame's width, the
  Cloudflare request, and the CSS — and a second copy of the numbers would drift. Three things
  here are easy to undo by accident:
  - **A matted frame's ratio is not the media's, and the image's box inside it is.** The frame
    takes the locked ratio; `imageBox()` then fits the media's ratio inside the padded box and
    `margin: auto` centres it, so the inset is exactly the padding on the constraining axis and
    wider on the other. Sizing that inner box to the *padded box* instead would letterbox the
    image inside it — which is what the pre-`framed` code did by giving the frame the media's
    ratio: at 16:9 in a 90px row the sides came out ~10.6px against 6px top and bottom.
  - **The shadow is a `filter: drop-shadow()` on the `.frame` wrapper, not a `box-shadow`, and
    not on the `img`.** Two separate reasons. Not on the img: with `object-fit` its border box
    is still the whole frame — only the bitmap inside is inset — so a shadow there traces the
    frame's edge and is swallowed by `overflow: hidden`. Not `box-shadow`: much of this pool is
    `yuva420p`, mockup collages floating on transparency, and a box shadow draws a rectangle
    around artwork that has no rectangle in it. A filter shadows the alpha of what the element
    rendered, so it follows the collage's silhouette and, for an opaque image, the rounded rect
    exactly as a box shadow would. It applies to the rendered result, so the clip above still
    rounds the corners and the shadow lands outside it, in the mat.
    The production URL keeps that alpha: `cloudflareImageUrl()` emits no `background` and never
    `fit=pad`, and `format=auto` negotiates AVIF or WebP, both of which carry alpha.
  - The Cloudflare request asks for whichever box the image actually occupies — the inner box
    with `fit=contain` when matted, the whole frame with `fit=cover` when not. Asking for the
    frame while matted would over-fetch, and `cover` there would crop what the inset exists to
    reveal. The outer border is a real `border`, not a ring outside the box: `.scrollableArea`
    is a scroll container and clips anything painted beyond the thumbnail — the same reason the
    focus ring is inset.
  - **Hovering a thumbnail tilts and lifts it, and that needed room made for it.**
    `.scrollableArea` is a scroll container, so it clips *both* axes — `overflow-y: scroll`
    forces the x axis to `auto` even though it is declared `visible` — and the row's box was
    exactly the thumbnails' box, so the shadow was cut off flat at the edge. The fix is the
    `--hover-room` pairing in `Attachments.module.css`: the container is grown by 10px on
    every side (`inset: -10px`) and given exactly that much padding back, so its content box
    is the row's original box and nothing in the layout moves. The mobile rule's bleed offsets
    add `--hover-room` on top of their own for the same reason, so the first child's
    compensating `margin-left: 40px` still lands on the column edge. The hover is gated on
    `hover: hover` — on touch, `:hover` sticks after a tap and would leave a thumbnail tilted
    behind the lightbox it just opened — and under `prefers-reduced-motion` the lift and shadow
    stay while the rotation goes.

- **A `floating` asset drops its border when opened.** The other per-asset flag in
  `media.json` (see CONTENT-SCHEMA.md), and the mirror of `framed` in its default: omitted
  means no. It marks a file with no rectangle in it — a mockup collage on transparency — for
  which the lightbox's hairline and rounded corner trace an edge the artwork has not got.
  `.imageWrap[data-floating="true"]` removes both and substitutes a `drop-shadow`, which
  shadows the *alpha* of what was rendered and so follows the collage's silhouette. That needs
  `overflow: visible`, since the shadow falls outside the wrapper and the default clip would
  swallow all of it. The opened image's radius is 12px (down from 24px, which at full-screen
  size rounded the media into a card rather than just taking the hard corner off — 12px is
  near the thumbnail's 10px, so a corner barely changes as it opens).

### Component Patterns

- **Server components** (async): `layout.tsx`, `page.tsx`, `[slug]/page.tsx` — handle data loading
- **Client components** (`"use client"`): `Profile.tsx`, `Attachments.tsx`, `Lightbox.tsx`, `Scrollbar.tsx`, `RichText.tsx`, `Gallery.tsx`, `Tabs.tsx`
- **`SiteFooter.tsx` is in the root layout**, below the bar, so it closes both routes — the gallery
  would otherwise just stop after its last item. Two things there:
  - Its "Last updated" is `new Date()` at module scope in a *server* component, so it is evaluated
    once during the build and baked into the export. That is what the phrase means for a static
    site, and it is deliberately not a content field: a date that has to be remembered goes stale,
    while this one cannot, because publishing *is* rebuilding. `timeZone: 'UTC'` keeps a build near
    midnight on the 1st from naming the wrong month.
  - The gap above it is **padding, not margin**, and that is the only reason the two routes agree.
    The gallery's list ends in a margin, which collapses with an adjacent margin — a 16px top
    margin disappeared into the list's 60px and left the gallery 16px tighter than the CV, whose
    section padding cannot collapse. `Gallery.module.css` gives its list a matching 60px bottom
    margin for the same reason.
- Lightbox uses React Portal to render to `document.body`
- **The lightbox's controls are one cluster at the bottom** — prev, the pager dots, next — in
  `.controls`. Two things about it are deliberate. The steps are anchored to the *viewport* rather
  than to the media: there are also invisible click-halves over the media, and those alone were not
  enough, because for a portrait or square item (704px wide in a 1280px viewport) most of the screen
  is backdrop and clicking backdrop *closes*, leaving no reachable way to step through a tall item.
  And the steps are flex siblings of the dots rather than pinned to the left and right edges, which
  is what keeps them beside the dots at any item count — the dots' width grows with the number of
  items, so an offset from the centre would have to be recomputed to match.
  The cluster sits at `z-index: 11`, above `.carousel` (10), which matters for the opposite case: on
  a wide image the click-half lands on top of a button and swallows the press, so the step still
  happened but the button never saw its own hover or focus. The halves are `aria-hidden` and out of
  the tab order — the visible pair carries the accessible names, or a screen reader announces
  "Previous media" twice.
- **A video in the lightbox shows its position in a bar below the media**, at `top: 100%` on a box
  spanning `.imageWrap` — so it is exactly the media's width and takes no part in the aspect-ratio
  arithmetic that sizes the wrap. `.imageWrap` normally clips (that is what rounds the media's
  corners), so `data-video` lifts the clip and moves the radius onto the media itself, the same
  trade the `floating` treatment makes. `.lightboxImage[data-video]` also grows its bottom padding
  to 80px, and that is what keeps the bar clear of the control cluster: `containerRef` measures
  `.lightboxInner` *inside* that padding, so the media shrinks to fit rather than the bar being
  pushed down into the controls. Only height-constrained media needs it — a 1:1 video reaches the
  bottom padding where a landscape one leaves slack — but reserving it for both keeps the bar the
  same distance from the media either way. The playhead is read in a `requestAnimationFrame` loop
  gated on `display`, since the carousel keeps the neighbours mounted and would otherwise run three
  loops at once.
- **Opening the lightbox reserves the scrollbar's width as `padding-right` on `<html>`.** Locking
  the scroll takes the scrollbar away, which widens the viewport by its width and slides the
  centred content column sideways by half of that — 7.5px at a 15px scrollbar — then back again on
  close, which was the visible snap as the scrollbar returned. Putting the same width back as
  padding on the element that lost it keeps every box where it was, so nothing reflows in either
  direction. `scrollbar-gutter: stable` is the declarative version and does not work here: the
  gutter is dropped the moment `overflow` becomes `hidden` (measured — `clientWidth` still jumps
  the full 15px), so it has to be measured and restored by hand. It measures 0 with overlay
  scrollbars, which is right — nothing was taken away, so nothing is added.
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
- `sharp` (dev only) — measures image uploads in the Studio. The build never runs it: dimensions
  are always authored into `media.json`.

### Deployment

Static export (`out/`) deployed to Cloudflare Pages. Cache headers and baseline security headers are
configured in `public/_headers`. Images are unoptimized by Next.js (Cloudflare handles optimization
via CDN).

`app/lib/cloudflareImage.ts` builds Cloudflare Image Resizing URLs (`/cdn-cgi/image/...`) for
both `Attachments.tsx` and `Gallery.tsx`. That endpoint only exists on Cloudflare's edge, so it
is applied in production builds only — in development the original URL is used, otherwise every
image 404s. `npm run check:cdn` asserts both directions of that gate; nothing else catches a
break, since `npm run build` succeeds either way.

Two things there are easy to get wrong:

- **SVG skips the transform entirely.** It is vector, so there are no pixels to save and
  `format=auto` would rasterise a logo — strictly worse. Cloudflare also does not treat SVG as a
  resizable input, so wrapping one risks a 404 that `npm run check:cdn` cannot catch: that script
  counts variant URLs, it never fetches them.
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
