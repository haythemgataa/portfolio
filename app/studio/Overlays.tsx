'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { inferMediaType } from '../lib/contentTypes';
import type { MediaAsset } from '../lib/contentTypes';
import type { Pick } from './lib/studioContext';
import styles from './Studio.module.css';

/**
 * A pending question — either "are you sure" or "what should this be called".
 *
 * This exists because `window.confirm` and `window.prompt` cannot be relied on to ask. Chrome
 * offers a "Prevent this page from creating additional dialogs" checkbox once a page has
 * produced a few in a row, and the Studio produced one for every add, rename and delete — so
 * it was easy to tick without meaning to. From then on both calls return immediately with
 * nothing shown, which turned every one of those buttons into a silent no-op: clicking ×
 * simply did nothing, for the rest of the page's life, reporting no error and leaving no way
 * to tell that from a broken button. Some embedded webviews no-op dialogs the same way.
 *
 * So the Studio has no native dialogs left. Editing on the canvas has since retired the
 * *prompts* — a new item is created empty and named in place — but the confirmations remain,
 * and they are the half that failed dangerously.
 */
export type Ask = {
  title: string;
  /** Lines of explanation — what will change, and what survives. */
  detail?: string[];
  /** Present when the dialog collects a value rather than just consent. */
  input?: { label: string; placeholder?: string; initial?: string };
  confirmLabel: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
  /** Receives the trimmed input value, or '' for a plain confirmation. */
  onConfirm: (value: string) => void;
};

/**
 * Enter confirms and Escape cancels, so it costs the same keystrokes the native dialogs did.
 * An empty input cancels rather than submitting, which is what `prompt()` returning `""` used
 * to mean at every call site.
 */
