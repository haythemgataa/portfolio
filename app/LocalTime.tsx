"use client";

import { useEffect, useRef, useState } from "react";
import { scrambleText } from "./scrambleText";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import styles from "./SiteFooter.module.css";
import type { MutedSegment } from "./lib/contentTypes";

/**
 * The author's timezone, as an IANA zone rather than a fixed offset.
 *
 * Tunisia has not observed DST since 2008, so `+01:00` would be correct today — and that is
 * exactly the kind of fact that goes stale without anyone noticing, where a zone name cannot.
 * `{(GMT+1)}` in `cv.json` is the authored label and stays authored; this is only what the reveal
 * reads the clock in.
 */
const TIME_ZONE = "Africa/Tunis";

/**
 * 24-hour, and the character count is the point rather than the style: `(17:54)` is exactly as
 * long as the `(GMT+1)` it replaces, where `(5:54 PM)` is two longer. Paired with the monospaced
 * `.locationMuted`, equal length is equal width — so the swap and the scramble that performs it
 * cannot resize anything.
 *
 * `en-GB` rather than the visitor's locale for the same reason — a locale that resolves to
 * `h:mm a` would put the length back whatever `hour12` says on some engines.
 */
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** How often the revealed clock catches up. Only ever running while someone is looking at it. */
const TICK_MS = 1000;

const localTime = () => `(${formatter.format(new Date())})`;

type LocalTimeProps = {
  /** `profile.locationSegments` — see `splitMuted`. Omitted or empty renders nothing. */
  segments?: MutedSegment[],
};

/**
 * Where the author is, and — on hover, focus or a press — what time it is there, the offset
 * scrambling into the clock.
 *
 * **A `<button>`, not a span with pointer handlers.** Hover alone would make this invisible on
 * every phone and to every keyboard, and the reveal is a real if small action, which is the same
 * argument that makes the contact row's address pill a button rather than a link. It is reset to
 * inherit the surrounding type — no pill, no border, no fill — so the footer's line reads exactly
 * as it did; the only chrome it gains is a `:focus-visible` ring.
 *
 * Six things about it:
 *
 * - **The resting render is the authored label**, on the server and on the hydrating client's
 *   first render alike. The clock is only ever read inside an event handler, so there is no
 *   hydration mismatch and — the half that actually matters — no build-time `new Date()` leaking
 *   into the page. That is the same boundary `LastUpdated` exists to hold: this is a client
 *   component beside a server one precisely so that "last updated" stays the build's date while
 *   this one is the visitor's *now*.
 * - **It swaps the first muted run and leaves any others alone.** `{(GMT+1)}` is what the reveal
 *   answers, and "Tunisia" is true either way. Addressing the *first* `{...}` rather than every
 *   one of them means a second brace pair added to `profile.location` later keeps its own text,
 *   which is right — it would not be the timezone.
 * - **Nothing resizes, and that is now structural rather than lucky.** `.locationMuted` is
 *   monospaced, so every glyph — the label's, the clock's, and every character the scramble
 *   cycles through — has one advance. Equal character count is therefore equal width, through the
 *   whole animation and not merely at its two ends.
 * - **The transition scrambles; the clock ticking does not.** A press or a pointer arriving runs
 *   `scrambleText`; the once-a-second catch-up writes the new value straight in, and only while no
 *   scramble is running. Re-scrambling on a minute rollover would fire at an arbitrary moment
 *   under a reader's eye, which is a distraction rather than an effect.
 * - **`prefers-reduced-motion` skips the animation, not the feature.** The value swaps instantly;
 *   what it says is the information, and the resolve is the ornament.
 * - **The accessible name renames itself instead of carrying `aria-pressed`.** Both would make a
 *   screen reader announce the state twice — the argument the CV's Show/Hide Details control
 *   already makes. So an `.srOnly` span says what a press would do next, and the visible text says
 *   what is on screen now. It is driven by the *intent* rather than by the animating string, so it
 *   never announces a frame of noise.
 */
