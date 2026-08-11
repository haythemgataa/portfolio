# Content schema proposal — single-JSON content model

Status: proposal, decisions settled. Supersedes the `NNN-` directory-per-item
structure read by `app/lib/contentLoader.ts`.

## Goals

1. **Ordering without filesystem renames.** Order becomes an array index.
2. **One authoritative media list per item.** No implicit auto-detect fallback.
3. **A written, typed schema** — the way `app/lib/galleryTypes.ts` already is.
4. **Atomic writes**, so the Studio cannot leave a half-renamed tree behind.
5. **Drop dead fields** that no component reads.
6. **Layout-critical sections cannot be misordered** — enforced by the shape of
   the document, not by a convention the Studio has to remember.

## Explicit non-goals

- **This does not improve SEO.** Content JSON is build-time input read with Node
  `fs` and baked into prerendered HTML. No client code fetches it
  (`grep -rn "fetch(.*content" app` returns nothing outside the Studio), so a
  crawler receives identical HTML either way.
- **This does not improve runtime network cost**, for the same reason. It does
  stop shipping 27 never-requested JSON files to the CDN, but that is a
  side effect of moving them out of `public/`, not of the restructure.

The one genuine SEO tie-in is *enabling*, not automatic: keeping `role` and `org`
as structured fields (rather than only the denormalized `heading` string) is what
would later allow a JSON-LD `Person` / `worksFor` graph. There is currently no
JSON-LD, sitemap, or robots route in the app at all.

## Audit of the current data

25 items across 9 sections, 30 CV media files, 10 gallery media files.

Fields present in `item.json`, against what the merged components actually read:

| Field | Present | Non-empty | Read by a component? |
|---|---|---|---|
| `id` | 25 | 25 | yes — React keys |
| `url` | 25 | 14 | yes |
| `year` | 20 | 20 | yes |
| `heading` | 20 | 20 | yes |
| `description` | 20 | 11 | yes |
| `attachments` | 19 | 11 | yes |
| `location` | 14 | 14 | yes |
| `platform` / `handle` | 5 / 5 | 5 / 5 | yes — contact rows only |
| `collaborators` | 20 | **0** | **no** |
| `type` | 20 | 20 | **no** — duplicates the section |
| `title` | 17 | 17 | **no** |
| `organization` | 5 | 5 | **no** |
| `company` | 4 | 4 | **no** |
| `event` | 4 | 4 | **no** |
| `presenter` | 3 | 3 | **no** |
| `degree` / `school` | 2 / 2 | 2 / 2 | **no** |
| `publisher` | 2 | 1 | **no** |
| `name` | 1 | 1 | **no** |

`collaborators` is present on 20 items and empty on all 20 — pure dead weight.
The rest are leftovers from the original directory-tree migration; their information is
already denormalized into `heading` (`"Product designer at InstaDeep"` =
`title` + `company`).

Only **four** `general.json` fields are read anywhere in the app —
`profilePhoto`, `displayName`, `byline`, `about`:

```
$ grep -rhoE "general\.[a-zA-Z]+" app --include="*.tsx" | sort -u
general.about
general.byline
general.displayName
general.profilePhoto
```

`username`, `profession`, `location`, `pronouns`, `buttonLabel` (`"Download CV"`)
and `status` (`{text, emoji, timestamp}`) are all unread. **Ruled droppable.**

### The section keys are dead too

`SECTION_MAP` maps directory names to JSON keys (`speaking` → `talks`) and
`loadProfileData()` spreads them onto its return value. **Nothing reads them.**
The only consumers of the loader output are:

| Consumer | Reads |
|---|---|
| `layout.tsx` | `cv.general.displayName`, `cv.general.byline`, `cv.general` → `ProfileHeader` |
| `Profile.tsx` | `cv.general.about`, `cv.allCollections` |
| `gallery/page.tsx` | `cv.general.displayName` |

No `cv.workExperience`, no `cv.talks`, anywhere. So the entire `jsonKey` half of
`SECTION_MAP` and the `...sections` spread in the return object can be deleted
outright rather than ported.

## Two problems this also fixes

Both found while auditing, both worth designing out rather than porting:

1. **`Profile.tsx` branches on the display label** — twice:
   ```tsx
   <div className={collection.name === "Contact" ? styles.contacts : styles.experiences}>
   ...
   if (collection.name === "Contact") { return <ContactItem .../> }
   ```
   Renaming that section to "Get in touch" silently breaks the contact layout.
   Hoisting contact out of the orderable list (below) removes the branch entirely
   rather than replacing it with a `kind` discriminator.

2. **`galleryLoader.ts` derives ids from array position** —
   `id: \`${index}-${entry.file}\`` — so every id changes when you reorder.
   Ids should be authored and stable.

