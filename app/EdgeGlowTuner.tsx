"use client";

import { useState } from "react";
import styles from "./EdgeGlowTuner.module.css";

/**
 * **A temporary knob for the lit edges, and it exists only in `npm run dev`.**
 *
 * Two sliders over the two dials in `globals.css` — the ink's alpha and the light's radius —
 * writing them straight onto `<html>` so the whole page repaints as they move. It prints the
 * declarations to paste back into `globals.css`, which is the point: this is for finding the
 * numbers, not for keeping them. Delete the file and its two lines in `layout.tsx` when the
 * values are settled.
 *
 * `process.env.NODE_ENV` is a build-time literal, so a production build renders nothing at all —
 * verified, no panel markup in `out/index.html`, `out/gallery.html` or `out/404.html`. It does
 * **not** keep this out of the bundle: the layout's `import` is static, so the component and this
 * stylesheet still ship as a few hundred dead bytes, exactly as `ThemeSwitch` already documents
 * for its own branch gate. That is the reason this is a file to delete rather than a flag to
 * leave switched off — and why it is gated on the environment rather than on
 * `THEME_SWITCH_ENABLED`, which marks a tool meant to exist on preview deploys.
 *
 * The values are deliberately *not* persisted. `localStorage` would mean either a hydration
 * mismatch or reading it in an effect, and `set-state-in-effect` is an error in this repo's lint
 * config — a real cost for a throwaway, where Fast Refresh already preserves this component's
 * state across edits to other files.
 */
const INK_DEFAULT = 14;
const RADIUS_DEFAULT = 90;

export default function EdgeGlowTuner() {
  const [ink, setInk] = useState(INK_DEFAULT);
  const [radius, setRadius] = useState(RADIUS_DEFAULT);
  const [open, setOpen] = useState(true);

  if (process.env.NODE_ENV === "production") return null;

  // Written on every change rather than in an effect, for the reason above. The ink is restated
  // in full because it is one value: the `color-mix` is what makes it follow the theme's own
  // overlay ink, so a bare alpha would lose the dark theme.
  const apply = (nextInk: number, nextRadius: number) => {
    const root = document.documentElement;
    root.style.setProperty(
      "--edge-glow-ink",
      `color-mix(in srgb, var(--overlay-ink) ${nextInk}%, transparent)`,
    );
    root.style.setProperty("--edge-glow-radius", `${nextRadius}px`);
  };

  return (
    <div className={styles.panel} data-open={open}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        Edge glow{open ? "" : ` · ${ink}% · ${radius}px`}
      </button>

      {open ? (
        <div className={styles.body}>
          <label className={styles.row}>
            <span className={styles.label}>ink</span>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={ink}
              onChange={(event) => {
                const next = Number(event.target.value);
                setInk(next);
                apply(next, radius);
              }}
            />
            <span className={styles.value}>{ink}%</span>
          </label>

          <label className={styles.row}>
            <span className={styles.label}>radius</span>
            <input
              type="range"
              min={20}
              max={400}
              step={5}
              value={radius}
              onChange={(event) => {
                const next = Number(event.target.value);
                setRadius(next);
                apply(ink, next);
              }}
            />
            <span className={styles.value}>{radius}px</span>
          </label>

          {/* What to paste into `globals.css` once the numbers look right. */}
          <pre className={styles.snippet}>
{`--edge-glow-radius: ${radius}px;
--edge-glow-ink: color-mix(
  in srgb, var(--overlay-ink) ${ink}%, transparent
);`}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
