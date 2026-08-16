"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import FigmaCursor from "./FigmaCursor";
import styles from "./SiteFooter.module.css";

/** Milliseconds between characters. */
const CHAR_MS = 95;
/** How long the cursor takes to travel between two points. */
const MOVE_MS = 520;
/** How long the arrow stays compressed. Short — a click is an event, not a gesture. */
const CLICK_MS = 100;
/** A beat before the cursor sets off, and again after it lands before it clicks. */
const LEAD_IN_MS = 320;
const SETTLE_MS = 140;
/** Between the last character and the cursor moving on. */
const AFTER_TYPING_MS = 300;
/** The small gap used twice: click-then-type, and arrive-then-become-a-hand. */
const BEAT_MS = 100;
/**
 * The pause after the selection lands, before the cursor leaves. Longer than the other beats on
 * purpose: it is the only moment the finished thing is on screen with nothing moving, so it is
 * what gives the selection time to be read rather than merely appear.
 */
const EXIT_DELAY_MS = 700;
/** The parting move, slower than the working ones — leaving is not a task being performed. */
const EXIT_MOVE_MS = 760;
/** How often the hand waves again once it has settled. */
const WAVE_EVERY_MS = 5500;

/**
 * How long the clap runs. Has to match `handClap` in the stylesheet — and note it is set there
 * twice, once for each hand, which is what keeps the two halves of the gesture together.
 */
const CLAP_MS = 560;
/**
 * How long the hand sits still after arriving before it waves. Longer than the settle used
 * between the working steps: the hand has just faded in over its own transition, and waving
 * while that is still resolving reads as one continuous twitch rather than as arriving, and
 * then greeting.
 */
const WAVE_LEAD_IN_MS = 520;
/** The drawn hand's fingertip, in its own 24x24 box — see public/hand-cursor.svg. */
const USER_HAND_HOTSPOT = { x: 12, y: 2 };

/**
 * Where each pointer's tip sits in the SVG's own units — see FigmaCursor. The element is
 * positioned by its top-left corner, so every target point is offset by this to put the *tip*
 * on it. Change the artwork and these have to be remeasured, or the cursor points below and
 * right of everything.
 *
 * **The element is positioned by the arrow's tip only, never the hand's.** The two differ by
 * about 6px in each axis, so switching which one the offset was built from moved the element —
 * and during a cross-fade both pointers are on screen, so that shift was visible as the arrow
 * jumping sideways while it faded out. Instead the offset never changes and the hand's *layer*
 * carries the difference between the tips (`hand - arrow`, so translate by its negation), which
 * puts the hand's fingertip on the same mark without anything moving at the swap. That is also
 * why the name pill needs no compensation: nothing under it moves any more.
 */
const POINTER_HOTSPOT = {
  arrow: { x: 6, y: 6.5 },
  hand: { x: 12.4, y: 2.2 },
} as const;

type Pointer = keyof typeof POINTER_HOTSPOT;
type Point = { x: number, y: number };

/**
 * Where the first click lands, relative to the date box's bottom-left corner. Nudged up and in
 * rather than sitting exactly on the corner: a pointer parked on the corner reads as aimed at
 * the frame, where one inside the box reads as aimed at the date.
 */
const FIRST_CLICK_OFFSET = { x: 8, y: -6 };

/** How long the wave runs. Must match `handWave` in the stylesheet. */
const WAVE_MS = 900;

type LastUpdatedProps = {
  /** Already formatted. Computed at build time by the server component above — see SiteFooter. */
  date: string,
};

