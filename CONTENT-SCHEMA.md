# Content schema

The authoring contract for `content/`. The types are in
`app/lib/contentTypes.ts` and `app/lib/galleryTypes.ts`; this document is the
*why*, which the types cannot carry.

## File layout

```
content/                      # build-time input, NOT served
  cv.json                     # sections, items, order
  gallery.json                # gallery entries and captions
  media.json                  # per-asset facts, keyed by filename
  case-studies/<slug>.md      # markdown stays as files
public/media/<file>           # ONE flat pool, shared by both tabs
```

Two files, not one: the CV is sections → items → media, the gallery is a flat
media list. They share conventions (media references, stored dimensions) via a
common types module, not a common schema. Two files also keep a bad write from
taking out both.

Content JSON sits outside `public/` because it is compiler input, not a static
asset. It is read with Node `fs` and baked into prerendered HTML; no client code
fetches it (`grep -rn "fetch(.*content" app` returns nothing outside the Studio).
Media has to stay under `public/`.

Two things that follow from that, worth stating because they are easy to assume:

- **The content model has no effect on SEO.** A crawler receives identical HTML
  either way. There is no JSON-LD, sitemap, or robots route in the app.
- **It has no effect on runtime network cost**, for the same reason. Moving JSON
  out of `public/` did stop shipping 27 never-requested files to the CDN, but
  that is the move, not the schema.

## `content/cv.json`

```json
{
  "version": 1,
  "profile": {
    "displayName": "Haythem Gataa",
    "byline": "Software Designer {& Engineer}",
    "location": "Tunisia {(GMT+1)}",
    "about": "I'm a detail-oriented Software Designer…",
    "photo": "profile.webp"
  },
  "sections": [
    {
      "key": "workExperience",
      "label": "Work Experience",
      "items": [
        {
          "id": "product-designer-at-instadeep",
          "year": "2023 — Now",
          "heading": "Product Designer at InstaDeep",
          "url": "https://instadeep.com",
          "subheading": "Tunis, Tunisia",
          "description": "* Collaborating on a design system…",
          "media": ["board-view-running.webp", "pcb-layout-editing.webm"]
        }
      ]
    }
  ],
  "contact": {
    "label": "Contact",
    "items": [
      {
        "id": "contact-email",
        "platform": "Email",
        "handle": "gataa.haythem@gmail.com",
        "url": "mailto:gataa.haythem@gmail.com"
      }
    ]
  }
}
```

Rules:

- **Array order is display order.** No numeric prefixes anywhere. Reordering is a
  pure JSON edit, which is what lets the Studio avoid renaming anything on disk.
- `profile` is pinned first, `contact` pinned last; neither lives in `sections[]`.
- `sections[]` is homogeneous — every entry is timeline-shaped.
- `key` is stable and machine-facing; it replaces a hardcoded section map, so
  adding a section needs no code change. `label` is free text and safe to rename.
- `id` is stable and **globally unique**. It names nothing on disk, but it is a
  React key and the Studio's addressing scheme, so `contentLoader.ts` throws on a
  duplicate rather than shipping it.
- `subheading` is the one free-text line under the heading. It is not
  location-specific despite its origins — Work Experience uses it for a city,
  Personal Projects for a stack (`"Swift (w/ Claude)"`). It was called `location`
  until that second use made the name a lie.
- `description` is markdown. Start a line with `* ` for a bullet.
- `item.media` is a **list of filenames** into the pool; array order is display
  order. Dimensions live in `media.json`, so the build skips `sharp` entirely.
- Media `type` stays **inferred from the extension** — storing it would be a
  second source of truth that can drift.
- Omit optional fields rather than writing `""`.

One naming seam: media is authored under `media` but the loader resolves it to
`attachments`, because that is the prop `Attachments.tsx` already takes.

### Muted runs in free text

`{...}` sets that run in `--grey3`, the lightest of the three text greys — so a string can
lead with what matters and let the rest sit back. Two fields take it, `profile.byline` and
`profile.location`:

```json
"byline": "Product Designer {& Engineer}",
"location": "Tunisia {(GMT+1)}"
```

