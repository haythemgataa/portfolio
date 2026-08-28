import { bellina } from "./lib/font";
import styles from "./SectionNumber.module.css";

/**
 * The ordinal on a section title — `01` beside Work Experience — set in Bellina and fading out
 * as it goes.
 *
 * **The number is derived from position, never authored.** Array order is display order
 * everywhere in this content model, so the ordinal is a fact about where a section already sits
 * rather than a field that could disagree with it. Reordering sections in the Studio renumbers
 * them for free, and there is no way to commit a CV whose numbering skips or repeats.
 *
 * `aria-hidden`, because the numbering is a visual device and the heading beside it is already
 * the section's accessible name. Left exposed it would prepend "01" to every one of them, which
 * is a screen reader announcing the decoration before the thing it decorates.
 *
 * The font's variable class rides on this element rather than being applied up at `<html>`, which
 * keeps the custom property on the same element that reads it — no ancestor in between for the
 * two to be separated by, and no route dressed with a variable it never uses.
 *
 * It does *not* keep the font's preload off `/gallery`, which was the other half of the reason
 * for putting it here and turned out not to hold: Next merges the two routes' client CSS into one
 * chunk and emits the preload from the chunk. See the note on `bellina` in `lib/font.ts`.
 */
const SectionNumber: React.FC<{ index: number }> = ({ index }) => (
  <span aria-hidden="true" className={`${styles.number} ${bellina.variable}`}>
    {String(index + 1).padStart(2, "0")}
  </span>
);

export default SectionNumber;
