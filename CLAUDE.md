# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start dev server (localhost:3000)
- `npm run build` — Build static export to `out/`, then strip the placeholder route (`scripts/clean-export.mjs`)
- `npm run lint` — Run ESLint (flat config in `eslint.config.mjs`)
- `npm run check:cdn` — Assert the Cloudflare image gate emits `/cdn-cgi/image/` URLs for
  production builds and none outside them. Runs two builds; not part of `npm run build`.

`scripts/` holds `clean-export.mjs` and `fetch-font.mjs`, both of which `npm run build` runs
(the second via `prebuild`, and also on `postinstall` and `predev`). The one-shot migrations that
produced the current content model are gone — see git history if you need them.

- `npm run fetch:font` — download `app/fonts/Switzer-Variable.woff2` if it is missing or does not
  match the pinned hash. Normally there is no reason to run it by hand; it is wired to the three
  lifecycle hooks above so a fresh checkout, an install and a build all get the file.

No test framework is configured.

`out/` is gitignored — Cloudflare Pages runs `npm run build` on deploy, so the export is never committed.

### Content Studio (`localhost:3000/studio`)

A dev-only editor for all three content files. **It is the site, made editable.** The canvas
renders the real CV and gallery — importing the site's own CSS modules and, where it can, the
site's own components — and every string a visitor can read is edited by clicking it where it
sits. Every mutation is a read-modify-write; `git checkout -- content public/media` is the undo.

It replaced a three-pane form editor (regions → rows → fields). The forms are gone because a
form cannot answer the question actually being asked while writing a CV, which is *how does this
look on the page*. What the forms could answer, and the canvas cannot, is now the whole of the
inspector's job — see below.

**Measured against the live site rather than eyeballed**, which is the only way this claim stays
true: at 917px the column, header, tab bar, About margins, section padding, year gutter, title
box and section-header height (39.59375px) match `/` exactly, and the gallery's list height
matches `/gallery` to 0.01px across every entry.

#### The split: canvas or inspector

Anything a visitor can read is edited on the canvas. Anything else is a fact about the document
rather than a thing on it, and gets a panel: a link's *target* (the page shows only an arrow),
an asset's intrinsic dimensions, its poster frame, the `framed`/`floating` flags, a section's
machine-facing `key`, and the orphan report.

The rule is worth keeping: **a field that appears in both places is a field with two truths on
screen at once**, and the one not being looked at is the one that will surprise you.

The inspector floats *over* the canvas rather than sitting beside it as a flex sibling. That is
not decoration — the site's full-bleed constructions (the tab bar's sticky wrapper, its fade, the
dot texture) are all `calc(50% - 50vw)` measured from the centred column, so a canvas narrower
than the viewport lands every one of them off-centre. Giving the canvas the whole width is what
lets those files be reused untouched.

#### `Editable`, and why it is not `contentEditable`

A heading is not plain text: it carries `[filename]` tokens resolved into `<img>`s, `{braces}`
resolved into muted spans, a link arrow. What is displayed and what is stored are different
strings, and there is no honest way back from an `<img>` to the token that produced it. So the
resting render is swapped for a control rather than being made editable in place — which also
means the resting state can be arbitrarily rich while the editor is always the raw authored
string.

Four things about it are load-bearing:

- **Nothing an affordance draws may move a glyph.** Hover tints are backgrounds and box-shadows
  on inline boxes (which fragment per line, like a text highlight), selection rings are
  absolutely positioned pseudo-elements, toolbars are absolute. So the canvas at rest measures
  identically to the page and revealing a control never reflows what you were about to click.
- **The caret lands where you clicked.** That is most of what separates editing on the page from
  a form beside the page. Where the rendered text equals the stored string the offset transfers
  directly; where it does not — a heading with a token, a byline with braces, a markdown
  description — the *clicked text node* is found in the stored string and the offset taken from
  there, because every one of those transformations only adds or removes markup around runs of
  prose that survive verbatim. A run that appears twice is ambiguous and bails to the end, since
  guessing puts the caret somewhere the author did not point.
- **`font: inherit` does not carry `letter-spacing`**, which the name and the section titles both
  set. Without it a heading visibly loosens the moment it is clicked.
- **The draft is local while editing**, and there is deliberately *no* sync adopting an outside
  change into an open field. An open field belongs to whoever is typing in it; the server's
  stale-write guard is what protects the document, not a race between two values.

Empty fields are handled two ways, and the split is deliberate. The year and the heading have
boxes either way, so their placeholder is faded with **opacity** — the one reveal that cannot
move anything, which keeps an empty slot clickable at rest. The subheading and description are
omitted entirely by the site, so they are conditionally rendered on selection; an always-present
empty `.details` would leave a phantom 11.2px gap under every item, because
`.subheading ~ .details .detailsInner` carries a top padding.

#### What the canvas restates, and what it reuses

Reused outright: `Attachments` (the whole thumbnail row — the frame arithmetic, the mat, the
fades, the drag), `GalleryPreview`, `RichText`, `LastUpdated`, `TagIcon`, `Arrow12`, and every
relevant `.module.css`.

`Attachments` took **one optional prop, `onSelect`**, which overrides its press from "open the
lightbox" to "edit this asset". The alternative was a second thumbnail renderer carrying a copy
of that file's geometry, and a copy of that is a copy that drifts — in the direction that matters
most, where the editor stops showing what the site renders. Note that it maps the press back to a
*filename* paired with its resolved media, never a bare index: unresolvable references are
dropped from the row, so an index would name the wrong file the moment one reference broke.

