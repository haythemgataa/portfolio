import type { Metadata } from "next";
import "./globals.css";
import layout from "./layout.module.css";
import styles from "./NotFound.module.css";
import NotFoundCode from "./NotFoundCode";
import ThemeScript from "./ThemeScript";
import ThemeSwitch from "./ThemeSwitch";
import { switzer } from "./lib/font";
import { loadProfileData } from "./lib/contentLoader";
import { SITE_URL } from "./lib/site";
import { THEME_SWITCH_ENABLED } from "./lib/theme";

/**
 * Takes the finished numeral off the *first* frame, so the typing animation has something to
 * start from.
 *
 * The markup ships complete and selected — that is what a reader with JavaScript off should get,
 * and what a crawler should read. But static HTML paints long before React hydrates, so emptying
 * the box from an effect would show the finished 404 for a few frames and then blank it, which
 * reads as a fault rather than as an animation. The same argument the theme script is built on:
 * anything deferred to React runs after the browser has already painted, and that *is* the flash.
 *
 * So this runs synchronously, parsed immediately after the numeral, and sets one attribute that
 * two rules in `NotFound.module.css` key off. `NotFoundCode` clears it in a layout effect.
 *
 * Three things it deliberately does:
 *
 * - **It checks `prefers-reduced-motion` itself.** The attribute is never set for a reader who
 *   has asked for less motion, so they get the finished numeral with no hiding and no restoring.
 * - **It arms a timeout to undo itself.** If React never arrives — the bundle fails, an extension
 *   blocks it — nothing would otherwise clear the attribute and the numeral would stay hidden on
 *   a page whose whole job is to say 404. After two seconds it puts it back. When React does
 *   arrive it has already cleared the attribute, so this finds nothing to do.
 * - **`try`/`catch`**, because `matchMedia` is absent in some embedded webviews and a throw here
 *   would take the rest of the inline script with it.
 */
const TYPING_SCRIPT =
  `try{if(!matchMedia("(prefers-reduced-motion: reduce)").matches){` +
  `var e=document.documentElement;e.setAttribute("data-typing","");` +
  `setTimeout(function(){e.removeAttribute("data-typing")},2000)}}catch(e){}`;

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
 *   the one page that ignores it.
 * - **the glow and the dot texture**, which are `layout.module.css`'s own elements. They are what
 *   make this read as this site rather than as a generic error screen, and they cost no request.
 *
 * What it does *not* re-create is the header, the tab bar, About or the footer. That is the point
 * of the file, not an omission.
 *
 * **`suppressHydrationWarning` is unconditional here, where `layout.tsx` gates it on the theme
 * flag.** Two scripts write to this `<html>` before React hydrates — the theme script, which only
 * exists off the production branch, and `TYPING_SCRIPT`, which exists on every branch. So unlike
 * the layout there is no build in which this element is left untouched, and gating it would report
 * a mismatch that no change to the render could satisfy. It still covers only this element's own
 * attributes, never its subtree.
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
      suppressHydrationWarning
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
                `<h1>` on screen to compete with it — `ProfileHeader` is not rendered here. */}
            <NotFoundCode />
            {/* Immediately after the numeral, so it runs while the parser is still inside this
                subtree and before anything has been painted. See `TYPING_SCRIPT`. */}
            <script dangerouslySetInnerHTML={{ __html: TYPING_SCRIPT }} />

            <p className={styles.line}>
              How did you manage to get lost in a single-page website?
            </p>

            {/* **A plain `<a>`, not `next/link`, and that is a fix rather than a preference.**
                This page replaces the root layout instead of rendering inside it, so the client
                router has no app tree here to reconcile a new route into. A `<Link>` still
                intercepted the press and pushed `/` into the address bar, then aborted the
                navigation — leaving the 404 on screen at the site's own URL, which is worse than
                doing nothing. Reproduced from a real 404 URL and from `/404.html` alike.
                A full document load is also the honest thing from a standalone page: `/` is a
                static file the CDN already has.

                It is a link home rather than a `history.back()` button for a separate reason. On
                a 404 the history is unknowable: a typed URL or a fresh tab has none, where
                `back()` does nothing at all — the silent no-op this codebase already has a
                paragraph about — and where history does exist it usually leads off-site, which is
                the opposite of what this control is for. A link to `/` is true in every case and
                still works with JavaScript off. The label names the destination the way the
                site's other controls do, and matches the tab it lands on. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className={styles.back}>
              Back to the CV
            </a>
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
