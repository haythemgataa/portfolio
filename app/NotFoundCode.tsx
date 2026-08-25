"use client";

import { useLayoutEffect, useRef, useState } from "react";
import FigmaCursor from "./FigmaCursor";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import styles from "./NotFound.module.css";

/** What gets typed. Also the accessible name, and the string the sizer reserves room for. */
const CODE = "404";

/** Milliseconds between characters. Slower than the footer's 95: there are three of them, each
 *  the size of a fist, and at that scale a character landing is an event rather than a tick. */
const CHAR_MS = 165;
/** How long the cursor takes to travel between two points. */
const MOVE_MS = 520;
/** How long the arrow stays compressed. Short — a click is an event, not a gesture. */
const CLICK_MS = 100;
/** A beat before the cursor sets off, and again after it lands before it clicks. */
const LEAD_IN_MS = 300;
const SETTLE_MS = 140;
/** The small gap between the click releasing and the first character. */
const BEAT_MS = 100;
/** Between the last character and the cursor moving on. */
const AFTER_TYPING_MS = 320;
/**
 * The pause after the selection lands, before the cursor leaves. Longer than the other beats on
 * purpose: it is the only moment the finished thing is on screen with nothing moving, so it is
 * what gives the selection time to be read rather than merely appear.
 */
const HOLD_MS = 780;
/** The parting move, slower than the working ones — leaving is not a task being performed. */
const EXIT_MOVE_MS = 700;
/** Matches the opacity transition on `.cursor`, after which there is nothing left to unmount. */
const FADE_MS = 400;

/**
 * The arrow's tip in the SVG's own units — see `FigmaCursor`. The element is positioned by its
 * top-left corner, so every target is offset by this to put the *tip* on it. It has to agree with
 * `.cursorPointer`'s `transform-origin`, which shrinks the arrow into the same point on a click.
 */
const POINTER_HOTSPOT = { x: 6, y: 6.5 };

type Point = { x: number, y: number };

/**
 * The numeral, and the Figma cursor that types it.
 *
 * The choreography is the footer's, with one deliberate difference at the end. `LastUpdated`
 * *clears* its selection on the way out, because a date left selected by a pointer that has walked
 * away reads as stuck. Here the selected state is the design — it is what the page is for — so the
 * cursor leaves it behind and fades out.
 *
 * Three things about how it starts and stops:
 *
 * - **The markup ships finished.** The numeral, the frame and the four handles are all in the
 *   static HTML, so a reader with JavaScript off gets the whole design and a screen reader gets a
 *   real name. The animation is what is layered on top, not what the page depends on.
 * - **`prefers-reduced-motion` skips all of it.** No cursor is mounted at all and the numeral is
 *   complete from the first paint. Not a faster animation — none. Note the preference is read
 *   *twice*, from two sources, and that is deliberate rather than redundant: `matchMedia` decides
 *   whether the sequence arms, because the hook cannot be trusted on the hydrating pass (see the
 *   effect); the hook decides what is rendered, because it is what notices the preference changing
 *   while the page is open.
 * - **It fires once.** There is no observer and no replay: this page is one viewport with nothing
 *   to scroll to, so the sequence simply runs on mount.
 *
 * The reset that empties the box happens in a **layout** effect, not a passive one, so React has
 * re-rendered before the browser paints. That is only half of the fix — the static HTML is painted
 * long before React hydrates at all — and the other half is the blocking script beside the markup
 * in `global-not-found.tsx`, which takes the finished state off the *first* frame. This effect is
 * what hands control back by clearing the attribute that script sets.
 */
