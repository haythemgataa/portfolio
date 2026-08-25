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
