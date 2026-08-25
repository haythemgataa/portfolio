'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStudio } from '../lib/studioContext';
import styles from './canvas.module.css';

/**
 * A run of the site's own text that becomes a field when you click it.
 *
 * The point of the whole canvas is that at rest it is the page — same type, same spacing, same
 * markup — so this renders *nothing of its own* until it is being edited. No box, no border, no
 * placeholder chrome. What it adds at rest is a hover tint and a focus ring, both drawn outside
 * the text's own box with a negative-inset overlay, so revealing the affordance cannot move a
 * single glyph.
 *
 * Three things about it are load-bearing:
 *
 * - **It swaps the rendered text for a control rather than using `contentEditable`.** A heading
 *   is not plain text — it carries `[filename]` icon tokens resolved into `<img>`s, a link
 *   arrow, and `{braces}` muted runs elsewhere — so what is displayed and what is stored are
 *   different strings. `contentEditable` would edit the *displayed* one, and there is no honest
 *   way back from an `<img>` to the token that produced it. Swapping means the resting state can
 *   be arbitrarily rich while the editor is always the raw authored string.
 * - **The caret lands where you clicked**, not at the end. That is most of what separates
 *   editing on the page from a form with the page next to it: a click near a word is a request
 *   to fix that word. It is computed off the resting element before the swap, and only when the
 *   resting content is plain text — with `children` supplied, the DOM text and the stored string
 *   are different lengths and the offset would be a lie, so it falls back to the end.
 * - **The draft is local while editing.** The parent's write is debounced, so without a draft
 *   the input would be controlled by a value that lags the keystrokes; and for the comma-
 *   separated fields the stored value round-trips through an array, which would eat the comma
 *   that starts the next entry the instant it was typed.
 */

type EditableProps = {
  /** The authored string. For a list field, the parent joins and splits around this. */
  value: string;
  onChange: (next: string) => void;
  /** Shown, greyed, when the value is empty. Never submitted. */
  placeholder: string;
  /** Names the field for a screen reader — the visible text is the value, not a label. */
  label: string;
  /** The site class this text is set in, so the field inherits the exact type. */
  className?: string;
  /**
   * How the value renders at rest, when that is not simply the value — a heading's icons, a
   * byline's muted runs, a description's markdown. Supplying this turns off caret placement,
   * since the displayed text no longer maps onto the stored string.
   */
  children?: React.ReactNode;
  /** Enter inserts a newline instead of committing. Also switches to an auto-growing textarea. */
  multiline?: boolean;
  /** Extra class on the wrapper, for cases that need their own box (the year column). */
  wrapperClassName?: string;
  /**
   * Whether the open field fills its line or sizes to itself. Block is right almost
   * everywhere — a heading's field should be as wide as the heading's box. Inline is for the
   * short runs that share a line with something else, where a full-width field would push its
   * neighbours onto the next one for as long as it is open: the gallery byline's date and tags.
   */
  layout?: 'block' | 'inline';
  /**
   * The resting element. A span everywhere text flows inline; a div for the blocks whose
   * resting render is markdown, because `RichText` emits `<p>` and a paragraph inside a span
   * is a block-in-inline that fragments the highlight into pieces.
   */
  as?: 'span' | 'div';
  /** Called when editing starts, so the canvas can select the thing being typed into. */
  onEdit?: () => void;
};

/** Where a point landed: which text node, how far into it, and how far into the whole run. */
type Hit = { node: Node; offsetInNode: number; totalOffset: number };

/**
 * The text node and offset a point falls on inside `root`, or null. Both engine spellings are
 * tried: WebKit and Blink expose `caretRangeFromPoint`, Gecko `caretPositionFromPoint`.
 */
function hitFromPoint(root: HTMLElement, x: number, y: number): Hit | null {
  const doc = root.ownerDocument;
  let node: Node | null = null;
  let offsetInNode = 0;

  type CaretDoc = Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  const caretDoc = doc as CaretDoc;

  if (typeof caretDoc.caretRangeFromPoint === 'function') {
    const range = caretDoc.caretRangeFromPoint(x, y);
    if (!range) return null;
    node = range.startContainer;
    offsetInNode = range.startOffset;
  } else if (typeof caretDoc.caretPositionFromPoint === 'function') {
    const position = caretDoc.caretPositionFromPoint(x, y);
    if (!position) return null;
    node = position.offsetNode;
    offsetInNode = position.offset;
  } else {
    return null;
  }

  if (!node || node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return null;

  // The hit offset is relative to that text node; the whole-run offset is that plus everything
  // before it.
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n === node) return { node, offsetInNode, totalOffset: total + offsetInNode };
    total += (n.textContent ?? '').length;
  }
  return null;
}

