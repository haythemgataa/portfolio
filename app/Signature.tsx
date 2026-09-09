import styles from "./Signature.module.css";
import { SIGNATURE } from "./lib/signature";

/**
 * The nib, in user units — the brush that reveals the fill as it travels.
 *
 * 0.22em is what makes the trick work rather than a taste: the outlines are *contours*, so the
 * pen runs up one side of a stroke and back down the other, and a brush centred on that contour
 * has to be wide enough to reach across the stroke on the way out or the letter fills in two
 * passes and reads as a retrace. Measured against the finished mark: at 8.8px the reveal is
 * pixel-identical to a plain filled render, which is the check that nothing is left behind.
 */
const NIB = SIGNATURE.size * 0.22;

/**
 * A hair of extra weight on the letterforms, in user units.
 *
 * The traced outlines are the face at its own weight, and at 40px this script is very fine —
 * the thinnest connectors come out around a pixel. A stroke of `currentColor` on the *filled*
 * paths grows every stem by half this on each side, counters included, so the mark thickens
 * uniformly rather than being scaled up. It is small on purpose: at 1 user unit the stem very
 * nearly doubles, which reads as a different, bolder script.
 *
 * It is inside the masked group, so it is revealed by the pen along with the ink it thickens,
 * and it stays well inside the box's 1.5px of padding.
 */
const WEIGHT = 0.5;

/**
 * The size of the invisible text laid under the mark, as a share of the em the outlines were
 * baked at.
 *
 * It exists so the name can be selected, copied and found on the page — a drawing cannot be any
 * of those, and a name is a thing people reasonably want to take. `textLength` pins its width to
 * the ink's, so the highlight is the width of the signature whatever font actually renders it;
 * this only sets how *tall* the band is. 0.45 covers the body of the writing without reaching
 * the flourishes, which is what a selection over cursive normally looks like — matching the
 * ink's full 49px would drag a block across two lines' worth of empty space above and below the
 * letters.
 */
const SELECTION_SIZE = SIGNATURE.size * 0.45;

/**
 * The fill, one path per glyph rather than one per contour.
 *
 * **This is what makes a counter a hole.** Winding is a property of a path: an `e`'s loop is cut
 * out of the `e` only while the two share one, and the outlines are traced per *subpath* because
 * the mask needs them apart (a dash pattern restarts at each subpath, so a multi-contour `d`
 * reveals all of its contours at once). Split and filled separately, every loop in the signature
 * came out solid — the `e`, the `a`s, the `H` and the `G` all blocked in.
 *
 * Grouped per glyph and not into one path for the whole name, because these letters overlap:
 * script advances are tight and the side bearings are negative. Nonzero winding across the whole
 * string would let one letter's counter punch a hole through its neighbour's stem wherever the
 * two crossed. Per glyph, the font's own winding is all that is in play.
 */
const GLYPH_PATHS = SIGNATURE.strokes.reduce<string[]>((glyphs, stroke) => {
  glyphs[stroke.glyph] = (glyphs[stroke.glyph] ?? '') + stroke.d;
  return glyphs;
}, []);

/**
 * The ids on the mask's contours. Fixed rather than `useId()`: they only have to be unique
 * within a document, this renders once per page from the root layout, and `useId` would drag
 * the whole component across the client boundary for a string.
 */
const ID = 'signature';

type SignatureProps = {
  /** The accessible name — `profile.displayName`, never the traced string. */
  label: string,
};

/**
 * The name, drawn rather than set.
 *
 * The face is a nine-glyph subset of one commercial script, so this was never going to be text:
 * `scripts/gen-signature.mjs` traces it once and `app/lib/signature.ts` ships the outlines. See
 * that script's header for why the font itself is neither committed nor served.
 *
 * The animation is the one spell.sh's Signature component uses, with the two things that make it
 * cost nothing here changed:
 *
 * - **The paths are precomputed, not parsed in the browser.** spell.sh fetches the OTF and runs
 *   `opentype.js` on it at mount, which is ~200 KB of parser plus a font request plus a layout
 *   pass before the first pixel — and a fixed string cannot possibly need any of it. Traced at
 *   build time this is a server component that ships no JavaScript at all.
 * - **It animates in CSS, not framer-motion.** Which is what keeps the *finished* signature the
 *   thing an inert page shows: `animation-fill-mode: both` holds the hidden state before the
 *   delay and the drawn state after it, so with JavaScript off the marks still draw, and under
 *   `prefers-reduced-motion` they are simply there. A motion component would have had to render
 *   its hidden `initial` state into the server payload and wait for hydration to undo it.
 *
 * How it draws: the fill is masked by the same outlines stroked with a fat round nib, and the
 * nib's `stroke-dashoffset` runs 1 → 0. So the ink appears exactly where the pen has reached,
 * and the resting state is the plain filled letterform — no permanent outline over it. spell.sh
 * also lays a hairline over the fill that never fades; at these stroke weights that reads as a
 * different, much bolder face (measured: it very nearly doubles the stem), so it is left out.
 *
 * `currentColor` for the same reason `Arrow12.tsx` uses it: the mark has to be near-black on the
 * light ground and near-white on the dark one, and inline SVG is the only form that can see the
 * page's own colour.
 */
