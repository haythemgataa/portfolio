import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import styles from "./layout.module.css";
import About from "./About";
import ProfileHeader from "./ProfileHeader";
import SiteFooter from "./SiteFooter";
import Tabs from "./Tabs";
import ThemeSwitch from "./ThemeSwitch";
import { loadProfileData } from "./lib/contentLoader";
import { hasGalleryItems } from "./lib/galleryLoader";
import { SITE_URL } from "./lib/site";
import { THEME_STORAGE_KEY } from "./lib/theme";

/**
 * Switzer, self-hosted through `next/font/local` rather than fetched from Fontshare.
 *
 * What it replaces was strictly serial on a cold visit: a DNS lookup and TLS handshake to
 * api.fontshare.com, then a render-blocking stylesheet, and only then the woff2 — from a
 * *second* origin, cdn.fontshare.com, whose URL is not known until that CSS has arrived. Two
 * `preconnect`s overlapped the handshakes with the rest of the document and that was the most
 * they could do; the chain itself is what goes away here. The file now ships from our own origin
 * under `/_next/static/media/`, which `public/_headers` already caches `immutable` for a year,
 * and Next emits a `<link rel="preload">` for it into this same `<head>`.
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
const switzer = localFont({
  src: "./fonts/Switzer-Variable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-switzer",
  adjustFontFallback: false,
  fallback: ["Arial"],
});

/**
 * Whether this build gets the theme switch. Set from the git branch in `next.config.ts` — off on
 * the production branch, on for preview deploys and local dev.
 *
 * `NEXT_PUBLIC_*` is inlined at build time, so this is a literal and both the button and the
 * inline script below are dead code on production: **no markup, no script tag, and no
 * `data-theme` ever set.** Measured on a `CF_PAGES_BRANCH=main` export — zero occurrences of
 * either in `out/`.
 *
 * What it does *not* do is keep `ThemeSwitch.tsx` out of the client bundle. The import above is
 * static, and Next registers every client component in its manifest whether or not a branch
 * renders it, so the code still lands in a shared chunk. Verified rather than assumed. Fighting
 * that is not worth it for a component this size, but the claim is worth stating accurately:
 * the switch cannot *appear* on production, it is simply also not free.
 */
const THEME_SWITCH_ENABLED = process.env.NEXT_PUBLIC_THEME_SWITCH === "true";

export async function generateMetadata(): Promise<Metadata> {
  const cv = await loadProfileData();
  return {
    // The site had no idea what its own origin was. `metadataBase` is what resolves every
    // relative URL the metadata layer emits — canonicals here, and whatever a social card
    // eventually needs — against the real host instead of being dropped or guessed at.
    //
    // Deliberately *not* setting `alternates.canonical` at this level: metadata is inherited,
    // so a canonical here would be handed to every route that does not override it, and
    // /gallery would claim to be a duplicate of /. Each page declares its own.
    metadataBase: new URL(SITE_URL),
    title: cv.profile.displayName,
    description: cv.profile.byline || '',
    // The card's text. Its *image* is deliberately not named here: `app/opengraph-image.png` is
    // a file convention, so Next emits `og:image` and `twitter:image` for this segment along
    // with the type, the real pixel dimensions read off the file, and a cache-busting hash —
    // none of which a hand-written `images` entry would carry. A child that overrides this block
    // loses the image and has to name it again; `/gallery` does, via `OG_IMAGE`.
    openGraph: {
      type: 'website',
      url: '/',
      siteName: cv.profile.displayName,
      title: cv.profile.displayName,
      description: cv.profile.byline || '',
    },
    twitter: {
      card: 'summary_large_image',
      title: cv.profile.displayName,
      description: cv.profile.byline || '',
    },
  };
}

