import type { Metadata } from "next";
import "../globals.css";
import styles from "../layout.module.css";
import StickyFade from "../StickyFade";
import ThemeScript from "../ThemeScript";
import ThemeSwitch from "../ThemeSwitch";
import { switzer } from "../lib/font";
import { SITE_URL } from "../lib/site";
import { THEME_SWITCH_ENABLED } from "../lib/theme";

export const metadata: Metadata = {
  // Declared here rather than inherited, because there is nothing above this to inherit from:
  // this is a **second root layout**, not a child of `(site)`'s. Without it Next falls back to
  // `http://localhost:3000` and bakes that host into every absolute URL the metadata layer emits
  // — the same trap `global-not-found.tsx` documents. No `alternates.canonical` and no `title`:
  // both belong to the individual study, and a title here would be handed to every one of them.
  metadataBase: new URL(SITE_URL),
};

/**
 * A case study's own root layout.
 *
 * **This is a second root layout, reached by putting the routes in `(site)` and `(study)` route
 * groups and deleting `app/layout.tsx`.** It is the only way to give a route a different `<html>`
 * shell in the App Router, and the alternative was worse: the header, tab bar, About and footer
 * live in a layout precisely *because* `/` and `/gallery` are sibling segments under one layout,
 * which is what lets the tab pill animate between them instead of the whole block unmounting on
 * every switch (see the note in `(site)/layout.tsx`). Moving that chrome into the two pages so a
 * third page could opt out of it would break the pill to fix the wrong thing.
 *
 * `(site)` keeps both tabs under one layout, so nothing about that changes. This file renders what
 * a case study actually needs and none of the rest.
 *
 * The cost of a separate root is the same one `global-not-found.tsx` pays, and each piece is
 * **imported rather than restated**, because a second copy is the failure mode:
 *
 * - **the font**, from `lib/font.ts`. Calling `localFont()` again here would emit a second
 *   `@font-face` and an extra stylesheet link onto *every page of the site*.
 * - **`globals.css`**, which is where the tokens, the palette and `p { text-wrap: pretty }` live.
 * - **the pre-paint theme script**, or this would be the one route that ignores a forced theme.
 * - **the glow and the dot texture**, which are `layout.module.css`'s own elements — what makes
 *   this read as this site rather than as a detached document, at the cost of no request.
 *
 * What it deliberately does *not* render is `ProfileHeader`, `Tabs`, `About` and `SiteFooter`.
 * That is the point of the file, not an omission: a case study is a document, and the CV's own
 * introduction and tab bar above it would frame it as a subsection of the CV rather than as the
 * thing you navigated to.
 *
 * **`--sticky-top` is `0px` here, and that is not a detail.** A case study's section titles are
 * the CV's, sticky at that offset — but there is no tab bar above them to clear, so they park at
 * the top of the viewport. The root layout makes exactly the same substitution when the gallery is
 * empty and the bar is not rendered.
 *
 * One consequence worth knowing before adding navigation: **moving between root layouts is a full
 * page load**, not a client-side one. Next's own docs call this out. Here it costs nothing — every
 * route is a static file the CDN already has — but it does mean the `← Back` link and the folder
 * card that leads here are hard navigations whatever primitive they use.
 *
 * `suppressHydrationWarning` rides on the theme-script flag for the reason `(site)/layout.tsx`
 * gives: that script writes an attribute the server never sent, it is the only thing that touches
 * this element, and on the production branch no script is emitted so a genuine mismatch here
 * should still be reported.
 */
export default function CaseStudyLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={switzer.variable} suppressHydrationWarning={THEME_SWITCH_ENABLED}>
      <head>
        <ThemeScript />
      </head>
      <body>
        <div className={styles.page}>
          <div
            className={styles.column}
            style={{ '--sticky-top': '0px' } as React.CSSProperties}
          >
            {/* Grain then glow, the order the root layout uses. Both carry their own z-index, so
                nothing depends on it — but keeping the order identical means one less difference
                to reason about between the two shells. */}
            <div className={styles.dotTexture} aria-hidden="true" />
            <div className={styles.topGradient} aria-hidden="true">
              <div className={styles.topGradientBand} />
            </div>
            {/* The band a section title pins into. On the CV the tab bar carries this; here there
                is no bar, so without it the document scrolls visibly behind a pinned title —
                which is why the titles carry no background of their own on either route. It
                observes its own sentinel, since nothing else on this route needs to know. */}
            <StickyFade />
            {children}
          </div>
        </div>
        {/* Outside `.page` because it is `fixed` and belongs to the session rather than the
            document — inside the column it would be a child of a stacking context. Present so
            both themes can be checked on a case study too; it renders off production only. */}
        {THEME_SWITCH_ENABLED && <ThemeSwitch />}
      </body>
    </html>
  );
}
