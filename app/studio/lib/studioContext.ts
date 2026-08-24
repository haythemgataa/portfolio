'use client';

import { createContext, useContext } from 'react';
import type { ContactItem, CvFile, CvItem, CvSection, MediaAsset } from '../../lib/contentTypes';
import type { GalleryEntry, GalleryFile } from '../../lib/galleryTypes';

/**
 * What the canvas and the inspector are both looking at, and everything they can do to it.
 *
 * It is a context rather than props because the canvas is the *site's* component tree in
 * miniature — a header, a tab bar, sections, items, thumbnail rows, a footer — and threading a
 * dozen callbacks down through that shape would mean every one of those components taking props
 * it only passes on. The document is small and every mutation is addressed by id, so there is
 * nothing here that a deeper component could not equally well ask for directly.
 */

/** What the inspector is describing, and what the canvas draws a selection ring around. */
export type Selection =
  | { kind: 'none' }
  /** The pinned block at the top: name, byline, About, the gallery teaser, the footer location. */
  | { kind: 'profile' }
  | { kind: 'section'; sectionKey: string }
  | { kind: 'item'; sectionKey: string; itemId: string }
  | { kind: 'contact' }
  | { kind: 'contactRow'; itemId: string }
  | { kind: 'gallery' }
  | { kind: 'galleryEntry'; id: string };

export type Orphans = { unregistered: string[]; unreferenced: string[] };

/** Which of the site's two routes the canvas is showing. */
export type CanvasTab = 'cv' | 'gallery';

/** Where an upload should attach itself. */
export type UploadTarget =
  | { kind: 'item'; sectionKey: string; itemId: string }
  | { kind: 'gallery' };

export type StudioApi = {
  // ---- the document -------------------------------------------------------
  cv: CvFile;
  assets: Record<string, MediaAsset>;
  gallery: GalleryFile;
  orphans: Orphans;

  /**
   * How the canvas turns a pool filename into a URL.
   *
   * Plain `/media/<file>`, with none of the content hash `assetUrl` adds at build time — that
   * one reads the file's bytes, which the browser cannot do, and the Studio does not need it:
   * dev serves the pool uncached, and a file that has just been rewritten has to be re-fetched
   * rather than pinned. See the note at the top of `lib/resolveContent.ts`.
   */
  urlFor: (file: string) => string;

  // ---- what is being looked at -------------------------------------------
  tab: CanvasTab;
  setTab: (tab: CanvasTab) => void;
  selection: Selection;
  select: (selection: Selection) => void;
  /** The pooled asset the inspector is describing, if any. Independent of `selection`. */
  assetFile: string | null;
  selectAsset: (file: string | null) => void;

  // ---- field edits (debounced, optimistic) --------------------------------
  /** `null` removes the key — see the note on `setProfileField` in Studio.tsx. */
  setProfileField: (key: string, value: string | string[] | null) => void;
  setItemField: (sectionKey: string, itemId: string, key: string, value: string) => void;
  setContactField: (itemId: string, key: string, value: string) => void;
  /** `null` removes the key, for the same reason — see `setProfileField`. */
  setGalleryField: (id: string, key: string, value: string | string[] | null) => void;
  setAssetField: (file: string, key: string, value: string | boolean) => void;

  // ---- structure ----------------------------------------------------------
  addSection: (label: string) => void;
  renameSection: (sectionKey: string, label: string) => void;
  deleteSection: (section: CvSection) => void;
  moveSection: (from: number, to: number) => void;

  addItem: (sectionKey: string) => void;
  deleteItem: (sectionKey: string, item: CvItem) => void;
  moveItem: (sectionKey: string, from: number, to: number) => void;

  renameContact: (label: string) => void;
  addContactRow: () => void;
  deleteContactRow: (item: ContactItem) => void;
  moveContactRow: (from: number, to: number) => void;

  addGalleryEntry: (file: string) => void;
  deleteGalleryEntry: (entry: GalleryEntry) => void;
  moveGalleryEntry: (from: number, to: number) => void;
  setGalleryEntryFile: (id: string, file: string) => void;

  // ---- media --------------------------------------------------------------
  attachMedia: (sectionKey: string, itemId: string, file: string) => void;
  detachMedia: (sectionKey: string, itemId: string, file: string) => void;
  moveMedia: (sectionKey: string, itemId: string, from: number, to: number) => void;
  upload: (files: FileList | null, target: UploadTarget) => void;
  setGalleryPreview: (files: string[]) => void;

  /**
   * Drop an `[filename]` token into a heading — at the caret of the open field when there is
   * one, appended when there is not.
   */
  insertHeadingIcon: (sectionKey: string, itemId: string, file: string) => void;
  /**
   * Registered by whichever inline field is open, so the inspector's icon picker can reach
   * into it. The field is the only thing that knows its own caret and its own draft, and the
   * token is positional — appending it would put a logo at the end of every heading.
   */
  registerInsert: (
    insert: ((text: string) => void) | null,
    options?: {
      /**
       * Only clear the slot if it still holds *this* callback. A field closing after another has
       * opened would otherwise deregister its successor: clicking straight from one field into
       * the next opens the second before the first blurs.
       */
      onlyIfCurrent?: boolean;
    }
  ) => void;

  // ---- derived ------------------------------------------------------------
  poolFiles: string[];
  imagePoolFiles: string[];
  /** Filenames the CV references. Mirrors the server's `collectReferences`. */
  cvUses: Set<string>;
  /** Filenames the gallery references. */
  galleryUses: Set<string>;

  /** Opens the pool picker. Resolves through the callback rather than a promise so a
      cancelled pick simply never calls back. */
  pickAsset: (options: Pick) => void;
};

/**
 * What a pool pick asks for. Declared here rather than beside the component because both the
 * callers and `AssetPicker` need it, and a second copy of the shape is a copy that drifts —
 * `keepFocus` was added to one of them and immediately failed to typecheck at the other.
 */
export type Pick = {
  title: string;
  /** Images only — a heading icon is drawn at 20px, where a video is meaningless. */
  imagesOnly?: boolean;
  /** Marked in the grid as already in use here, but still pickable. */
  used?: Set<string>;
  onPick: (file: string) => void;
  /**
   * Leave the caller's focus where it is instead of taking it for the filter box.
   *
   * Only the heading-icon picker sets it, and it is the difference between that feature working
   * and being dead code. An `[filename]` token is *positional* — it has to land at the caret —
   * and the only thing that knows the caret is the open inline field, which registers a callback
   * while it is focused. Autofocusing the dialog blurred that field, which committed it,
   * unmounted the `<input>` and cleared the registration, so by the time a tile was pressed the
   * token could only be appended. The caller's button already cancels its own mousedown for the
   * same reason; this is the other half of it.
   */
  keepFocus?: boolean;
};

export const StudioContext = createContext<StudioApi | null>(null);

export function useStudio(): StudioApi {
  const api = useContext(StudioContext);
  if (!api) throw new Error('useStudio must be used inside the Studio');
  return api;
}

/** Whether two selections address the same thing. */
export function sameSelection(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'section':
      return a.sectionKey === (b as { sectionKey: string }).sectionKey;
    case 'item':
      return (
        a.sectionKey === (b as { sectionKey: string }).sectionKey &&
        a.itemId === (b as { itemId: string }).itemId
      );
    case 'contactRow':
      return a.itemId === (b as { itemId: string }).itemId;
    case 'galleryEntry':
      return a.id === (b as { id: string }).id;
    default:
      return true;
  }
}