Five things to know:

- **Braces, not the heading's square brackets.** The two tokens mean different things and
  both are hand-authored, so sharing a delimiter would make `[Engineer]` a missing-image
  reference instead of a muted span.
- **The helpers are named for the treatment, not the field.** `splitMuted` and `plainText`
  in `app/lib/contentTypes.ts` — a third field that wants this should reuse them rather than
  introduce another delimiter.
- **The braces are stripped from the plain string.** `byline` is also the site's
  `description`, `og:description` and `twitter:description`, so the loader hands the metadata
  layer a brace-free string and the component renders `bylineSegments` instead. Same split as
  a heading's `heading` vs `headingSegments`, for the same reason.
- **It names no pool file**, so unlike `[filename]` it needs no reference counting — there is
  nothing for the sweep to delete and nothing to mirror in the Studio's `cvUses`.
- **Empty braces render nothing** rather than an empty span, and an unclosed `{` is left as
  the literal character — the pattern only matches a closed pair on one line.

### Inline icons in headings

`[filename]` anywhere inside a `heading` renders that pool image inline at 18px,
**exactly where the token sits** — so a logo can go mid-title rather than only at
one end:

```json
{ "heading": "Product Designer at [instadeep-logo.svg] InstaDeep" }
{ "heading": "[figma-logo.svg] Figma" }
```

The spaces you leave around the token are the gaps you get; nothing adds margin
for you. Any item in any section can use it, as many times as it likes.

Three things worth knowing:

- **The filename is a pool reference living inside free text.** It is counted by
  `collectReferences()` via `headingIconFiles()`, so the sweep will not delete a
  logo that is rendering. Anything else that ever embeds a filename in prose has
  to be added there too.
- **A token that does not resolve stays visible** as its literal `[filename]`
  text, with a build warning. Rendering nothing would make a typo look like a
  feature that silently does not work.
- **Square brackets are safe because a heading is plain text, not markdown.** If
  headings ever become markdown this collides with link syntax and the delimiter
  has to change.

Drawn at 20px with `fit: contain`, so a wordmark or non-square logo is never
cropped. A video token is refused with a warning. SVG is served as-is — see the
note in `cloudflareImage.ts` on why it skips the transform.

#### Dark-theme variants

A mark that vanishes against a dark ground needs a different file, not a filter.
Add a sibling whose name ends `-dark` before the extension and it is picked up
automatically in dark mode:

```
rive-logo.svg        →  used in light mode
rive-logo-dark.svg   →  used in dark mode
```

Only the light file is ever named in a heading. The variant is found by
convention, which has one consequence worth remembering: **that is also how it
becomes referenced.** `collectReferences()` derives the sibling and counts it as
referenced exactly when the light one is — the same rule a video's poster follows
— because nothing else would ever count it and the sweep would delete it.

It is optional per logo. A file with no `-dark` sibling serves both themes, so
only the marks that actually need one get one. It still has to be registered in
`media.json` like any pool file.

The swap is `<picture>` with a `media="(prefers-color-scheme: dark)"` source, not
JavaScript: this is a static export with no theme state to read, so a scripted
swap would paint the light file first and correct itself after hydration, and do
nothing at all with JS disabled.

In the Studio, the Heading field has a **+ Insert icon** picker that drops a token
at the cursor, so the filename never has to be typed. A file dropped into
`public/media/` by hand is *unregistered* until it has a `media.json` entry, and
unregistered files are unusable and absent from the picker.

### Fixed vs. orderable sections

The sections do not all render the same way, and the ones that differ are the
ones whose position is load-bearing for the layout. Rather than let the Studio
drag them anywhere and hope, the document makes position structural:

| Region | Position | Orderable? | Source |
|---|---|---|---|
| Header — photo, name, byline | always first | no | `profile` |
| About | always second, above the tab bar; renders untitled | no | `profile.about` |
| Work Experience, Education, Awards, Speaking, … | between | **yes** | `sections[]` |
| Contact | always last | no | `contact` |
| Footer — published date and location | below both routes, outside the CV | no | `profile.location` |

