import "../globals.css";
import EdgeGlow from "../EdgeGlow";
import ThemeScript from "../ThemeScript";
import { switzer } from "../lib/font";
import { THEME_SWITCH_ENABLED } from "../lib/theme";

/**
 * The Studio's root layout. It exists because the app has no `app/layout.tsx` any more: the site's
 * routes sit in `(site)` and `(study)` route groups, each with a root layout of its own, and
 * `/studio` is in neither. With no layout above it, Next rendered the Studio with no `<html>` or
 * `<body>` at all and said so in the dev overlay on every load.
 *
 * **A plain `layout.tsx`, not `layout.studio.tsx` like the page and the route handlers, and that
 * is a fix.** It was `.studio.tsx` first, which made it dev-only like everything else here, and it
 * broke `npm run build` on any checkout where `npm run dev` had run. Next writes a type validator
 * for every layout it knows about, and `tsconfig.json` includes the dev server's copy
 * (`.next/dev/types`) as well as the build's. The dev copy checks a `/studio` layout against the
 * global `LayoutProps`, which during a build is declared from the *production* route list, where
 * no such layout existed, so the build failed its type check. Pages and route handlers are checked
 * through local types rather than that global, which is why they can be dev-only and this cannot.
 * A fresh clone, like a Cloudflare deploy, has no `.next/dev` and never saw the error.
 *
 * As a plain file it exists in both route lists and the two agree. It still ships nothing: in
 * production there is no page under it, because `page.studio.tsx` only counts as a page while the
 * Studio's `pageExtensions` are active, and a layout with no page under it has no route to render.
 * Verified: the export has the same nine pages as before and no file or string from the Studio.
 *
 * It carries what the Studio used to receive from the site's root layout, and nothing else:
 *
 * - **`globals.css`**, which holds every token the canvas is drawn with. The Studio never imported
 *   it itself.
 * - **the font's variable class on `<html>`**, which `--default-font` resolves through. Without it
 *   the canvas falls back to Arial and every measurement it is held to against `/` is off.
 * - **the pre-paint theme script**, so a theme forced on the site is the one the canvas shows.
 *   `suppressHydrationWarning` rides on the same flag, for the reason `(site)/layout.tsx` gives.
 * - **the lit-edge driver**, which the Studio sat under on `dev`, so the canvas's hairlines light
 *   the way the site's do.
 *
 * Not the site's chrome. The header, tab bar, About and footer used to render underneath the
 * Studio, covered by its `position: fixed; inset: 0`, and the canvas draws its own copies. Not the
 * theme switch either: it was under the Studio too (its z-index is 30, the Studio's is 100).
 * `metadata` stays in `page.studio.tsx`, which already sets the tab's title.
 */
export default function StudioLayout({
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
        {children}
        <EdgeGlow />
      </body>
    </html>
  );
}
