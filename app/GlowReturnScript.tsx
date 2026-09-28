import type { ResolvedCaseStudy } from "./lib/contentTypes";
import { FALLBACK_FOLDER_COLOR } from "./lib/resolveContent";

/**
 * Hands a case study's colour to the CV's glow when the reader has just come back from that study,
 * so the glow can turn from the study's colour back into the site's own. The animation itself is
 * `.topGradientReturn` in `layout.module.css`; this only decides whether it runs and in what colour.
 *
 * **Inline and blocking in `<head>`, for `ThemeScript`'s reason.** The first frame of the CV has to
 * *be* the study's glow, and anything that waits for React has already painted the sweep by the
 * time it runs, which would be the orange-to-rainbow snap this exists to remove.
 *
 * **It decides from `document.referrer`, not from something the study page left behind.** Opening
 * `/` from a study sends the study's URL as the referrer: same-origin requests get the full URL
 * under the site's `strict-origin-when-cross-origin` policy (`public/_headers`). So the study page
 * needs no script and no click handler, and the answer covers every way of leaving a study for the
 * CV: the Back link, a link in the prose, a Cmd-click into a new tab. Two things narrow it:
 *
 * - **Only a `navigate` load counts.** A reload keeps the referrer it was first loaded with, so
 *   without this check, reloading the CV after coming back would replay the return every time.
 *   A history traversal that is not served from the back/forward cache is excluded for the same
 *   reason. One that *is* served from it runs no script at all: the page comes back exactly as it
 *   was left, which was the sweep.
 * - **Only a study with a colour of its own.** The map is built from the same list the cards
 *   render, less anything on the fallback ink, which on the study page keeps the site's sweep and
 *   so has nothing to return from.
 *
 * **It writes a `<style>` element, never an attribute or an inline style on `<html>`.** Either of
 * those is an attribute React did not render, which it reports as a hydration mismatch.
 * `ThemeScript` has to live with that and carries `suppressHydrationWarning` to do so. This has no
 * need to: React 19 skips over unexpected tags in `<head>` while hydrating, so an appended element
 * is simply left alone.
 *
 * `hasOwnProperty` because the lookup key is a pathname, and a referrer of `/constructor` would
 * otherwise find `Object.prototype.constructor`. `try` because `new URL` throws on a referrer it
 * cannot parse and there is nothing to do about that but paint the sweep.
 */
const GlowReturnScript: React.FC<{ studies: ResolvedCaseStudy[] }> = ({ studies }) => {
  const colours = returnColours(studies);
  if (Object.keys(colours).length === 0) return null;

  // Slugs and hex colours are both validated by the loader, so nothing in the map can close the
  // tag. `<` is escaped anyway: this string is written into a `<script>` verbatim.
  const map = JSON.stringify(colours).replace(/</g, "\\u003c");

  return (
    <script
      dangerouslySetInnerHTML={{
        __html:
          `try{var m=${map},r=document.referrer;if(r){` +
          `var u=new URL(r),n=performance.getEntriesByType("navigation")[0],` +
          `k=u.pathname.replace(/^\\/+|\\/+$/g,"").replace(/\\.html$/,"");` +
          `if(u.origin===location.origin&&Object.prototype.hasOwnProperty.call(m,k)&&(!n||n.type==="navigate")){` +
          `var s=document.createElement("style");` +
          `s.textContent=":root{--glow-brand:"+m[k]+";--glow-return:running}";` +
          `document.head.appendChild(s)}}}catch(e){}`,
      }}
    />
  );
};

/**
 * Slug to colour, for every study that has a colour of its own. Exported so the layout can ask the
 * same question before rendering the layer this script drives.
 */
export function returnColours(studies: ResolvedCaseStudy[]): Record<string, string> {
  const colours: Record<string, string> = {};
  for (const study of studies) {
    // The same test `CaseStudy.tsx` makes before drawing a brand layer at all.
    if (study.color !== FALLBACK_FOLDER_COLOR) colours[study.slug] = study.color;
  }
  return colours;
}

export default GlowReturnScript;