/**
 * The offset in the *stored* string that a click corresponds to.
 *
 * Straightforward when the resting render is the value itself. It is not, for the fields that
 * matter most: a heading renders `[instadeep.svg]` as a 20px image, a byline drops its braces,
 * a description is markdown with its bullets and emphasis markers consumed. In every one of
 * those the displayed text is *shorter* than what is stored, so the rendered offset would land
 * short of the word that was clicked — and it would land further short the further down the
 * text you clicked, which is worse than not trying.
 *
 * So there are two routes and a bail:
 *
 * - **Identical text** — the common case even for a rich field, since most headings carry no
 *   token and most bylines no braces. The offset transfers directly.
 * - **Anchor on the clicked run.** Every one of these transformations only ever adds or removes
 *   markup *around* runs of prose; the run itself survives verbatim. So the text node that was
 *   clicked can be found in the stored string, and the offset within it is exact.
 * - **Ambiguity bails to the end.** If the clicked run appears twice there is no way to tell
 *   which copy was pressed, and guessing puts the caret somewhere the author did not point.
 */
function caretForValue(root: HTMLElement, x: number, y: number, value: string): number | null {
  const hit = hitFromPoint(root, x, y);
  if (!hit) return null;

  if (root.textContent === value) return Math.min(hit.totalOffset, value.length);

  const chunk = hit.node.textContent ?? '';
  if (!chunk) return null;

  const first = value.indexOf(chunk);
  if (first === -1) return null;
  if (value.indexOf(chunk, first + 1) !== -1) return null;

  return Math.min(first + hit.offsetInNode, value.length);
}

/** A textarea has no intrinsic height, so its content has to set one on every input. */
function autosize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

