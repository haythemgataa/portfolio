import React from 'react';
import { HAND_FILL_D, HAND_LINES_D, HAND_OUTLINE_D } from './handPaths';

/**
 * The reader's own pointer while it is over the footer's clap zone, so the greeting is two hands
 * meeting rather than an arrow poking one.
 *
 * Inline rather than a file, and it used to be `public/hand-cursor.svg`. That file was forced
 * once — the zone carried a CSS `cursor`, which takes a URL and so has nothing to inline into —
 * but the clap cannot animate a native cursor, since the compositor simply stamps it at the
 * pointer. So the zone became `cursor: none` with this drawn in its place, and the constraint
 * lapsed the moment it did: the very change that made the hand animate is what made it inlinable.
 *
 * Leaving it a file cost a request that could not be made until the element existed, which is to
 * say until the pointer was already inside a zone that had just hidden its own cursor. On a cold
 * cache the first arrival hid the real pointer and then waited on a round trip with nothing drawn
 * in its place, so the hand appeared on the second visit and only then. Inline, there is nothing
 * to wait for.
 *
 * `aria-hidden` because it is the pointer, not content — the same job the `alt=""` did on the
 * `<img>` this replaces. It carries no `draggable={false}` either, which an `<img>` needed
 * because images are natively draggable and the drag pre-empted the pointer it stands in for.
 *
 * The near-black is deliberate against the site's orange (see `handPaths.ts`): two identical
 * hands read as one object doubled rather than as someone arriving to meet it.
 */
const UserHand = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path fillRule="evenodd" clipRule="evenodd" d={HAND_OUTLINE_D} fill="white" />
    <path d={HAND_FILL_D} fill="white" />
    <path fillRule="evenodd" clipRule="evenodd" d={HAND_LINES_D} fill="#2C2C2C" />
  </svg>
);

export default UserHand;
