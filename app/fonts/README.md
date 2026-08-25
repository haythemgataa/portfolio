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
