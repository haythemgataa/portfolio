import type { Metadata } from "next";
import "./globals.css";
import styles from "./layout.module.css";
import About from "./About";
import ProfileHeader from "./ProfileHeader";
import SiteFooter from "./SiteFooter";
import Tabs from "./Tabs";
import ThemeScript from "./ThemeScript";
import ThemeSwitch from "./ThemeSwitch";
import { switzer } from "./lib/font";
import { loadProfileData } from "./lib/contentLoader";
import { hasGalleryItems } from "./lib/galleryLoader";
import { SITE_URL, pageTitle } from "./lib/site";
import { THEME_SWITCH_ENABLED } from "./lib/theme";

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
    // Suffixed on the dev deploy — see `pageTitle`, which is also why the two `title` fields in
    // the card blocks below are left bare.
    title: pageTitle(cv.profile.displayName),
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
            the way in — see ThemeScript.tsx for why it is inline and blocking. It is a component
            rather than a literal here because `global-not-found.tsx` bypasses this layout and has
            to emit the same script itself, and two copies of one string is one copy too many. */}
        <ThemeScript />
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
