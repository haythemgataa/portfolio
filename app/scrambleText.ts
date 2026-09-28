/**
 * Animates one string into another by cycling random glyphs at each position, settling them left
 * to right. Used by the footer's place, where `(GMT+1)` becomes the actual time there.
 *
 * A plain function rather than a hook: it is driven from event handlers (a pointer arriving, a
 * press) rather than from a render, so there is nothing for a hook to synchronise. It returns its
 * own cancel, which the caller keeps and calls on the next transition and on unmount.
 *
 * Three things about it are deliberate:
 *
 * - **A position whose character is the same at both ends never scrambles.** That is what holds
 *   the parentheses still in `(GMT+1)` → `(17:54)` — a bracket flickering into letters reads as a
 *   rendering fault rather than as an effect — and it costs no special case, because the rule is
 *   stated over the characters rather than over that one string's shape.
 * - **Glyphs re-roll on a probability, not every frame.** At 60fps a 380ms run is ~23 frames, and
 *   a fresh character on every one of them is a strobe rather than a scramble. Each unsettled
 *   position keeps its glyph most frames and swaps on about a third of them.
 * - **It is driven by `requestAnimationFrame` off `performance.now()`**, so the run takes the same
 *   wall-clock time whatever the refresh rate, and a backgrounded tab simply stops mid-way and
 *   resumes — the caller's cancel is what guarantees it never outlives the state it belongs to.
 *
 * The caller is responsible for the two things this cannot know: that the run does not resize its
 * box (see `.locationMuted`, which is monospaced so every glyph in the pool has one advance), and
 * that it is skipped entirely under `prefers-reduced-motion`.
 */

/**
 * Uppercase letters and digits — the two classes the real endpoints are drawn from, so the noise
 * looks like it belongs to the string it is resolving into. Punctuation was in the pool first and
 * read as line noise against a face this restrained.
 */
const POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Quick, as these things go: long enough to read as a resolve, short enough not to be a wait. */
const DURATION_MS = 380;

/** Chance an unsettled position takes a new glyph on any given frame. */
const REROLL = 0.34;

/**
 * The share of the run spent staggering the settle points across the string. The rest is the
 * window any one position can take to land in, which is what keeps the tail from all resolving on
 * the same frame.
 */
const STAGGER = 0.55;

type Frame = (text: string) => void;

/**
 * `onDone` fires once, after the final frame, and only when the run finishes on its own — a
 * cancelled run is silent. It is a real callback rather than the caller sniffing for
 * `frame === to`, because every position can settle a frame or two before `progress` reaches 1
 * and that test would then report "finished" early, while the loop was still running.
 */
export function scrambleText(from: string, to: string, onFrame: Frame, onDone?: () => void): () => void {
  const length = Math.max(from.length, to.length);

  // Where each position stops scrambling, as a fraction of the run. Rolled once up front rather
  // than per frame, so a position cannot settle and then un-settle.
  const settleAt = Array.from(
    { length },
    (_, i) => (i / Math.max(1, length)) * STAGGER + Math.random() * (1 - STAGGER),
  );
  const noise: string[] = Array.from({ length }, () => POOL[(Math.random() * POOL.length) | 0]);

  const started = performance.now();
  let raf = 0;
  let cancelled = false;

  const step = (now: number) => {
    if (cancelled) return;
    const progress = Math.min(1, (now - started) / DURATION_MS);

    let out = '';
    for (let i = 0; i < length; i++) {
      const a = from[i] ?? '';
      const b = to[i] ?? '';
      // Unchanged positions — the brackets, and any digit that happens to match — are never noise.
      if (a === b || progress >= settleAt[i]) {
        out += b;
        continue;
      }
      if (Math.random() < REROLL) noise[i] = POOL[(Math.random() * POOL.length) | 0];
      out += noise[i];
    }
    onFrame(out);

    if (progress < 1) {
      raf = requestAnimationFrame(step);
    } else {
      // Land on the target exactly, rather than trusting every position's settle point to have
      // been passed — a rounding error here would leave a glyph of noise on screen for good.
      onFrame(to);
      onDone?.();
    }
  };

  raf = requestAnimationFrame(step);

  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}
