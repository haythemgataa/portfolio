#!/usr/bin/env node
/**
 * Traces the name into the SVG paths `app/lib/signature.ts` ships, and is the only thing that
 * ever reads the font it is traced from.
 *
 * **The signature is artwork, not text, and this is what makes that literal.** The face is a
 * commercial script (The Prestige Signature, Sigit Dwipa / Nirmana Visual) subset to the nine
 * glyphs of one name — there is nothing else it could set — so shipping it as a webfont would
 * mean publishing licensed Font Software from a public repo to render one fixed string. Tracing
 * it once buys three things instead: no font bytes on the wire, no second `@font-face`, and a
 * mark that themes with `currentColor` the way `Arrow12.tsx` and `handPaths.ts` already do.
 *
 * It is deliberately wired to no lifecycle hook. Nothing on the site or in the Studio reads the
 * font, so a build, an install and a fresh clone all have everything they need; this runs by
 * hand, on the machine that has the OTF, when the name or the size changes:
 *
 *     node scripts/gen-signature.mjs path/to/ThePrestigeSignature-Subset.otf
 *
 * `opentype.js` is a devDependency for that one command and is never imported by the app.
 *
 * Two decisions here are load-bearing, and both are about how the drawing animates:
 *
 * - **One record per *subpath*, never one per glyph.** SVG restarts a dash pattern at the start
 *   of every subpath, so a `d` holding a letter's outer contour and its counters cannot be
 *   revealed progressively as a whole: every contour in it starts at once, and the reveal jumps.
 *   Split, each element carries exactly one contour and `stroke-dashoffset` means one thing.
 * - **Timing is a share of the total contour length, not a share of the letters.** A fixed beat
 *   per glyph runs the pen slowly through `t` and sprints it through the `H`; measured lengths
 *   let `Signature.module.css` give every stroke a duration proportional to how far the pen
 *   actually travels, which is one hand moving at one speed.
 *
 * Lengths are flattened at 32 samples per curve — the timing is a share of a share, so an error
 * that is uniform across strokes cancels, and 32 puts the residual well under a frame.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import opentype from 'opentype.js';

/** The string traced. Every glyph in it has to exist in the subset — there are exactly nine. */
const TEXT = 'Haythem Gataa';
/** The em size the outlines are baked at, and therefore the size the SVG's user units are in. */
const SIZE = 40;
/**
 * Slack around the ink, in user units. The fill is what paints, so nothing strokes past the ink
 * — this is only so antialiasing at the box edge has somewhere to go. `ProfileHeader` pulls it
 * back out with a negative margin, which is why the number travels with the data.
 */
const PAD = 1.5;
/** Curve flattening resolution, for the length measurement only. */
const SAMPLES = 32;
/**
 * How much of a contour's tail the next one starts inside of.
 *
 * The nib travels the letterform's *contour*, so it runs up one side of a stroke and back down
 * the other, and the return trip reveals nothing the outbound pass has not already covered.
 * Every contour therefore ends in a dead beat of roughly half its length — imperceptible on an
 * `a`, but the `H` is a fifth of the whole signature and its tail read as the pen stopping
 * mid-name. Overlapping is also what a hand does; a pen does not come to rest between letters.
 *
 * **It is scheduled here rather than in CSS because it has to accumulate.** Expressed per stroke
 * as "start a share of the previous span early", the shift does not carry forward: a small
 * contour pulled back into the `G`'s tail finishes early and the one after it, whose own
 * predecessor is now small, barely moves — leaving a hole. Measured, that was a 66ms freeze
 * two thirds of the way through the name. Walking the schedule forward instead makes every
 * stroke start before its predecessor ends *by construction*, so the union of the animations
 * has no gap in it at all.
 */
const OVERLAP = 0.4;
/**
 * The word space, in em — advance only, since the subset carries no space glyph and the loop
 * below refuses `.notdef` for everything else. 0.527 is `.notdef`'s own advance in this file,
 * which is where Fontself parks the space width, and it is the value the traced spacing between
 * "Haythem" and "Gataa" was checked against.
 */
const WORD_SPACE = 0.527;

const fontPath = process.argv[2];
if (!fontPath) {
  console.error('usage: node scripts/gen-signature.mjs <path to ThePrestigeSignature-Subset.otf>');
  process.exit(1);
}

