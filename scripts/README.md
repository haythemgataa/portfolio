# Scripts

## `clean-export.mjs`

Runs automatically as part of `npm run build`.

`output: 'export'` requires `generateStaticParams()` to return at least one route,
so `app/[slug]/page.tsx` emits a synthetic `__placeholder__` slug that calls
`notFound()`. The export still writes that page to disk, so this script deletes it
afterwards — otherwise Cloudflare would serve `/__placeholder__` as a real 200 URL.

Once real case studies exist in `content/case-studies/`, the placeholder path is
unused and this becomes a no-op.

## `migrate-to-json.ts`

**Already run — kept for provenance, not reuse.** Its input no longer exists.

This produced the current content model, converting the old `NNN-` prefixed
directory tree (`public/content/<NNN-section>/<NNN-item>/item.json` + `media/`)
into `content/cv.json`, `content/gallery.json` and an id-keyed
`public/media/cv/<itemId>/` tree. See [CONTENT-SCHEMA.md](../CONTENT-SCHEMA.md)
for the schema and the reasoning.

```bash
npx tsx scripts/migrate-to-json.ts --dry-run   # print the plan, write nothing
npx tsx scripts/migrate-to-json.ts             # apply
```

What it did, worth knowing if you ever need to audit the result:

- **Preserved rather than dropped.** `title`/`degree`/`name` became `role`, and
  `company`/`school`/`presenter`/`event`/`organization`/`publisher` became `org`,
  keeping structured data that previously existed only denormalized inside
  `heading`. Fields no component read were dropped and reported.
- **Reproduced the old loader's behaviour exactly**, including its media ordering
  (explicit `attachments` first, then a sorted `readdir`) and its dimension
  fallbacks — so the rendered HTML was provably unchanged. Verifying that was the
  acceptance test: build before, build after, diff the rendered DOM.
- **Copied media, never moved it**, so it was re-runnable and the old tree could
  be deleted in a separate reviewable commit.