Restated (markup only; classes are the site's): the tab bar, because the site's tabs are `<Link>`s
to real routes and here they switch documents without unmounting the editor; the header, About and
footer, because `layout.tsx` is a server component reading from disk and so renders what is
*saved* rather than what is being typed; and the gallery rows, whose video behaviour is
deliberately not reproduced — the intersection observer and dwell timer exist to stop a *reader*
downloading clips they scrolled past, and in an editor they become a page of videos starting and
stopping while you try to type.

Three fidelity traps found by measurement, each invisible in code review:

- **`.canvas` needs `isolation: isolate`.** The page glow and dot texture are drawn by `.column`
  at `z-index: -1`/`-2`. A negative layer paints in the nearest ancestor *stacking context*, and
  neither `.column` nor `.canvas` was one — so both escaped to `.studio` and painted at step 2 of
  its order, while `.canvas`, being positioned and opaque, painted over them at step 8. The
  canvas simply had no glow, which is the one thing above the fold.
- **`.node` needs it too, and it costs something.** The selection ring is a `z-index: -1`
  pseudo-element, so without isolation it escaped the same way and drew nothing at all. Isolating
  fixes that but also confines `.tools` (z-index 16), which then paints *under* the tab bar's
  fade (`Tabs.module.css`, z-index 12) — a positioned sibling in `.canvas`'s stack. Under a stuck
  bar that fade starts fully opaque over 72px, so a hovered toolbar in that band was erased while
  staying clickable. A node is therefore lifted to `z-index: 13` only while its toolbar is shown
  (`:has(> .tools)`), which clears the fade and stays below the section header (15) and the bar
  (20).
- **Ring rules are ordered so the drop state comes last.** `.dropzone::before` and
  `.node::before` both declare `border: 1px solid transparent` — a *shorthand*, which resets
  `border-color` and `border-style`. `.dropping::before` has identical specificity, so it only
  wins by being later in the file. Declared after it, `.dropzone::before` silently erased the
  drop ring while leaving its background tint, which on the gallery is hidden behind the rows
  themselves.

  Verifying any of this in a pane that does not paint needs `transition: none` first — and the
  selector must be `*, *::before, *::after`, since `*` does not match pseudo-elements. Without
  it these rules read as broken: the computed colour is frozen at the transition's start value.
- **A `<button>` does not inherit the page font.** `.tab` sets a size, a weight and a line height
  but no family; on the site's `<a>` that inherits Switzer, on the canvas's `<button>` it fell
  back to Arial — while the `.pillLabel` twins, being plain spans, stayed Switzer, so the
  typeface swapped mid-travel as the pill crossed them.
- **`data-stuck` must follow a sentinel**, not be pinned true. Pinned, the fade below the bar
  washed out the top of About at rest and the pill's glow reflection was off while the glow was
  still on screen. The observer's `root` is the canvas, because the canvas is the scroller.

Gallery captions render as **plain text**, matching `Gallery.tsx` — passing them through
`RichText` showed bold and links on the canvas that the published page prints as literal
asterisks and brackets, which is the one failure an edit-in-place editor must not have.

#### Structural editing

Sections, items, contact rows and gallery entries all carry a hover toolbar (grip, ↑, ↓, ×) and
reorder by drag or by arrow. Creating is inline and empty: a new item is created with no fields
and selected, so its ghost slots appear and you type into the page. **Creating a section is the
one exception that asks for text up front**, because a section's `key` is derived from that first
label and is machine-facing and permanent, where the label itself stays free to rename.

Two write-path details that are easy to get wrong:

- **`contact.create` is sent `data: {}`, and the empty object is the point.** `createContactItem`
  seeds `{ id, platform: '', handle: '' }` and merge-patches the payload over it — and
  `mergePatch` *deletes* a key whose patch value is `''`. Passing the two empty strings
  explicitly stripped both required fields and wrote a bare `{ "id": … }`.
- **An emptied list field is sent as `null`, never `[]` and never `undefined`.** `mergePatch`
  deletes on `''`/`null`/`undefined` and has no case for an empty array, so `[]` is written
  verbatim — a committed diff line the schema says should be an absent key, and one nothing in the
  UI could then remove. This binds `tags` and `galleryPreview`; teaching `mergePatch` about empty
  arrays would change the contract for every caller to fix two fields.

  **`null` and not `undefined` is the whole mechanism, and getting it wrong looks like it works.**
  The payload is serialised with `JSON.stringify`, which *drops* keys whose value is `undefined` —
  so an `undefined` never reaches the server as a key at all, `mergePatch` is handed `{}`, and the
  field is left exactly as it was. It reads as a removal that silently does nothing. Verified by
  POSTing `{"tags": null}` at the live route and confirming the key is gone from the file.

#### The pool picker

Choosing a file is a grid of thumbnails with a filter, not a `<select>` of filenames. The pool is
89 files, several differing only by a `-poster` or `-dark` suffix, and a filename is a poor
description of a picture. Videos show their poster frame, since that is the frame the site shows
at rest. Files already used here are dimmed but still pickable — the same file in two places is
the whole point of a shared pool.

**`keepFocus` is the difference between the heading-icon insert working and being dead code.** An
`[filename]` token is positional, and the only thing that knows the caret is the open inline
field. Autofocusing the picker's filter box blurred that field, which committed it, unmounted the
`<input>` and cleared its registration — so the token could only ever be appended. Both halves are
needed: the picker skips its autofocus, and the sheet cancels the mousedown that would otherwise
focus a tile before its click fires. The caller's button cancels its own mousedown for the same
reason.

Two smaller consequences of the same mechanism. The field registers its insert callback in a ref
shared through context, and the cleanup **only clears the slot if it still holds its own
callback** — clicking straight from one field into another opens the second before the first
blurs, so an unconditional clear would deregister the successor. And the caret is restored by a
`useLayoutEffect` with no dependency array that re-applies until the field's value catches up,
because writing a controlled input's `value` puts the caret at the end and this insert triggers
several commits; a single `requestAnimationFrame` fixed it and the next render moved it back.

#### Guards

**No native dialogs.** Every confirmation is an in-app dialog (`AskDialog` in `Overlays.tsx`), and
that is a fix rather than a preference. Chrome offers a "Prevent this page from creating
additional dialogs" checkbox once a page has produced a few in a row, and the old Studio produced
one for every add, rename and delete — easy to tick without meaning to. From then on `confirm()`
and `prompt()` return immediately with nothing shown, so every one of those buttons became a
silent no-op, for the rest of the page's life, with no error and no way to tell it from a broken
button. Some embedded webviews no-op dialogs the same way. Editing on the canvas has since
retired the *prompts* — a new item is named in place — but the confirmations remain, and they are
the half that failed dangerously.

`Escape` is scoped in one place rather than per field: the window handler that clears the
selection ignores the key when a dialog or picker is open, and when the event's target is an
`INPUT`/`TEXTAREA`/`SELECT`. Without it, Escape-as-"I'm done with this field" also unmounted the
inspector panel being typed into, and Escape-to-dismiss-a-dialog silently threw away the
selection the dialog was about.

Three guards make whole-file rewrites safe, and all three are load-bearing:

- **Atomic write** — `cv.json.tmp` then `fs.rename`, so no reader sees a partial file.
- **Stale-write rejection** — the UI sends the content hash it loaded and the route refuses a
  mismatch with a 409. The hash covers all three content files, so a change to any of them
  invalidates a pending edit. Without it, a tab left open would silently revert the whole CV on
  its next keystroke. It is **required**, not optional: `writeDoc` used to test
  `if (expectedHash && …)`, so omitting the field skipped the check altogether and the guard only
  bound callers who volunteered for it. Uploads go through it too — the `FormData` is assembled
  inside the `run()` callback rather than before it, because a form built once freezes the hash
  and a replay after the resync would re-send the stale one. Verified live: changing `content/`
  with `git checkout` underneath an open tab made its next write 409 rather than clobber the file.
- **Selective writes** — only files whose serialization actually changed are rewritten, so a
  CV-only edit leaves `gallery.json` untouched and out of the diff.

Field edits are debounced with **one pending timer per field**, keyed by op+target+field. A single
shared timer was silently lossy: each payload carries only the field it belongs to and the server
merge-patches it, so the cancelled timeout was the sole carrier of that value. They deliberately
do *not* go through `run()`'s stale-hash replay — their payload is a whole value, and replaying it
could overwrite a change this tab never saw.

`Studio.module.css` positions the tool `fixed; inset: 0` because `/studio` sits under the site's
root layout and would otherwise render below `ProfileHeader` and the tab bar.

It exists only in `npm run dev`, enforced two ways in `next.config.ts`:

- Its files are named `page.studio.tsx` / `route.studio.ts`, which only resolve
  as routes via the dev-only `pageExtensions`.
- `output: 'export'` is applied to production builds only, because it rejects
  non-static route handlers even when merely running `next dev`. The tradeoff is
  that static-export violations now surface at `npm run build` rather than in dev.

Route handlers refuse to run outside development, and `assertLocalDev` then checks two
more things — each closing a hole the other does not:

- **`npm run dev` binds `127.0.0.1`**, and that is what makes the `Host` allow-list mean
  anything. `Host` is chosen by the caller, so while dev listened on 0.0.0.0 the check was
  not an authorization check at all: anyone on the LAN could send `Host: localhost` and read
  or destroy content. The allow-list is now the backstop rather than the guard, and it no
  longer accepts an empty `Host` — only a hand-written request omits one.
- **A same-origin check (`Sec-Fetch-Site`, falling back to `Origin`) on every unsafe
  method**, which is what stops any page the author happens to visit from driving these
  routes cross-site. Next's own dev-time cross-site guard covers its internal endpoints
  (`/_next`, `/__nextjs`) and never sees these. Neither a JSON body sent as `text/plain` nor
  a `multipart/form-data` upload is preflighted — both are CORS *simple* requests, and
  `req.json()` does not consult Content-Type — so a visited page could POST
  `{"op":"section.delete"}` blind. Section keys are guessable: they are the visible labels.
  GET is exempt because a cross-site *read* is already contained (no `Access-Control-Allow-Origin`
  comes back, so nothing is legible); it is the write, whose effect lands whether or not its
  response can be read, that needed the check.

## Architecture

This is a **static portfolio/CV site** built with Next.js 16 (App Router) + React 19 + TypeScript. It uses `output: 'export'` in next.config.ts to produce a fully static site deployed to **Cloudflare Pages**.

### Routing

- `/` — Home page renders the `Profile` component with all CV sections
- `/gallery` — Standalone media gallery (see **Gallery** below)
- `/[slug]` — Dynamic case study pages generated from markdown files in `content/case-studies/`
- `/robots.txt`, `/sitemap.xml` — generated by `app/robots.ts` and `app/sitemap.ts`
- `404.html` — `app/global-not-found.tsx` (see **The 404** below)
- All pages are statically generated at build time via `generateStaticParams()`

#### The 404

**It is `app/global-not-found.tsx`, not `app/not-found.tsx`, and the whole design follows from
that.** A `not-found.tsx` renders as the root layout's `children` — measured, that leaves 286px of
clear space at 1280x800 and **134px at 375px wide**, in a hole between About and the real footer,
with ~514px of chrome fixed above and below it whatever the viewport. A display numeral, a
sentence and a button do not go in 134px, and the page would scroll (today's default 404 already
does: 1314px of document in an 800px window). `global-not-found` is the only convention that steps
outside the layout, which is why `experimental.globalNotFound` is on in `next.config.ts`. It is
experimental and taken deliberately: Next's own production checklist recommends the file, and a
break would fail the build rather than ship a bad page. Verified against `output: 'export'` — it
emits `out/404.html` (byte-identical to `_not-found.html`) carrying none of the layout's chrome.

Bypassing the layout means re-declaring what it provides, and each is **imported rather than
restated**, because a second copy is the failure mode:

- **The font moved to `app/lib/font.ts`.** Calling `localFont()` a second time does not dedupe the
  *CSS*: the woff2 is emitted once but Next generates a second `@font-face`, a second variable
  class and an extra stylesheet `<link>` **on every page of the site**. Verified: one `@font-face`,
  one woff2, and all three pages share one variable class.
- **The pre-paint theme script moved to `app/ThemeScript.tsx`**, gated on `THEME_SWITCH_ENABLED`,
  which moved to `lib/theme.ts` beside the storage key. Otherwise the 404 is the one page that
  ignores a forced theme.
- **`metadataBase` is not inherited.** Unset, Next bakes `http://localhost:3000` into the card
  tags. **No `robots` entry is declared** — Next already injects `noindex` into this route at build
  time, and adding one emitted a competing second tag whose `nofollow` would have discouraged
  crawlers from following the only link on the page.
- The glow and dot texture are `layout.module.css`'s own elements, reused so the transcribed alpha
  ramps keep one home. `.dotTexture`'s fixed `height: 560px` is the one thing that needed a local
  override (`.grain`): as an absolutely positioned box it still contributes scrollable overflow, so
  on a short window it handed the page exactly `560 − viewportHeight` of scroll — 170px at 844x390.

**The way out is a plain `<a href="/">`, never `next/link`, and that is a fix rather than a
preference.** Because this file replaces the root layout instead of rendering inside it, the client
router has no app tree here to reconcile a new route into. A `<Link>` still intercepted the press
and pushed `/` into the address bar, then aborted the fetch — leaving the 404 on screen at the
site's own URL, which is worse than doing nothing. Reproduced from a real 404 path and from
`/404.html` alike, and fixed by letting the browser do a full document load. It is a link home
rather than a `history.back()` button for a separate reason: on a 404 the history is unknowable,
and in a fresh tab `back()` does nothing at all.

The numeral wears the footer date's Figma **selected** treatment (`SiteFooter.module.css`),
transcribed rather than shared — the footer's copy is entangled with its own hand/wave/clap. It is
typed out under the same Figma cursor (`NotFoundCode.tsx`), which clicks into the frame, types,
clicks the corner to select, and leaves. The one difference from the footer is the ending:
`LastUpdated` *clears* its selection on the way out because a date left selected by a departed
pointer reads as stuck, where here the selected state **is** the design, so the cursor leaves it
behind.

Three things make that animation safe, and all three are load-bearing:

- **The width is reserved by a hidden copy of the finished string.** Let the frame grow with the
  text instead and three things break at once: the box is centred, so it grows *both* ways and
  every point the cursor has been aimed at drifts out from under it; the digits expand into the
  cursor typing them; and the frame pops from nothing to full width on the first keystroke.
- **A blocking script beside the numeral takes the finished state off the first frame.** The markup
  ships complete and selected — that is what a reader with JavaScript off gets — but static HTML
  paints long before React hydrates, so emptying the box from an effect would show the finished 404
  and then blank it. Same argument as the theme script. It checks `prefers-reduced-motion` itself,
  and arms a 2s timeout to undo itself if React never arrives.
- **The preference is read twice, from two sources, deliberately.** `matchMedia` decides whether the
  sequence arms; the hook decides what renders. `useSyncExternalStore` hands the *server* snapshot
  to the hydrating pass, so `usePrefersReducedMotion()` still reports "motion allowed" on that first
  render — arming on it emptied the box for one painted frame for exactly the readers who asked not
  to see that.

Four things about scaling the treatment, all measured:

- **The type sizes are discrete, not a fluid `clamp()`**, and that is what puts the rule on the
  baseline. The rule's offset depends on the baseline, which is `ascent + half-leading`, and Blink
  *floors* half-leading to whole pixels — so fractional font sizes (exactly what `vw` produces)
  throw the rule up to 1.3px off, worst at 768px, iPad portrait. At fixed integer sizes the exact
  offset is a known integer: at `line-height: 1`, 96→12px, 120→15px, 160→21px, 200→26px. Measured
  error is **0 at every breakpoint in both themes**. A `max-height` rule drops back to 96px on a
  landscape phone, which the width breakpoints cannot see.
- The continuous form is `F·(L − (a − d))/2 − 1px` with Switzer's `a = 0.980`, `d = 0.250` (hhea,
  upem 1000, identical across all nine shipped cuts). At the footer's 14px/1.6 it gives 5.08px
  against the 5px it ships, which is the check that this is the same rule.
- **The frame, the 1px rule and the 8px handles do not scale**, because a Figma selection handle is
  screen-sized whatever the object is. That is what makes it read as the same cursor having
  selected a bigger thing.
