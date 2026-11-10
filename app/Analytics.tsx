import { IS_PRODUCTION_DEPLOY } from "./lib/site";

/**
 * Umami, self-hosted — privacy-first page counting, no cookies and no cross-site identifier.
 *
 * **Only on the production branch.** Analytics answers "how is the real site being used", and a
 * dev deploy's traffic is the author's own — counting it does not add a data point, it corrupts
 * the ones that matter. `IS_PRODUCTION_DEPLOY` is a build-time literal, so on every other branch
 * this is not a hidden script tag but no script tag at all.
 *
 * **`data-domains` is what keeps a local `npm run dev` on `main` out of the numbers.** That build
 * is production as far as the branch gate knows, so it emits the tag. Simple Analytics, which this
 * replaced, ignored `localhost` on its own; Umami's tracker has no such rule and counts whatever
 * host it runs on unless that host is missing from this list. `www` is listed because it serves the
 * same build.
 *
 * **The host has to be public and HTTPS, and nothing fails loudly when it is not.** The tracker
 * posts to `/api/send` on whatever origin its own `src` names. An `http://` src is mixed content on
 * this HTTPS site and is blocked before any request; a tailnet-only name does not resolve for a
 * visitor. Either way the page renders exactly as before and nothing is counted.
 *
 * A component rather than the raw tag written into three files, for the same reason `ThemeScript`
 * is one: both root layouts render it, and so does `global-not-found.tsx`, which bypasses them and
 * inherits nothing — the trap the theme script, the font and the favicons already document there.
 * A 404 is a page worth counting. It is `defer`, as Umami ships it, and React 19 hoists and dedupes
 * only `async` scripts — which is why every caller renders this inside `<head>` itself, once.
 *
 * **No `data-do-not-track`**, so visitors with Do Not Track set are counted — the choice the
 * Simple Analytics tag made with `data-collect-dnt`, kept. The argument is that what is collected
 * is the same either way, no cookie and no identifier, so honouring DNT would only discard page
 * views, not withhold anything personal. Add `data-do-not-track="true"` to exclude them.
 *
 * **Umami's `recorder.js` is deliberately not loaded.** It is rrweb session replay plus heatmaps,
 * and that is the line between needing no banner and needing one: the CNIL's audience-measurement
 * exemption requires session-replay features to be off. See CLAUDE.md before adding it.
 */
const Analytics: React.FC = () => {
  if (!IS_PRODUCTION_DEPLOY) return null;

  return (
    <script
      defer
      src="https://stats.haythem.cv/script.js"
      data-website-id="28ca7101-65e1-4ba6-b791-460ecc52a8c3"
      data-domains="haythem.cv,www.haythem.cv"
    />
  );
};

export default Analytics;
