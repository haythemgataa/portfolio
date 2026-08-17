"use client"

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "./lib/theme";
import styles from "./ThemeSwitch.module.css";

/**
 * The three states, in the order the button cycles them.
 *
 * "system" is first and is the default, because it is what every visitor gets: the switch is a
 * working tool for checking both themes, not a preference the site is asking anyone to set.
 */
const MODES = ["system", "light", "dark"] as const;
type Mode = (typeof MODES)[number];

const LABELS: Record<Mode, string> = {
  system: "Theme: system",
  light: "Theme: light",
  dark: "Theme: dark",
};

/**
 * Sun, moon, and a half-and-half disc for "follow the OS". `currentColor` throughout, so the
 * glyph tracks the button's own colour and needs no theme handling of its own.
 */
const Glyph = ({ mode }: { mode: Mode }) => {
  if (mode === "light") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="3.25" fill="currentColor" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
          <line
            key={deg}
            x1="8" y1="1.5" x2="8" y2="3"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            transform={`rotate(${deg} 8 8)`}
          />
        ))}
      </svg>
    );
  }

  if (mode === "dark") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.75 5.75 0 1 0 7.1 7.1Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 2.75A5.25 5.25 0 0 1 8 13.25Z" fill="currentColor" />
    </svg>
  );
};

/**
 * The stored mode is external state, so it is read through `useSyncExternalStore` rather than
 * copied into `useState` from an effect — which is both what the lint rule asks for and the
 * honest description: `localStorage` is the store, and this component is a view of it.
 *
 * `getSnapshot` returns one of three string literals, so React's referential check is a value
 * comparison and cannot loop. The reads are wrapped because storage *throws* rather than
 * returning null when it is denied (Safari private mode, a blocked third-party context), and a
 * dev-only button is not worth taking the page down over.
 */
const listeners = new Set<() => void>();

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  // `storage` only fires in *other* tabs, so it keeps a second window in step; the local set
  // notifies through `listeners` instead.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
};

const getSnapshot = (): Mode => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
};

/** No storage during the export, and no attribute on `<html>` either — so the server sees system. */
const getServerSnapshot = (): Mode => "system";

/**
 * A dev-only control for forcing the theme, rendered only off the production branch — see
 * `NEXT_PUBLIC_THEME_SWITCH` in `next.config.ts`. The gate is a build-time literal, so on
 * production nothing here renders; the module is still bundled, though, because the layout's
 * `import` is static — see the note beside the flag there.
 *
 * All it does is write `data-theme` onto `<html>`. Every themed value in the codebase is a
 * `light-dark()` resolved against `color-scheme`, and the two `:root[data-theme]` rules in
 * globals.css set that — so one attribute repaints the whole site and there is no second palette
 * to keep in step.
 *
 * Two things worth knowing:
 *
 * - **The attribute is removed rather than set to "system".** `light-dark()` follows
 *   `color-scheme: light dark` from `:root`, which is what an absent attribute leaves in place;
 *   a `data-theme="system"` would need a third CSS rule saying the same thing.
 * - **The page is already correct before this mounts.** The inline script in `layout.tsx` applies
 *   the stored theme in `<head>`, ahead of first paint. This component only catches the *button*
 *   up, which is why hydrating at "system" and correcting a frame later is harmless.
 */
const ThemeSwitch: React.FC = () => {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const cycle = () => {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];

    const root = document.documentElement;
    if (next === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", next);
    }

    try {
      if (next === "system") {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      }
    } catch {
      // Denied storage means the choice lasts for this page only, which is acceptable here.
    }

    // The store has changed; nothing else is watching it in this tab.
    listeners.forEach(notify => notify());
  };

  return (
    <button
      type="button"
      className={styles.switch}
      onClick={cycle}
      // The label carries the current state rather than the next one, and the button is not
      // `aria-pressed`: this is a three-way cycle, not a toggle, so there is no "on" to report.
      aria-label={LABELS[mode]}
      title={LABELS[mode]}
    >
      <Glyph mode={mode} />
    </button>
  );
};

export default ThemeSwitch;
