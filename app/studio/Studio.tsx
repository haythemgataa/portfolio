'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './Studio.module.css';
import { darkVariant, headingIconFiles, inferMediaType } from '../lib/contentTypes';
import type { ContactItem, CvFile, CvItem, CvSection, MediaAsset } from '../lib/contentTypes';
import type { GalleryEntry, GalleryFile } from '../lib/galleryTypes';
import CanvasShell from './canvas/CanvasShell';
import CvCanvas from './canvas/CvCanvas';
import GalleryCanvas from './canvas/GalleryCanvas';
import Inspector from './Inspector';
import { AskDialog, AssetPicker } from './Overlays';
import type { Ask } from './Overlays';
import {
  StudioContext,
  type CanvasTab,
  type Orphans,
  type Pick,
  type Selection,
  type StudioApi,
  type UploadTarget,
} from './lib/studioContext';
import { move } from './lib/useDragHandlers';

type Status = { kind: 'idle' | 'busy' | 'saved' | 'error'; message?: string };

type StudioProps = {
  initialCv?: CvFile;
  initialAssets?: Record<string, MediaAsset>;
  initialGallery?: GalleryFile;
  initialHash?: string;
  initialOrphans?: Orphans;
  loadError?: string;
};

const NO_ORPHANS: Orphans = { unregistered: [], unreferenced: [] };

/**
 * The 409 from the stale-write guard, told apart from a real failure so one
 * operation can be replayed against the refreshed document. See `run()`.
 */
class StaleContentError extends Error {}

/**
 * The Studio: the site, rendered editable, with an inspector for what the site does not show.
 *
 * This file is the orchestrator only — document state, the write path and its guards, and the
 * API the canvas and inspector consume through context. Nothing here knows what a section looks
 * like; `canvas/` does, by importing the site's own stylesheets.
 */
