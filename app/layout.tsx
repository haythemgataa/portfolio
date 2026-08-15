import type { Metadata } from "next";
import "./globals.css";
import styles from "./layout.module.css";
import ProfileHeader from "./ProfileHeader";
import SiteFooter from "./SiteFooter";
import Tabs from "./Tabs";
import { loadProfileData } from "./lib/contentLoader";
import { hasGalleryItems } from "./lib/galleryLoader";
import { SITE_URL } from "./lib/site";

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

  return (
    <html lang="en">
      <head>
        {/* The stylesheet below is render-blocking and lives on a third origin, so the first
            paint waits on a DNS lookup, a TLS handshake, the CSS, and only then the font file
            it names — strictly serial, because the font's URL is not known until the CSS
            arrives. `preconnect` overlaps the first two of those with the rest of the document.

            Both hosts are needed and they are different: the CSS comes from api.fontshare.com
            and the woff2 it points at from cdn.fontshare.com, so preconnecting only the one in
            the href leaves the handshake that actually precedes the font unstarted. The font
            fetch is anonymous, hence `crossOrigin` — without it the browser opens a *second*
            connection for the real request and the warmed one goes to waste. */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@1&display=swap" />
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
            {/* About sits with the avatar and byline, above the bar, so it reads as one
                introduction rather than as the CV's first section. It has to live here
                rather than in the CV page for the same reason the header does: the bar is
                sticky and shared, so anything above it must be identical on both routes or
                switching tabs moves the bar. */}
            <ProfileHeader profile={cv.profile} />
            <Tabs showGallery={showGallery} />
            {children}
            {/* Below the bar, so unlike the header it does not have to be identical per route —
                it is here rather than in `Profile.tsx` because it closes the *page*, and the
                gallery would otherwise just stop after its last item. */}
            <SiteFooter />
          </div>
        </div>
      </body>
    </html>
  );
}