const Editable: React.FC<EditableProps> = ({
  value,
  onChange,
  placeholder,
  label,
  className,
  children,
  multiline = false,
  wrapperClassName,
  layout = 'block',
  as: Tag = 'span',
  onEdit,
}) => {
  const { registerInsert } = useStudio();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  /** The value editing started from, so Escape has something to restore. */
  const startedAt = useRef('');
  /** Where the caret should land once the control exists. */
  const caretAt = useRef<number | null>(null);
  /**
   * A caret position that has to be re-applied after the value catches up — set by the icon
   * insert, which changes the text under a caret that is already placed.
   */
  const pendingCaret = useRef<number | null>(null);
  const restRef = useRef<HTMLSpanElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  const begin = useCallback(
    (caret: number | null) => {
      startedAt.current = value;
      caretAt.current = caret;
      setDraft(value);
      setEditing(true);
      onEdit?.();
    },
    [value, onEdit]
  );

  // Placing the caret has to happen before paint, or the field is visibly focused at the end
  // for a frame and then jumps.
  useLayoutEffect(() => {
    if (!editing) return;
    const field = fieldRef.current;
    if (!field) return;
    autosize(field as HTMLTextAreaElement);
    field.focus();
    const at = caretAt.current ?? field.value.length;
    const clamped = Math.min(at, field.value.length);
    field.setSelectionRange(clamped, clamped);
  }, [editing]);

  /**
   * While this field is open it is the one thing that can place a token at a caret, so it lends
   * that ability to the inspector's icon picker. Re-registered whenever the draft changes,
   * because the closure has to splice into the *current* text.
   */
  useEffect(() => {
    if (!editing) return;
    const insert = (text: string) => {
      const field = fieldRef.current;
      if (!field) return;
      const at = Math.min(field.selectionStart ?? draft.length, draft.length);
      const next = draft.slice(0, at) + text + draft.slice(at);
      setDraft(next);
      onChange(next);
      // Where the caret belongs once the new text has landed: just past the token, so typing
      // continues where the author was and a second insert goes where they expect.
      //
      // Recorded for the effect below rather than applied in a `requestAnimationFrame`. Writing
      // a controlled input's `value` puts the caret at the end, and this insert triggers more
      // than one commit — the draft, then the optimistic document, then the picker unmounting —
      // so a single deferred call fixed the caret and the next render moved it back. Measured:
      // it ended at 66 (the end) rather than 24.
      pendingCaret.current = at + text.length;
    };
    registerInsert(insert);
    // Only clear the slot if it is still *ours*. Clicking straight from one field into another
    // opens the second before the first blurs, so an unconditional `registerInsert(null)` here
    // would run after the new field had already registered and leave it silently deregistered.
    return () => registerInsert(insert, { onlyIfCurrent: true });
  }, [editing, draft, onChange, registerInsert]);

  /**
   * Note what is deliberately *not* here: a sync that adopts `value` when it changes from
   * outside while the field is open. An open field belongs to whoever is typing in it, and
   * having half-written text replaced mid-sentence by a `refresh()` landing from an unrelated
   * save is worse than the staleness it would fix. The document is protected by the server's
   * stale-write guard rather than by this: a write against a hash that has moved comes back
   * 409 and is replayed against the refreshed document.
   */

  /**
   * Re-applies a pending caret after *every* commit, and only once the field's value has caught
   * up with the draft — placing it against the old text would put it in the wrong character.
   * No dependency array on purpose: the whole point is that it runs again on the render that
   * finally carries the new value.
   */
  useLayoutEffect(() => {
    if (pendingCaret.current === null) return;
    const field = fieldRef.current;
    if (!field || field.value !== draft) return;
    const at = Math.min(pendingCaret.current, field.value.length);
    pendingCaret.current = null;
    field.focus();
    field.setSelectionRange(at, at);
  });

  const commit = () => {
    setEditing(false);
    caretAt.current = null;
    pendingCaret.current = null;
  };

  const cancel = () => {
    onChange(startedAt.current);
    setEditing(false);
    caretAt.current = null;
  };

  if (editing) {
    const shared = {
      className: [styles.field, className].filter(Boolean).join(' '),
      value: draft,
      'aria-label': label,
      placeholder,
      onBlur: commit,
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        setDraft(e.target.value);
        onChange(e.target.value);
        if (multiline) autosize(e.target as HTMLTextAreaElement);
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancel();
          return;
        }
        // Single-line fields commit on Enter, the way a form field does. Multiline ones keep
        // Enter for the newline it means in markdown and commit on blur instead.
        if (e.key === 'Enter' && !multiline) {
          e.preventDefault();
          commit();
        }
      },
      // Clicks inside the field must not reach the canvas's own selection handlers, which
      // would re-select and steal focus on every press.
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
      onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
    };

    return (
      <Tag
        className={[
          styles.editable,
          styles.editableOpen,
          layout === 'inline' ? styles.editableInline : '',
          wrapperClassName,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {multiline ? (
          <textarea {...shared} ref={fieldRef as React.RefObject<HTMLTextAreaElement>} rows={1} />
        ) : (
          <input {...shared} type="text" ref={fieldRef as React.RefObject<HTMLInputElement>} />
        )}
      </Tag>
    );
  }

  const empty = value.length === 0;

  return (
    <Tag
      ref={restRef as React.RefObject<HTMLSpanElement & HTMLDivElement>}
      className={[
        styles.editable,
        empty ? styles.editableEmpty : '',
        className,
        wrapperClassName,
      ]
        .filter(Boolean)
        .join(' ')}
      tabIndex={0}
      // A button, not a textbox. At rest this is a span with no editing behaviour of any kind —
      // `role="textbox"` announced it as a field, so an empty Description slot was read as "edit"
      // and typing into it did nothing, because there is nothing to type into until it is
      // activated. `role="button"` describes what pressing it does, which is open the editor.
      //
      // The name carries the value rather than just the label: this element *is* the content, so
      // an `aria-label` of "Heading" alone would replace the heading's text in the accessibility
      // tree with the word "Heading".
      role="button"
      aria-label={`${label}: ${value || 'empty'}`}
      onMouseDown={(e) => {
        // Left button only, and before focus moves, so the point still hits the resting text.
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const caret = empty ? null : caretForValue(e.currentTarget, e.clientX, e.clientY, value);
        begin(caret);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          begin(null);
        }
      }}
    >
      {empty ? <span className={styles.ghost}>{placeholder}</span> : (children ?? value)}
    </Tag>
  );
};

export default Editable;
