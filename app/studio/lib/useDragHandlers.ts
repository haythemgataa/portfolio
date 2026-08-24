'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Native HTML5 drag-and-drop for reordering a list.
 *
 * The grip is the drag *source* and the row is the drop *target* — marking the whole row
 * draggable makes browsers treat a press-and-release on it as an aborted drag and swallow the
 * click, which on this canvas would mean a row you cannot select by clicking.
 */
export function useDragHandlers(onReorder: (from: number, to: number) => void) {
  const from = useRef<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const source = useCallback(
    (index: number) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        from.current = index;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
      },
      onDragEnd: () => {
        from.current = null;
        setOver(null);
      },
    }),
    []
  );

  const target = useCallback(
    (index: number) => ({
      onDragOver: (e: React.DragEvent) => {
        // Only a reorder in progress — a file dragged in from the desktop belongs to the
        // upload dropzone underneath, and claiming it here would swallow the drop.
        if (from.current === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (over !== index) setOver(index);
      },
      onDragLeave: () => setOver((current) => (current === index ? null : current)),
      onDrop: (e: React.DragEvent) => {
        if (from.current === null) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(null);
        if (from.current !== index) onReorder(from.current, index);
        from.current = null;
      },
    }),
    [onReorder, over]
  );

  return { source, target, over };
}

/** Move an element within a list, returning a new array. */
export function move<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