`sections[]` therefore holds **only** the homogeneous timeline-shaped sections —
every entry renders identically (`year` gutter + heading + subheading +
description + attachments). That is what makes reordering safe: there is no entry
in the array that needs different CSS.

Two consequences worth stating:

- **No `kind` discriminator is needed.** An earlier draft gave each section a
  `kind: "timeline" | "contact"`. Hoisting contact to its own key makes the array
  homogeneous by construction, so the field disappears — a flag that can be wrong
  is replaced by a shape that cannot. It also retired two
  `collection.name === "Contact"` string comparisons in `Profile.tsx` that
  silently broke the contact layout if the section was renamed.
- **Contact's *items* are still orderable**, and its heading is still editable
  via `contact.label`. Only the section's position is pinned.

### Dropped fields

`role` and `org` were once carried alongside `heading` as its structured halves,
on the theory that they would later enable a JSON-LD `Person` / `worksFor` graph.
They are gone: nothing ever read them, and authoring them by hand next to
`heading` wrote the same words twice. If a graph is ever wanted, splitting
`heading` is a migration, not a blocker.

## `content/media.json`

```json
{
  "version": 1,
  "assets": {
    "board-view-running.webp": { "width": 2560, "height": 1440 },
    "mentor-nations.webp": { "width": 1802, "height": 1130, "framed": false },
    "kairouan-mosque-photos.webp": { "width": 1546, "height": 1112, "floating": true },
    "award-ceremony.webm": { "width": 1254, "height": 704, "poster": "award-ceremony-poster.webp" }
  }
}
```

Keyed by filename, so an asset structurally cannot carry two records. Holds only
*intrinsic* facts — dimensions, the poster frame, and the two treatment flags
below. Presentation (captions, dates, ordering) stays with the referring entry.

Both flags sit here rather than on the reference because both follow from what the
file *is*, not from where it appears — and a per-reference copy could disagree with
itself, which is the drift the pool exists to prevent.

`framed` has a non-obvious default: **omitted means matted**, which is what every
thumbnail did before the flag existed, so `false` is the only value ever written.
A screenshot wants the mat; a photograph wants to bleed. Note that it no longer
controls the white rim — every thumbnail carries that now — only the wash, the
inset and the locked 14:9 frame.

`floating` is the mirror image — **omitted means no**, so `true` is the only value
ever written — and it describes an asset with no rectangle in it: a mockup collage
or photo montage sitting on transparency. It affects only the opened (lightbox)
view, where such an asset drops the hairline border and the rounded corner that
would otherwise trace an edge the artwork has not got, and gains instead the
silhouette-following `drop-shadow` its thumbnail already has. The test is the alpha
channel: if the corners are transparent, the flag applies. All six of the pool's
current collages carry it.

Note that the two are independent. `framed` is about the *thumbnail* and `floating`
about the *opened view*, so a collage is normally both matted and floating — the mat
gives the small version a consistent frame in the row, and the flag stops the large
version being boxed.

**Dimensions are always authored**, so the build never runs `sharp`. The Studio
measures images on upload; video it cannot measure, so a new video lands on a
1600x900 placeholder until corrected.

That is a real tradeoff, and the failure mode has happened: **replacing a file in
`public/media/` without updating its record leaves the dimensions stale, and nothing
warns.** Eleven of the collages were once re-exported with their transparent padding
trimmed — every one exactly 180px smaller in both axes — and the ratios derived from
the old numbers letterboxed the thumbnails inside their own mats and mis-sized the
gallery's aspect-ratio boxes. `resolveAsset` only rejects a record that is *missing*
width or height, not one that disagrees with the file. So: replace media through the
Studio, or correct the record by hand afterwards. To find drift, compare each
record against the file:

```
python3 -c "
import json
from PIL import Image
for f, a in json.load(open('content/media.json'))['assets'].items():
    if f.lower().endswith(('.webm', '.mp4', '.mov')): continue
    im = Image.open('public/media/' + f)
    if (im.width, im.height) != (a['width'], a['height']):
        print(f, a['width'], a['height'], '->', im.width, im.height)
"
```

