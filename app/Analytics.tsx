import { IS_PRODUCTION_DEPLOY } from "./lib/site";

/**
 * Simple Analytics — privacy-first page counting, no cookies and no cross-site identifier.
 *
 * **Only on the production branch.** Analytics answers "how is the real site being used", and a
 * dev deploy's traffic is the author's own — counting it does not add a data point, it corrupts
 * the ones that matter. `IS_PRODUCTION_DEPLOY` is a build-time literal, so on every other branch
 * this is not a hidden script tag but no script tag at all. (A local `npm run dev` on `main` would
 * emit it; Simple Analytics ignores `localhost`, so that costs nothing.)
 *
 * A component rather than the raw tag written into two files, for the same reason `ThemeScript` is
 * one: this has to be rendered by both `layout.tsx` (every ordinary route) and
 * `global-not-found.tsx`, which bypasses the layout and inherits nothing from it — the trap the
 * theme script, the font and the favicons already document there. A 404 is a page worth counting,
 * and two copies of one string is one copy too many.
 *
 * Rendering `<script async src>` from a component is safe on React 19: it hoists the element into
 * `<head>` and dedupes by `src`, so it lands once however many times it is rendered.
 *
 * **`data-collect-dnt="true"` is a real choice and not boilerplate**, worth knowing before it is
 * copied anywhere else: it opts *into* counting visitors who have Do Not Track set, which reads
 * like the opposite of the privacy claim above it. The argument for it here is that what is
 * collected is the same either way — no cookie, no identifier, nothing that follows anyone between
 * sites — so honouring DNT would only discard page views, not withhold anything personal. Drop the
 * attribute to exclude them.
 *
 * No `<noscript>` pixel. Simple Analytics offers one, and it is a request charged to readers with
 * JavaScript off in exchange for a count they get nothing from.
 */
const Analytics: React.FC = () => {
  if (!IS_PRODUCTION_DEPLOY) return null;

  return (
    <script data-collect-dnt="true" async src="https://scripts.simpleanalyticscdn.com/latest.js" />
  );
};

export default Analytics;