const LocalTime: React.FC<LocalTimeProps> = ({ segments }) => {
  /** True from the moment the reveal is asked for, whatever the animation is currently showing. */
  const [shown, setShown] = useState(false);
  /**
   * What the muted run renders. `null` means "whatever the document authored", which is what keeps
   * the resting markup identical to the server's and out of the animation's hands entirely.
   */
  const [display, setDisplay] = useState<string | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const tick = useRef<ReturnType<typeof setInterval>>(undefined);
  const cancelScramble = useRef<(() => void) | null>(null);
  /** Read by the scramble as its starting string, so it always begins from what is on screen. */
  const displayRef = useRef<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  /**
   * What kind of pointer opened the last press. A press *toggles* on touch and pen, where there is
   * no hover to have already revealed anything — and does not on a mouse, where it otherwise
   * cancelled the reveal the pointer arriving had just produced, so clicking read as the feature
   * refusing to work. `onClick` cannot see the pointer type itself, hence the ref.
   */
  const pressPointer = useRef<string>("mouse");

  const label = segments?.find((s) => s.kind === "muted")?.text ?? "";

  const write = (value: string | null) => {
    displayRef.current = value;
    setDisplay(value);
  };

  /** Cancels any run in flight first: two scrambles writing the same span would fight each other. */
  const animateTo = (to: string, resting: string | null) => {
    cancelScramble.current?.();
    cancelScramble.current = null;

    if (prefersReducedMotion) {
      write(resting);
      return;
    }

    const from = displayRef.current ?? label;
    cancelScramble.current = scrambleText(from, to, write, () => {
      // Clearing the ref here is load-bearing, not tidiness: the tick below treats a non-null
      // cancel as "a run owns the span", so leaving it set would silence the clock permanently
      // after the first reveal.
      cancelScramble.current = null;
      // Hand the span back to its resting value — `null` on the way out, so the authored segment
      // renders itself again rather than the component holding a copy of the document's text.
      write(resting);
    });
  };

  const show = () => {
    setShown(true);
    const now = localTime();
    animateTo(now, now);
    clearInterval(tick.current);
    tick.current = setInterval(() => {
      // Silent. A scramble in flight owns the span until it lands, and re-scrambling on a minute
      // rollover would interrupt a reader mid-glance.
      if (cancelScramble.current) return;
      write(localTime());
    }, TICK_MS);
  };

  const hide = () => {
    setShown(false);
    clearInterval(tick.current);
    animateTo(label, null);
  };

  useEffect(() => () => {
    clearInterval(tick.current);
    cancelScramble.current?.();
  }, []);

  /**
   * Hover leaving does not un-reveal something the keyboard is still pointing at. A mouse user who
   * clicks the button focuses it and then moves away, and hiding there would contradict the focus
   * ring still drawn around it. `blur` runs after focus has already moved, so this never blocks it.
   */
  const hideUnlessFocused = () => {
    if (document.activeElement === buttonRef.current) return;
    hide();
  };

  if (!segments?.length) return null;

  const mutedIndex = segments.findIndex((s) => s.kind === "muted");

  return (
    <button
      ref={buttonRef}
      type="button"
      className={styles.location}
      // `pointerenter`/`pointerleave`, filtered to a mouse. The pointer events fire for touch too
      // — a tap produces an enter, and a leave the moment the finger lifts — so unfiltered, a tap
      // would reveal the time and immediately withdraw it. Touch and pen go through the press.
      onPointerEnter={(event) => { if (event.pointerType === "mouse") show(); }}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") hideUnlessFocused(); }}
      onPointerDown={(event) => { pressPointer.current = event.pointerType; }}
      onFocus={show}
      onBlur={hide}
      onClick={() => {
        // Safari does not focus a button on press, so `onFocus` cannot be relied on to carry
        // touch — which is the one platform where hover does not exist either.
        if (pressPointer.current === "mouse") return;
        if (shown) hide(); else show();
      }}
    >
      {segments.map((segment, i) =>
        segment.kind === "muted" ? (
          <span key={i} className={styles.locationMuted}>
            {i === mutedIndex && display !== null ? display : segment.text}
          </span>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
      {/* Driven by the intent rather than by the animating string, so a frame of noise is never
          what a screen reader is told the control does. */}
      <span className={styles.srOnly}>
        {shown ? "Show time zone" : "Show local time"}
      </span>
    </button>
  );
};

export default LocalTime;