/**
 * The header and tab bar live here rather than in each page so they survive navigation
 * between `/` and `/gallery`. Those are sibling route segments, so anything rendered
 * inside their pages is unmounted and remounted on every switch — which would reset the
 * sticky bar's state and make it impossible to animate the active pill between tabs.
 * Keeping them in the layout also stops the avatar from re-mounting on each switch.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [cv, showGallery] = await Promise.all([
    loadProfileData(),
    hasGalleryItems(),
  ]);

  /* The theme script below writes `data-theme` onto `<html>` before React hydrates, which is the
     entire point of it being inline and blocking — and it is also, unavoidably, a hydration
     mismatch: the server sent no such attribute and React's own render produces none, so React
     reports the DOM it found as wrong. The attribute is *deliberately* not part of the render,
     because there is nothing to render it from on the server — the value lives in the visitor's
     `localStorage` — so the warning has nothing to tell us and no way to be satisfied.
     `suppressHydrationWarning` covers exactly one element's own attributes and text, not its
     subtree, so nothing below is silenced.

     Gated on the same flag as the script rather than set unconditionally: on the production
     branch no script is emitted, nothing mutates this element, and a genuine `<html>` mismatch
     there should still be reported. The suppression is kept as narrow as its cause.

     A plain block comment rather than a JSX one, and that is not a style choice: a JSX comment is
     an expression container, valid only among an element's children, so at the top of a
     `return (` it does not parse. */
  return (
    <html lang="en" className={switzer.variable} suppressHydrationWarning={THEME_SWITCH_ENABLED}>
      <head>
        {/* Applies a stored theme before the first paint, so a forced dark never flashes light on
            the way in. It has to be inline and here — in `<head>`, ahead of the body — because
            anything deferred to React runs after the browser has already painted, which is what
            makes the flash. Blocking is the point.

            Only emitted off the production branch, alongside the button that writes the key. On
            production there is no switch and nothing to restore, so no script tag is emitted at
            all rather than shipping a no-op on every page load.

            `try` because storage throws rather than returning null when it is denied. */}
        {THEME_SWITCH_ENABLED && (
          <script
            // The site is a static export with no user content in this string — it is a constant
            // written here, not interpolated from anything.
            dangerouslySetInnerHTML={{
              __html:
                `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
                `if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`,
            }}
          />
        )}
      </head>
      <body>
        <div className={styles.page}>
          <div
            className={styles.column}
            // Where sticky section headers park. The tab bar is the only thing above them,
            // and it is not rendered at all while the gallery is empty — in which case they
            // belong at the very top instead of below a bar that is not there.
            style={{
              '--sticky-top': showGallery
                ? 'calc(var(--tab-bar-height) + var(--tab-bar-gap-top) + var(--tab-bar-gap-bottom))'
                : '0px',
            } as React.CSSProperties}>
            {/* Drawn in CSS, not loaded. Sized against this column rather than the viewport
                so the glow lands on the content at every browser width, and nested in two
                elements so the horizontal and vertical falloffs multiply without
                `mask-composite`. See `.topGradient` in layout.module.css. */}
            {/* Page grain, under the glow. See `.dotTexture` in layout.module.css. */}
            <div className={styles.dotTexture} aria-hidden="true" />
            <div className={styles.topGradient} aria-hidden="true">
              <div className={styles.topGradientBand} />
            </div>
            {/* The avatar/name/byline block is the *only* thing above the bar, and that is what
                keeps the bar at the same height on both routes: it is sticky and shared, so
                whatever sits above it decides where it rests, and anything route-specific up
                there makes it jump when the tabs are switched.

                About is below the bar for exactly that reason. It is identical on both routes,
                so the layout renders it once here rather than each page carrying a copy. What
                moving it bought is the space *under* the tabs, where content is free to differ
                per route — the CV opens with a gallery teaser that `/gallery` has no business
                showing, and the bar no longer moves because of it. */}
            <ProfileHeader profile={cv.profile} />
            <Tabs showGallery={showGallery} />
            <About about={cv.profile.about} />
            {children}
            {/* Below the bar, so unlike the header it does not have to be identical per route —
                it is here rather than in `Profile.tsx` because it closes the *page*, and the
                gallery would otherwise just stop after its last item. */}
            <SiteFooter location={cv.profile.locationSegments} />
          </div>
        </div>
        {/* Outside `.page` because it is `fixed` and belongs to the session rather than the
            document — inside the column it would be a child of a stacking context and could end
            up under the tab bar. */}
        {THEME_SWITCH_ENABLED && <ThemeSwitch />}
      </body>
    </html>
  );
}
