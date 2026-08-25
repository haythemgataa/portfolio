import { THEME_STORAGE_KEY, THEME_SWITCH_ENABLED } from "./lib/theme";

/**
 * Applies a stored theme to `<html>` before the first paint.
 *
 * It has to be inline and blocking, and it has to sit in `<head>` ahead of the body: anything
 * deferred to React runs after the browser has already painted, which *is* the flash. Blocking
 * is the point, and it is why this is a raw `<script>` rather than a component with an effect.
 *
 * Rendered by both `layout.tsx` (every ordinary route) and `global-not-found.tsx` (which bypasses
 * the layout, so it would otherwise have no theme at all). One module rather than two copies of
 * the same string: the script and `ThemeSwitch.tsx` have to agree on the storage key and on the
 * two accepted values, and a divergence between them fails silently as "the switch stopped
 * working on that one page".
 *
 * Only emitted off the production branch, alongside the button that writes the key. On production
 * there is no switch and nothing to restore, so no script tag is emitted at all rather than
 * shipping a no-op on every page load.
 *
 * `try` because storage throws rather than returning null when it is denied.
 *
 * **Its caller must carry `suppressHydrationWarning` on `<html>`, gated on the same flag** — see
 * the note at the `<html>` element in `layout.tsx`. This script writes an attribute the server
 * never sent and no render produces, which React correctly reports as a mismatch it has no way to
 * satisfy.
 */
const ThemeScript: React.FC = () => {
  if (!THEME_SWITCH_ENABLED) return null;

  return (
    <script
      // The site is a static export with no user content in this string — it is a constant
      // written here, not interpolated from anything.
      dangerouslySetInnerHTML={{
        __html:
          `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
          `if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`,
      }}
    />
  );
};

export default ThemeScript;