/**
 * "Last updated: <date>", where the date types itself out under a Figma cursor that moves in,
 * clicks, waits for the typing, moves on and clicks again.
 *
 * This is a client component and `SiteFooter` deliberately is not: `LAST_UPDATED` is
 * `new Date()` at module scope, which on the server runs once during the build and bakes the
 * publish date into the export. Moving that into the browser would silently turn it into the
 * *visitor's* current date — a "last updated" that is always today and therefore never wrong
 * and never useful. So the date is computed up there and arrives here as a finished string.
 *
 * The label lives here rather than in the footer because the cursor's first position is defined
 * against it — "below Last updated" — and an absolutely positioned child needs the whole line
 * as its containing block, not just the box at the end of it.
 *
 * Four things about how the sequence starts and stops:
 *
 * - **The date renders complete and is emptied on approach**, rather than starting empty. That
 *   is what a visitor with JavaScript off keeps — the export already contains the date, so
 *   nothing here is load-bearing for reading it. Emptying happens in the observer rather than in
 *   the effect body, so a reader who never reaches the bottom pays no render for it.
 * - **`prefers-reduced-motion` skips all of it.** No cursor is mounted at all and the date is
 *   complete from the first paint. Not a faster animation — none.
 * - **It fires once.** The observer disconnects on the first intersection, so scrolling away and
 *   back does not replay it, which would make the footer restless.
 * - **Every target is measured, never hardcoded.** The date's width depends on the month the
 *   build ran in — "May 2026" is narrower than "August 2026" — so a fixed offset would put the
 *   second click in the wrong place for two months of the year.
 */