## Proposed file layout

```
content/                      # build-time input, NOT served
  cv.json                     # sections, items, order
  gallery.json                # gallery entries and captions
  media.json                  # per-asset facts, keyed by filename
  case-studies/<slug>.md      # markdown stays as files
public/media/<file>           # ONE flat pool, shared by both tabs
```

Two files, not one: the CV is sections → items → media, the gallery is a flat
media list. They share conventions (media entry shape, stored dimensions) via a
common types module, not a common schema. Two files also keep a bad write from
taking out both.

Content JSON moves out of `public/` because it is compiler input, not a static
asset. Media must stay under `public/`.

## One media pool, one description per asset

Media lives in a single flat pool and each file is described exactly once, in
`content/media.json`. `cv.json` and `gallery.json` reference filenames only.

This replaced per-item folders (`public/media/cv/<itemId>/`) for a reason that
had already cost us a bug. Two videos existed twice on disk — once under the CV
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
  entries, and poster frames all count. `planGarbage()` computes this without
  touching disk, and the route writes the JSON *before* deleting files, so a
  rejected write can never destroy media.
- **Filename collisions are global**, so uploads check the whole registry.
- **Per-item locality is gone.** The registry is the index now, not the folder
  tree.

Uploading bytes already in the pool resolves to the existing asset instead of
writing a second copy, which is what stops the duplication recurring.

Item `id` must still be **unique across the whole document** — it is no longer a
folder name, but it is still a React key and the Studio's addressing scheme. The
loader fails the build on a duplicate.

## Fixed vs. orderable sections

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
every entry renders identically (`year` gutter + heading + location + description
+ attachments). That is what makes reordering safe: there is no entry in the
array that needs different CSS.

Two consequences worth stating:

- **No `kind` discriminator is needed.** An earlier draft gave each section a
  `kind: "timeline" | "contact"`. Hoisting contact to its own key makes the array
  homogeneous by construction, so the field disappears — a flag that can be wrong
  is replaced by a shape that cannot.
- **Contact's *items* are still orderable**, and its heading is still editable
  via `contact.label`. Only the section's position is pinned.

## `content/cv.json`

