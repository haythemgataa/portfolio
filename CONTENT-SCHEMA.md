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
    "byline": "Software Designer & Engineer in Tunisia",
    "about": "I'm a detail-oriented Software Designer…",
    "photo": "profile.jpg"
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
          "media": ["instadeep-1.png", "instadeep-2.png"]
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

### Fixed vs. orderable sections

The sections do not all render the same way, and the ones that differ are the
ones whose position is load-bearing for the layout. Rather than let the Studio
drag them anywhere and hope, the document makes position structural:

| Region | Position | Orderable? | Source |
|---|---|---|---|
| Header — photo, name, byline | always first | no | `profile` |
| About | always second | no | `profile.about` |
| Work Experience, Education, Awards, Speaking, … | between | **yes** | `sections[]` |
| Contact | always last | no | `contact` |

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
    "instadeep-1.png": { "width": 2000, "height": 1500 },
    "award-ceremony.mp4": { "width": 1254, "height": 704, "poster": "award-ceremony-poster.jpg" }
  }
}
```

Keyed by filename, so an asset structurally cannot carry two records. Holds only
*intrinsic* facts — dimensions and the poster frame. Presentation (captions,
dates, ordering) stays with the referring entry.

**Dimensions are always authored**, so the build never runs `sharp`. The Studio
measures images on upload; video it cannot measure, so a new video lands on a
1600x900 placeholder until corrected.

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
  entries, and poster frames all count, so a thumbnail removed from the CV
  survives if the gallery still shows it. `planGarbage()` is pure and the route
  writes JSON *before* deleting files, so a rejected write cannot destroy media.
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
      "file": "poster-series.png",
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