const bytes = readFileSync(fontPath);
const font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

// Lay the string out on the baseline at y = 0, advancing from x = 0. `getPath` bakes the em
// size into the coordinates, so everything below is already in the SVG's user units.
let pen = 0;
const glyphs = [];
const inkBottoms = [];
for (const ch of TEXT) {
  if (ch === ' ') { pen += WORD_SPACE * SIZE; continue; }
  const glyph = font.charToGlyph(ch);
  if (glyph.index === 0) {
    console.error(`the subset has no glyph for ${JSON.stringify(ch)}`);
    process.exit(1);
  }
  const path = glyph.getPath(pen, 0, SIZE);
  if (path.commands.length) glyphs.push(path.commands);
  // Read off the font rather than off the traced curve: a bounding box taken from control
  // points is a superset of the ink, and this one is used to sit text on a line.
  inkBottoms.push(-glyph.getBoundingBox().y1 * (SIZE / font.unitsPerEm));
  pen += (glyph.advanceWidth ?? font.unitsPerEm) * (SIZE / font.unitsPerEm);
}

// One list of commands per subpath, tagged with the glyph it came out of. See the note above
// for why the split has to happen, and `Signature.tsx` for why the glyph has to be remembered:
// the *mask* wants the contours apart and the *fill* wants them back together, because a
// counter is only a hole while it shares a path with the letter it is punched out of.
const subpaths = [];
for (const [glyph, commands] of glyphs.entries()) {
  let current = null;
  for (const command of commands) {
    if (command.type === 'M') { current = { glyph, commands: [command] }; subpaths.push(current); }
    else current.commands.push(command);
  }
}

// The ink's own box, so the SVG is the size of the drawing rather than of the em square — a
// script face's ascender and descender are both enormous and mostly empty.
const box = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
const points = (c) => {
  const p = [];
  if ('x' in c) p.push([c.x, c.y]);
  if ('x1' in c) p.push([c.x1, c.y1]);
  if ('x2' in c) p.push([c.x2, c.y2]);
  return p;
};
for (const { commands } of subpaths) for (const c of commands) for (const [x, y] of points(c)) {
  box.x1 = Math.min(box.x1, x); box.y1 = Math.min(box.y1, y);
  box.x2 = Math.max(box.x2, x); box.y2 = Math.max(box.y2, y);
}
// Control points can sit outside the curve they bend, so this box is a superset of the ink and
// the padding above is a floor rather than an exact figure. That is the safe direction.
const dx = PAD - box.x1;
const dy = PAD - box.y1;

/**
 * Where the writing actually sits, which in this face is nowhere near where the font says.
 *
 * The em box's baseline is the wrong line to put anything on here: the lowercase floats 7.6px
 * above it and the flourishes hang 10-12px below, so text set on it would sit visibly under the
 * word. The *median* glyph bottom is the line the letters are written on — the descenders and
 * the two capitals are outvoted by the eight letters resting on it — and taking the median is
 * what makes that robust to whatever string is traced next.
 */
const sortedBottoms = inkBottoms.slice().sort((a, b) => a - b);
const middle = sortedBottoms.length / 2;
const medianBottom = sortedBottoms.length % 2
  ? sortedBottoms[Math.floor(middle)]
  : (sortedBottoms[middle - 1] + sortedBottoms[middle]) / 2;
const baseline = round(dy + medianBottom, 2);
const width = round(box.x2 - box.x1 + PAD * 2, 2);
const height = round(box.y2 - box.y1 + PAD * 2, 2);

function round(n, places) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const cubicAt = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
};
const quadAt = (p0, p1, p2, t) => {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
};