```json
{
  "version": 1,
  "profile": {
    "displayName": "Haythem Gataa",
    "byline": "Software Designer & Engineer in Tunisia",
    "about": "I'm a detail-oriented Software Designer…",
    "photo": "profilePhoto.jpg"
  },
  "sections": [
    {
      "key": "workExperience",
      "label": "Work Experience",
      "items": [
        {
          "id": "product-designer-at-instadeep",
          "year": "2023 — Now",
          "heading": "Product designer at InstaDeep",
          "role": "Product designer",
          "org": "InstaDeep",
          "url": "https://instadeep.com",
          "location": "Tunis, Tunisia",
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

- **Array order is display order.** No numeric prefixes anywhere.
- `profile` is pinned first, `contact` pinned last; neither lives in `sections[]`.
- `sections[]` is homogeneous — every entry is timeline-shaped.
- `key` is stable and machine-facing; it replaces `SECTION_MAP`, so adding a
  section needs no code change. `label` is free text and safe to rename.
- `id` is stable and **globally unique**. It names nothing on disk, but it is a
  React key and the Studio's addressing scheme.
- `role` / `org` are optional. They carry no rendering weight today — `heading`
  is what renders — but they are the hook for future JSON-LD.
- `item.media` is a **list of filenames** into the pool; array order is display
  order. Dimensions live in `media.json`, so the build skips `sharp` entirely.
- Media `type` stays **inferred from the extension** — storing it would be a
  second source of truth that can drift, which is the same mistake in miniature.
- Omit optional fields rather than writing `""`.

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

Not added: `alt`. It belongs here, and CV thumbnails currently render `alt=""`,
but wiring it up changes rendered output and is its own change. The registry is
where it goes when you want it.

## `content/gallery.json`

Entries carry only presentation — which asset, in what order, with what caption:

- A required, authored `id`, replacing the index-derived one (`${index}-${file}`
  changed every id on reorder).
- `file` references the shared pool.
- `width`/`height`/`poster` are **gone** — they live in `media.json` now.

## Studio impact

Deleted from `app/studio/lib/content-fs.ts` (roughly 120 of ~430 lines):

- `renumber()`, the two-phase scratch rename, and its rollback
- `reorderSections()`'s splice-around-hidden-directories logic
- `splitPrefix` / `pad` / prefix parsing
- directory slug-collision handling for create and rename
- section create/rename/delete as `mkdir` / `rename` / `rm`
- `syncAttachments()` and the implicit auto-detect fallback

Replaced by: read `cv.json` → mutate in memory → write atomically. `item.rename`
disappears (renaming edits a string). `section.reorder` and `item.reorder` become
one array splice each.

The UI gains a small distinction: `profile` and `contact` are editable panels
with **no drag handle**, and the reorder list covers `sections[]` only. The
`section.create` / `section.delete` operations apply only to `sections[]`;
contact cannot be deleted.

The API surface shrinks to roughly: `GET /tree`, `POST /mutate` (a JSON patch on
the document), `POST /media` (upload), `DELETE /media`.

### Write safety

A whole-file rewrite has a much larger blast radius than a per-item write, so
two guards are required, not optional:

1. **Atomic write** — write `cv.json.tmp`, then `fs.rename` onto `cv.json`.
   `rename` is atomic within a filesystem, so no reader ever sees a partial file.
2. **Stale-write rejection** — the Studio sends the content hash it loaded; the
   route recomputes it before writing and rejects a mismatch with "reload and
   retry". Without this, a stale tab silently reverts the whole CV.

Media upload still touches the filesystem; only ordering and text move into JSON.

## Migration

Two scripts ran, in order. Both copied rather than moved, so each old layout
could be deleted in its own reviewable commit.

### 1. `scripts/migrate-to-json.ts` — directory tree to JSON

Historical: this produced the per-item media layout that step 2 then replaced.
With `--dry-run`:

1. Walk the existing tree via the current loader logic.
2. Emit `content/cv.json`, preserving current order as array order, hoisting
   `009-contact` into the top-level `contact` key.
3. Emit `content/gallery.json` with authored ids.
4. Move media: `public/content/<NNN-section>/<NNN-item>/media/*` →
   `public/media/cv/<itemId>/*`; gallery media → `public/media/gallery/`.
5. Measure each image once with `sharp` and write `width`/`height` into the JSON.
   Videos keep any declared dimensions and are reported if undeclared.
6. Drop the dead fields listed above; report anything unrecognized rather than
   discarding it silently.
7. Verify `id` uniqueness across the whole document and fail loudly on a clash.
8. Leave the old tree in place — deletion is a separate, reviewable commit.

### 2. `scripts/migrate-media-pool.ts` — per-item folders to one pool

With `--dry-run`:

1. Hash every referenced file and collapse identical bytes to one asset. Two
   videos were duplicated between the CV and the gallery.
2. Assign short names — `org` (falling back to `heading`) plus an index, so
   `Product-designer-at-InstaDeep-1.png` became `instadeep-1.png`. Gallery names
   are registered first, so the shorter existing name wins for shared assets.
3. Measure anything whose dimensions were not recorded — the poster frame and the
   avatar — rather than writing a placeholder.
4. Where two records for one file disagreed, keep the one that is not a known
   fallback (`1920x1080`, `1600x900`) and report it.
5. Emit `content/media.json`; rewrite `cv.json` media as filename lists and strip
   `width`/`height`/`poster` from `gallery.json`.

Verified by deriving the exact old→new URL map from the two content snapshots,
rewriting the previous build's HTML with it, and diffing: 40 mappings, no
ordering changes, and the rendered DOM identical apart from a build-hash chunk
name.

### Acceptance test

Build before and after, then diff the rendered HTML:

```bash
npm run build && cp -R out /tmp/out-before
# run migration + loader rewrite
npm run build && diff -r /tmp/out-before out
```

Only media URLs should differ. Any other change in `out/index.html` is a
migration bug. This makes losslessness provable rather than asserted.

## Loader changes

`contentLoader.ts` collapses to: read one file, validate, resolve media URLs.
`readdir`, prefix sorting, `SECTION_MAP`, `generateItemId`, `detectAttachments`,
`getImageDimensions` and the dead `...sections` spread all go.

The return shape changes from `{ general, ...sections, allCollections }` to
`{ profile, sections, contact }`. That touches four call sites — `layout.tsx`,
`page.tsx`, `Profile.tsx`, `gallery/page.tsx` — all of which currently read
`cv.general.*`. `Profile.tsx` renders `sections.map(...)` and then a `<Contact>`
block, which is what lets both `collection.name === "Contact"` checks die.

## Decisions settled

1. **Two files, not one** — CV and gallery keep separate schemas.
2. **One flat media pool plus a `media.json` registry**, superseding the original
   per-item-folder decision — see "One media pool" above for why it changed.
3. **Case studies stay as `.md` files**, not strings in JSON.
4. **`role` / `org` retained** as optional structured fields for future JSON-LD.
5. **`buttonLabel`, `status`, and the rest of the unread `general` fields are
   dropped**, along with every dead `item.json` field in the audit table.
6. **Profile pinned top, contact pinned bottom, `sections[]` orderable and
   homogeneous** — no `kind` discriminator.
