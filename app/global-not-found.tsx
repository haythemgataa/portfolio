import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import layout from "./layout.module.css";
import styles from "./NotFound.module.css";
import ThemeScript from "./ThemeScript";
import ThemeSwitch from "./ThemeSwitch";
import { switzer } from "./lib/font";
import { loadProfileData } from "./lib/contentLoader";
import { SITE_URL } from "./lib/site";
import { THEME_SWITCH_ENABLED } from "./lib/theme";

export async function generateMetadata(): Promise<Metadata> {
  const cv = await loadProfileData();
  return {
    // Declared here rather than inherited, because there is nothing to inherit from: this file
    // replaces the root layout rather than rendering inside it, so `layout.tsx`'s `metadataBase`
    // never reaches this route. Without it Next falls back to `http://localhost:3000` and bakes
    // that host into the card tags — a warning at build time and a wrong absolute URL in the
    // export.
    metadataBase: new URL(SITE_URL),
    // The same `X — name` shape `/gallery` uses, rather than a third title format. Left alone the
    // tab would just read the site's name, which is not wrong but says nothing about where you
    // have landed.
    title: `Not found — ${cv.profile.displayName}`,
    // No `robots` entry, and that is checked rather than assumed: Next injects
    // `<meta name="robots" content="noindex">` into this route at build time, so it is already in
    // `out/404.html` even though a static export has no server deciding a status. Declaring one
    // here emitted a *second*, competing robots tag — and `nofollow` on it would have discouraged
    // crawlers from following the one link on the page, which goes home.
    //
    // No `alternates.canonical` either: this page answers for every path that does not exist, so
    // it has no one address to name. Declaring one would point every 404 at a single URL.
  };
}

/**
 * The 404.
 *
 * **It is `global-not-found` rather than `not-found` because of the one requirement everything
 * else here follows from: the whole page has to fit inside the viewport.** `app/not-found.tsx`
 * renders as `children` of the root layout — measured, that leaves 286px of clear space on a
 * 1280x800 window and 134px on a 375px phone, between About and the real footer, with a fixed
 * cost of ~514px of chrome above and below it. A large numeral, a sentence and a button do not go
 * in 134px. `global-not-found` is the only convention that steps outside the layout (verified by
 * build against `output: 'export'`: it emits `out/404.html`, carries none of the layout's chrome,
 * and the page does not scroll), which is why `experimental.globalNotFound` is enabled in
 * `next.config.ts`.
 *
 * The cost of stepping outside the layout is that four things it normally provides have to be
 * named here — and each of them is imported rather than restated, because a second copy is the
 * failure mode:
 *
 * - **the font**, hoisted to `lib/font.ts`. Calling `localFont()` again here would emit a second
 *   `@font-face` and a second stylesheet chunk onto *every page of the site*, not just this one.
 * - **`globals.css`**, which is where the tokens, the palette and `p { text-wrap: pretty }` live.
 * - **the pre-paint theme script**, so a forced theme is honoured here too rather than this being
 *   the one page that ignores it. `suppressHydrationWarning` rides on the same flag for the same
 *   reason as in `layout.tsx`: the script writes an attribute the server never sent.
 * - **the glow and the dot texture**, which are `layout.module.css`'s own elements. They are what
 *   make this read as this site rather than as a generic error screen, and they cost no request.
 *
 * What it does *not* re-create is the header, the tab bar, About or the footer. That is the point
 * of the file, not an omission.
 *
 * Everything here is static: no client component, no state, no effect. The selection chrome is
 * five spans and the way out is a `<Link>`.
 *
 * A note on `notFound()`: with this file present, a `notFound()` thrown inside a route segment
 * still looks for `app/not-found.tsx` and falls back to Next's default UI, which there is none of.
 * Today nothing reaches that path — `[slug]/page.tsx` only throws for the synthetic
 * `__placeholder__` slug, and `scripts/clean-export.mjs` deletes that page after every build. A
 * real case study that calls `notFound()` would need `app/not-found.tsx` adding alongside this.
 */
export default async function GlobalNotFound() {
  return (
    <html
      lang="en"
      className={switzer.variable}
      suppressHydrationWarning={THEME_SWITCH_ENABLED}
    >
      <head>
        <ThemeScript />
      </head>
      <body>
        <main className={styles.page}>
          {/* The site's own glow and grain, borrowed rather than redrawn — see `.decoration`.
              Ordered grain-then-glow to match the root layout, though both carry their own
              z-index and so do not depend on it. */}
          <div className={styles.decoration} aria-hidden="true">
            {/* `.grain` is this file's own, and it caps the texture's fixed 560px height to the
                viewport — without it a short window inherits 560px of document and scrolls. */}
            <div className={`${layout.dotTexture} ${styles.grain}`} />
            <div className={layout.topGradient}>
              <div className={layout.topGradientBand} />
            </div>
          </div>

          <div className={styles.inner}>
            {/* The page's only heading, and unlike the in-layout alternative there is no second
                `<h1>` on screen to compete with it — `ProfileHeader` is not rendered here.
                The four handles and the rule are empty spans: decorative, and contributing
                nothing to the accessible name, which stays exactly "404". */}
            <h1 className={styles.code}>
              404
              <span className={styles.selectionUnderline} />
              <span className={styles.handle} data-corner="top-left" />
              <span className={styles.handle} data-corner="top-right" />
              <span className={styles.handle} data-corner="bottom-left" />
              <span className={styles.handle} data-corner="bottom-right" />
            </h1>

            <p className={styles.line}>
              How did you manage to get lost in a single-page website?
            </p>

            {/* A `<Link>` home, not a `history.back()` button, and that is a correctness choice
                rather than a stylistic one. On a 404 the history is unknowable: a typed URL or a
                fresh tab has none, where `back()` does nothing at all — the silent no-op this
                codebase already has a paragraph about — and where history does exist it usually
                leads off-site, which is the opposite of what this control is for. A link to `/`
                is true in every case, needs no client component, and still works with JavaScript
                off. The label names the destination the way the site's other controls do, and
                matches the tab it lands on. */}
            <Link href="/" className={styles.back}>
              Back to the CV
            </Link>
          </div>
        </main>
        {/* Outside `.page` because it is `fixed` and belongs to the session rather than the
            document. Present here so both themes can be checked on this page too; it renders off
            the production branch only, exactly as in the root layout. */}
        {THEME_SWITCH_ENABLED && <ThemeSwitch />}
      </body>
    </html>
  );
}