/** Serialises one subpath into `d` and measures it, in one pass over the commands. */
function trace(commands) {
  let d = '';
  let length = 0;
  let at = [0, 0];
  let opened = [0, 0];
  const n = (v) => round(v, 1);

  for (const c of commands) {
    if (c.type === 'M') {
      at = [c.x + dx, c.y + dy];
      opened = at;
      d += `M${n(at[0])} ${n(at[1])}`;
    } else if (c.type === 'L') {
      const to = [c.x + dx, c.y + dy];
      length += distance(at, to);
      d += `L${n(to[0])} ${n(to[1])}`;
      at = to;
    } else if (c.type === 'C') {
      const c1 = [c.x1 + dx, c.y1 + dy];
      const c2 = [c.x2 + dx, c.y2 + dy];
      const to = [c.x + dx, c.y + dy];
      let previous = at;
      for (let i = 1; i <= SAMPLES; i++) {
        const p = cubicAt(at, c1, c2, to, i / SAMPLES);
        length += distance(previous, p);
        previous = p;
      }
      d += `C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(to[0])} ${n(to[1])}`;
      at = to;
    } else if (c.type === 'Q') {
      const c1 = [c.x1 + dx, c.y1 + dy];
      const to = [c.x + dx, c.y + dy];
      let previous = at;
      for (let i = 1; i <= SAMPLES; i++) {
        const p = quadAt(at, c1, to, i / SAMPLES);
        length += distance(previous, p);
        previous = p;
      }
      d += `Q${n(c1[0])} ${n(c1[1])} ${n(to[0])} ${n(to[1])}`;
      at = to;
    } else if (c.type === 'Z') {
      length += distance(at, opened);
      d += 'Z';
      at = opened;
    }
  }

  return { d, length };
}

const traced = subpaths.map((s) => ({ glyph: s.glyph, ...trace(s.commands) }));
const total = traced.reduce((sum, s) => sum + s.length, 0);

// Walk the pen forward: each contour opens once the one before it is `1 - OVERLAP` done, and
// takes time in proportion to how far the nib travels through it. Then normalise so the last
// stroke lands exactly at 1 and `--signature-duration` is the real length of the whole hand.
const spans = traced.map(({ length }) => length / total);
const opens = [];
let cursor = 0;
spans.forEach((span, i) => {
  opens.push(cursor);
  cursor += i === spans.length - 1 ? span : span * (1 - OVERLAP);
});
const timeline = opens[opens.length - 1] + spans[spans.length - 1];

const strokes = traced.map(({ glyph, d }, i) => ({
  glyph,
  d,
  start: round(opens[i] / timeline, 4),
  span: round(spans[i] / timeline, 4),
}));

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'app', 'lib', 'signature.ts');

writeFileSync(out, `/**
 * The signature, traced from ${JSON.stringify(TEXT)} at ${SIZE}px by \`scripts/gen-signature.mjs\`.
 *
 * **Generated — do not edit.** Re-run the script instead; it is the only thing that reads the
 * font, and the header comment there explains why the outlines are baked in rather than set.
 *
 * \`start\` and \`span\` are fractions of the finished animation's *timeline*, which
 * \`Signature.module.css\` multiplies by one duration. \`span\` is proportional to how far the
 * nib travels through that contour, so the composite is one hand at one speed; \`start\` is not
 * their running sum, because each contour opens before the one before it has finished — see
 * \`OVERLAP\` in the generator. One entry per *subpath*, never per glyph: a dash pattern restarts
 * at each subpath, so a multi-contour \`d\` reveals all of its contours at once.
 *
 * \`glyph\` is which letter the contour came out of, and it is what puts the counters back:
 * winding is a property of a *path*, so an \`e\`'s loop is only a hole while it shares one with
 * the \`e\`. \`Signature.tsx\` groups by it to build the fill and ignores it for the mask.
 */
export const SIGNATURE = {
  /** What it says — the accessible name comes from \`profile.displayName\`, not from here. */
  text: ${JSON.stringify(TEXT)},
  /** The em size the outlines are baked at; the SVG's user units are CSS pixels at this size. */
  size: ${SIZE},
  width: ${width},
  height: ${height},
  /**
   * The line the letters are written on, in user units — the median glyph bottom, not the em
   * box's baseline, which in this face sits well below the word. \`Signature.tsx\` sits the
   * selectable text on it.
   */
  baseline: ${baseline},
  /** Slack around the ink, which \`ProfileHeader\` pulls back out so the ink starts on the column edge. */
  pad: ${PAD},
  strokes: [
${strokes.map((s) => `    { glyph: ${s.glyph}, start: ${s.start}, span: ${s.span}, d: ${JSON.stringify(s.d)} },`).join('\n')}
  ],
} as const;
`);

console.log(`wrote ${out}: ${strokes.length} strokes, ${width}x${height}, ${(traced.reduce((n, s) => n + s.d.length, 0) / 1024).toFixed(1)} KB of path data`);