export const AskDialog: React.FC<{ ask: Ask; onClose: () => void }> = ({ ask, onClose }) => {
  const [value, setValue] = useState(ask.input?.initial ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // The field when there is one to fill in; otherwise the *safe* button, since on these
    // dialogs the other one deletes and Enter would take it.
    if (ask.input) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      cancelRef.current?.focus();
    }
    return () => previouslyFocused?.focus?.();
  }, [ask]);

  const submit = () => {
    const trimmed = value.trim();
    if (ask.input && !trimmed) {
      onClose();
      return;
    }
    ask.onConfirm(trimmed);
    onClose();
  };

  return (
    <div className={styles.dialogBackdrop} onMouseDown={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={ask.title}
        // Clicking the sheet must not reach the backdrop's dismiss handler.
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          // Enter submits only the dialogs that have something to type into. On the input-less
          // ones focus is parked on Cancel precisely because the other button deletes — and this
          // handler covers the whole subtree, so it was suppressing Cancel's own Enter→click and
          // running the delete instead. Left to the browser, Enter now activates whichever
          // button actually has focus.
          if (e.key === 'Enter' && ask.input) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <h2 className={styles.dialogTitle}>{ask.title}</h2>
        {ask.detail?.map((line) => (
          <p key={line} className={styles.dialogDetail}>
            {line}
          </p>
        ))}
        {ask.input && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>{ask.input.label}</span>
            <input
              ref={inputRef}
              className={styles.input}
              type="text"
              placeholder={ask.input.placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
        )}
        <div className={styles.dialogActions}>
          <button ref={cancelRef} className={styles.ghostButton} onClick={onClose}>
            Cancel
          </button>
          <button
            className={ask.danger ? styles.dangerButton : styles.primaryButton}
            onClick={submit}
          >
            {ask.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Choosing a file out of the pool, by looking at it.
 *
 * Every one of these was a `<select>` of bare filenames, which stopped working somewhere around
 * the point the pool passed a dozen files: the list is 80-odd names now, several of which differ
 * only by a suffix (`-poster`, `-dark`), and a filename is a poor description of a picture. A
 * grid answers the question the author is actually asking — *which* image — and it is the same
 * pool either way, so nothing about the content model changes.
 *
 * Filtering is on the filename because that is all there is: the registry records dimensions and
 * flags, not titles.
 */
export const AssetPicker: React.FC<{
  pick: Pick;
  assets: Record<string, MediaAsset>;
  urlFor: (file: string) => string;
  onClose: () => void;
}> = ({ pick, assets, urlFor, onClose }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  /**
   * What had focus before this dialog opened, so closing can hand it back.
   *
   * Captured *here*, in the effect that does the focusing, and not in the trap effect below —
   * passive effects run in declaration order, so a capture down there would always read the
   * filter box this line is about to focus, and the restore would target a node being unmounted.
   * `??=` because this effect re-runs if `keepFocus` changes while the sheet is open, and a
   * second capture would record something inside the picker.
   */
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current ??= document.activeElement as HTMLElement | null;
    if (pick.keepFocus) return;
    inputRef.current?.focus();
  }, [pick.keepFocus]);

  /**
   * Escape and the Tab trap live on `window`, not on the backdrop's `onKeyDown`.
   *
   * A React handler on the backdrop only ever sees keys pressed inside it, which is fine while
   * the filter box has focus and useless the moment focus is anywhere else — including the very
   * first Tab past the last tile, which used to land on the toolbar behind the backdrop with the
   * dialog still open and Escape no longer reaching anything. `aria-modal` is a promise that the
   * rest of the page is inert, so the trap is what makes the attribute true.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusable = sheet.querySelectorAll<HTMLElement>(
        'button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !sheet.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      // Not when the caller is holding a caret: restoring focus here would be the second thing
      // to move it, and the field it belongs to is already focused.
      if (!pick.keepFocus) previouslyFocusedRef.current?.focus?.();
    };
  }, [onClose, pick.keepFocus]);

  const files = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return Object.keys(assets)
      .filter((file) => !pick.imagesOnly || inferMediaType(file) === 'image')
      .filter((file) => !needle || file.toLowerCase().includes(needle))
      .sort();
  }, [assets, query, pick.imagesOnly]);

  return (
    <div className={styles.dialogBackdrop} onMouseDown={onClose}>
      <div
        ref={sheetRef}
        className={styles.picker}
        role="dialog"
        aria-modal="true"
        aria-label={pick.title}
        // Only stops the backdrop's dismiss. The `keepFocus` preventDefault lives on the tiles
        // instead — cancelling mousedown for the whole sheet also cancelled it for the filter
        // box, which combined with `keepFocus` skipping the autofocus meant that box could never
        // be focused at all: typing a filter went into the heading field behind the backdrop and
        // was saved to cv.json.
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.pickerHead}>
          <h2 className={styles.dialogTitle}>{pick.title}</h2>
          <input
            ref={inputRef}
            className={styles.input}
            type="search"
            placeholder={`Filter ${files.length} file${files.length === 1 ? '' : 's'}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ul className={styles.pickerGrid}>
          {files.map((file) => {
            const asset = assets[file];
            const isVideo = inferMediaType(file) === 'video';
            // A video has no thumbnail of its own — its poster is a pool file like any other,
            // and is exactly the frame the site shows at rest.
            const preview = isVideo && asset?.poster ? asset.poster : file;
            return (
              <li key={file}>
                <button
                  type="button"
                  className={styles.pickerTile}
                  data-used={pick.used?.has(file) || undefined}
                  // A mousedown focuses the button before its click fires, which would move
                  // focus off the field holding the caret this token has to land at.
                  onMouseDown={(e) => {
                    if (pick.keepFocus) e.preventDefault();
                  }}
                  onClick={() => {
                    pick.onPick(file);
                    onClose();
                  }}
                >
                  <span className={styles.pickerThumb}>
                    {isVideo && !asset?.poster ? (
                      <span className={styles.pickerVideo}>▶</span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={urlFor(preview)} alt="" loading="lazy" />
                    )}
                    {isVideo && <span className={styles.pickerBadge}>video</span>}
                  </span>
                  <span className={styles.pickerName} title={file}>
                    {file}
                  </span>
                  <span className={styles.pickerMeta}>
                    {asset ? `${asset.width}×${asset.height}` : 'not in media.json'}
                    {pick.used?.has(file) ? ' · already used' : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {files.length === 0 && <p className={styles.dialogDetail}>Nothing in the pool matches.</p>}
      </div>
    </div>
  );
};
