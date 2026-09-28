/**
 * The one renderer behind every drawn mark on the site: the gallery's tag icons, the contact
 * row's platform glyphs, and the ordinal-replacing icon beside a section title.
 *
 * All three families are **duotone** — a 20%-opacity silhouette with a full-strength outline
 * over it — and all three were three copies of the same eleven-line `<svg>` wrapper carrying
 * three copies of the same rationale. This is the `handPaths.ts` move: the shape lives once, and
 * the thing that actually differs between callers (the grid, the colour, the CSS box) is a prop.
 *
 * Why these are inline SVG rather than files in `public/`, stated once so the three records
 * above it do not each have to:
 *
 * - **`currentColor` only sees the page's colour when the SVG is part of the document.** As an
 *   `<img>` every mark that follows the theme would have needed either a `-dark` sibling or a
 *   filter, plus a request apiece for one or two paths. That is the `Arrow12.tsx` rule.
 * - **They are chrome, so `public/media/` would be the wrong home even for the orange ones**,
 *   which do not follow the theme: that pool is reference-counted against `content/media.json`,
 *   and anything in it with no content record reads as an orphan and can be swept.
 *
 * Every record keyed by name is a **closed vocabulary with an honest empty case** rather than a
 * lookup with a generic fallback: an unlisted tag, platform or section key renders no mark, which
 * is what a newly authored one should look like until a mark is drawn for it. Nothing breaks.
 */

export type DuotoneMark = {
  /**
   * The grid the mark was exported on, as one number — every export here is square. Carried per
   * mark rather than assumed per family, because they are not all the same: the tag set is a
   * 14-grid export and `Personal` arrived on a 16 grid. That costs nothing to be right about,
   * since a `viewBox` scales to the CSS box either way — measured, `Personal` at 16 has ink
   * fractions of 0.6875 x 0.8749, identical to the 14-grid mark it replaced, so the two render
   * the same glyph at the same weight. Assuming one grid for the family is what would have
   * silently drawn it 14% large.
   */
  box: number;
  /**
   * The 20%-opacity silhouette behind the outline, as one entry per contour that has to wind on
   * its own. An array rather than one `d` because two of these marks (`DeepPCB`, `Unsplash`)
   * arrived as two separate paths, and joining their subpaths into one is *not* equivalent:
   * under nonzero winding two overlapping contours drawn in opposite directions cancel to a
   * hole. Most marks carry a single entry.
   */
  bg: string[];
  /**
   * The full-strength outline, split for the same reason.
   *
   * **Every layer is a fill, and that is an invariant worth keeping.** `Unsplash` arrived once
   * drawn as two nested *stroked* polygons, which needed a `strokeFg` flag and a second branch in
   * the renderer — filled, those contours are the outline's centrelines and paint as two solid
   * blocks rather than the notch the mark is. It was redrawn as fills and the flag is gone.
   * Nothing in the set declares a `stroke` any more (checked across all 28 source files); if a
   * future export does, redraw it rather than reviving the branch.
   */
  fg: string[];
};

type MarkProps = {
  /** Applied by the caller so the mark can be sized and aligned from CSS. */
  className?: string;
  /**
   * The CSS box, written as the `width`/`height` attributes. Omitted where the caller sizes the
   * element entirely from CSS, which is what the contact pills do.
   */
  size?: number;
};

/**
 * Every mark drawn through here is decorative — a tag's own label sits immediately beside it, a
 * contact pill carries its own accessible name spelling out platform and handle, and a section
 * icon sits next to the heading that is already the section's accessible name. So `aria-hidden`
 * throughout, and no `<title>`: exposed, each would announce the decoration before the thing it
 * decorates.
 *
 * The silhouette is one `<g opacity>` rather than an `opacity` on each path, which is what the
 * exports themselves do and is not interchangeable: with the opacity per path, two overlapping
 * contours composite to 0.36 instead of staying at 0.2.
 */
const DuotoneIcon: React.FC<MarkProps & { mark: DuotoneMark }> = ({ mark, className, size }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox={`0 0 ${mark.box} ${mark.box}`}
    fill="none"
    aria-hidden="true"
    focusable="false"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Index keys: a mark's contours are positional and the array is a literal that never
        reorders, so there is no identity to preserve across renders. */}
    <g opacity="0.2">
      {mark.bg.map((d, index) => (
        <path key={index} d={d} fill="currentColor" />
      ))}
    </g>
    {mark.fg.map((d, index) => (
      <path key={index} d={d} fill="currentColor" />
    ))}
  </svg>
);

export default DuotoneIcon;