const Signature: React.FC<SignatureProps> = ({ label }) => {
  return (
    <svg
      className={styles.signature}
      viewBox={`0 0 ${SIGNATURE.width} ${SIGNATURE.height}`}
      width={SIGNATURE.width}
      height={SIGNATURE.height}
      // Still `role="img"` with the name on the wrapper, even though there is now real text
      // inside: the role prunes the subtree, so assistive technology reads the name once
      // instead of meeting it twice. Selection, copy and find-in-page are unaffected by role.
      role="img"
      aria-label={label}
      // No `vector-effect`: the box is the drawing's own, so a scaled-down copy scales its
      // strokes with it, where `non-scaling-stroke` would hold the nib at 8.8 device units and
      // over-reveal.
    >
      <defs>
        {SIGNATURE.strokes.map((stroke, i) => (
          // One contour each, for the nib to travel along — never painted directly.
          // `pathLength="1"` is what lets one keyframe drive contours of wildly different
          // lengths: it normalises the dash units, so `stroke-dasharray: 1 2` is always
          // "one whole contour, then more gap than there is path".
          <path key={i} id={`${ID}-${i}`} d={stroke.d} pathLength="1" />
        ))}
        <mask
          id={`${ID}-nib`}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={SIGNATURE.width}
          height={SIGNATURE.height}
        >
          {SIGNATURE.strokes.map((stroke, i) => (
            <use
              key={i}
              href={`#${ID}-${i}`}
              className={styles.nib}
              style={{ '--start': stroke.start, '--span': stroke.span } as React.CSSProperties}
              stroke="#fff"
              strokeWidth={NIB}
              fill="none"
              // Butt, not round. Every contour here is closed, so the two ends meet and there is
              // nothing for a cap to round — while a round cap on a dash of length zero is drawn
              // as a *dot*, which is a stray blob of ink sitting in the mask before its stroke
              // has started. Verified: at rest the whole mark is blank.
              strokeLinecap="butt"
              strokeLinejoin="round"
            />
          ))}
        </mask>
      </defs>
      {/* The name as real text, invisible, and *before* the ink so the two layers land the right
          way round. Selection paints its background and then the text over it, so under the
          drawing the highlight goes behind the letterforms exactly as it would behind glyphs;
          after it, the highlight would cover the signature it is supposed to be highlighting.

          `textLength` with `lengthAdjust="spacingAndGlyphs"` is the whole reason this is SVG
          text rather than an HTML span laid over the box: it pins the run to the ink's exact
          width, so the highlight matches the mark regardless of which font is resolved, and it
          keeps matching while Switzer is still loading and Arial is standing in. An HTML overlay
          would have had to guess a font-size and letter-spacing per face.

          `fill="transparent"` and not `fill="none"`: `none` is unpainted, and an unpainted glyph
          is not hit-testable under the default `visiblePainted`, so there would be nothing to
          start a drag on. */}
      <text
        className={styles.selectable}
        x={SIGNATURE.pad}
        y={SIGNATURE.baseline}
        textLength={SIGNATURE.width - SIGNATURE.pad * 2}
        lengthAdjust="spacingAndGlyphs"
        fontSize={SELECTION_SIZE}
        fill="transparent"
      >
        {label}
      </text>
      {/* The ink. The same outlines the mask strokes, re-joined per glyph so the counters are
          holes — see `GLYPH_PATHS`. The path data therefore appears twice in the markup, which
          costs almost nothing over the wire: it is a byte-identical repeat well inside deflate's
          window, and measured on the export the whole SVG gzips to ~4.6 KB either way.

          `pointer-events: none` so it does not stand between the pointer and the text beneath
          it — the drawing is on top, and a press that landed on a letterform rather than
          between two would otherwise start no selection at all. */}
      <g mask={`url(#${ID}-nib)`} fill="currentColor" pointerEvents="none">
        {GLYPH_PATHS.map((d, i) => (
          <path
            key={i}
            d={d}
            stroke="currentColor"
            strokeWidth={WEIGHT}
            strokeLinejoin="round"
          />
        ))}
      </g>
    </svg>
  );
};

export default Signature;