Editable from the Studio: selecting a gallery entry, or clicking a CV thumbnail,
opens that asset's entry. That is the supported way to fix a video's dimensions.
Because the record is shared, correcting it fixes every place the file is used.

Not added: `alt`. It belongs here, and CV thumbnails currently render `alt=""`,
but wiring it up changes rendered output and is its own change. The registry is
where it goes when you want it.

### One pool, one description per asset

Media lives in a single flat pool and each file is described exactly once.
`cv.json` and `gallery.json` reference filenames only.

This replaced per-item folders (`public/media/cv/<itemId>/`) for a reason that
had already cost a bug. Two videos existed twice on disk — once under the CV
item, once under the gallery — so each had **two** dimension records, and they
drifted: the awards video was `1920x1080` on the CV side (the 16:9 fallback,
because `sharp` cannot measure video) against a true `1254x704` on the gallery
side. One file, two descriptions, one wrong.

Merging the folders alone would have deduped 6.5 MB of 51.7 MB and left that bug
class alive. The registry retires it: an asset cannot disagree with itself.

The costs, which are real:

- **Deletion needs reference counting.** With per-item folders, deleting an item
  deleted its folder and orphans were impossible. In a pool, a file may only be
  deleted once nothing references it — CV items, the profile photo, gallery
  entries, and poster frames all count, so a thumbnail whose item is deleted
  survives if the gallery still shows it. `planGarbage()` is pure and the route
  writes JSON *before* deleting files, so a rejected write cannot destroy media.
  Detaching a thumbnail from an item is not one of these paths: it drops the
  reference and leaves the file in the pool, to be attached elsewhere.
- **Filename collisions are global**, so uploads check the whole registry.
- **Per-item locality is gone.** The registry is the index now, not the folder
  tree.

Uploading bytes already in the pool resolves to the existing asset instead of
writing a second copy, which is what stops the duplication recurring.

## `content/gallery.json`

```json
{
  "version": 1,
  "items": [
    {
      "id": "poster-series",
      "file": "kairouan-mosque-portrait.webp",
      "title": "Poster series",
      "caption": "Print work for We Are Kairouan.",
      "date": "2025"
    }
  ]
}
```

An **ordered** `items` array; array order is display order. Entries carry only
presentation — which asset, in what order, with what caption:

- `id` is required and **authored**. It used to be derived from the array index
  (`${index}-${file}`), which meant every id changed on reorder.
- `file` references the shared pool and must exist in `media.json`. A missing
  file is skipped with a build warning rather than failing the build.
- `title`, `caption` and `date` are optional. `caption` doubles as the image alt
  text; `date` is a free-form label (`"2025"`, `"March 2026"`).
- Dimensions live in `media.json`, never here. They are required there, not
  measured — `sharp` cannot measure video, so an undeclared video used to fall
  back silently to 16:9 and shift the layout.

An absent or empty `gallery.json` renders a neutral empty state, so the route
always builds. While it has no items, the CV page hides the tab bar entirely
rather than offering an empty tab.

## Write safety

The Studio rewrites whole files, which has a much larger blast radius than a
per-item write, so two guards are required rather than optional:

1. **Atomic write** — write `cv.json.tmp`, then `fs.rename` onto `cv.json`.
   `rename` is atomic within a filesystem, so no reader ever sees a partial file.
2. **Stale-write rejection** — the Studio sends the content hash it loaded; the
   route recomputes it before writing and rejects a mismatch with a 409. The hash
   covers all three content files, so a change to any of them invalidates a
   pending edit. Without this, a tab left open would silently revert the whole CV
   on its next keystroke.

A third behaviour is an optimisation, not a guard: **selective writes** mean only
files whose serialization actually changed are rewritten, so a CV-only edit
leaves `gallery.json` out of the diff.

Media upload still touches the filesystem; only ordering and text live in JSON.

The Studio's API surface is `GET /tree`, `POST /mutate` (a patch on the
document), `POST /media` (upload), `DELETE /media`. Both `profile` and `contact`
are editable panels with no drag handle; `section.create` / `section.delete`
apply to `sections[]` only, and contact cannot be deleted.