export default function Studio({
  initialCv,
  initialAssets = {},
  initialGallery = { items: [] },
  initialHash = '',
  initialOrphans = NO_ORPHANS,
  loadError,
}: StudioProps) {
  const [cv, setCv] = useState<CvFile | null>(initialCv ?? null);
  /** content/media.json — the single description of every pooled asset. */
  const [assets, setAssets] = useState<Record<string, MediaAsset>>(initialAssets);
  const [gallery, setGallery] = useState<GalleryFile>(initialGallery);
  const [orphans, setOrphans] = useState<Orphans>(initialOrphans);
  const [tab, setTab] = useState<CanvasTab>('cv');
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  /** Pooled asset shown in the inspector's asset panel. Independent of `selection`. */
  const [assetFile, setAssetFile] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(
    loadError ? { kind: 'error', message: loadError } : { kind: 'idle' }
  );
  const [ask, setAsk] = useState<Ask | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);

  /**
   * Stable closers. Inline arrows would be a fresh identity on every render of this component,
   * and `AssetPicker`'s effects depend on `onClose` — its cleanup restores focus to whatever was
   * focused before the dialog opened. A re-render while the picker is open (a debounced save
   * landing, say) would then tear that effect down and put focus back, pulling it out of the
   * filter box at a moment the author did not ask for.
   */
  const closeAsk = useCallback(() => setAsk(null), []);
  const closePick = useCallback(() => setPick(null), []);

  /**
   * The content hash last seen by this tab. Sent with every write so the server
   * can refuse an overwrite based on a stale view of the document.
   */
  const hashRef = useRef(initialHash);

  /**
   * Set by whichever inline field is currently open, so the inspector's icon picker can insert
   * at the caret rather than appending. Null when nothing is open — see `insertHeadingIcon`.
   */
  const insertRef = useRef<((text: string) => void) | null>(null);
  const registerInsert = useCallback(
    (fn: ((text: string) => void) | null, options?: { onlyIfCurrent?: boolean }) => {
      if (options?.onlyIfCurrent) {
        // A closing field clearing the slot must not clobber one that has already taken it.
        if (insertRef.current === fn) insertRef.current = null;
        return;
      }
      insertRef.current = fn;
    },
    []
  );

  const refresh = useCallback(async () => {
    const res = await fetch('/studio/api/tree', { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load content');
    setCv(json.cv);
    setAssets(json.assets ?? {});
    setGallery(json.gallery ?? { items: [] });
    hashRef.current = json.hash;
    setOrphans(json.orphans ?? NO_ORPHANS);
    return json.cv as CvFile;
  }, []);

  const mutate = useCallback(async (op: string, payload: Record<string, unknown> = {}) => {
    const res = await fetch('/studio/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, hash: hashRef.current, ...payload }),
    });
    const json = await res.json().catch(() => ({ error: res.statusText }));
    if (!res.ok) {
      const message = json.error || 'Request failed';
      throw res.status === 409 ? new StaleContentError(message) : new Error(message);
    }
    if (json.hash) hashRef.current = json.hash;
    return json;
  }, []);

  const run = useCallback(
    async (fn: () => Promise<unknown>, successMessage = 'Saved') => {
      setStatus({ kind: 'busy' });
      try {
        await fn();
      } catch (error) {
        // A stale hash means the files moved under an open tab: a git checkout,
        // an editor, another Studio window. Resyncing here is not enough on its
        // own — it used to leave the click itself unapplied, which read as a
        // dead button. Every operation routed through `run` is addressed by id,
        // or (for a reorder) validated against the document and rejected on a
        // mismatch, so replaying one against the refreshed document does what
        // was asked. Field edits deliberately do not come through here: their
        // payload is a whole value, and replaying that could overwrite a change
        // this tab never saw.
        if (!(error instanceof StaleContentError)) {
          setStatus({ kind: 'error', message: (error as Error).message });
          await refresh().catch(() => {});
          return;
        }
        try {
          await refresh();
          await fn();
        } catch (retryError) {
          setStatus({ kind: 'error', message: (retryError as Error).message });
          await refresh().catch(() => {});
          return;
        }
      }
      await refresh();
      setStatus({ kind: 'saved', message: successMessage });
    },
    [refresh]
  );

  /**
   * The document arrives with the server render, so an out-of-band change —
   * notably `git checkout -- content public/media`, the documented undo — would
   * otherwise stay invisible in an open tab. Mutations already re-read on their
   * own; this covers everything else.
   */
  useEffect(() => {
    const onFocus = () => {
      refresh().catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  // ---- field editing (debounced autosave) --------------------------------
  /**
   * One pending timer *per field*, not one for the whole tool.
   *
   * A single shared timer was silently lossy: each payload carries only the
   * field it belongs to (`data: { [key]: value }`) and the server merge-patches
   * it, so the cancelled timeout was the sole carrier of that value. Typing a
   * heading and tabbing to the subheading inside the debounce window sent only
   * the subheading, reported "Saved", and left the optimistic copy showing a
   * heading that had never been written — until the next `refresh()` replaced it
   * with what was actually on disk. Keyed by op+target+field, so consecutive
   * edits to *one* field still collapse into a single write.
   */
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const queueMutate = useCallback(
    (key: string, op: string, payload: Record<string, unknown>, message = 'Saved') => {
      const timers = saveTimers.current;
      const pending = timers.get(key);
      if (pending) clearTimeout(pending);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          setStatus({ kind: 'busy' });
          mutate(op, payload)
            .then(() => setStatus({ kind: 'saved', message }))
            .catch((error) => setStatus({ kind: 'error', message: error.message }));
        }, 600)
      );
    },
    [mutate]
  );

  // A timer that outlives the tool would fire a write against an unmounted tree.
  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const queueSave = useCallback(
    (key: string, op: string, payload: Record<string, unknown>, patch: (draft: CvFile) => void) => {
      // Optimistic local edit so typing stays responsive.
      setCv((prev) => {
        if (!prev) return prev;
        const draft = structuredClone(prev);
        patch(draft);
        return draft;
      });
      queueMutate(key, op, payload);
    },
    [queueMutate]
  );

  // ---- the API the canvas and inspector consume ---------------------------

  const urlFor = useCallback((file: string) => `/media/${file}`, []);

  /**
   * `null` means *remove the key*, and callers use it for the optional list fields when they
   * empty out. `mergePatch` deletes on `''`/`null`/`undefined` and has no case for an empty array,
   * so `[]` would be written into cv.json verbatim — a committed diff line the schema says should
   * be an absent key, and one nothing in the UI could then remove. Normalising at the call site is
   * the same trade `removeMediaRef` makes for `media`: teaching `mergePatch` about empty arrays
   * would change the contract for every caller in order to fix two fields.
   *
   * **`null` and not `undefined`, and the difference is the whole mechanism.** The payload is
   * serialised with `JSON.stringify`, which *drops* keys whose value is `undefined` — so an
   * `undefined` here never reaches the server as a key at all, `mergePatch` is handed `{}`, and
   * the field is silently left exactly as it was. It reads as a removal that does nothing.
   * `null` survives serialisation and hits the same delete branch.
   */
  const setProfileField = useCallback(
    (key: string, value: string | string[] | null) => {
      queueSave(`profile.update::${key}`, 'profile.update', { data: { [key]: value } }, (draft) => {
        const profile = draft.profile as unknown as Record<string, unknown>;
        // The optimistic copy mirrors what the server will do, so the canvas does not show a
        // `null` where the document will have nothing.
        if (value === null) delete profile[key];
        else profile[key] = value;
      });
    },
    [queueSave]
  );

  const setItemField = useCallback(
    (sectionKey: string, itemId: string, key: string, value: string) => {
      queueSave(
        `item.update:${sectionKey}/${itemId}:${key}`,
        'item.update',
        { sectionKey, itemId, data: { [key]: value } },
        (draft) => {
          const item = draft.sections
            .find((s) => s.key === sectionKey)
            ?.items.find((i) => i.id === itemId);
          if (item) (item as unknown as Record<string, unknown>)[key] = value;
        }
      );
    },
    [queueSave]
  );

  const setContactField = useCallback(
    (itemId: string, key: string, value: string) => {
      queueSave(
        `contact.update:${itemId}:${key}`,
        'contact.update',
        { itemId, data: { [key]: value } },
        (draft) => {
          const row = draft.contact.items.find((i) => i.id === itemId);
          if (row) (row as unknown as Record<string, unknown>)[key] = value;
        }
      );
    },
    [queueSave]
  );

  const setGalleryField = useCallback(
    (itemId: string, key: string, value: string | string[] | null) => {
      // gallery.json is a peer document, so it is patched separately from cv.
      setGallery((prev) => ({
        ...prev,
        items: (prev.items ?? []).map((e) => {
          if (e.id !== itemId) return e;
          const next = { ...e } as unknown as Record<string, unknown>;
          // `null` is a removal — see `setProfileField`.
          if (value === null) delete next[key];
          else next[key] = value;
          return next as unknown as GalleryEntry;
        }),
      }));
      queueMutate(`gallery.update:${itemId}:${key}`, 'gallery.update', {
        itemId,
        data: { [key]: value },
      });
    },
    [queueMutate]
  );

  const setAssetField = useCallback(
    (file: string, key: string, value: string | boolean) => {
      // The optimistic copy has to be typed the way the registry stores it, or a flag
      // round-trips through Number() and comes back as 0.
      const local = typeof value === 'boolean' || key === 'poster' ? value : Number(value) || 0;
      setAssets((prev) => ({ ...prev, [file]: { ...prev[file], [key]: local } }));
      queueMutate(`asset.update:${file}:${key}`, 'asset.update', { file, data: { [key]: value } }, 'Asset updated');
    },
    [queueMutate]
  );

  // ---- structure ----------------------------------------------------------

  const addSection = useCallback(
    (label: string) => {
      run(async () => {
        const res: { sectionKey?: string } = await mutate('section.create', { label });
        if (res.sectionKey) setSelection({ kind: 'section', sectionKey: res.sectionKey });
      }, 'Section created');
    },
    [mutate, run]
  );

  const renameSection = useCallback(
    (sectionKey: string, label: string) => {
      queueSave(
        `section.rename:${sectionKey}`,
        'section.rename',
        { sectionKey, label },
        (draft) => {
          const section = draft.sections.find((s) => s.key === sectionKey);
          if (section) section.label = label;
        }
      );
    },
    [queueSave]
  );

  const deleteSection = useCallback(
    (target: CvSection) => {
      const count = target.items.length;
      setAsk({
        title: `Delete the "${target.label}" section?`,
        detail: [
          `Removes ${count} item${count === 1 ? '' : 's'} from cv.json. Any media of theirs that nothing else references is deleted from the pool.`,
          'Undo with: git checkout -- content public/media',
        ],
        confirmLabel: 'Delete section',
        danger: true,
        onConfirm: () =>
          run(async () => {
            await mutate('section.delete', { sectionKey: target.key });
            setSelection({ kind: 'none' });
          }, 'Section deleted'),
      });
    },
    [mutate, run]
  );

  const moveSection = useCallback(
    (from: number, to: number) => {
      if (!cv) return;
      const next = move(cv.sections, from, to);
      setCv({ ...cv, sections: next });
      run(() => mutate('section.reorder', { order: next.map((s) => s.key) }), 'Sections reordered');
    },
    [cv, mutate, run]
  );

  const addItem = useCallback(
    (sectionKey: string) => {
      run(async () => {
        // Created empty and named on the canvas: an item's fields are all free text, so there
        // is nothing a dialog could ask that the page cannot ask better.
        const res: { itemId?: string } = await mutate('item.create', { sectionKey, data: {} });
        if (res.itemId) setSelection({ kind: 'item', sectionKey, itemId: res.itemId });
      }, 'Item added');
    },
    [mutate, run]
  );

  const deleteItem = useCallback(
    (sectionKey: string, item: CvItem) => {
      setAsk({
        title: `Delete "${item.heading || item.id}"?`,
        detail: [
          'Any media of its own that nothing else references is deleted from the pool.',
          'Undo with: git checkout -- content public/media',
        ],
        confirmLabel: 'Delete',
        danger: true,
        onConfirm: () =>
          run(async () => {
            await mutate('item.delete', { sectionKey, itemId: item.id });
            setSelection({ kind: 'section', sectionKey });
          }, 'Item deleted'),
      });
    },
    [mutate, run]
  );

  const moveItem = useCallback(
    (sectionKey: string, from: number, to: number) => {
      const section = cv?.sections.find((s) => s.key === sectionKey);
      if (!section) return;
      const order = move(section.items, from, to).map((i) => i.id);
      run(() => mutate('item.reorder', { sectionKey, order }), 'Items reordered');
    },
    [cv, mutate, run]
  );

  const renameContact = useCallback(
    (label: string) => {
      queueSave('contact.rename', 'contact.rename', { label }, (draft) => {
        draft.contact.label = label;
      });
    },
    [queueSave]
  );

  const addContactRow = useCallback(() => {
    run(async () => {
      // `data: {}`, and the empty object is the point. `createContactItem` seeds the row with
      // `{ id, platform: '', handle: '' }` and then merge-patches this over it — and `mergePatch`
      // *deletes* a key whose patch value is `''`. So passing the two empty strings explicitly
      // stripped both required fields and wrote a bare `{ "id": "contact-row" }`, which the
      // schema forbids and the built site renders as an empty row with a stray link arrow.
      // Passing nothing leaves the seed intact.
      const res: { itemId?: string } = await mutate('contact.create', { data: {} });
      if (res.itemId) setSelection({ kind: 'contactRow', itemId: res.itemId });
    }, 'Contact row added');
  }, [mutate, run]);

  const deleteContactRow = useCallback(
    (item: ContactItem) => {
      setAsk({
        title: `Delete "${item.platform || item.id}"?`,
        detail: ['Undo with: git checkout -- content public/media'],
        confirmLabel: 'Delete',
        danger: true,
        onConfirm: () =>
          run(async () => {
            await mutate('contact.delete', { itemId: item.id });
            setSelection({ kind: 'contact' });
          }, 'Contact row deleted'),
      });
    },
    [mutate, run]
  );

  const moveContactRow = useCallback(
    (from: number, to: number) => {
      const items = cv?.contact?.items ?? [];
      const order = move(items, from, to).map((i) => i.id);
      run(() => mutate('contact.reorder', { order }), 'Contact rows reordered');
    },
    [cv, mutate, run]
  );

  const addGalleryEntry = useCallback(
    (file: string) => {
      run(async () => {
        const res: { itemId?: string } = await mutate('gallery.create', { file });
        if (res.itemId) setSelection({ kind: 'galleryEntry', id: res.itemId });
        setAssetFile(file);
      }, `${file} added to the gallery`);
    },
    [mutate, run]
  );

  /** Filenames the gallery references. */
  const galleryUses = useMemo(
    () => new Set((gallery.items ?? []).map((e) => e.file)),
    [gallery]
  );

  /**
   * The mirror image: filenames the CV references. Must count every kind of reference the
   * server's `collectReferences` does — a kind missing here would have the UI offer to delete a
   * file the CV is still showing.
   */
  const cvUses = useMemo(() => {
    const used = new Set<string>();
    if (cv?.profile?.photo) used.add(cv.profile.photo);
    // Counted for the same reason the server counts it — see `collectReferences`.
    for (const f of cv?.profile?.galleryPreview ?? []) used.add(f);
    for (const s of cv?.sections ?? []) {
      for (const i of s.items ?? []) {
        for (const f of i.media ?? []) used.add(f);
        for (const f of headingIconFiles(i.heading)) {
          used.add(f);
          // Counted for the same reason the server counts it — see `collectReferences`.
          const dark = darkVariant(f);
          if (dark && assets[dark]) used.add(dark);
        }
      }
    }
    // A poster is reachable only through its video, so it is used exactly when that video is —
    // the registry pass `collectReferences` makes. Without it the UI offered to delete a poster
    // with "Nothing else references it", while the server (correctly) kept it.
    for (const [file, asset] of Object.entries(assets)) {
      if (asset.poster && used.has(file)) used.add(asset.poster);
    }
    return used;
    // `assets` matters as well as `cv`: whether a `-dark` sibling counts depends on it being in
    // the registry, so uploading one has to recompute this set.
  }, [cv, assets]);

  const deleteGalleryEntry = useCallback(
    (entry: GalleryEntry) => {
      // Removing an entry drops the reference and nothing else — the file stays in the pool
      // either way, which is the same rule detaching a CV thumbnail follows. The note only says
      // whether anything else still points at it, since an entry that was the last reference
      // leaves the file behind as an orphan.
      setAsk({
        title: `Remove "${entry.title || entry.file}" from the gallery?`,
        detail: [
          cvUses.has(entry.file)
            ? `The CV also uses ${entry.file}, so the file keeps its place in public/media/.`
            : `${entry.file} stays in public/media/ and in media.json, so it can be added again from the pool. Nothing else references it, so it will show up as an orphan until it is.`,
          'Undo with: git checkout -- content public/media',
        ],
        confirmLabel: 'Remove',
        danger: true,
        onConfirm: () =>
          run(async () => {
            await mutate('gallery.delete', { itemId: entry.id });
            setSelection({ kind: 'none' });
          }, 'Gallery entry removed'),
      });
    },
    [cvUses, mutate, run]
  );

  const moveGalleryEntry = useCallback(
    (from: number, to: number) => {
      const order = move(gallery.items ?? [], from, to).map((e) => e.id);
      run(() => mutate('gallery.reorder', { order }), 'Gallery reordered');
    },
    [gallery, mutate, run]
  );

  const setGalleryEntryFile = useCallback(
    (itemId: string, file: string) => {
      run(() => mutate('gallery.setFile', { itemId, file }), 'Asset changed');
      setAssetFile(file);
    },
    [mutate, run]
  );

  // ---- media --------------------------------------------------------------

  const attachMedia = useCallback(
    (sectionKey: string, itemId: string, file: string) => {
      run(
        () => mutate('media.attach', { sectionKey, itemId, files: [file] }),
        `${file} added to this item`
      );
    },
    [mutate, run]
  );

  const detachMedia = useCallback(
    (sectionKey: string, itemId: string, file: string) => {
      run(
        () => mutate('media.remove', { sectionKey, itemId, file }),
        `${file} removed from this item — still in the pool`
      );
    },
    [mutate, run]
  );

  const moveMedia = useCallback(
    (sectionKey: string, itemId: string, from: number, to: number) => {
      const item = cv?.sections.find((s) => s.key === sectionKey)?.items.find((i) => i.id === itemId);
      if (!item) return;
      const order = move(item.media ?? [], from, to);
      run(() => mutate('media.reorder', { sectionKey, itemId, order }), 'Media reordered');
    },
    [cv, mutate, run]
  );

  const upload = useCallback(
    (files: FileList | null, target: UploadTarget) => {
      if (!files || files.length === 0) return;
      const picked = Array.from(files);

      run(async () => {
        // Built inside the callback, not outside it. A FormData freezes the hash at the moment
        // it is assembled, so a replay after `run` resyncs would have re-sent the stale one and
        // 409'd again for as long as the tab was open — which is why the 409 is also classified
        // as `StaleContentError` here, the way `mutate` does it. Upload was the one operation
        // that could not recover from a stale hash.
        const form = new FormData();
        form.append('attachTo', target.kind === 'gallery' ? 'gallery' : 'cv');
        if (target.kind === 'item') {
          form.append('sectionKey', target.sectionKey);
          form.append('itemId', target.itemId);
        }
        form.append('hash', hashRef.current);
        picked.forEach((file) => form.append('files', file));

        const res = await fetch('/studio/api/media', { method: 'POST', body: form });
        const json = await res.json().catch(() => ({ error: res.statusText }));
        if (!res.ok) {
          const message = json.error || 'Upload failed';
          throw res.status === 409 ? new StaleContentError(message) : new Error(message);
        }
        if (json.hash) hashRef.current = json.hash;
        if (target.kind === 'gallery' && json.createdIds?.length) {
          setSelection({ kind: 'galleryEntry', id: json.createdIds[0] });
        }
        if (json.warning) throw new Error(json.warning);
      }, 'Media uploaded');
    },
    [run]
  );

  const setGalleryPreview = useCallback(
    (files: string[]) => setProfileField('galleryPreview', files),
    [setProfileField]
  );

  /**
   * Drop an `[filename]` icon token into a heading.
   *
   * Positional by nature, which is the whole point of the token — so it inserts at the caret of
   * the open heading field when there is one, and appends when there is not. The picker button
   * cancels its own mousedown precisely so the field stays open long enough for this to have a
   * caret to aim at.
   */
  const insertHeadingIcon = useCallback(
    (sectionKey: string, itemId: string, file: string) => {
      const token = `[${file}]`;
      const insert = insertRef.current;
      if (insert) {
        insert(token);
        return;
      }
      const item = cv?.sections
        .find((s) => s.key === sectionKey)
        ?.items.find((i) => i.id === itemId);
      const current = item?.heading ?? '';
      setItemField(sectionKey, itemId, 'heading', current ? `${current} ${token}` : token);
    },
    [cv, setItemField]
  );

  const poolFiles = useMemo(() => Object.keys(assets).sort(), [assets]);
  const imagePoolFiles = useMemo(
    () => poolFiles.filter((file) => inferMediaType(file) === 'image'),
    [poolFiles]
  );

  const select = useCallback((next: Selection) => {
    setSelection(next);
    // An asset panel belongs to whatever was clicked; moving to something else without an
    // asset of its own would otherwise leave the previous file's dimensions on screen under a
    // heading that has nothing to do with it.
    if (next.kind !== 'item' && next.kind !== 'galleryEntry') setAssetFile(null);
  }, []);

  const api: StudioApi | null = useMemo(() => {
    if (!cv) return null;
    return {
      cv,
      assets,
      gallery,
      orphans,
      urlFor,
      tab,
      setTab,
      selection,
      select,
      assetFile,
      selectAsset: setAssetFile,
      setProfileField,
      setItemField,
      setContactField,
      setGalleryField,
      setAssetField,
      addSection,
      renameSection,
      deleteSection,
      moveSection,
      addItem,
      deleteItem,
      moveItem,
      renameContact,
      addContactRow,
      deleteContactRow,
      moveContactRow,
      addGalleryEntry,
      deleteGalleryEntry,
      moveGalleryEntry,
      setGalleryEntryFile,
      attachMedia,
      detachMedia,
      moveMedia,
      upload,
      setGalleryPreview,
      insertHeadingIcon,
      registerInsert,
      poolFiles,
      imagePoolFiles,
      cvUses,
      galleryUses,
      pickAsset: setPick,
    };
  }, [
    cv, assets, gallery, orphans, urlFor, tab, selection, select, assetFile,
    setProfileField, setItemField, setContactField, setGalleryField, setAssetField,
    addSection, renameSection, deleteSection, moveSection, addItem, deleteItem, moveItem,
    renameContact, addContactRow, deleteContactRow, moveContactRow,
    addGalleryEntry, deleteGalleryEntry, moveGalleryEntry, setGalleryEntryFile,
    attachMedia, detachMedia, moveMedia, upload, setGalleryPreview,
    insertHeadingIcon, registerInsert, poolFiles, imagePoolFiles, cvUses, galleryUses,
  ]);

  /**
   * Escape clears the selection, which is also what closes the inspector's panels.
   *
   * Both guards below are corrections. An inline `Editable` stops Escape itself, but nothing else
   * did: the inspector's Link and dimension boxes, the add-section field, and both dialogs all let
   * it through, so Escape-as-"I'm done with this field" also deselected — unmounting the very
   * panel being typed into — and Escape-to-dismiss-a-dialog silently threw away the selection the
   * dialog was about. Testing the event's target and the open overlays here fixes every one of
   * them in one place, rather than adding a `stopPropagation` to each field and waiting to forget
   * one.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (ask || pick) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      setSelection({ kind: 'none' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ask, pick]);

  // `api` is null exactly when `cv` is, so testing the document is the same test — and it is
  // the one that does not make the linter trace the memo back to `insertRef`.
  if (!cv) {
    return (
      <div className={styles.studio}>
        <div className={styles.empty}>Could not load content/cv.json. {status.message}</div>
      </div>
    );
  }

  return (
    <StudioContext.Provider value={api}>
      <div className={styles.studio}>
        {ask && <AskDialog ask={ask} onClose={closeAsk} />}
        {pick && (
          <AssetPicker pick={pick} assets={assets} urlFor={urlFor} onClose={closePick} />
        )}

        <header className={styles.topbar}>
          <div className={styles.brand}>
            Content Studio
            <span className={styles.devBadge}>dev only</span>
          </div>
          <div className={styles.topbarRight}>
            <span className={`${styles.status} ${styles[`status_${status.kind}`]}`}>
              {status.kind === 'busy' ? 'Saving…' : status.message || ''}
            </span>
            <a className={styles.link} href="/" target="_blank" rel="noreferrer">
              Open site ↗
            </a>
          </div>
        </header>

        <div className={styles.body}>
          <CanvasShell>{tab === 'cv' ? <CvCanvas /> : <GalleryCanvas />}</CanvasShell>
          <Inspector />
        </div>
      </div>
    </StudioContext.Provider>
  );
}