- **`letter-spacing` is `normal`**, where every other title here is tracked in. Tracking is applied
  after the *last* character too, and Switzer's `4` carries only 0.0135em of right side bearing —
  pixel-scanned at 140px, `-0.02em` leaves 0.7px of clearance at the emphasis weight and −1.1px at
  900, where the ink crosses the frame.

**The site's origin lives once, in `app/lib/site.ts`.** Three things must agree on it and the
failure when they do not is quiet — a sitemap pointing at the wrong host is still valid XML. It
feeds `metadataBase` in the root layout, the `Sitemap:` line in robots.txt, and every `<loc>`.

Two things about the metadata that are easy to get wrong:

- **`alternates.canonical` is declared per route, never in the root layout.** Metadata is
  inherited, so a canonical there is handed to every route that does not override it and
  `/gallery` ends up asking to be de-indexed in favour of `/`. `metadataBase` is the opposite —
  it *wants* to be inherited, which is what lets each page write `canonical: '/gallery'` as a
  path.
- **`app/robots.ts` and `app/sitemap.ts` each need `export const dynamic = 'force-static'`.** A
  metadata route is a Route Handler underneath, and `output: 'export'` refuses one that has not
  committed to being static even when it reads nothing request-shaped. Per the note above about
  `output: 'export'` applying to production builds only, this surfaces at `npm run build` and
  not in dev.

`sitemap.ts` derives its entries rather than listing them: `/` always, `/gallery` only when
`hasGalleryItems()` — the same question the layout asks before offering the tab, since the empty
route still answers 200 and is not worth indexing — and one entry per real markdown file in
`content/case-studies/`. It reads that directory directly instead of calling
`generateStaticParams()`, which keeps the synthetic `__placeholder__` slug out by construction
rather than by filtering for its name. `lastModified` is the build clock for the same reason
`SiteFooter`'s "Last updated" is: publishing *is* rebuilding, so that date cannot go stale.

**The social card is `app/opengraph-image.png`** — a Next file convention, not a `public/` asset,
and not a `public/media/` one (that pool is reference-counted against `media.json`, so chrome put
there reads as an orphan and can be swept). The convention buys three things a hand-written
`images` entry does not: the type and the *real* pixel dimensions read off the artwork, and a
content hash in the query so a redrawn card busts caches — which matters because `_headers` gives
`/*.png` a year of `immutable`. `opengraph-image.alt.txt` beside it supplies `og:image:alt`;
**it must not end in a newline**, because the file's bytes go into the attribute verbatim and a
trailing one lands inside the quotes.

The awkward part is inheritance, and it is worth knowing before touching either block:
**metadata is replaced wholesale, never deep-merged.** A route that declares `openGraph` to
change its title *loses the file convention's image*; a route that declares none inherits the
parent's `og:url` and title, so `/gallery` announces itself as the CV at the site root. Neither
is right alone, so `/gallery` declares the block and names the image again through `OG_IMAGE` in
`site.ts`. It carries no width/height: the root's are measured from the artwork, and a
hand-written second pair is exactly the copy that goes stale the day the card is redrawn.

Because that path is named by hand rather than by the convention, `/gallery` checks the file
exists before pointing at it — the same shape as `hasGalleryItems()` gating the sitemap entry.
Without it a build with no artwork still advertises `/opengraph-image.png` and every scraper
following it gets a 404, where the root simply emits no `og:image` at all.

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

There is a third option worth reaching for before either: inline chrome, needing no file at all.
`Arrow12.tsx` writes its single monochrome path straight into the document, which also solves
the theming — a mark has to be near-black on the light ground and near-white on the dark one,
and `currentColor` only sees the page's colour when the SVG is part of the document. An `<img>`
is an independent document, so a file would have meant either a second `-dark` copy or a filter,
plus a request for one path.

**The footer's two hands are the case that proves the rule the hard way.** The reader's hand was
`public/hand-cursor.svg` until it wasn't, and the file's own comment explained why it had to be
one: the clap zone carried a CSS `cursor`, which takes a URL and so has nothing to inline into.
That stopped being true the day the clap was added — a native cursor image is stamped by the
compositor and cannot be animated, so the zone became `cursor: none` with the hand *drawn* in its
place. The constraint lapsed at that moment and the comment outlived it by a long way.

The cost of the leftover file was a bug with a distinctive shape: **the `<img>` is only rendered
once the pointer is already inside a zone that has just hidden its own cursor**, so on a cold
cache the first arrival hid the real pointer and then waited on a round trip with nothing drawn
in its place. The hand appeared on the *second* hover and only then, which reads as broken rather
than slow. Inline, there is nothing to wait for.

Two things worth keeping from the fix. `handPaths.ts` holds the three path `d` strings once,
because the file and `FigmaCursor.tsx` had held byte-identical copies of all three — verified,
not assumed — so a redraw meant finding both; only the fill differs, and it is the whole
difference between the site's hand and the reader's (two identical hands read as one object
doubled rather than as someone arriving to meet it). And an inline `<svg>` needs `aria-hidden`
where the `<img>` had `alt=""`, and needs no `draggable={false}`, which existed only because
images are natively draggable and the drag pre-empted the pointer it stands in for.

`content/` sits outside `public/` deliberately: it is compiler input, not a static asset.
Keeping it in `public/` shipped 27 never-requested JSON files to the CDN and made the whole
CV fetchable at `/content/.../item.json`. Media has to stay under `public/`.

**Resolution — authored JSON to what components render — lives once, in `app/lib/resolveContent.ts`,
and that module touches no filesystem.** Two callers need the same logic and only one of them can
read disk: `contentLoader` and `galleryLoader` run at build time and resolve a pool filename to a
URL carrying its content hash, which means reading the bytes; the Studio's canvas renders the same
content in the browser, from a document that is not on disk yet at all, against a plain
`/media/<file>`. So the URL function is *injected* and everything else — which files exist, what a
heading's `[token]` becomes, what a missing dimension means, how tags are normalised — is decided
in one place. A second copy in the Studio would drift, and it would drift silently, in the one
direction that matters: the editor showing something the built site does not.

`mediaRegistry.resolveAsset` is that function bound to `assetUrl`; nothing else changed. Verified
rather than assumed: built the pre-refactor tree in a worktree and diffed the exports — identical
rendered text, identical `/media/` URLs including every `?v=` hash (64 on `/`, 38 on `/gallery`),
identical `description`/`og:*`/`twitter:*`, identical sitemap.

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
- **Every video carries a `poster`, and that is a load-time contract rather than a nicety.**
  Nothing resizes video: Cloudflare Image Resizing does not accept it, so a `<video>` always
  fetches the whole file whatever box it is shown in. The poster is what both surfaces show at
  rest — see the CV row below, and `Gallery.tsx`'s `preload="none"` — so a video without one is
  not a missing detail but an asset that reverts to downloading megabytes to fill a thumbnail.
  Posters are pool files like any other, counted by `collectReferences()` exactly when their
  video is.
- **Pool video has no single resolution cap, and `media.json` is the only record of what each
  file is.** A re-encode is 30 fps, VP9 CRF 30, no audio, and never upscales either axis. Audio is
  stripped because every `<video>` on the site — row, gallery and lightbox alike — is `muted`.
  Anything that changes a file's real dimensions means updating `media.json` in the same pass;
  nothing measures video at build time.

  Width is chosen per clip, not by rule — today 3444 (`design-ruler-*`), 2560
  (`personal-website-framer`), 1920 (`instanovo-404-page`). What decides it is where the clip is
  looked at, and the trap is that `calc(100vw - 48px)` is **CSS** pixels: on a Retina display a
  1728px window is ~1680 CSS px and so ~3360 *device* pixels, where a 1920-wide file is upscaled
  nearly 1.75x. That is why 1920 is not self-evidently enough, and why the two Design Ruler
  screencasts — whose whole subject is fine UI text — are kept at native width.

  The cap was 1080px at CRF 32 for one release, and the lesson from raising it is **which axis was
  actually costing the bytes**. At 1080px the Design Ruler clips measured 0.946 luma SSIM against
  their source, visible as softened UI text. Framerate is the cheap axis and resolution the
  expensive one, which is what paid for 1920 at 30 fps (0.963-0.986 across the pool as it then
  stood). Measure SSIM with the encode upscaled back to the source's size, the way the lightbox
  shows it — at 540px every one of these looks fine and the loss only surfaces where the clip is
  opened.

  **Re-encoding is not automatically an improvement, and on one clip it was strictly a loss.** That
  lesson binds any capture that arrives *already* VP9, which is the case to watch for rather than a
  fact about the file in the pool today (see the re-capture note below).
  `design-ruler-alignment-guides.webm` used to be the untouched ReplayKit capture: VP9, 3456x2234,
  container-declared 120 fps but variable-rate — 912 real frames over 18.8s, so ~48 fps average
  rather than the 2260 the declaration implies. Every re-encode of it came out **both larger and
  worse**, because a quality target spends bits faithfully reproducing the source's own
  compression artifacts:

  | | frames | size | bits/frame |
  |---|---|---|---|
  | capture | 912 | 7.60 MB | 69.9 kbit |
  | CRF 30, all frames | 912 | 10.94 MB | 100.6 kbit |
  | CRF 30, 30 fps | 565 | 8.46 MB | 125.5 kbit |

  At equal frame count CRF 30 costs +44% for fidelity the capture already had; dropping to 30 fps
  gives back 23%, leaving +11% over doing nothing at all. Decimation also makes each surviving
  frame *more* expensive (100.6 -> 125.5 kbit), because the residual against a predecessor further
  away in time is larger — so frames removed never equals bytes saved.

  That file was therefore **remuxed, not re-encoded** — `-c copy -map_metadata -1 -fflags +bitexact`
  leaves the coded bitstream bit-identical (verify with matching `framemd5`) and only rewrites the
  container. Two things follow, and they still bind the next VP9 capture:

  - **The remux is not optional.** Captures arrive carrying
    `COM.APPLE.QUICKTIME.AUTHOR=ReplayKitRecording` and siblings, and `public/media/` is served
    publicly, so a straight copy publishes them. `bitexact` reduces the muxer's own tag to a bare
    `encoder=Lavf`; Matroska requires a MuxingApp element, so that is the floor, not a leak.
  - **`-c copy` cannot change the framerate**, which is why this one file keeps its VFR timing.
    VP9 frames are inter-coded, so discarding any means decoding and re-encoding all of them:
    there is no way to strip the metadata *and* cap the fps without paying for the re-encode. The
    30 fps rule binds re-encodes; it does not bind a capture that is already smaller than every
    re-encode of it.

  **Neither of those applies to the three clips re-captured in Aug 2026.** `design-ruler-measure`,
  `design-ruler-alignment-guides` and `personal-website-framer` were re-recorded to crop the macOS
  menu bar out of frame, and they arrive as 30 fps CFR **H.264** at 3444x2160. WebM cannot carry
  H.264, so `-c copy` is not on the table and the remux exception lapses: all three are ordinary
  CRF 30 re-encodes, at native width for the two Design Ruler clips and 2560 for the Framer one.
  The re-crop changes the aspect (1.594 against the old 1.547), so their posters were regenerated
  too — a poster is its own asset with its own `media.json` dimensions, and nothing derives one from
  the other. Measured 0.987-0.993 mean luma SSIM against those sources, better than the pool's
  older numbers because an H.264 export is an easier thing to reproduce than a raw capture.

  One thing that surfaced there and is worth knowing before tuning CRF on a screencast: **on
  near-static UI footage SSIM barely responds to CRF at all.** On `design-ruler-measure`, CRF 30 /
  34 / 38 measured 0.9911 / 0.9907 / 0.9903 mean and 0.8169 / 0.8167 / 0.8167 at the 1st percentile,
  while the file went 6.87 -> 5.16 -> 4.01 MB; 1:1 crops of static text are indistinguishable. Almost
  every frame is identical to its predecessor, so the metric is dominated by frames that cost nearly
  nothing either way and the bits all go to the moving stretch. CRF 30 is still the rule, but do not
  read a flat SSIM curve as proof that a higher CRF is free — judge these by looking at the moving
  section.

  This is affordable because nothing fetches a video on page load — the CV row and the gallery
  both rest on a poster, and `Gallery.tsx` waits out `PLAY_DWELL_MS` before `play()` commits to
  the download. Weight here is paid by a reader who actually opens the clip, not by everyone.
