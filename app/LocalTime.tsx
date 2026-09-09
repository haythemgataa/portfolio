"use client";

import { useEffect, useRef, useState } from "react";
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
 * 24-hour, which is not a stylistic preference: `(17:54)` is exactly as many characters as the
 * `(GMT+1)` it replaces, where `(5:54 PM)` is two longer and visibly stretches the line under the
 * pointer that asked for it.
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
 * Where the author is, and — on hover, focus or a press — what time it is there.
 *
 * **A `<button>`, not a span with pointer handlers.** Hover alone would make this invisible on
 * every phone and to every keyboard, and the reveal is a real if small action, which is the same
 * argument that makes the contact row's address pill a button rather than a link. It is reset to
 * inherit the surrounding type — no pill, no border, no fill — so the footer's line reads exactly
 * as it did; the only chrome it gains is a `:focus-visible` ring.
 *
 * Four things about it:
 *
 * - **The resting render is the authored label**, on the server and on the hydrating client's
 *   first render alike. The clock is only ever read inside an event handler, so there is no
 *   hydration mismatch and — the half that actually matters — no build-time `new Date()` leaking
 *   into the page. That is the same boundary `LastUpdated` exists to hold: this is a client
 *   component beside a server one precisely so that "last updated" stays the build's date while
 *   this one is the visitor's *now*.
 * - **It replaces the muted run, not the whole line.** `{(GMT+1)}` is what the reveal is an answer
 *   to, and "Tunisia" is true either way. With more than one `{...}` run every one of them would
 *   swap, which is a shape the authored string does not currently have and would read oddly if it
 *   did — worth knowing before adding a second brace pair to `profile.location`.
 * - **Nothing to its right moves.** The run narrows a little on reveal (digits are tighter than
 *   `GMT+1`'s letters even at equal character count), and the colophon button beside it is pinned
 *   to the column's far edge by `space-between`, so the change is absorbed by the gap. The muted
 *   run also carries `tabular-nums`, so the minute rolling over cannot jiggle the string.
 * - **The name renames itself instead of carrying `aria-pressed`.** Both would make a screen
 *   reader announce the state twice — the argument the CV's Show/Hide Details control already
 *   makes. So an `.srOnly` span says what a press would do next, and the visible text says what
 *   is on screen now.
 *
 * No transition on the swap. A crossfade would need both strings stacked in one grid cell, which
 * means reserving the wider of the two forever; the swap moves nothing, so there is nothing to
 * smooth over.
 */
const LocalTime: React.FC<LocalTimeProps> = ({ segments }) => {
  const [time, setTime] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const buttonRef = useRef<HTMLButtonElement>(null);
  /**
   * What kind of pointer opened the last press. A press *toggles* on touch and pen, where there is
   * no hover to have already revealed anything — and does not on a mouse, where it otherwise
   * cancelled the reveal the pointer arriving had just produced, so clicking read as the feature
   * refusing to work. `onClick` cannot see the pointer type itself, hence the ref.
   */
  const pressPointer = useRef<string>("mouse");

  // The interval is started by the handlers below rather than by an effect, because it should only
  // exist while the time is on screen. This is the safety net for an unmount mid-reveal.
  useEffect(() => () => clearInterval(timer.current), []);

  const show = () => {
    setTime(localTime());
    clearInterval(timer.current);
    timer.current = setInterval(() => setTime(localTime()), TICK_MS);
  };

  const hide = () => {
    clearInterval(timer.current);
    setTime(null);
  };

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

  const shown = time !== null;

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
            {shown ? time : segment.text}
          </span>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
      <span className={styles.srOnly}>
        {shown ? "Show time zone" : "Show local time"}
      </span>
    </button>
  );
};

export default LocalTime;
