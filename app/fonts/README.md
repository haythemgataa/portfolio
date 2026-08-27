# Switzer

Variable weight axis, 100–900. Indian Type Foundry, via [Fontshare](https://www.fontshare.com/fonts/switzer).

**`Switzer-Variable.woff2` is not in git** — `.gitignore` covers it and `scripts/fetch-font.mjs`
pulls it on `postinstall`, `predev` and `prebuild`. Nothing to do by hand; `npm run fetch:font`
forces it if you ever need to.

That is a licensing constraint, not a size one. `LICENSE.txt` §01 permits and *recommends*
self-hosting, so serving the file from the site's own origin is fine and always was. §02 forbids
making the font available through a "repository" or "publicly accessible servers", which a public
repo with the binary committed would be.

The file is whatever Fontshare's API currently serves, byte-for-byte, and its SHA-256 is pinned in
the script. It must not be subsetted or format-converted — §02 forbids both, and `next/font` does
neither to a local font: it copies the file and emits the `@font-face`.

Wired up in `app/layout.tsx`. Read the comment there before changing anything about the fallback:
`adjustFontFallback` is off deliberately, measured against these exact bytes.

---

# Bellina Slant Condensed (Numbers)

`Bellina-Numbers.woff2` — 1,688 bytes, the ten digits and nothing else. Used only for the ordinal
on a section title (`app/SectionNumber.tsx`); wired up in `app/lib/font.ts` alongside Switzer.

**This one *is* in git**, which is the opposite of its neighbour and worth knowing before you tidy
the `.gitignore`. Switzer is fetched per checkout because its licence forbids distributing the
binary through a public repository. This is a subset cut by hand from a numbers-only source, so
there is no upstream URL for `scripts/fetch-font.mjs` to pull it from — left ignored, the build
fails on a clean clone while continuing to work on the machine that added the file. The ignore rule
therefore names `Switzer-Variable.woff2` rather than globbing `*.woff2`.

Built with:

    pyftsubset "Bellina Slant Condensed - Numbers.ttf" \
      --unicodes=U+0030-0039 --layout-features='' --no-hinting --desubroutinize \
      --flavor=woff2 --output-file=Bellina-Numbers.woff2

Nothing is lost to those flags, checked rather than assumed: the source has 11 glyphs and no
`fvar`, and its `GPOS`/`GSUB` are present but carry **zero** lookups and zero features — so there
is no kerning between these digits to preserve. Keeping `kern` produces 2,856 bytes for identical
rendering. Hinting goes because the face is only ever set at 28px.

Metrics that other files are measured against, so re-cut with care: `unitsPerEm` 1000,
`sTypoAscender` 986, `sTypoDescender` -250, and a digit ink height of **0.754em** sitting on the
baseline. `SectionNumber.module.css` derives the numeral's offset from the second and third of
those, and `--section-number-headroom` in `globals.css` from the last.

**No licence terms travel with the file.** The source carries no `copyright` (nameID 0),
`license` (13) or `licenseURL` (14) record at all, so nothing here establishes the right to
self-host it or to commit it to a public repository — confirm that against wherever the family was
obtained before this repo is published.