- **Dimensions are always authored**, so the build never runs `sharp`; `type` is inferred from the
  extension rather than stored, so there is one source of truth for it.
- **`{...}` sets that run in the lightest grey** (see CONTENT-SCHEMA.md). The second free-text
  token, and deliberately not the heading's `[...]`: sharing a delimiter would make `[Engineer]`
  a missing-image reference rather than a muted span. It names no pool file, so unlike the icon
  token it needs no reference counting. `profile.byline` and `profile.location` both take it —
  `splitMuted`/`plainText` are named for the treatment rather than for the byline they were
  written for, so a third field reuses them instead of growing another delimiter. The half worth
  remembering is that the byline is *also* the site's `description`, `og:description` and
  `twitter:description` — so the loader hands the metadata layer a brace-stripped string and the
  component renders `bylineSegments`, the same split as a heading's `heading` vs
  `headingSegments`. Writing the raw string into metadata would ship a literal `{` into the
  search result and the social card.
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

**Both routes sit on the same ground.** The gallery used to swap `--background-primary` and
`--background-muted` on `body:has([data-page="gallery"])`, so its page took the wash and its raised
surfaces took white. That swap is gone, and with it the `--ground-*` plumbing it needed (the two
tokens could not trade values directly — a custom property referring to another that refers back to
it resolves to nothing) and the wrapper div in `gallery/page.tsx` that carried the attribute.

`body` still transitions `background-color` over `--ground-fade`, which now only does visible work
when the theme switch changes the ground rather than when a tab is clicked.

**Each item is lifted off the page by a shadow rather than framed by a border**
(`0 0 0 .5px rgba(2,6,23,.08), 0 2px 8px 0 rgba(2,6,23,.04)`). The media sits flush to the frame's
edge. Two things about it:

- **The first layer is a spread, not a blur**, so it reads as a crisp outer edge rather than a
  glow — it does the job an outer hairline would, which is why the frame carries no border of its
  own. `.frame::after`'s inner hairline stays, and with no border in play `inset: 0` is the border
  box exactly, so `border-radius: inherit` is again correct.
- **`overflow: hidden` on `.frame` clips the media, not the shadow.** A box-shadow paints outside
  the border box regardless of the element's own overflow, and nothing above it in the list clips
  either.

The shadow is a light-theme treatment and effectively disappears in dark: its ring resolves to
1.02:1 against that ground, against 1.19:1 on white. The inner hairline — which is `--border`, so
it flips to white at 8% — is what carries the edge there.

- `content/gallery.json` — an **ordered** `items` array; array order is display order.
- `app/lib/galleryLoader.ts` — resolves entries to `GalleryItem`s, typed in
  `app/lib/galleryTypes.ts`. Entries reference the shared pool; dimensions come from
  `media.json` via `app/lib/mediaRegistry.ts`, which both loaders share.
- **`tags` are filters, joined to the date by middots** — `2026 · DeepPCB · UI`, each with a mark
  of its own. Blanks, repeats and stray whitespace are stripped twice: in the Studio on write, so
  the file cannot record them, and in `galleryLoader` on read, which is what covers a hand edit
  that never went through the Studio. That is also what makes `GalleryItem.tags` a plain `string[]`
  the component maps over without re-checking, and what makes the tag safe as a React key.
  Emptying the field removes the key rather than writing `"tags": []`, normalised to `undefined`
  at the call site exactly as `removeMediaRef` does for `media` — `mergePatch` deletes on
  `''`/`null`/`undefined`, and teaching it about empty arrays would change the contract for every
  caller to fix one field.

  That normalising used to be tidiness and is now correctness: **a tag is the filter key**, so two
  entries agreeing on a tag is precisely what puts them in one filtered set, and a trailing space
  would split a tag in two without changing how either copy looks.
- **Clicking a tag filters the list to it; clicking it again clears.** One tag at a time, held in
  `Gallery`'s own state rather than in a `?tag=` search param — this is a static export, so the
  prerendered HTML cannot know the tag, and seeding state from `location.search` at mount is
  exactly the hydration mismatch the theme script already has to be forgiven for. The cost is that
  a filtered view is not linkable, which is the trade taken deliberately. Five things follow:
  - **`openable` is built from the filtered list, not from `items`.** The lightbox arrow-keys
    through whatever array it is handed, so stepping would otherwise walk into rows that are not
    on the page behind the backdrop.
  - **The filter bar is sticky at `--sticky-top` with `z-index: 15`** — the CV's section-title
    slot exactly, between the tab bar's fade (12) and the bar itself (20). It has to be: it lands
    inside the fade's 72px band, which washes out anything at that height, and painting over the
    fade is how the section titles already solve that. Pushing it below the band instead would open
    a 128px hole above the list. It carries no background for the same reason those titles do not.
  - **It is a section header, so it takes `.sectionHeader`'s whole box** — the same
    `6px 0 calc((var(--type-size) * var(--line-height)) / 2)` padding and 16px column gap, restated
    from those tokens rather than from their resolved pixels. Sharing the sticky offset is what
    makes this matter: with no padding of its own the bar's label baseline sat **12.4px** above a
    section title's, which read as the bar being tucked up against the tabs while the CV's headers
    were not. And `.filterTag` takes the `h2` treatment from `.profileSection h2` — `--type-size`,
    `--weight-emphasis`, `-0.02em` — because the active tag *is* the title of the list beneath it;
    at the byline's 12px it read as a caption and left the bar half a header tall. Verified with
    one measurement method across both routes: baseline 22.5px from the box top and height 39.6px,
    identical on each.
  - **`.filter + .list` is 12px, not 24px**, because the bar now contributes
    `.sectionHeader`'s 11.2px bottom padding — the two together land within a pixel of the 24px
    that was there before the padding arrived.
  - **The mark in the bar needs no `vertical-align`, and adding one does nothing.** This is the
    trap: `.metaIcon`'s -3px is tuned to 12px text, the bar's label is 14px, so the arithmetic
    invites a ~-2px override. `.filterTag` is a flex container, so the mark is a flex item and
    `align-items: center` places it — confirmed by setting an absurd value and measuring no
    movement at all. Centring the 14px box in the 22.4px line box happens to land the ink 0.45px
    off the cap's optical centre, so there is nothing to tune. Note the matching hazard when
    *measuring* in there: a zero-size baseline probe inside `align-items: center` reports the
    line's centre, not its baseline, which is off by half the line box and looks like a real
    misalignment. Measure from the text's font box instead.
  - **Clear is the CV's Show/Hide Details control, restyled to match it exactly** (verified
    property by property against the live element, not by eye). Consistency is the smaller half
    of the reason: the note beside `.detailsToggle` explains that it stays quiet *because* it
    sits in a sticky header, where a filled pill parked under the tab bar for the length of a
    section competes with the label beside it. This bar is sticky, in the same slot, with a label
    beside it. It was a `--background-muted` pill first, which is exactly what that argument
    rules out. The declarations are duplicated rather than shared, the same trade `.srOnly`
    makes — so if the CV's toggle changes, this has to follow by hand.
  - **The jump back to the top is `scrollTo`, never `scrollIntoView`** — and that is a consequence
    of the bar being sticky. A pinned sticky element's rect reports the *pinned* position, so
    `scrollIntoView` on it sees something already exactly where it asked to be and does nothing at
    all, which reads as the scroll silently failing. The clearance is measured off `.list` instead:
    its `scroll-margin-top` (the tab bar), its `margin-top` (which `.filter + .list` already
    varies), and the bar's own height. All three are read from the DOM rather than restated in JS.
  - **The scroll happens at all** because filtering shortens the list under a reader who is
    somewhere down it, leaving them in blank space past the last surviving row.
  - **Pressed and hover must not resolve to the same colour.** Hover takes one step off the line's
    resting tertiary; pressed goes the whole way to `--foreground-primary`, so an active filter is
    legible without the pointer anywhere near it. They were briefly both `--foreground-secondary`,
    which made an active tag indistinguishable from one under the cursor.
- **The tag marks are inlined in `app/TagIcon.tsx`, not files.** The `Arrow12.tsx` rule: each is a
  single monochrome path, and `currentColor` only sees the page's colour when the SVG is part of
  the document, so a file would have meant a `-dark` sibling or a filter plus a request apiece.
  They are chrome, so `public/media/` would be the wrong home regardless — that pool is
  reference-counted, and anything in it with no content record reads as an orphan. `TAG_PATHS`'s
  keys **are** the vocabulary: an unlisted tag still filters, it just renders unadorned, which is
  what a newly hand-authored label should look like until a mark is drawn for it. The date's mark
  is deliberately *not* in that record — it is not a tag and filters nothing. `.metaIcon`'s
  `vertical-align: -3px` is half the 14px box less half the measured 8.3px cap height; verified at
  0.15px off the text's optical centre, so changing the size means revisiting it.
- **That line is inline flow, not flex, and it was flex once.** Flex was right while the tags were
  filled pills, because a pill is a box and boxes need aligning; text does not. Inline layout puts
  the date and every tag on one baseline for free, wraps at the spaces, and needs no `gap`. The
  flex version measured 3px taller than its own text — a flex item that is itself a flex container
  contributes a *synthesized* baseline rather than its text's, so `align-items: baseline` did not
  actually put the date and the tags on the same line. Two consequences: the `<span>` around the
  date **must stay**, because the leading middot is `.tags:not(:first-child)::before` and the
  date's presence is what decides whether it is drawn — which is also why an entry with tags and
  no date needs no branch in the component; and `.date` carries **layout only**. It has a class
  again now that a mark travels with it (`white-space: nowrap`, so the line never wraps between a
  mark and what it labels), but still no type or colour — those stay inherited from `.byline`, or
  the line drifts into two weights.

  The marks cost this line nothing, which was worth checking rather than assuming: a 14px box in
  12px text at `line-height: 1.6` sits inside the 19.2px line box, measured identical with the
  marks, without them, and with the tag buttons laid out `inline-block` instead of `inline`. So
  `.tagButton { display: inline }` is the smaller change rather than the fix for a bug — a UA
  button is `inline-block`, and `inline` is simply what leaves the byline's flow untouched.