const LastUpdated: React.FC<LastUpdatedProps> = ({ date }) => {
  const wrapRef = useRef<HTMLParagraphElement>(null);
  const boxRef = useRef<HTMLSpanElement>(null);
  /** Read by the repeating wave, so it does not animate a footer nobody is looking at. */
  const onScreen = useRef(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Complete on the server and on the hydrating client's first render, so the two agree.
  const [shown, setShown] = useState(date.length);
  /** Null until the sequence arms, which is also what keeps the cursor out of the export. */
  const [cursor, setCursor] = useState<Point | null>(null);
  const [clicking, setClicking] = useState(false);
  /** Figma's selection — underline and corner handles — drawn by the second click. */
  const [selected, setSelected] = useState(false);
  /**
   * Whether the blue frame is drawn. False at rest, which is deliberate: the box belongs to the
   * animation, not to the design, so the export, a reader with JavaScript off and a reader with
   * reduced motion all get the plain date — the same thing the sequence leaves behind when the
   * hand takes over.
   */
  const [boxed, setBoxed] = useState(false);
  const [pointer, setPointer] = useState<Pointer>("arrow");
  const [waving, setWaving] = useState(false);
  const [clapping, setClapping] = useState(false);
  const clapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /**
   * Where to draw the reader's own hand, relative to the cursor element. Null when they are not
   * over the zone, which is also when the native pointer is theirs again.
   */
  const [userHand, setUserHand] = useState<Point | null>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  /** Per-leg travel time, so the parting move can be slower than the working ones. */
  const [moveMs, setMoveMs] = useState(MOVE_MS);

  /**
   * Derived rather than synced: under reduced motion the date is complete whatever the counter
   * says, so there is nothing to write back. That also covers the preference being switched on
   * *during* the animation — the effect below tears its timers down and this renders the finished
   * date on the same pass, where assigning state in the effect would have taken an extra render
   * to settle and tripped `set-state-in-effect` on the way.
   */
  const visible = prefersReducedMotion ? date.length : shown;

  useEffect(() => {
    if (prefersReducedMotion) return;

    const el = boxRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;

    const timers: number[] = [];
    let typing: ReturnType<typeof setInterval> | undefined;

    /** Points are wrapper-relative, so the cursor's own offsets stay in one coordinate space. */
    const boxAt = (): { left: number, right: number, bottom: number } => {
      const w = wrap.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      return { left: b.left - w.left, right: b.right - w.left, bottom: b.bottom - w.top };
    };

    const startPoint = (): Point => ({ x: 22, y: wrap.getBoundingClientRect().height + 18 });
    const firstClick = (): Point => {
      const b = boxAt();
      return { x: b.left + FIRST_CLICK_OFFSET.x, y: b.bottom + FIRST_CLICK_OFFSET.y };
    };
    const belowRight = (): Point => {
      const b = boxAt();
      return { x: b.right, y: b.bottom + 12 };
    };
    /**
     * The parting position: low and left of the line, but not jammed into its corner — tucked
     * up and in a little so the pill sits under the text rather than hanging off the column.
     */
    const farLeftBelow = (): Point => ({ x: 14, y: wrap.getBoundingClientRect().height + 8 });

    let armed = false;
    let replay: ReturnType<typeof setInterval> | undefined;
    let waveOff: ReturnType<typeof setTimeout> | undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const showing = entries.some((entry) => entry.isIntersecting);
        // Kept live rather than disconnected after the first hit, because the repeating wave
        // needs to know whether anyone is still down here. Arming is guarded by a flag instead,
        // so scrolling away and back does not replay the whole sequence.
        onScreen.current = showing;
        if (!showing || armed) return;
        armed = true;

        // Emptying the box happens *here*, not on mount. Doing it synchronously in the effect
        // meant an extra render pass on every load, on a page most readers never scroll to the
        // bottom of. The observer's bottom margin fires this while the box is still below the
        // fold, so the complete date is cleared before anyone watches it blank itself.
        setShown(0);
        setBoxed(true);
        setCursor(startPoint());

        // Cumulative, so each line reads as "and then, this long later" rather than as an
        // absolute offset that has to be recomputed by hand when a duration changes.
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
            if (typed >= date.length && typing) clearInterval(typing);
          }, CHAR_MS);
        });
        // The typing runs on its own interval, so the next step just waits it out.
        then(date.length * CHAR_MS + AFTER_TYPING_MS, () => setCursor(belowRight()));
        // The second click is the one that selects: the handles and underline appear with the
        // press, not after it, because a selection is what the press *did*.
        then(MOVE_MS + SETTLE_MS, () => {
          setClicking(true);
          setSelected(true);
        });
        then(CLICK_MS, () => setClicking(false));

        // The exit. The pointer becomes a hand on the way out, so the ~6px the differing
        // hotspots shift the element is absorbed by a travel already underway rather than
        // reading as a twitch in place. The frame, underline and handles go at the same moment
        // — the cursor leaving *is* the deselection, and a selection left behind by a pointer
        // that has walked away reads as stuck rather than as chosen.
        then(EXIT_DELAY_MS, () => {
          setMoveMs(EXIT_MOVE_MS);
          setCursor(farLeftBelow());
        });
        // The arrow travels; only once it has arrived and paused does it become a hand and let
        // the date go. Nothing about the element's position changes here — the offset is built
        // from the arrow's tip whichever pointer is showing, and the hand's layer carries the
        // difference itself, so the swap is purely a cross-fade.
        then(EXIT_MOVE_MS + BEAT_MS, () => {
          setPointer("hand");
          setSelected(false);
          setBoxed(false);
        });
        then(WAVE_LEAD_IN_MS, () => setWaving(true));
        then(WAVE_MS, () => {
          setWaving(false);
          // And again, on a slow loop, for as long as the footer is on screen. The gate is the
          // point: without it this would keep restarting a CSS animation on an element parked
          // thousands of pixels above the viewport for the rest of the session.
          replay = setInterval(() => {
            if (!onScreen.current) return;
            setWaving(true);
            clearTimeout(waveOff);
            waveOff = setTimeout(() => setWaving(false), WAVE_MS);
          }, WAVE_EVERY_MS);
        });
      },
      // The bottom margin is what keeps the reset off-screen: the callback fires while the box
      // is still that far below the fold, so the complete date is cleared before anyone sees
      // it. Trigger on visibility alone and the reader would watch it blank itself and retype.
      { rootMargin: "0px 0px 240px 0px" },
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      timers.forEach((t) => clearTimeout(t));
      if (typing) clearInterval(typing);
      if (replay) clearInterval(replay);
      if (waveOff) clearTimeout(waveOff);
    };
  }, [date, prefersReducedMotion]);

  /**
   * The clap, fired when the reader's own pointer arrives over the hand.
   *
   * Driven by `pointerenter` on a small circle laid over the hand rather than by measuring
   * distance on every pointer move. That is one listener on one element instead of one on the
   * window for the life of the page, it fires once on arrival rather than continuously while
   * the pointer rests there, and — the reason it is an element at all — it is what carries the
   * `cursor` that turns the reader's arrow into a hand. A distance check cannot do that: only a
   * real box the pointer is *over* can change what the pointer looks like.
   */
  useEffect(() => () => clearTimeout(clapTimer.current), []);

  /**
   * The reader's hand is *drawn*, not a `cursor:` image, and that is what the clap costs. A
   * native cursor is a picture the compositor stamps at the pointer — nothing can animate it,
   * so a cursor image can only ever be the still hand arriving. Drawing it means the zone hides
   * the real pointer (`cursor: none`) and this element stands in for it, which is what lets both
   * hands run the same clap.
   */
  const trackUserHand = (event: React.PointerEvent<HTMLSpanElement>) => {
    const el = cursorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setUserHand({ x: event.clientX - r.left, y: event.clientY - r.top });
  };

  const startClap = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (prefersReducedMotion) return;
    trackUserHand(event);
    setClapping(true);
    clearTimeout(clapTimer.current);
    clapTimer.current = setTimeout(() => setClapping(false), CLAP_MS);
  };

  return (
    <p className={styles.updated} ref={wrapRef}>
      Last updated:{" "}
      {/* Hidden from assistive tech: a half-typed date is not a fact, and the real one is
          carried by the sibling below — otherwise it would also be announced twice. */}
      <span
        ref={boxRef}
        className={`${styles.strong} ${styles.date}`}
        /* The frame is drawn only while the animation owns the date, and only once there is a
           character in it: an empty rectangle sitting after "Last updated:" reads as a missing
           value rather than as a pause. The border keeps its 2px whether or not it is visible —
           see the stylesheet — so nothing on the line shifts as it comes and goes. */
        data-boxed={boxed && visible > 0 ? "true" : undefined}
        aria-hidden="true"
      >
        {date.slice(0, visible)}
        {/* Absolutely positioned, so none of this disturbs the text it is drawn around — the
            box has to keep measuring exactly as wide as the date for the cursor's targets to
            stay right. Four separate elements rather than one with corner pseudo-elements,
            because a box only has two of those. */}
        {selected ? (
          <>
            <span className={styles.selectionUnderline} />
            <span className={styles.handle} data-corner="top-left" />
            <span className={styles.handle} data-corner="top-right" />
            <span className={styles.handle} data-corner="bottom-left" />
            <span className={styles.handle} data-corner="bottom-right" />
          </>
        ) : null}
      </span>
      <span className={styles.srOnly}>{date}</span>
      {cursor ? (
        <span
          ref={cursorRef}
          className={styles.cursor}
          data-pointer={pointer}
          data-clicking={clicking ? "true" : undefined}
          data-waving={waving && !clapping ? "true" : undefined}
          data-clapping={clapping ? "true" : undefined}
          style={
            {
              transform: `translate(${cursor.x - POINTER_HOTSPOT.arrow.x}px, ${cursor.y - POINTER_HOTSPOT.arrow.y}px)`,
              // Drives the travel time in the stylesheet, so the parting move can take longer
              // than the working ones without a second transition rule.
              "--cursor-move": `${moveMs}ms`,
            } as React.CSSProperties
          }
          aria-hidden="true"
        >
          <FigmaCursor
            nameClassName={styles.cursorName}
            arrowLayerClassName={styles.cursorArrowLayer}
            handLayerClassName={styles.cursorHandLayer}
            pointerClassName={styles.cursorPointer}
            sparkClassName={styles.cursorSpark}
          />
          {/* Only once the hand is out: before that there is nothing to greet, and a box that
              swallows the pointer over an arrow that is still working would be a trap. */}
          {pointer === "hand" ? (
            <span
              className={styles.clapZone}
              onPointerEnter={startClap}
              onPointerMove={trackUserHand}
              onPointerLeave={() => setUserHand(null)}
            />
          ) : null}
          {userHand ? (
            /* Two boxes: the outer one is *where* the hand is and is written every pointer move;
               the inner one is what claps. One element cannot do both — the clap animates
               `transform`, which would win over the inline positioning for its whole duration and
               fling the hand to the corner of the line. */
            <span
              className={styles.userHand}
              style={{
                transform: `translate(${userHand.x - USER_HAND_HOTSPOT.x}px, ${userHand.y - USER_HAND_HOTSPOT.y}px)`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a 24px fixed-size mark
                  with no responsive variants to pick between; next/image would add a wrapper
                  and a srcset for one unoptimised SVG. */}
              <img
                className={styles.userHandArt}
                src="/hand-cursor.svg"
                alt=""
                width={24}
                height={24}
                draggable={false}
              />
            </span>
          ) : null}
        </span>
      ) : null}
    </p>
  );
};

export default LastUpdated;
