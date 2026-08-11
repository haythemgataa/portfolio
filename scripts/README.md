# Scripts

## `clean-export.mjs`

Runs automatically as part of `npm run build`.

`output: 'export'` requires `generateStaticParams()` to return at least one route,
so `app/[slug]/page.tsx` emits a synthetic `__placeholder__` slug that calls
`notFound()`. The export still writes that page to disk, so this script deletes it
afterwards — otherwise Cloudflare would serve `/__placeholder__` as a real 200 URL.

Once real case studies exist in `content/case-studies/`, the placeholder path is
unused and this becomes a no-op.

## `check-cdn-gate.mjs`

```bash
npm run check:cdn
```

Not part of the build — run it after touching `app/lib/cloudflareImage.ts`,
`next.config.ts`, or anything that renders a thumbnail.

`/cdn-cgi/image/` only exists on Cloudflare's edge, so variant URLs must be
emitted for production-branch Pages builds and for nothing else. Both failure
directions are invisible locally, because `npm run build` passes either way:

| Gate | Symptom |
|---|---|
| stuck on | every thumbnail 404s in dev and on `*.pages.dev` previews |
| stuck off | production serves full-size originals, unresized |

The script runs both builds (~1 min) and asserts each direction. It builds plain
*last*, so a failure never leaves `out/` holding a production-flagged export.