- **Dropping the pills also dropped a whole class of bug**, worth remembering before reaching for
  one again. A short pill needs `line-height: 1`, which puts this font's 15px ascent + descent
  inside a 12px content box, leaving the cap height off-centre in a way no round padding fixes.
  Worse, it is easy to measure *backwards*: `Range.getBoundingClientRect()` returns the **font**
  box, which already has the negative half-leading folded in, not the line box — treat it as the
  line box and add half-leading again and the computed baseline lands 1.5px high, which argues for
  nudging the text down when it in fact needs nudging up. That mistake shipped a padding that
  dropped the descender of a "p" through the pill's bottom edge. Measure a baseline with a
  zero-size `display: inline-block; vertical-align: baseline` probe, whose top *is* the baseline.
- Each entry carries a **required, authored `id`**. It used to be derived from the array index
  (`${index}-${entry.file}`), which meant every id changed whenever the gallery was reordered.
- `width`/`height` are **required**, not measured. This retires a live footgun: `sharp` cannot
  measure video, so an undeclared video used to fall back silently to 16:9 and shift the layout.
  Now the migration and the Studio always write real numbers and images and videos behave alike.
- Missing files listed in `gallery.json` are skipped with a build warning rather than
  failing the build.
- Each entry's `id` must be **unique**, enforced in `loadGalleryItems` the way `contentLoader`
  enforces CV item ids. `Gallery` tracks the open item by id and `findIndex` stops at the first
  match, so a duplicate opens the earlier entry whichever was clicked, and misroutes a Studio
  edit the same way.
- An absent/empty `gallery.json` renders a neutral empty state, so the route always builds.
  While the gallery has no media, `page.tsx` calls `hasGalleryItems()` and the CV page
  hides the tab bar entirely — visitors are never offered an empty tab, and the Gallery tab
  appears on its own once media is added. `/gallery` stays reachable directly, and **`Tabs.tsx`
  re-adds the tab when the pathname is already `/gallery`**: the bar is rendered by the shared
  root layout, which computes `showGallery` once for both routes, so an emptied gallery took the
  bar off `/gallery` itself and left a visitor arriving from a link with no way back to the CV.

Videos autoplay muted when scrolled into view and pause when they leave, via
`IntersectionObserver`, so only one video decodes at a time. Under
`prefers-reduced-motion: reduce` they stay paused and expose native controls instead
(`app/usePrefersReducedMotion.ts`).

Two things about *when* that costs anything:

- **A video's poster is an `<img>`, not the `poster` attribute.** That attribute has no lazy
  option — the browser fetches it as soon as the element is parsed, however far down the list it
  sits — so with seven clips spread down a nine-screen page every poster was pulled before the
  reader had scrolled a pixel, while the plain images beside them deferred correctly. As an
  `<img>` it takes `loading="lazy"` and behaves like the rest of the page. It is layered *over*
  the video so there is no empty frame while the file arrives, and hides on `loadeddata` rather
  than `playing` — under reduced motion `playing` never comes, and there `preload` is
  `"metadata"` precisely so the video can paint the frame its controls sit on. `pointer-events:
  none` on it is load-bearing for the same reason: it covers those controls until it fades.
- **`play()` waits for `PLAY_DWELL_MS` of the item staying on screen.** `play()` is what commits
  to downloading the whole clip — `preload` is `"none"` until then — so starting on the
  intersection alone meant a reader who flicked from the top of the list to the bottom pulled
  every clip in it, several MB, having seen none of them. The `clearTimeout` on the way out is
  the half that actually does the work. Measured: a full-page flick now starts zero videos.

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
**travels** between them — near-black on the light theme, near-white on the dark one. It is
filled with `--foreground-primary` and labelled in `--background-primary`, which is what "inverts
the ground it sits on" means literally: the pill is the page's ink and its label the page's
ground, so it cannot drift from either and on the gallery route the label follows that route's
ground for nothing. It had two tokens of its own (`#000`/`#fff` and the reverse) and they are
gone; the pill moved by ΔE 0.178 in light and 0.051 in dark, which is below what reads as a
change. The way it is built is the point:

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
  the real pathname, because that is a claim about which page is open. The click handler sets
  `pendingHref` **only for a click that will navigate this tab** — not a modified click, not a
  non-primary button, not the tab already open. `onClick` runs before next/link decides, and
  next/link bails on a modified event, so cmd-clicking Gallery opened a new tab and parked *this*
  page's pill on Gallery for the rest of the session: the reset is keyed on the pathname
  changing, and it never changed.
- Geometry is derived, never measured: tabs are `flex: 1 1 0` with a known `--tab-inner-gap`,
  so tab *n* starts at `n x (width + gap)`. Exact at any column width, no ResizeObserver. Each
  copy is pulled back into the bar's coordinates, which is why all of them mask to the same
  rect. Watch the percentages: in `left` one resolves against the containing block and in
  `transform` against the element's own width, which is why `--tab-width` is written on
  `.pillTravel` — the box it must resolve against — and not on the window.
- `.pillFill::after` reflects the page glow onto the pill, drawn with the same
  `--glow-sweep` at the same `--glow-fraction` scale — both in `globals.css` precisely so the
  reflection cannot drift from the glow. Its strength is `--tab-reflection-opacity` rather than a
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
`--background-primary`, which is what makes it follow the gallery's muted ground automatically.

The fade is a sibling of the bar rather than the bar's own `::after`, and that matters: the
CV's sticky section headers park inside the fade's band and have to paint over it, which a
pseudo-element could not allow because the bar's `z-index: 20` makes it a stacking context.
The stack is fade (12) < section header (15) < bar (20) — so a header still slides *under*
the bar on its way out. `--sticky-top` in `globals.css` is where the headers park; the
layout overrides it to `0` when the tab bar is not rendered at all.

Three things it depends on:

- **`ProfileHeader.tsx` holds the avatar, name and byline, and deliberately nothing else** —
  it is the *entire* content above the tab bar. The bar is sticky and shared, so its resting
  height is however tall that block is; keeping it to the three things that are identical on
  both routes is what stops the bar landing at a different height per route and jumping when
  the tabs are switched.
- **About renders *below* the bar, from the root layout** (`About.tsx`), and this is the second
  arrangement rather than the original. It used to sit above the bar, with the header, on the
  reasoning that it read as one introduction — which was fine while it was the only thing that
  wanted to be up there. It stopped being fine when the CV grew a gallery teaser that
  `/gallery` has no business showing: CV-only content above the bar moved the bar 500px between
  routes. Moving About down made the space under the tabs route-free, which is what the teaser
  now uses. Three things follow:
  - **The layout renders About, not each page.** The text is identical on both routes, so a
    per-page copy would be two copies of one fact. Anything genuinely per-route goes in the
    page, below it.
  - **The air either side of the bar is split across three files** — `.header`'s
    `margin-bottom`, `--tab-bar-gap-top` / `--tab-bar-gap-bottom`, and `.about`'s `margin-top`.
    The two sides are deliberately close to even so the bar reads as sitting *between* the name
    and the page rather than being pushed onto one of them.
  - It still carries no visible title: a sticky heading would have nothing to pin under, and
    the `<section>` takes its accessible name from `aria-label`.
- **`GalleryPreview.tsx` — the 2x2 teaser — is the CV page's first block**, rendered by
  `Profile.tsx` and not by the layout. That is what makes it CV-only without a route test: the
  layout is never told which route it is rendering, so anything conditional up there needs
  `usePathname()`, whereas inside the CV page being on the CV *is* the condition. Four things
  worth knowing before touching it:
  - **It must stay below the bar.** Above it, the bar's resting height stops matching
    `/gallery`'s and the jump comes back — measured at 500px, the block's height plus its
    margin.
  - **`.wrap` deliberately carries no top margin.** `.about` already ends in `margin-bottom:
    52px`, and adjacent sibling margins collapse, so one declared here would simply be shadowed
    by the larger of the two — the gap above the teaser is About's, and it is the same gap the
    gallery's first row gets on the other route.
  - **The frame's fill and hairline are `--background-muted` and `--border`** —
    the unselected pill's and the thumbnails' own tokens, not literals — so the three surfaces
    cannot drift and the dark theme needs no second rule.
  - Tiles lock a 4:3 border box whatever the media's own shape is and fill it with
    `object-fit: cover`, so the four read as a set; the Cloudflare request asks for the tile
    *less its 1px border on each side*, the same arithmetic (and the same reason) as a
    thumbnail's. The blur-up is the lightbox's, down to the checks-before-it-subscribes effect
    and the `setTimeout` rather than `requestAnimationFrame` — see `LightboxImage`.
- **Nothing in the content column carries a narrow-viewport indent any more.** About's body
  copy used to take `margin-left: 16px` below 480px, inherited from the days when it was a CV
  section whose text lined up past a section title. It sits under the tabs now, with a
  full-width surface directly beneath it, so the indent read as a misalignment; About and the
  teaser both take the whole column at every width, the same edges the avatar and the bar use.
- `.profile` and `.gallery` are both centred (`margin: 0 auto`), which is what makes the
  full-bleed `calc(50% - 50vw)` margins land symmetrically on either route.
- `globals.css` uses `overflow-x: clip` (not `hidden`) on `html, body`. `hidden` makes them
  scroll containers, which silently breaks `position: sticky`. `hidden` is still declared
  first as a fallback for browsers without `clip` support.

### CV interactions

Three behaviours in `Profile.tsx` / `Attachments.tsx` that are easy to break by accident:

- **A video thumbnail shows its poster, and fetches the video only on hover.** The row is 90px
  tall and used to render an `autoPlay` video per attachment, which downloads the whole file:
  `autoPlay` does that regardless of the `preload` hint, and there was no viewport gate here the
  way there is in `Gallery.tsx`. The CV page therefore spent ~11 MB — one clip of it 5.9 MB —
  animating thumbnails the size of a postage stamp, above and below the fold alike. A poster is
  an ordinary image, so it goes through Cloudflare like every other thumbnail and costs ~12 KB.
  Four things hold it together:
  - **The preview is layered over the poster, not swapped with it.** A swap blanks the thumbnail
    for as long as the file takes to arrive, which on the first hover is precisely the wait this
    moves off the page load. `.media video[data-preview]` is what stacks it, gated on the
    attribute because the no-poster fallback still renders a plain in-flow video — styling *all*
    videos to `opacity: 0` would leave that one an empty frame.
  - **It fades in on `playing`, not on mount or `loadeddata`.** Those land a paint too early and
    the cross-fade cuts to a frozen frame.
  - **`useHasHover` gates the mount, not the handler.** `pointerenter` fires on a touch tap too,
    and there the tap is a request to open the lightbox — loading a preview about to be covered
    by it is pure waste. Focus/blur mirror hover so the keyboard gets the same affordance.
  - **A video with no poster falls back to the old autoplaying element.** `media.json` gives
    every video one today; the branch exists so that adding one without a poster degrades to
    heavy rather than to blank.
  - **`.playBadge` is what tells a reader it is a video at all**, since a still thumbnail is
    otherwise an image. It carries literal black-and-white rather than theme tokens on purpose:
    it sits on arbitrary media — a near-white screenshot in one thumbnail, a dark editor in the
    next — so it cannot borrow the page's foreground and stay legible, which is why every video
    player converges on a dark scrim under a white glyph. It is `aria-hidden` because the
    button's accessible name already says "video", and `pointer-events: none` because the row is
    dragged by grabbing the thumbnails and anything laid over one is a patch the drag dies on.
    It hides on `data-ready`, not `data-preview`: hovering a cold thumbnail leaves the poster up
    for the length of the fetch, and that is the moment the badge is most reassuring.
