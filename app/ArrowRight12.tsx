/**
 * The line arrow that follows a label — "See more in Gallery →", and the case study's "← Back",
 * which is this same path mirrored in CSS rather than a second `d` string.
 *
 * It lives here rather than beside either caller for the reason `handPaths.ts` gives: two
 * components draw the same mark, and a redraw should not mean finding both. It is inline rather
 * than a file for `Arrow12.tsx`'s reason — one monochrome path, and `currentColor` only sees the
 * page's colour when the SVG is part of the document, so a file would mean a `-dark` sibling or a
 * filter plus a request.
 *
 * Stroked, not filled, which is what distinguishes it from `Arrow12` — that one is the little
 * diagonal "opens elsewhere" mark on a heading link, and this one is travel along the page.
 */
const ArrowRight12 = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M2.5 6H9.5M9.5 6L6.5 3M9.5 6L6.5 9"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default ArrowRight12;
