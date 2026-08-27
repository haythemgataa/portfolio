import localFont from "next/font/local";

/**
 * Switzer, self-hosted through `next/font/local` rather than fetched from Fontshare.
 *
 * **It lives here, rather than beside its one caller, because it now has two.** `layout.tsx`
 * dresses every ordinary route; `global-not-found.tsx` bypasses the layout entirely and so has
 * to declare the face itself. Calling `localFont()` twice does not dedupe: the woff2 is still
 * emitted once, but Next generates a *second* `@font-face` rule and a second variable class in
 * their own CSS chunk, which lands as an extra stylesheet `<link>` on every page of the site.
 * Measured, not assumed. One module imported twice gives one of each.
 *
 * What self-hosting replaces was strictly serial on a cold visit: a DNS lookup and TLS handshake
 * to api.fontshare.com, then a render-blocking stylesheet, and only then the woff2 — from a
 * *second* origin, cdn.fontshare.com, whose URL is not known until that CSS has arrived. Two
 * `preconnect`s overlapped the handshakes with the rest of the document and that was the most
 * they could do; the chain itself is what goes away here. The file ships from our own origin
 * under `/_next/static/media/`, which `public/_headers` already caches `immutable` for a year,
 * and Next emits a `<link rel="preload">` for it into the head of every route that uses it.
 *
 * The second half is the layout shift, and the configuration for it is the opposite of the
 * obvious one: `adjustFontFallback` is **off**, which is measured rather than assumed.
 *
 * `display: swap` paints a fallback first and re-measures when the real font arrives. Because
 * `line-height` is an explicit 1.6, line *boxes* never move — so the only thing that can shift
 * this page is a change in advance width rewrapping a paragraph and pushing everything below it
 * down one 22.4px line. Left on, `adjustFontFallback: "Arial"` synthesises a fallback face at
 * `size-adjust: 101.38%`, a figure Next derives from the OS/2 `xAvgCharWidth` ratio — an average
 * over a fixed character set rather than over real text. Measured against this page's own prose
 * the ideal is 99.98% at the font's default weight and 99.38% at the 350 body copy is actually
 * set in, so the applied value overshoots by about two percent. That is enough to do the damage:
 * swapping through it moved 551 elements and grew the document 22px.
 *
 * Plain Arial, unadjusted, moves **one** element by 1.2px and does not change the document height
 * at all — Switzer and Arial are within 0.02% of each other at weight 400. Test faces at 99.38%
 * and 99.7% measured identically to it, so there is no constant here worth carrying and none is:
 * the fallback is named and left alone. Nothing is given up on a platform with no Arial either,
 * since the synthesised face is itself `src: local(Arial)` and fails there the same way. The
 * generic tail behind Arial is not repeated here — `globals.css` declares it once, on `body`.
 *
 * `weight: "100 900"` declares the variable axis, and that is load-bearing rather than
 * descriptive: `--weight-base` and `--weight-emphasis` are 350 and 550, both off the 100s grid,
 * and two rules ask for `calc(var(--weight-base) + 100)`. A static cut would snap all of them to
 * the nearest shipped weight and collapse the pairing.
 */
export const switzer = localFont({
  src: "../fonts/Switzer-Variable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-switzer",
  adjustFontFallback: false,
  fallback: ["Arial"],
});

/**
 * Bellina Slant Condensed, subset to the ten digits and used for nothing but the ordinal on a
 * section title (`SectionNumber.tsx`).
 *
 * **It is a subset because that is all it can be.** The source is a numbers-only cut, 11 glyphs
 * and no `fvar`, so there is nothing here to ration: `pyftsubset --unicodes=U+0030-0039` with
 * hinting and layout features dropped lands at 1,688 bytes, against 2,856 for the same subset
 * with `kern` kept. Keeping it cost nothing to give up — `GPOS` and `GSUB` are both present but
 * carry *zero* lookups and zero features, checked rather than assumed, so there was never any
 * kerning between these digits to lose. Hinting goes for the same reason it is safe to: the face
 * is only ever set at 28px, well past where a `glyf` hinting program earns its bytes.
 *
 * `preload` is left on, and the reason is worth writing down because the obvious reasoning fails.
 * `SectionNumber` scopes the face to the one component that sets it, so it looks as though the
 * preload should follow the numeral onto `/` alone. It does not: Next merges this route's client
 * CSS with the gallery's into a single chunk, both pages link it, and the `<link rel="preload">`
 * is emitted from the chunk rather than from the component. Checked in `out/`, not assumed —
 * `/gallery` carries the preload too, and only the 404 escapes it by being a separate tree.
 *
 * Turning it off would fix that at the cost of the thing it is there for: paired with
 * `display: "block"` the numeral would be invisible until the font was discovered through the
 * stylesheet and fetched. 1,688 bytes on one route that does not need them is the cheaper half of
 * that trade — less than a single CV thumbnail — so it stays.
 *
 * `display: "block"` rather than the `"swap"` Switzer takes, and the difference follows from what
 * the two faces are doing. Swapping body copy trades a moment of Arial for text you can read
 * immediately. Swapping *this* would flash a fallback numeral in an unrelated face into a slot
 * whose whole job is to be the flourish on a heading — the wrong shape is worse than no shape,
 * and being absolutely positioned it can reflow nothing on arrival either way. The block period
 * is close to theoretical here: 1.7 KB, from our own origin, `<link rel="preload">`d by Next into
 * the head of the one route that renders it.
 *
 * `adjustFontFallback` is off for a much duller reason than Switzer's — there is nothing to
 * adjust. The numeral is out of flow, so no metric a synthesised fallback could match can move
 * anything on the page.
 */
export const bellina = localFont({
  src: "../fonts/Bellina-Numbers.woff2",
  weight: "400",
  style: "normal",
  display: "block",
  variable: "--font-bellina",
  adjustFontFallback: false,
  fallback: ["Georgia", "serif"],
});