- **No CV thumbnail is `loading="lazy"`, and that is deliberate.** The tabs are real routes, so
  switching to `/gallery` unmounts this tree and destroys every `<img>` in it — decoded pixels
  belong to the element, not to the URL. Coming back builds a fresh element per thumbnail with
  no memory of having been loaded, and each one then needs the browser to decide to fetch it
  again from scratch. Chrome settles that on the next scroll; WebKit does not reliably settle it
  at all, which showed on iOS as thumbnails that had been on screen before the round trip coming
  back permanently blank. Measured on the live site: **0 of 44 elements survive the navigation,
  and the return trip issues 0 requests** — the bytes were never the problem, the decision was.
  What makes eager affordable is the resizing: the whole set is ~190 KB of AVIF, less than one
  of the source images it replaced, and it returns from cache as `immutable`. This reverses the
  earlier rationing, which was correct when these were full-size originals that genuinely
  competed; at 2-6 KB apiece `fetchPriority` is enough to order them.
- **Priority is still rationed to one row, and `Profile.tsx` is what decides which.** A hint
  given to everything is a hint given to nothing. A row cannot tell from its own index where it
  sits in the document, which is why `priority` is threaded from `Profile` (first item of the
  first section) rather than inferred in `Attachments`: its leading `PRIORITY_THUMBNAILS` are
  hinted `high`, and past `DEPRIORITISE_AFTER` in an off-screen row a thumbnail is hinted `low`,
  so when a reader scrolls, the row's leading edge arrives first.
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
  `--background-primary` instead, so it reads as a margin of ground held around the image rather than
  as a light edge — a light rim on every thumbnail at once is the loudest thing on a dark
  page, which is why it was already dimmed there — and takes `--background-hover` on hover. That
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
    exactly as a box shadow would.
    **The element carrying that filter must not also carry a clip**, which is why the print's 3px
    rounding is on the `img` (and the preview `video`) rather than on `.frame`. `.frame` used to
    take `overflow: hidden` alongside the filter, and on WebKit an element's own overflow clip is
    applied to its *filter output* — so the shadow, which lies entirely outside that box, was
    thrown away. Every matted thumbnail on iOS Safari was therefore shadowless, and had been
    silently: the loss is invisible on an opaque screenshot and obvious on a collage whose artwork
    reaches the frame's edge, which is how it was eventually reported. Blink does not apply the
    clip that way, so no width in Chrome shows it — this reads like a mobile bug and is an engine
    one. Reproduced minimally in the iOS Simulator: two identical mats, one with `filter` +
    `overflow: hidden` on the same element and one with the clip moved to the `img`; the first
    renders no shadow at all, the second renders it. Nothing was lost by dropping the clip — the
    frame *is* the image's box under `object-fit: contain`, so there was never anything to
    overflow, and `border-radius: inherit` on the media reproduces the same corner.
    `.media`'s own `overflow: hidden` went the same way and is now scoped to the unmatted
    treatment, which is the only one whose image reaches the button's edges. On a matted thumbnail
    it clipped nothing — `.frame` is the only child and is inset 14px — while leaving the shadow
    dependent on 12px of mat happening to exceed its ~6px reach. The shadow is now bounded only by
    `.scrollableArea`, which already reserves `--hover-room` for overpaint.
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
  would otherwise just stop after its last item. It carries the published date at one end and
  `profile.location` at the other. Four things there:
  - Its "Last updated" is `new Date()` at module scope in a *server* component, so it is evaluated
    once during the build and baked into the export. That is what the phrase means for a static
    site, and it is deliberately not a content field: a date that has to be remembered goes stale,
    while this one cannot, because publishing *is* rebuilding. `timeZone: 'UTC'` keeps a build near
    midnight on the 1st from naming the wrong month.
  - **That is also why the typing animation lives in `TypedDate.tsx` and the footer stays a server
    component.** The animation needs `"use client"`; moving the whole footer across that boundary
    would move `new Date()` into the visitor's browser, quietly turning "last updated" into *today*
    for everyone. The date is computed in the footer and arrives in the child as a finished string.
  - **The date renders complete and is emptied on approach**, not on mount. Complete is what the
    export contains, so a reader with JavaScript off — or with `prefers-reduced-motion` set, where
    there is no animation at all — simply reads it. The emptying happens in the IntersectionObserver
    callback rather than in the effect body, which keeps a wasted render off every page load; the
    observer's `rootMargin` fires it ~240px before the box is on screen, so nobody watches the
    finished date blank itself and retype. Measured on a stepped scroll: zero frames where the
    complete date is visible before the animation starts. Reduced motion is *derived* during render
    rather than written back as state — assigning it in the effect trips `set-state-in-effect`.
  - The gap above it is **padding, not margin**, and that is the only reason the two routes agree.
    The gallery's list ends in a margin, which collapses with an adjacent margin — a 16px top
    margin disappeared into the list's 60px and left the gallery 16px tighter than the CV, whose
    section padding cannot collapse. `Gallery.module.css` gives its list a matching 60px bottom
    margin for the same reason.
  - **The gap *below* it is split across two files, and `.column`'s half is deliberately not
    symmetric.** The footer's own `padding-bottom: 60px` is reserved room rather than air: the
    cursor is absolutely positioned, so it adds nothing to the page's height and reaches within a
    pixel of that padding's edge. `.column` used to match its top padding underneath, which put
    72px of genuine emptiness below the lowest thing on the page — 132px in total against 72px
    above the avatar. Its `padding-bottom` is 24px now, so the total is 84px and ~23px of that is
    clear below the cursor's lowest frame. It cannot go much lower: below ~588px wide the top
    clamp is already at its 24px floor, and that is where the cursor's reserve is thinnest — the
    footer's 60px plus whatever is left here has to cover the ~61px the cursor hangs below its
    line, or the end of the document cuts it off, which is the bug the 60px was added to fix.
    Measured after the change: 23.1px clear at 873px wide, 13.1px at 375px (the footer stacks
    there, so the cursor starts lower), nothing clipped on either route.
- Lightbox uses React Portal to render to `document.body`
- **The lightbox requests a resized image, and used to request the original.** `LightboxImage`
  rendered `src={media.url}` and never imported `cloudflareImageUrl`, so opening one downloaded
  the source file — up to 394 KB of 2560x1440 webp — whatever box it landed in. It now offers a
  `srcSet` across `LIGHTBOX_WIDTHS` with `sizes="calc(100vw - 48px)"`, capped at the media's own
  width so Cloudflare is never asked to upscale. Most of the saving is not the resizing but
  `format=auto` negotiating AVIF: 23-27% at full size, 65-77% once a viewport picks a smaller
  step. `sizes` deliberately errs wide — a height-constrained picture is narrower than the
  viewport and the attribute cannot say so, and guessing low shows as a soft image.
- **A blurred stand-in covers the wait, and a spinner covers a long one.** `.placeholder` is a
  24px-wide copy (under a kilobyte) blown up and blurred, sharpening as it fades once the real
  media has a frame. Four things there are load-bearing:
  - **The real media has no opacity of its own** — only the stand-in animates. That is the safe
    direction: a failure can leave a blur up a moment too long, where hiding the media until
    `load` risks pinning a sharp picture invisible behind a stand-in that never leaves.
  - **`loaded` checks before it subscribes.** The media is usually already cached from the
    thumbnail or gallery row that opened the lightbox, so it can be `complete` before any
    listener is live — and an event that already fired is one you never hear. `error` counts as
    done, so a broken file does not mean a permanent blur.
  - **That check defers through `setTimeout`, not `requestAnimationFrame`.** Animation frames only
    run while the page paints, so in a backgrounded tab the reveal never fires and the reader
    comes back to the stand-in still up.
  - **The blur sits on the image inside a plain clipping span.** `filter` applies to the *result*
    of a clip, so blurring the clipping box feathers the blur back out past the edge that box
    exists to contain — and the clip is needed at all because `.imageWrap` drops its
    `overflow: hidden` for the floating and video treatments. `.placeholder`'s `scale(1.06)` is
    sized against the blur radius, so changing one means revisiting the other.

  Note for anyone verifying this in a preview pane that does not paint: CSS transitions and rAF
  are both driven by the frame clock, so computed styles freeze at their starting values and
  correct code reads as broken. Check the *inline* style, or set `transition: none` first.
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
  **The steps take `--background-muted`** — the same token the tab bar's unselected pills wear, so
  the two read as one family of raised controls against the `--background-primary` backdrop. They
  hover to `--background-hover` like everything else. `.close` takes the same pair, since it sits
  on the same backdrop, plus the same `--foreground-secondary` → `--foreground-primary` glyph
  move — it used to sit a step lighter at `--foreground-tertiary`, which read as two weights of the
  same control rather than one set. Its bars paint with `currentColor`, so the `color` on the
  button drives both of them and the hover with one declaration. **It is also the steps' 28px box**,
  at `border-radius: 50%`: it was 24px at a 16px radius, and a 4px difference between two controls
  wearing identical tokens on the same backdrop read as a mistake rather than as a hierarchy.
- **The pager's active dot is a full 8px and the rest are 5px**, so the size carries the state
  alongside the opacity — 25 identical marks with one of them slightly darker did not. Three things:
  - **The 8px *box* is constant; only a `transform: scale()` changes.** The dots are a flex row with
    a fixed gap, so animating `width`/`height` would shift every dot after the one that changed, and
    a step changes two of them at once. Verified: the pitch stays 14px in every state.
  - **The inactive opacity went 0.1 → 0.15.** A 5px dot at 10% of the foreground is very nearly not
    there; the shrink and the fade would otherwise compound.
  - Scale and opacity ride one transition, so the dot growing and the dot shrinking are a single
    exchange rather than two effects landing at different times.
