# Gallery content

Media for the `/gallery` tab. This directory is independent of the CV sections in
`001-general`, `002-workExperience`, … — nothing here appears on the CV tab, and CV
media does not appear here.

```
public/content/gallery/
  gallery.json   → ordered list of items
  media/         → the image and video files
```

## gallery.json

`items` is an **ordered array — its order is the display order.** To reorder the
gallery, reorder the array. There is no separate sort field.

```json
{
  "items": [
    {
      "file": "study-01.jpg",
      "title": "Motion study",
      "caption": "Exploring easing curves for a card transition.",
      "date": "2026"
    },
    {
      "file": "reel.mp4",
      "title": "Interaction reel",
      "caption": "Micro-interactions from the design system.",
      "date": "March 2026",
      "width": 1920,
      "height": 1080,
      "poster": "reel-poster.jpg"
    }
  ]
}
```

### Fields

| Field     | Required | Notes |
| --------- | -------- | ----- |
| `file`    | yes      | Filename inside `media/`. |
| `title`   | no       | Shown under the media. |
| `caption` | no       | Shown under the title. |
| `date`    | no       | Free-form label, e.g. `"2026"` or `"March 2026"`. |
| `width` / `height` | images: no, **video: yes** | See below. |
| `poster`  | no       | Poster frame filename for video, also in `media/`. |
| `type`    | no       | `"image"` or `"video"`; inferred from the file extension. |

### Dimensions

Image dimensions are measured at build time with `sharp`, so you can omit them.

**Video dimensions must be declared.** `sharp` cannot read video, so an undeclared
video falls back to 16:9 and will render at the wrong aspect ratio, shifting the
layout as it loads. The build prints a warning naming the file if you forget.

### Adding media

1. Drop the file into `media/`.
2. Add an entry to `items` in the position you want it to appear.
3. For video, include `width`, `height`, and ideally a `poster`.

Unlisted files in `media/` are ignored — unlike the CV sections, this directory does
not auto-detect media, so that ordering and captions stay explicit. A listed file that
is missing from `media/` is skipped with a build warning.

### Recommended sizes

Items render in a 540px column, so **1080px wide is enough** for a crisp 2x display.
Larger originals are fine in production (Cloudflare resizes them at the edge) but are
served at full size in `npm run dev`, so keep them reasonable while authoring.