const NotFoundCode: React.FC = () => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLHeadingElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  /** Complete on the server and on the hydrating client's first render, so the two agree. */
  const [shown, setShown] = useState(CODE.length);
  /** Figma's selection — the rule and the four handles. Drawn from the start for the same reason. */
  const [selected, setSelected] = useState(true);
  /** Null until the sequence arms, which is also what keeps the cursor out of the export. */
  const [cursor, setCursor] = useState<Point | null>(null);
  const [clicking, setClicking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  /** Per-leg travel time, so the parting move can be slower than the working ones. */
  const [moveMs, setMoveMs] = useState(MOVE_MS);

  /**
   * Derived rather than synced: under reduced motion the numeral is complete whatever the counter
   * says, so there is nothing to write back. That also covers the preference being switched on
   * *during* the animation — the effect below tears its timers down and this renders the finished
   * numeral on the same pass, where assigning state in an effect would take an extra render to
   * settle and trip `set-state-in-effect` on the way.
   */
  const visible = prefersReducedMotion ? CODE.length : shown;
  const isSelected = prefersReducedMotion ? true : selected;
  /**
   * Derived for the same reason, and it is not belt-and-braces. The effect below can only decide
   * *once* whether to arm; this is what un-draws the cursor if the preference turns on afterwards,
   * without an effect writing state back.
   */
  const shownCursor = prefersReducedMotion ? null : cursor;

  useLayoutEffect(() => {
    // The blocking script only sets this when motion is allowed, but clearing it unconditionally
    // is what guarantees the numeral is never left hidden by a state React has since moved past.
    document.documentElement.removeAttribute("data-typing");

    // Read the preference from the media query rather than from the hook, and the difference is
    // not cosmetic. `useSyncExternalStore` hands the *server* snapshot to the hydrating render —
    // deliberately, so the markup matches — so on this first pass the hook still reports "motion
    // allowed" even for a reader who has asked for less. Arming on that and being corrected a tick
    // later empties the box for one painted frame, for precisely the people who asked not to see
    // that. `matchMedia` is authoritative here and now. The hook still drives what is *rendered*,
    // which is what covers the preference changing while the page is open.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const wrap = wrapRef.current;
    const code = codeRef.current;
    if (!wrap || !code) return;

    // Empty the box in the same pass, before the browser paints. The script above has already
    // hidden it, so nothing changes on screen here — this is what makes the hiding permanent
    // rather than a flash of the finished state once React takes the element over.
    setShown(0);
    setSelected(false);

    const timers: number[] = [];
    let typing: ReturnType<typeof setInterval> | undefined;

    /** Points are wrapper-relative, so the cursor's own offsets stay in one coordinate space.
     *  The box never changes size — the sizer reserves the finished width from the first frame —
     *  so these are stable from mount and do not have to be re-measured between legs. */
    const boxAt = () => {
      const w = wrap.getBoundingClientRect();
      const b = code.getBoundingClientRect();
      return {
        left: b.left - w.left,
        right: b.right - w.left,
        top: b.top - w.top,
        bottom: b.bottom - w.top,
      };
    };

    /** Off the lower-left corner, far enough out to read as arriving from somewhere. */
    const startPoint = (): Point => {
      const b = boxAt();
      return { x: b.left - 64, y: b.bottom + 56 };
    };
    /** Inside the frame, near the bottom-left — where you would click to put a caret in a text
     *  layer. The digits type to the *right* of it, so the cursor is never overrun by them. */
    const firstClick = (): Point => {
      const b = boxAt();
      return { x: b.left + 14, y: b.bottom - 16 };
    };
    /** The bottom-right corner: the click that selects the layer rather than entering it. */
    const selectClick = (): Point => {
      const b = boxAt();
      return { x: b.right, y: b.bottom + 8 };
    };
    /** Down and out, past the corner it just selected. */
    const exitPoint = (): Point => {
      const b = boxAt();
      return { x: b.right + 52, y: b.bottom + 64 };
    };

    setCursor(startPoint());

    // Cumulative, so each line reads as "and then, this long later" rather than as an absolute
    // offset that has to be recomputed by hand when a duration changes.
    let elapsed = 0;
    const then = (ms: number, run: () => void) => {
      elapsed += ms;
      timers.push(window.setTimeout(run, elapsed));
    };

    then(LEAD_IN_MS, () => setCursor(firstClick()));
    then(MOVE_MS + SETTLE_MS, () => setClicking(true));
    then(CLICK_MS, () => setClicking(false));
    // A beat between the click releasing and the first character, so the typing reads as a
    // consequence of the click rather than as something already underway during it.
    then(BEAT_MS, () => {
      let typed = 0;
      typing = setInterval(() => {
        typed += 1;
        setShown(typed);
        if (typed >= CODE.length && typing) clearInterval(typing);
      }, CHAR_MS);
    });
    // The typing runs on its own interval, so the next step just waits it out.
    then(CODE.length * CHAR_MS + AFTER_TYPING_MS, () => setCursor(selectClick()));
    // The second click is the one that selects: the handles and rule appear with the press, not
    // after it, because a selection is what the press *did*.
    then(MOVE_MS + SETTLE_MS, () => {
      setClicking(true);
      setSelected(true);
    });
    then(CLICK_MS, () => setClicking(false));
    // The exit. The selection stays — unlike the footer's, it is the finished design rather than
    // a step in the animation — and the cursor simply travels off and fades.
    then(HOLD_MS, () => {
      setMoveMs(EXIT_MOVE_MS);
      setLeaving(true);
      setCursor(exitPoint());
    });
    then(EXIT_MOVE_MS + FADE_MS, () => setCursor(null));

    return () => {
      timers.forEach(t => clearTimeout(t));
      if (typing) clearInterval(typing);
    };
  }, [prefersReducedMotion]);

  return (
    <div className={styles.codeWrap} ref={wrapRef}>
      {/* The typed box is `aria-hidden` — a half-typed numeral is not a fact, and without hiding
          it the 404 would be announced twice — so the real text rides in the sibling below. */}
      <h1 className={styles.code} ref={codeRef}>
        <span className={styles.glyphBox} aria-hidden="true">
          <span className={styles.glyphs}>{CODE.slice(0, visible)}</span>
          {/* Holds the frame open at the finished width from the first frame. See the note in the
              stylesheet: without it the box grows as it types, and because it is centred it grows
              both ways, dragging every point the cursor is aiming at out from under it. */}
          <span className={styles.sizer}>{CODE}</span>
        </span>
        <span className={styles.srOnly}>{CODE}</span>
        {/* Absolutely positioned, so none of this disturbs the box it is drawn around. Four
            separate elements rather than one with corner pseudo-elements, because a box only has
            two of those. */}
        {isSelected ? (
          <span className={styles.chrome} aria-hidden="true">
            <span className={styles.selectionUnderline} />
            <span className={styles.handle} data-corner="top-left" />
            <span className={styles.handle} data-corner="top-right" />
            <span className={styles.handle} data-corner="bottom-left" />
            <span className={styles.handle} data-corner="bottom-right" />
          </span>
        ) : null}
      </h1>

      {shownCursor ? (
        <span
          className={styles.cursor}
          data-clicking={clicking ? "true" : undefined}
          data-leaving={leaving ? "true" : undefined}
          style={
            {
              transform: `translate(${shownCursor.x - POINTER_HOTSPOT.x}px, ${shownCursor.y - POINTER_HOTSPOT.y}px)`,
              // Drives the travel time in the stylesheet, so the parting move can take longer
              // than the working ones without a second transition rule.
              "--cursor-move": `${moveMs}ms`,
            } as React.CSSProperties
          }
          aria-hidden="true"
        >
          <FigmaCursor
            handLayerClassName={styles.cursorHandLayer}
            pointerClassName={styles.cursorPointer}
          />
        </span>
      ) : null}
    </div>
  );
};

export default NotFoundCode;