- **Every button in the lightbox answers a press by animating its icon, not itself.** `:active` with
  a transition on the icon, rather than a framer gesture: it covers both directions — the glyph eases
  into the pressed state and back out on release — with no state to hold. The button's fill is
  already spent on hover, so the press needed something else to move. The chevrons lean 2px in the
  direction they travel (`.stepPrev` needs its own rule: the 180° mirror is on the `svg` *inside*
  `.stepIcon`, so composing both on one element would mean writing the rotation into every state);
  the close cross and the play badge can only compress, having no direction to lean in.
  Two things are load-bearing: the icon wrappers are `pointer-events: none`, or a span over the
  button's middle swallows the click; and **the close cross is two real spans now, not the button's
  `::before`/`::after`** — pseudo-elements cannot be moved as a unit, since each carries its own
  rotation. They stack in one grid cell under `place-items: center`, so there is no translate for
  those rotations to compose with.
- **Stepping slides the media as well as crossfading it**, `SLIDE_SHIFT_PX` (24) either side of
  centre, off a softer spring than the chrome's 700/50 — which lands in ~150ms, over before 24px of
  travel reads as movement. Three things:
  - **Direction is derived, not remembered.** Each slide gets `relative` = `Math.sign(index -
    currentIndex)`, so the outgoing item leaves the way the incoming one came in and nothing has to
    store which way the reader went.
  - **It is skipped in carousel mode**, where `scrollLeft` decides what is on screen and offsetting
    or fading the neighbours would fight the scroller for the same job. Under
    `prefers-reduced-motion` the crossfade stays — that is what says *which* item is up — and only
    the travel goes.
  - **`.lightboxImage` lost its `visibility: hidden` for `aria-hidden`.** Visibility flips in one
    frame, so the slide being stepped away from vanished instead of leaving, and the step read as
    the media blinking out and a new one arriving over bare backdrop. The neighbours animate to
    `opacity: 0` instead, and `aria-hidden` is what keeps them out of the accessibility tree the way
    visibility did — safe only because everything focusable inside an inactive slide is already
    `tabIndex={-1}`. Bytes are unaffected: `autoPlay`, `preload` and `loading` were always gated on
    `active`, never on visibility.
- **A video in the lightbox shows its position in a bar below the media**, at `top: 100%` on a box
  spanning `.imageWrap` — so it is exactly the media's width and takes no part in the aspect-ratio
  arithmetic that sizes the wrap. `.imageWrap` normally clips (that is what rounds the media's
  corners), so `data-video` lifts the clip and moves the radius onto the media itself, the same
  trade the `floating` treatment makes. `.lightboxImage[data-video]` also grows its bottom padding
  to 88px, and that is what keeps the bar clear of the control cluster: `containerRef` measures
  `.lightboxInner` *inside* that padding, so the media shrinks to fit rather than the bar being
  pushed down into the controls. Only height-constrained media needs it — a 1:1 video reaches the
  bottom padding where a landscape one leaves slack — but reserving it for both keeps the bar the
  same distance from the media either way. Measured at 1400x600, where the media is
  height-constrained: 14px between the bar and the cluster. The playhead is read in a
  `requestAnimationFrame` loop gated on `active` — the carousel keeps the neighbours mounted and
  would otherwise run three loops at once — and on the video actually *moving*, since a paused or
  scrubbed video's position is written by whoever moved it.
- **That bar is the scrubber, and the media itself is the play/pause button.** Both were added
  after the fact; six things about them are load-bearing:
  - **A video gets no click-halves.** An image's `.navigation` pair steps through the set on a
    press anywhere over the picture, and pressing a video means pausing it — the two cannot share
    one surface. `.playToggle` replaces them, covering the same box. Stepping stays reachable from
    the control cluster's arrows and from the arrow keys, neither of which it covers, and the
    backdrop still closes because the toggle only spans the media.
  - **The transport badge is hidden while playing and shown while paused**, the inverse of a
    thumbnail's play badge and for the same reason: the motion is the signal, so a dark disc
    parked mid-picture is only in the way. **Hover does not bring it back** — the whole surface
    is the button, so there is nothing hovering would disambiguate, and a disc appearing the
    moment the mouse crosses the clip is exactly the interruption hiding it was avoiding. Focus
    does, and that is not an inconsistency: a keyboard user gets the ring around the media and
    otherwise nothing saying what pressing it would do. Literal black-and-white, not theme tokens
    — it sits on arbitrary media.
  - **`isPlaying` and `duration` are read off the element, never tracked beside it.** Playback
    stops for reasons this component never asked for — an autoplay refusal, a step to another
    item, a media key — so a flag set wherever `pause()` happens to be called goes stale, and it
    is the button's accessible name. Both are read once up front *and* subscribed to, the same
    check-before-you-subscribe shape as `loaded`: duration does not exist at mount and may land
    before a listener is live.
  - **The scrubber is a real `role="slider"`, which collides with the dialog's arrow keys.** The
    lightbox listens for ArrowLeft/Right on `window` to step through items; a focused slider owns
    those keys for seeking. The element is beneath `window` in the bubble path, so its handler's
    `stopPropagation` is what stops one press doing both. Verified: ArrowRight on the slider moves
    the playhead 5s and leaves the pager dot alone; on `body` it still steps items.
  - **The hit band is 24px around a 5px bar, and exactly as wide.** A 5px drag target is a 5px
    drag target. `ratioFromPointer` measures against the band, not the bar, which is only correct
    because the two share a width — horizontal padding on `.scrubber` would silently skew every
    press. Pointer capture is what lets a drag survive leaving the band, which at this height is
    most drags. `touch-action: none` is required: the carousel scrolls horizontally on an
    ancestor, and a scrub is a horizontal drag.
  - **Everything transport-related is `tabIndex={active ? 0 : -1}`.** In carousel mode every slide
    is laid out at once and the dialog's Tab trap enumerates the whole portal, so without it
    tabbing walked through the controls of items that were not on screen.
- **`display` and `active` are two different questions, and `LightboxImage` takes both.** `display`
  is layout — in carousel mode (`data-mobile`) every slide has to be laid out and painted, because
  scrolling between them is how you navigate. `active` is "this is the slide on screen", and it is
  what gates everything that costs bytes: `autoPlay`, `preload`, `loading`, the rAF playhead loop,
  the spinner. It also gates the window-level Space listener, so exactly one of the mounted slides
  answers a keypress rather than all of them at once. They were one flag, and the flag was `isVisible || isMobileNow` — so on any
  touch-capable device (`'ontouchstart' in window`, which a touchscreen laptop satisfies as much as
  a phone) opening the lightbox marked *every* entry active: every video autoplaying at
  `preload="auto"`, every image `eager` at full viewport width, for the one item that was tapped.
- **Playback is driven imperatively, because `autoPlay`/`preload` are read once at mount.** Nothing
  in the file called `pause()`, so a video that had started kept streaming for as long as the
  lightbox stayed open, whichever item had since been stepped to — and the neighbours are
  deliberately kept mounted, so off-screen is the normal state for most of them. `play()` rejects
  routinely (AbortError from a pause landing mid-play, or an autoplay refusal) and the rejection is
  swallowed: the stand-in is still on screen either way.
- **In carousel mode `scrollLeft` is what shows an item, so stepping has to write it.** `next()`
  and `prev()` only moved `currentIndex`, which on a touch-capable device with a keyboard meant
  ArrowRight advanced the pager dot while the media stayed put and the dots then named an item that
  was not on screen. An effect assigns `scrollLeft` from `currentIndex` — *instantly*, not
  smoothly, because `handleScroll` derives the index back out of `scrollLeft` and a smooth scroll
  would feed a run of intermediate indices back in for the effect to chase.
- **The step buttons are gated on `hover: hover`, not on touch capability.** Those come apart on a
  touchscreen laptop, which has both, and the touch test was removing the only visible way to step
  through the carousel while a keyboard sat right there. A phone still hides them — `hover: none`,
  and there the swipe is the control.
- **`aria-modal` is a promise, so Tab is trapped.** The key handler cycles focus within the portal
  root; without it one Tab off the close button walked into the page behind the backdrop, where
  Enter on a thumbnail opened a *second* lightbox over the first.
- **The scroll lock is reference-counted at module scope.** Each instance used to save the inline
  values it found and restore them on unmount, which is right for one lightbox and destructive for
  two: the second captures the *locked* values, and whichever unmounts last writes
  `overflow: hidden` and the gutter padding back onto the document — an unscrollable page with
  nothing open and no recovery but a reload.
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
- Font: **Switzer**, self-hosted through `next/font/local` in `layout.tsx` from
  `app/fonts/Switzer-Variable.woff2` (one 42 KB variable file, 100-900), with `--default-font` in
  `globals.css` pointing at the `--font-switzer` variable it emits
