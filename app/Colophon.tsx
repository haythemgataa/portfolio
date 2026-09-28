"use client";

import { useEffect, useId, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { COLOPHON } from "./lib/colophon";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { useScrollLock } from "./useScrollLock";
import footer from "./SiteFooter.module.css";
import styles from "./Colophon.module.css";

/**
 * The one spring every overlay on this site uses, taken from `Lightbox.tsx` rather than picked
 * again here. Two overlays easing differently is a difference a reader can feel and nobody chose.
 */
const CHROME_SPRING = { type: 'spring', stiffness: 700, damping: 50 } as const;

/**
 * What the site is made of, in a dialog off the footer — the note at the back of the book.
 *
 * The trigger and the dialog live in one file so the trigger can own the `AnimatePresence` — the
 * arrangement `Gallery.tsx` uses for the lightbox, and the reason the exit animation runs at all:
 * a component cannot animate its own unmount.
 */
const Colophon: React.FC = () => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={footer.colophon}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Colophon
      </button>
      <AnimatePresence>
        {open ? (
          <ColophonDialog
            close={() => {
              setOpen(false);
              // Handed back explicitly rather than left to the dialog's own unmount cleanup: the
              // element that had focus when the dialog opened *is* this button, and it is the only
              // thing on screen that says what just closed.
              triggerRef.current?.focus();
            }}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
};

/**
 * The dialog. Mounted only while open, which is what lets it portal without a mount guard: it can
 * only be reached from client state that a press sets, so it is never part of a server render.
 * (`Lightbox.tsx` gets away without one for the same reason.)
 *
 * Everything structural here is the lightbox's, deliberately — it is the only shippable overlay
 * this codebase has, and the Studio's `AskDialog` is not a precedent to copy: it has no portal, no
 * scroll lock and no focus trap, because the Studio is already `fixed; inset: 0` and owns the
 * screen. What is reused: the `window`-level key handler, the focus round trip, the
 * reference-counted scroll lock (as a shared hook, since a second copy of that counter is a bug),
 * the backdrop-as-sibling layering, and the close button's two-span cross.
 *
 * What differs, and only this: the backdrop **veils** rather than replaces. The lightbox is a total
 * takeover of the gallery and so paints an opaque `--background-primary`; this is a panel over a
 * page you are still reading, so it takes `--backdrop`, the token `globals.css` has carried since
 * the Studio needed it and nothing on the site had yet used.
 */
const ColophonDialog: React.FC<{ close: () => void }> = ({ close }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const prefersReducedMotion = usePrefersReducedMotion();

  useScrollLock();

  // Focus in on open. Handing it back is the caller's job — see the note on `close` above.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  /**
   * Escape, and the Tab trap that makes `aria-modal` a promise rather than a claim.
   *
   * On `window` rather than a React `onKeyDown`, which is the trap the lightbox documents: a
   * subtree handler only fires for keys pressed *inside* the subtree, so it stops working the
   * moment focus escapes — exactly the situation a trap exists for. The `!root.contains(active)`
   * branch is the recovery path for focus that has already leaked.
   */
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); return }
      if (event.key !== 'Tab') { return }

      const root = dialogRef.current;
      if (!root) { return }
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => !el.hasAttribute('tabindex') || el.getAttribute('tabindex') !== '-1');
      if (focusable.length === 0) { return }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !root.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !root.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('keydown', handleKey); };
  }, [close]);

  return ReactDOM.createPortal(
    <div
      ref={dialogRef}
      className={styles.root}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* A sibling under the sheet rather than its parent, which is what saves the content a
          `stopPropagation`: the sheet paints above by z-index, so a press on it never reaches
          here. `aria-hidden` because the close button already carries the dismiss. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={CHROME_SPRING}
        className={styles.backdrop}
        aria-hidden="true"
        onClick={close}
      />
      <motion.div
        // The fade carries *what changed* and the scale is the ornament, so reduced motion keeps
        // the first and drops the second — the split the lightbox's own stepping already makes.
        initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.97 }}
        transition={CHROME_SPRING}
        className={styles.sheet}
      >
        <button
          ref={closeRef}
          type="button"
          className={styles.close}
          aria-label="Close colophon"
          onClick={close}
        >
          {/* Two real spans, not `::before`/`::after`: pseudo-elements cannot be moved as a unit,
              since each would carry its own rotation and the press would have to be written into
              both transforms. They stack in one grid cell, so there is no translate for those
              rotations to compose with. Straight from `Lightbox.module.css`. */}
          <span className={styles.closeIcon} aria-hidden="true">
            <span className={styles.closeBar} />
            <span className={styles.closeBar} />
          </span>
        </button>

        <h2 id={titleId} className={styles.title}>Colophon</h2>

        <div className={styles.groups}>
          {COLOPHON.map((group) => (
            <section key={group.label} className={styles.group}>
              <h3 className={styles.groupLabel}>{group.label}</h3>
              <ul className={styles.list}>
                {group.items.map((item) => (
                  <li key={item.name} className={styles.item}>
                    {item.href ? (
                      <a
                        className={styles.link}
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {item.name}
                      </a>
                    ) : (
                      <span className={styles.name}>{item.name}</span>
                    )}
                    {item.note ? <span className={styles.note}>{item.note}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
};

export default Colophon;