- No UI component library — all custom components
- **Every paragraph of running prose is `text-wrap: pretty`**, declared once on `p` in
  `globals.css` rather than per surface — `RichText` emits classless `<p>`s, so the element is the
  only handle that covers About, the CV's descriptions and a case study's whole body at once (the
  Studio's canvas reuses `RichText` and so gets it too). Two prose blocks are paragraphs without
  being `<p>` and carry it by hand: a gallery `.caption`, which is a `<div>` only because it
  renders as plain text, and `.description ul li`, because a *tight* markdown list arrives as bare
  `<li>` text where a loose one arrives wrapped in a `<p>` — and which one an author gets follows
  from a blank line they cannot see in the rendered page. Titles, the byline and the gallery's
  metadata line are deliberately left out: they are labels, not paragraphs. Measured both ways:
  it does real work (4–5 CV paragraphs end on a longer last line at 917px/480px) and it costs no
  height — every paragraph, list item, section and header measures identically with the rule and
  with it neutralised, at 917/600/480/375px on both routes, with no paragraph changing line count.

#### The palette

**Seven colour tokens, and adding an eighth should feel expensive.** The set was 19 names carrying
duplicate and near-duplicate values — `#ffffff` alone answered to four of them — and the audit
that cut it is worth knowing about before adding anything back.

| Token | Light | Dark | What it is |
|---|---|---|---|
| `--background-primary` | `#fff` | `#191b1f` | The page, on both routes |
| `--background-muted` | `#f3f4f6` | `#2b2e34` | Every surface on it: pills at rest, the gallery frame, the thumbnail mat, the avatar well, the scrollbar and scrubber tracks, the lightbox controls |
| `--foreground-primary` | `#111827` | `#e9ebef` | The name, section titles, a hovered icon — and the selected tab's fill |
| `--foreground-secondary` | `#4b5563` | `#b4bac4` | Most running text and iconography |
| `--foreground-tertiary` | `#9499a3` | `#868d99` | Dates, quiet text, the scrollbar thumb |
| `--blue` | `#0788f5` | — | Links and every focus ring |
| `--backdrop`, `--red`, `--green` | | | Studio only; these ship nowhere |

Plus two values derived from `--overlay-ink` (`#000` light, `#fff` dark), which is not a palette
colour so much as the direction "away from the ground":

| Derived | Value | What it is |
|---|---|---|
| `--border` | the overlay ink at `--overlay-strength` | Every hairline |
| `--background-hover` | `--background-muted` with the same overlay laid over it | Every hover: tab pills, the `.website` pill, the lightbox steppers and close, the dark theme's thumbnail rim |

`--overlay-strength` is **6% in light and 8% in dark**, and the asymmetry is the point: black over a
near-white surface bites harder than white over a near-black one, so matching the numbers makes
light heavy-handed and dark absent. It is a number, which is the one thing `light-dark()` cannot
carry, so it is the only value besides `--tab-reflection-opacity` that still needs the
`[data-theme]` rules. Resolved: `#f3f4f6 → #e4e5e7` in light, `#2b2e34 → #3c3f44` in dark.

**The thumbnail mat does not change on hover.** It holds `--background-muted` throughout: the mat
sits *behind* the print, so darkening it moved a colour the pointer is not pointing at, and against
a photo with any transparency it read as the image changing rather than the frame lifting. The lift
and its shadow are the hover in light; the rim is, in dark.

Five rules that keep it at seven:

- **Every themed value is one `light-dark()`, and there is no `prefers-color-scheme` block left
  in the codebase.** The pair sits on one line, so a value cannot be updated in light and
  forgotten in dark, and switching theme becomes a matter of setting `color-scheme` — which is
  all `:root[data-theme]` does. Each token declares its light value first as a bare fallback, the
  same shape as the `overflow-x: clip` and `.fade` fallbacks. Note that Lightning CSS *polyfills*
  `light-dark()` into a pair of toggle variables; it emits flips for `prefers-color-scheme` **and**
  for any rule that sets `color-scheme`, which is why the switch drives it correctly. Verified in
  the built CSS rather than assumed.
- **Solid colours are tinted, alpha overlays are neutral.** The ramp carries a slight blue bias so
  it reads as chosen against the `#f3f4f6` wash — lightness is held where it was, tertiary at
  2.86:1 on white against the old `#999`'s 2.85:1 — but `--border` and `--dot-color` are pure
  black or white. A tinted alpha over arbitrary media casts a colour on it; a neutral one only
  darkens or lightens.
- **A colour that follows the ground is not a token.** The selected pill's fill and label, the
  unselected pill, and the thumbnail's rim were all tokens with their own dark entries; each now
  resolves through `--background-primary` / `--foreground-primary` / `--background-muted` /
  `--background-hover`.
- **Judge closeness perceptually, not by contrast ratio.** A ratio knows nothing about hue and
  reports `--blue` against `--red` as 1.01:1. Rank candidates by OKLab ΔE and use contrast only
  between two neutrals, where it is the better measure at the dark end.
- **A rule drawn on text derives from the text.** Prose link underlines are
  `color-mix(in srgb, currentColor 22%, transparent)` rather than a grey. The fixed pair they
  replaced was ~11% of the text in light and ~21% in dark, so no single value could have matched
  both — and the light half was too faint to read as an underline.

**Both routes now sit on the same ground.** The gallery used to swap `--background-primary` and
`--background-muted` on `body:has([data-page="gallery"])`; that swap is gone, along with the
`--ground-*` plumbing it needed and the wrapper div that carried the attribute.

**The theme switch (`ThemeSwitch.tsx`) is a working tool, not a site feature.** It writes
`data-theme` onto `<html>` and nothing else — every themed value resolves through `color-scheme`,
so one attribute repaints the site. Four things about it:

- It renders only off the production branch, via `NEXT_PUBLIC_THEME_SWITCH` in `next.config.ts`.
  A `CF_PAGES_BRANCH=main` export contains no markup, no script tag and no `data-theme` — measured.
  It does **not** keep the component out of the client bundle: the layout's `import` is static and
  Next registers every client component in its manifest regardless of which branch renders it.
- An inline script in `<head>` applies the stored theme before first paint. It has to be inline
  and blocking; anything deferred to React runs after the browser has painted, which is the flash.
  **That is also a hydration mismatch, and `<html>` carries `suppressHydrationWarning` because of
  it.** The script writes `data-theme` before React hydrates, while the server sent no such
  attribute and the render produces none — deliberately, since the value lives in the visitor's
  `localStorage` and does not exist on the server. So React reported the DOM as wrong about
  something no change to the render could satisfy. The prop is gated on the same flag as the
  script rather than set unconditionally: production emits no script, nothing mutates that
  element, and a real `<html>` mismatch there should still be reported. It covers one element's
  own attributes and text, never its subtree. Verified: `<html lang="en">` is byte-identical in
  both builds, and the prop reaches the production payload only as `"suppressHydrationWarning":
  false` — data, not an attribute.
- The stored mode is read with `useSyncExternalStore`, not copied into state from an effect —
  `localStorage` is the store, and `set-state-in-effect` is an error in this repo's lint config.
- "System" removes the attribute rather than setting `data-theme="system"`, since `:root`'s
  `color-scheme: light dark` already means exactly that.

Shadows are the remaining gap: seven black alphas across four shadows, all hardcoded, none
adapting to the dark theme. The media scrims (`rgba(0,0,0,.55)` play badge, spinner, progress
scrim) are deliberately literal — they sit on arbitrary screenshots and video frames and cannot
borrow the page's foreground and stay legible.

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

`_headers` matches the pool at `/media/*`. The rule it replaced matched `/content/*`, a path that
stopped existing when `content/` moved out of `public/` to keep the JSON off the CDN — so the whole
media pool had been served uncached, silently, since that migration. Extension rules are the
backstop and `.webm` was missing from them, which is the pattern to watch: a new media type needs
adding in both places or it inherits no cache policy at all.

**Every pool URL therefore carries a `?v=<hash>` content hash, built in `assetUrl()`** — the one
place a `/media/` URL is constructed, so item media, posters, item icons, dark variants and the
profile photo all get it from one line. A year of `immutable` means the filename *is* the cache
key and nothing ever re-checks it, so re-cutting a clip in place published new bytes at a URL every
cache had promised not to look at again. Observed exactly that on `dev.haythem.cv` after the Design
Ruler re-cut: `Cf-Cache-Status: HIT`, `Age: 67532`, serving the previous encode and the previous
posters — whose cached sizes matched the pre-commit bytes to the byte — while the origin had the new
files all along. It is the mechanism `app/opengraph-image.png` already gets free from Next's file
convention, which is why the fix was to copy that rather than to shorten the cache policy. Five
things about it:

- **The hash is derived from the bytes, never authored.** A number written into `media.json` by hand
  can disagree with the file it describes, which is the whole failure being fixed; deriving it also
  means the Studio needs no part in this, since the version follows from whatever it wrote.
- **Not the mtime.** Git does not preserve mtimes, so every fresh clone and every CI checkout would
  invent new URLs and discard a warm cache for bytes that never changed. A content hash is stable
  across checkouts by construction.
- **`/cdn-cgi/image/<options>/<source>` tolerates a query on its source**, which the whole design
  rests on — every image is wrapped by `cloudflareImageUrl`, so a transform that rejected `?v=`
  would 404 all of the site's imagery, and that endpoint exists only on Cloudflare's edge where
  neither a local build nor `npm run check:cdn` would see it. Verified against production rather
  than assumed: 200 with byte-identical output beside the unversioned request, correct pixel
  dimensions back, and a different hash reported `MISS` — which is the busting itself, confirmed.
- **A srcset entry survives it.** Those URLs already contain commas from the transform options, and
  srcset is comma-separated; checked in the browser that a versioned candidate is still parsed whole
  rather than split, and that `currentSrc` comes back as one intact URL.
- **The already-poisoned entries need no purge.** The stale objects are cached under the
  *unversioned* key, and the site now asks for a different one, so the first request misses and
  fetches from origin. Purging is still the way to fix a URL that is already wrong in the wild;
  this is what stops the next re-cut needing one.

Reading the pool to hash it costs ~0.15s for 34 MB across 84 files, memoised per file per build
process — which is the only reason deriving it at build time is affordable at all.

**The font is self-hosted through `next/font/local`, and it used to come from Fontshare.** That
arrangement put a strictly serial chain in front of the first paint: DNS and TLS to
`api.fontshare.com`, a render-blocking stylesheet, and only then the woff2 — from a *second*
origin, `cdn.fontshare.com`, whose URL is not known until that CSS has arrived. Two `preconnect`s
overlapped the handshakes and that was the ceiling; the chain itself is what self-hosting removes.
The file now ships under `/_next/static/media/` with a content hash in its name, which
`public/_headers` already caches `immutable` for a year, and Next emits a `<link rel="preload">`
for it. Measured on the export: zero third-party hosts requested.

**`adjustFontFallback` is off, and that is the opposite of the obvious setting.** Because
`line-height` is an explicit 1.6, line *boxes* never move with the font — so the only shift this
page can suffer is a change in advance width rewrapping a paragraph and pushing everything below
it down one 22.4px line. Left on, Next synthesises an Arial-backed fallback at
`size-adjust: 101.38%`, derived from the OS/2 `xAvgCharWidth` ratio: an average over a fixed
character set rather than over real text. Against this page's own prose the ideal is 99.98% at the
font's default weight and **99.38% at the 350 the body copy is actually set in**, so the applied
value overshoots ~2%. Swapping through it moved 551 elements and grew the document 22px —
*worse* than no adjustment at all. Plain Arial moves **one** element by 1.2px and does not change
the document's height; test faces at 99.38% and 99.7% measured identically to it, so no constant is
carried. Nothing is given up where Arial is absent, since the synthesised face is itself
`src: local(Arial)` and fails there the same way.

The lesson generalises past this font: **a derived metric-match is a guess about the text, and this
site's off-grid weights are exactly where that guess misses.** Re-measure it rather than trusting
it if `--weight-base` changes.

**The woff2 is fetched at build time and is not in git**, which is a licensing constraint rather
than a size one. The ITF Free Font License permits — and recommends — self-hosting and serving the
file from your own origin, so the deployed site is unaffected by any of this. What §02 forbids is
making the Font Software available through a "repository" or "publicly accessible servers", and a
public repo with the binary committed is exactly that. `scripts/fetch-font.mjs` therefore pulls it
per checkout, and `.gitignore` covers `app/fonts/*.woff2`; `LICENSE.txt` and `README.md` beside it
stay committed, since a licence document is not the Font Software.

Four things about that script are deliberate:

- **The woff2's URL is read out of the Fontshare stylesheet, never hardcoded.** That hashed CDN
  path is Fontshare's to rotate, and a pinned one would break on the day it does — silently, if
  the failure were tolerated.
- **The bytes are pinned by SHA-256**, so an upstream re-cut fails loudly instead of shipping
  different metrics. That matters more here than it looks: `adjustFontFallback` is off *because*
  the fallback was measured against these exact bytes, so a changed file is a reason to re-measure
  rather than to carry on.
- **A matching local file short-circuits before any network call**, which is what keeps offline
  development working after the first install.
- **`postinstall` passes `--optional` and the build hooks do not.** A transient network blip
  should not fail `npm install`, but it must fail a build — a site built without the font is not
  a site worth deploying. Verified by running both against a deliberately wrong pin: strict exits
  1, optional warns and exits 0.

The trade is that a Fontshare outage can now fail a deploy. That is strictly the better place for
the dependency than where it used to be, which was in front of every visitor's first paint.

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
