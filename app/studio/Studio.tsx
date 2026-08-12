"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './Studio.module.css';
import {
  ASSET_FIELDS,
  CONTACT_FIELDS,
  GALLERY_FIELDS,
  ITEM_FIELDS,
  PROFILE_FIELDS,
  SECTION_SUGGESTIONS,
} from './lib/schema';
import type { FieldDef } from './lib/schema';
import { inferMediaType } from '../lib/contentTypes';
import type { ContactItem, CvFile, CvItem, CvSection, MediaAsset } from '../lib/contentTypes';
import type { GalleryEntry, GalleryFile } from '../lib/galleryTypes';

type Status = { kind: 'idle' | 'busy' | 'saved' | 'error'; message?: string };

/** Which region the editor is showing. Profile and contact are pinned. */
type Selection =
  | { kind: 'profile' }
  | { kind: 'section'; key: string }
  | { kind: 'contact' }
  | { kind: 'gallery' };

type Row = CvItem | ContactItem | GalleryEntry;

const isContact = (row: Row): row is ContactItem => 'platform' in row;
const isGallery = (row: Row): row is GalleryEntry => 'file' in row;

function move<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Native HTML5 drag-and-drop. The grip is the drag source and the row is the
 * drop target — marking the whole row draggable makes browsers treat a
 * press-and-release on it as an aborted drag and swallow the click.
 */
function useDragHandlers(onReorder: (from: number, to: number) => void) {
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
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (over !== index) setOver(index);
      },
      onDragLeave: () => setOver((cur) => (cur === index ? null : cur)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setOver(null);
        if (from.current !== null && from.current !== index) onReorder(from.current, index);
        from.current = null;
      },
    }),
    [onReorder, over]
  );

  return { source, target, over };
}

type Orphans = { unregistered: string[]; unreferenced: string[] };

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
 * So the Studio has no native dialogs left. Both halves matter: the confirmations are the ones
 * that failed dangerously, and the prompts are what got the checkbox ticked in the first
 * place. An in-app dialog cannot be suppressed by the browser, so a click always produces
 * either a question or an action.
 */
type Ask = {
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
 * The 409 from the stale-write guard, told apart from a real failure so one
 * operation can be replayed against the refreshed document. See `run()`.
 */
class StaleContentError extends Error {}

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
  /** Read-only here; used to show which assets the gallery also uses. */
  const [gallery, setGallery] = useState<GalleryFile>(initialGallery);
  const [orphans, setOrphans] = useState<Orphans>(initialOrphans);
  const [selection, setSelection] = useState<Selection>({ kind: 'profile' });
  const [itemId, setItemId] = useState<string | null>(null);
  /** Pooled asset shown in the asset panel, so dimensions can be corrected. */
  const [assetFile, setAssetFile] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(
    loadError ? { kind: 'error', message: loadError } : { kind: 'idle' }
  );
  /** The open dialog, if any. See the `Ask` type for why these are not native dialogs. */
  const [ask, setAsk] = useState<Ask | null>(null);

  /**
   * The content hash last seen by this tab. Sent with every write so the server
   * can refuse an overwrite based on a stale view of the document.
   */
  const hashRef = useRef(initialHash);

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
   * The document now arrives with the server render, so an out-of-band change —
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

  const section = useMemo<CvSection | null>(() => {
    if (!cv || selection.kind !== 'section') return null;
    return cv.sections.find((s) => s.key === selection.key) ?? null;
  }, [cv, selection]);

  const rows = useMemo<Row[]>(() => {
    if (!cv) return [];
    if (selection.kind === 'section') return section?.items ?? [];
    if (selection.kind === 'contact') return cv.contact?.items ?? [];
    if (selection.kind === 'gallery') return gallery.items ?? [];
    return [];
  }, [cv, gallery, section, selection]);

  /** Every pooled filename, for the "use an existing asset" pickers. */
  const poolFiles = useMemo(() => Object.keys(assets).sort(), [assets]);

  const activeItem = useMemo(() => rows.find((r) => r.id === itemId) ?? null, [rows, itemId]);

  // ---- field editing (debounced autosave) --------------------------------
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queueSave = useCallback(
    (op: string, payload: Record<string, unknown>, patch: (draft: CvFile) => void) => {
      // Optimistic local edit so typing stays responsive.
      setCv((prev) => {
        if (!prev) return prev;
        const draft = structuredClone(prev);
        patch(draft);
        return draft;
      });

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        setStatus({ kind: 'busy' });
        mutate(op, payload)
          .then(() => setStatus({ kind: 'saved', message: 'Saved' }))
          .catch((error) => setStatus({ kind: 'error', message: error.message }));
      }, 600);
    },
    [mutate]
  );

  const saveField = (key: string, value: string) => {
    if (selection.kind === 'profile') {
      queueSave('profile.update', { data: { [key]: value } }, (draft) => {
        (draft.profile as Record<string, unknown>)[key] = value;
      });
      return;
    }
    if (!activeItem) return;
    const id = activeItem.id;

    if (selection.kind === 'contact') {
      queueSave('contact.update', { itemId: id, data: { [key]: value } }, (draft) => {
        const row = draft.contact.items.find((i) => i.id === id);
        if (row) (row as Record<string, unknown>)[key] = value;
      });
    } else if (selection.kind === 'gallery') {
      // gallery.json is a peer document, so it is patched separately from cv.
      setGallery((prev) => ({
        ...prev,
        items: (prev.items ?? []).map((e) =>
          e.id !== id ? e : ({ ...e, [key]: value } as GalleryEntry)
        ),
      }));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        setStatus({ kind: 'busy' });
        mutate('gallery.update', { itemId: id, data: { [key]: value } })
          .then(() => setStatus({ kind: 'saved', message: 'Saved' }))
          .catch((error) => setStatus({ kind: 'error', message: error.message }));
      }, 600);
    } else {
      const sectionKey = selection.key;
      queueSave('item.update', { sectionKey, itemId: id, data: { [key]: value } }, (draft) => {
        const item = draft.sections
          .find((s) => s.key === sectionKey)
          ?.items.find((i) => i.id === id);
        if (item) (item as Record<string, unknown>)[key] = value;
      });
    }
  };

  /** Correct an asset's intrinsic facts — the only way to fix video dimensions. */
  const saveAssetField = (file: string, key: string, value: string | boolean) => {
    // The optimistic copy has to be typed the way the registry stores it, or a flag round-trips
    // through Number() and comes back as 0.
    const local =
      typeof value === 'boolean' || key === 'poster' ? value : Number(value) || 0;
    setAssets((prev) => ({
      ...prev,
      [file]: { ...prev[file], [key]: local },
    }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setStatus({ kind: 'busy' });
      mutate('asset.update', { file, data: { [key]: value } })
        .then(() => setStatus({ kind: 'saved', message: 'Asset updated' }))
        .catch((error) => setStatus({ kind: 'error', message: error.message }));
    }, 600);
  };

  // ---- reordering ---------------------------------------------------------
  const reorderSections = useCallback(
    (from: number, to: number) => {
      if (!cv) return;
      const next = move(cv.sections, from, to);
      setCv({ ...cv, sections: next });
      run(() => mutate('section.reorder', { order: next.map((s) => s.key) }), 'Sections reordered');
    },
    [cv, mutate, run]
  );

  const reorderRows = useCallback(
    (from: number, to: number) => {
      const order = move(rows, from, to).map((r) => r.id);
      if (selection.kind === 'contact') {
        run(() => mutate('contact.reorder', { order }), 'Contact rows reordered');
      } else if (selection.kind === 'gallery') {
        run(() => mutate('gallery.reorder', { order }), 'Gallery reordered');
      } else if (selection.kind === 'section') {
        run(() => mutate('item.reorder', { sectionKey: selection.key, order }), 'Items reordered');
      }
    },
    [rows, selection, mutate, run]
  );

  const media = useMemo<string[]>(
    () =>
      selection.kind === 'section' && activeItem ? ((activeItem as CvItem).media ?? []) : [],
    [selection, activeItem]
  );

  /**
   * Pooled assets this item does not already show — what `+ From pool` offers.
   * A file detached from one item shows up here for every other item, which is
   * how a removal is undone or reassigned.
   */
  const unusedPoolFiles = useMemo(
    () => poolFiles.filter((file) => !media.includes(file)),
    [poolFiles, media]
  );

  /** Filenames the gallery also references, so the UI can warn before removing. */
  const galleryUses = useMemo(
    () => new Set((gallery.items ?? []).map((e) => e.file)),
    [gallery]
  );

  /** Pooled assets the gallery does not show yet — what its `+ From pool` offers. */
  const ungalleriedPoolFiles = useMemo(
    () => poolFiles.filter((file) => !galleryUses.has(file)),
    [poolFiles, galleryUses]
  );

  /** The mirror image: filenames the CV references, for the gallery pane. */
  const cvUses = useMemo(() => {
    const used = new Set<string>();
    if (cv?.profile?.photo) used.add(cv.profile.photo);
    for (const s of cv?.sections ?? []) {
      for (const i of s.items ?? []) for (const f of i.media ?? []) used.add(f);
    }
    return used;
  }, [cv]);

  const reorderMedia = useCallback(
    (from: number, to: number) => {
      if (selection.kind !== 'section' || !activeItem) return;
      const order = move(media, from, to);
      run(
        () => mutate('media.reorder', { sectionKey: selection.key, itemId: activeItem.id, order }),
        'Media reordered'
      );
    },
    [media, selection, activeItem, mutate, run]
  );

  const sectionDrag = useDragHandlers(reorderSections);
  const rowDrag = useDragHandlers(reorderRows);
  const mediaDrag = useDragHandlers(reorderMedia);

  // ---- create / delete ----------------------------------------------------
  const addSection = () => {
    setAsk({
      title: 'New section',
      detail: [
        'Any name works — the heading is what renders and nothing branches on it.',
        `Keys already in use: ${SECTION_SUGGESTIONS.join(', ')}`,
      ],
      input: { label: 'Heading', placeholder: 'Speaking' },
      confirmLabel: 'Create section',
      onConfirm: (label) =>
        run(async () => {
          const res: { sectionKey?: string } = await mutate('section.create', { label });
          if (res.sectionKey) setSelection({ kind: 'section', key: res.sectionKey });
          setItemId(null);
        }, 'Section created'),
    });
  };

  const renameRegion = () => {
    if (selection.kind === 'contact') {
      setAsk({
        title: 'Rename the contact section',
        input: { label: 'Heading', initial: cv?.contact?.label ?? 'Contact' },
        confirmLabel: 'Rename',
        onConfirm: (label) => run(() => mutate('contact.rename', { label }), 'Contact renamed'),
      });
      return;
    }
    if (!section) return;
    const current = section.label;
    setAsk({
      title: `Rename "${current}"`,
      detail: ['Safe to change — nothing branches on it. The section key stays as it is.'],
      input: { label: 'Heading', initial: current },
      confirmLabel: 'Rename',
      onConfirm: (label) => {
        if (label === current) return;
        run(() => mutate('section.rename', { sectionKey: section.key, label }), 'Section renamed');
      },
    });
  };

  const removeSection = (target: CvSection) => {
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
          if (selection.kind === 'section' && selection.key === target.key) {
            setSelection({ kind: 'profile' });
            setItemId(null);
          }
        }, 'Section deleted'),
    });
  };

  const addRow = () => {
    if (selection.kind === 'contact') {
      setAsk({
        title: 'New contact row',
        detail: ['The handle and link are editable once the row exists.'],
        input: { label: 'Platform', placeholder: 'Email' },
        confirmLabel: 'Add row',
        onConfirm: (platform) =>
          run(async () => {
            const res: { itemId?: string } = await mutate('contact.create', {
              data: { platform, handle: '' },
            });
            if (res.itemId) setItemId(res.itemId);
          }, 'Contact row added'),
      });
      return;
    }
    if (selection.kind !== 'section') return;
    const sectionKey = selection.key;
    setAsk({
      title: `New item in "${section?.label ?? sectionKey}"`,
      detail: ['Everything else — year, subheading, description, media — is editable after.'],
      input: { label: 'Heading', placeholder: 'Product designer at InstaDeep' },
      confirmLabel: 'Create item',
      onConfirm: (heading) =>
        run(async () => {
          const res: { itemId?: string } = await mutate('item.create', {
            sectionKey,
            data: { heading },
          });
          if (res.itemId) setItemId(res.itemId);
        }, 'Item created'),
    });
  };

  /**
   * Add a gallery entry pointing at a pooled asset. This used to be a
   * `window.prompt` that asked for the filename as free text, with the whole
   * pool pasted into the message — unusable once the pool grew past a dozen
   * files (browsers truncate a long prompt), and one typo or a stale name came
   * back as "not in content/media.json". It is a picker now, so an unavailable
   * name cannot be asked for in the first place.
   */
  const addGalleryEntry = (file: string) => {
    run(async () => {
      const res: { itemId?: string } = await mutate('gallery.create', { file });
      if (res.itemId) setItemId(res.itemId);
    }, `${file} added to the gallery`);
  };

  const rowLabel = (row: Row) =>
    isContact(row)
      ? row.platform
      : isGallery(row)
        ? row.title || row.file
        : (row as CvItem).heading || row.id;

  const removeRow = (target: Row) => {
    // Removing a gallery entry drops the reference and nothing else — the file stays in the
    // pool either way, which is the same rule detaching a CV thumbnail follows. The note only
    // says whether anything else still points at it, since an entry that was the last
    // reference leaves the file behind as an orphan.
    const detail = isGallery(target)
      ? [
          cvUses.has(target.file)
            ? `The CV also uses ${target.file}, so the file keeps its place in public/media/.`
            : `${target.file} stays in public/media/ and in media.json, so it can be attached again from "+ From pool". Nothing else references it, so it will show up as an orphan until it is.`,
        ]
      : [];

    setAsk({
      title: `Delete "${rowLabel(target)}"?`,
      detail: [...detail, 'Undo with: git checkout -- content public/media'],
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => {
        if (selection.kind === 'contact') {
          run(() => mutate('contact.delete', { itemId: target.id }), 'Contact row deleted');
        } else if (selection.kind === 'gallery') {
          run(() => mutate('gallery.delete', { itemId: target.id }), 'Gallery entry deleted');
        } else if (selection.kind === 'section') {
          run(
            () => mutate('item.delete', { sectionKey: selection.key, itemId: target.id }),
            'Item deleted'
          );
        }
      },
    });
  };

  // ---- media --------------------------------------------------------------
  const uploadFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const toGallery = selection.kind === 'gallery';
    if (!toGallery && (selection.kind !== 'section' || !activeItem)) return;

    const form = new FormData();
    form.append('attachTo', toGallery ? 'gallery' : 'cv');
    if (!toGallery && selection.kind === 'section' && activeItem) {
      form.append('sectionKey', selection.key);
      form.append('itemId', activeItem.id);
    }
    form.append('hash', hashRef.current);
    Array.from(files).forEach((file) => form.append('files', file));

    run(async () => {
      const res = await fetch('/studio/api/media', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({ error: res.statusText }));
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      if (json.hash) hashRef.current = json.hash;
      if (json.createdIds?.length) setItemId(json.createdIds[0]);
      if (json.warning) throw new Error(json.warning);
    }, 'Media uploaded');
  };

  /**
   * Detach, not delete: the file stays in public/media/ and in media.json so it
   * can be attached elsewhere. Nothing is destroyed, so there is no confirm —
   * `+ From pool` puts it back.
   */
  const detachMedia = (file: string) => {
    if (selection.kind !== 'section' || !activeItem) return;
    run(
      () => mutate('media.remove', { sectionKey: selection.key, itemId: activeItem.id, file }),
      `${file} removed from this item — still in the pool`
    );
  };

  /** Reuse an asset already in the pool, which is the point of a shared pool. */
  const attachMedia = (file: string) => {
    if (selection.kind !== 'section' || !activeItem) return;
    run(
      () => mutate('media.attach', { sectionKey: selection.key, itemId: activeItem.id, files: [file] }),
      `${file} added to this item`
    );
  };

  // ---- render -------------------------------------------------------------
  const fields: FieldDef[] =
    selection.kind === 'profile'
      ? PROFILE_FIELDS
      : selection.kind === 'contact'
        ? CONTACT_FIELDS
        : selection.kind === 'gallery'
          ? GALLERY_FIELDS
          : ITEM_FIELDS;

  const editorTarget: Record<string, unknown> | null =
    selection.kind === 'profile'
      ? ((cv?.profile as unknown as Record<string, unknown>) ?? null)
      : (activeItem as unknown as Record<string, unknown> | null);

  const middleTitle =
    selection.kind === 'profile'
      ? 'Profile'
      : selection.kind === 'contact'
        ? (cv?.contact?.label ?? 'Contact')
        : selection.kind === 'gallery'
          ? 'Gallery'
          : (section?.label ?? 'Items');

  /** The asset the panel edits: a gallery entry's file, or a clicked CV thumbnail. */
  const panelAsset =
    selection.kind === 'gallery' && activeItem && isGallery(activeItem)
      ? activeItem.file
      : assetFile;

  return (
    <div className={styles.studio}>
      {ask && <AskDialog ask={ask} onClose={() => setAsk(null)} />}
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

      {!cv ? (
        <div className={styles.empty}>Could not load content/cv.json. {status.message}</div>
      ) : (
        <div className={styles.columns}>
          {/* ---------------- Regions ---------------- */}
          <aside className={styles.pane}>
            <div className={styles.paneHeader}>
              <h2>Pinned — top</h2>
            </div>
            <ul className={styles.list}>
              <li
                className={[
                  styles.row,
                  styles.rowPinned,
                  selection.kind === 'profile' ? styles.rowActive : '',
                ].join(' ')}
                onClick={() => {
                  setSelection({ kind: 'profile' });
                  setItemId(null);
                }}
              >
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>Profile &amp; About</span>
                  <span className={styles.rowMeta}>position fixed</span>
                </span>
              </li>
            </ul>

            <div className={styles.paneHeader}>
              <h2>Orderable</h2>
              <button className={styles.ghostButton} onClick={addSection}>
                + Add
              </button>
            </div>
            <ul className={styles.list}>
              {cv.sections.map((s, index) => (
                <li
                  key={s.key}
                  {...sectionDrag.target(index)}
                  className={[
                    styles.row,
                    selection.kind === 'section' && selection.key === s.key ? styles.rowActive : '',
                    sectionDrag.over === index ? styles.rowOver : '',
                  ].join(' ')}
                  onClick={() => {
                    setSelection({ kind: 'section', key: s.key });
                    setItemId(null);
                  }}
                >
                  <span className={styles.grip} aria-hidden {...sectionDrag.source(index)}>
                    ⠿
                  </span>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>{s.label}</span>
                    <span className={styles.rowMeta}>
                      {s.key} · {s.items.length} item{s.items.length === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className={styles.rowActions}>
                    <button
                      title="Move up"
                      disabled={index === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        reorderSections(index, index - 1);
                      }}
                    >
                      ↑
                    </button>
                    <button
                      title="Move down"
                      disabled={index === cv.sections.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        reorderSections(index, index + 1);
                      }}
                    >
                      ↓
                    </button>
                    <button
                      title="Delete section"
                      className={styles.danger}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSection(s);
                      }}
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>

            <div className={styles.paneHeader}>
              <h2>Pinned — bottom</h2>
            </div>
            <ul className={styles.list}>
              <li
                className={[
                  styles.row,
                  styles.rowPinned,
                  selection.kind === 'contact' ? styles.rowActive : '',
                ].join(' ')}
                onClick={() => {
                  setSelection({ kind: 'contact' });
                  setItemId(null);
                }}
              >
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{cv.contact?.label ?? 'Contact'}</span>
                  <span className={styles.rowMeta}>
                    position fixed · {cv.contact?.items?.length ?? 0} rows
                  </span>
                </span>
              </li>
            </ul>

            <div className={styles.paneHeader}>
              <h2>Other tab</h2>
            </div>
            <ul className={styles.list}>
              <li
                className={[
                  styles.row,
                  styles.rowPinned,
                  selection.kind === 'gallery' ? styles.rowActive : '',
                ].join(' ')}
                onClick={() => {
                  setSelection({ kind: 'gallery' });
                  setItemId(null);
                  setAssetFile(null);
                }}
              >
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>Gallery</span>
                  <span className={styles.rowMeta}>
                    /gallery · {gallery.items?.length ?? 0} items
                  </span>
                </span>
              </li>
            </ul>
          </aside>

          {/* ---------------- Rows ---------------- */}
          <aside className={styles.pane}>
            <div className={styles.paneHeader}>
              <h2>{middleTitle}</h2>
              {selection.kind !== 'profile' && (
                <span className={styles.paneHeaderActions}>
                  {selection.kind !== 'gallery' && (
                    <button className={styles.ghostButton} onClick={renameRegion}>
                      Rename
                    </button>
                  )}
                  {selection.kind === 'gallery' ? (
                    <>
                      {ungalleriedPoolFiles.length > 0 && (
                        <select
                          className={styles.ghostSelect}
                          aria-label="Add a gallery entry for an asset already in the pool"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) addGalleryEntry(e.target.value);
                            e.target.value = '';
                          }}
                        >
                          <option value="">+ From pool</option>
                          {ungalleriedPoolFiles.map((file) => (
                            <option key={file} value={file}>
                              {file}
                            </option>
                          ))}
                        </select>
                      )}
                      <label className={styles.ghostButton}>
                        + Upload
                        <input
                          type="file"
                          multiple
                          accept="image/*,video/*"
                          hidden
                          onChange={(e) => {
                            uploadFiles(e.target.files);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </>
                  ) : (
                    <button className={styles.ghostButton} onClick={addRow}>
                      + Add
                    </button>
                  )}
                </span>
              )}
            </div>

            {selection.kind === 'profile' ? (
              <div className={styles.empty}>
                The profile is a single record — edit its fields on the right.
              </div>
            ) : rows.length === 0 ? (
              <div className={styles.empty}>No items yet.</div>
            ) : (
              <ul className={styles.list}>
                {rows.map((row, index) => (
                  <li
                    key={row.id}
                    {...rowDrag.target(index)}
                    className={[
                      styles.row,
                      row.id === itemId ? styles.rowActive : '',
                      rowDrag.over === index ? styles.rowOver : '',
                    ].join(' ')}
                    onClick={() => setItemId(row.id)}
                  >
                    <span className={styles.grip} aria-hidden {...rowDrag.source(index)}>
                      ⠿
                    </span>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>{rowLabel(row)}</span>
                      <span className={styles.rowMeta}>
                        {isContact(row)
                          ? row.handle
                          : isGallery(row)
                            ? [row.file, cvUses.has(row.file) ? 'also on CV' : null]
                                .filter(Boolean)
                                .join(' · ')
                            : [
                              (row as CvItem).year,
                              (row as CvItem).media?.length
                                ? `${(row as CvItem).media!.length} media`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                      </span>
                    </span>
                    <span className={styles.rowActions}>
                      <button
                        title="Move up"
                        disabled={index === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          reorderRows(index, index - 1);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        title="Move down"
                        disabled={index === rows.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          reorderRows(index, index + 1);
                        }}
                      >
                        ↓
                      </button>
                      <button
                        title="Delete"
                        className={styles.danger}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRow(row);
                        }}
                      >
                        ×
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {/* ---------------- Editor ---------------- */}
          <main className={styles.editor}>
            {!editorTarget ? (
              <div className={styles.empty}>Pick an item to edit.</div>
            ) : (
              <>
                <div className={styles.editorHeader}>
                  <h2>
                    {selection.kind === 'profile'
                      ? String(cv.profile.displayName ?? 'Profile')
                      : rowLabel(activeItem!)}
                  </h2>
                  <code className={styles.path}>
                    {selection.kind === 'profile'
                      ? 'content/cv.json → profile'
                      : selection.kind === 'contact'
                        ? `content/cv.json → contact.items[${activeItem!.id}]`
                        : selection.kind === 'gallery'
                          ? `content/gallery.json → ${activeItem!.id}`
                          : `content/cv.json → ${selection.key}[${activeItem!.id}]`}
                  </code>
                </div>

                <div className={styles.form}>
                  {fields.map((field) => (
                    <label key={field.key} className={styles.field}>
                      <span className={styles.fieldLabel}>{field.label}</span>
                      {field.type === 'markdown' ? (
                        <textarea
                          className={styles.textarea}
                          rows={12}
                          placeholder={field.placeholder}
                          value={String(editorTarget[field.key] ?? '')}
                          onChange={(e) => saveField(field.key, e.target.value)}
                        />
                      ) : (
                        <input
                          className={styles.input}
                          type="text"
                          inputMode={field.type === 'url' ? 'url' : 'text'}
                          placeholder={field.placeholder}
                          value={String(editorTarget[field.key] ?? '')}
                          onChange={(e) => saveField(field.key, e.target.value)}
                        />
                      )}
                      {field.hint && <span className={styles.hint}>{field.hint}</span>}
                    </label>
                  ))}
                </div>

                {selection.kind === 'profile' && (
                  <p className={styles.hint}>
                    Photo: <code>public/media/profile/{String(cv.profile.photo)}</code> — replace
                    the file on disk to change it.
                  </p>
                )}

                {selection.kind === 'gallery' && activeItem && isGallery(activeItem) && (
                  <section className={styles.mediaSection}>
                    <div className={styles.paneHeader}>
                      <h2>Asset</h2>
                    </div>
                    <div className={styles.dropzone}>
                      <ul className={styles.mediaGrid}>
                        <li className={styles.mediaCard}>
                          {inferMediaType(activeItem.file) === 'image' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img alt={activeItem.file} src={`/media/${activeItem.file}`} />
                          ) : (
                            <div className={styles.videoThumb}>▶ video</div>
                          )}
                          <div className={styles.mediaMeta}>
                            <span title={activeItem.file}>{activeItem.file}</span>
                            <span className={styles.rowMeta}>
                              {assets[activeItem.file]
                                ? `${assets[activeItem.file].width}×${assets[activeItem.file].height}`
                                : 'not in media.json'}
                              {cvUses.has(activeItem.file) ? ' · also on CV' : ''}
                            </span>
                          </div>
                        </li>
                      </ul>
                    </div>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Point at a different asset</span>
                      <select
                        className={styles.input}
                        value={activeItem.file}
                        onChange={(e) =>
                          run(
                            () =>
                              mutate('gallery.setFile', {
                                itemId: activeItem.id,
                                file: e.target.value,
                              }),
                            'Asset changed'
                          )
                        }
                      >
                        {poolFiles.map((file) => (
                          <option key={file} value={file}>
                            {file}
                          </option>
                        ))}
                      </select>
                      <span className={styles.hint}>
                        Every file in public/media/. Reusing one the CV already shows costs no
                        extra bytes.
                      </span>
                    </label>
                  </section>
                )}

                {panelAsset && assets[panelAsset] && (
                  <section className={styles.mediaSection}>
                    <div className={styles.paneHeader}>
                      <h2>{panelAsset} — in media.json</h2>
                    </div>
                    <p className={styles.hint}>
                      Shared by both tabs, so editing this changes it everywhere the file is
                      used.
                    </p>
                    <div className={styles.form}>
                      {ASSET_FIELDS.map((field) => {
                        const stored = (assets[panelAsset] as unknown as Record<string, unknown>)[
                          field.key
                        ];
                        if (field.type === 'checkbox') {
                          return (
                            <label key={field.key} className={styles.checkboxField}>
                              <input
                                type="checkbox"
                                // An absent value is not "off" here — the field declares what
                                // omitting it means, so the box shows the treatment the asset
                                // actually gets.
                                checked={
                                  stored === undefined ? field.defaultChecked === true : stored === true
                                }
                                onChange={(e) =>
                                  saveAssetField(panelAsset, field.key, e.target.checked)
                                }
                              />
                              <span>
                                <span className={styles.fieldLabel}>{field.label}</span>
                                {field.hint && <span className={styles.hint}>{field.hint}</span>}
                              </span>
                            </label>
                          );
                        }
                        return (
                          <label key={field.key} className={styles.field}>
                            <span className={styles.fieldLabel}>{field.label}</span>
                            <input
                              className={styles.input}
                              type="text"
                              placeholder={field.placeholder}
                              value={String(stored ?? '')}
                              onChange={(e) => saveAssetField(panelAsset, field.key, e.target.value)}
                            />
                            {field.hint && <span className={styles.hint}>{field.hint}</span>}
                          </label>
                        );
                      })}
                    </div>
                  </section>
                )}

                {selection.kind === 'section' && activeItem && (
                  <section className={styles.mediaSection}>
                    <div className={styles.paneHeader}>
                      <h2>Media</h2>
                      <div className={styles.paneHeaderActions}>
                        {unusedPoolFiles.length > 0 && (
                        <select
                          className={styles.ghostSelect}
                          aria-label="Add an asset already in the pool"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) attachMedia(e.target.value);
                            e.target.value = '';
                          }}
                        >
                          <option value="">+ From pool</option>
                          {unusedPoolFiles.map((file) => (
                            <option key={file} value={file}>
                              {file}
                            </option>
                          ))}
                        </select>
                        )}
                        <label className={styles.ghostButton}>
                          + Upload
                          <input
                            type="file"
                            multiple
                            accept="image/*,video/*"
                            hidden
                            onChange={(e) => {
                              uploadFiles(e.target.files);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    {orphans.unregistered.length || orphans.unreferenced.length ? (
                      <p className={styles.hint}>
                        {orphans.unregistered.length
                          ? `In public/media/ but absent from media.json, so unusable: ${orphans.unregistered.join(', ')}. `
                          : ''}
                        {orphans.unreferenced.length
                          ? `Registered but referenced by nothing: ${orphans.unreferenced.join(', ')}.`
                          : ''}
                      </p>
                    ) : null}

                    <div
                      className={styles.dropzone}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        uploadFiles(e.dataTransfer.files);
                      }}
                    >
                      {media.length === 0 ? (
                        <span className={styles.empty}>
                          Drop images or videos here, or use Upload.
                        </span>
                      ) : (
                        <ul className={styles.mediaGrid}>
                          {media.map((file, index) => {
                            const asset = assets[file];
                            return (
                              <li
                                key={file}
                                {...mediaDrag.target(index)}
                                className={[
                                  styles.mediaCard,
                                  mediaDrag.over === index ? styles.rowOver : '',
                                  panelAsset === file ? styles.rowActive : '',
                                ].join(' ')}
                                onClick={() => setAssetFile(file)}
                                title="Click to edit this asset's dimensions"
                              >
                                {inferMediaType(file) === 'image' ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img alt={file} src={`/media/${file}`} />
                                ) : (
                                  <div className={styles.videoThumb}>▶ video</div>
                                )}
                                <div className={styles.mediaMeta}>
                                  <span
                                    className={styles.grip}
                                    aria-hidden
                                    {...mediaDrag.source(index)}
                                  >
                                    ⠿
                                  </span>
                                  <span title={file}>{file}</span>
                                  <span className={styles.rowMeta}>
                                    {asset ? `${asset.width}×${asset.height}` : 'not in media.json'}
                                    {galleryUses.has(file) ? ' · shared with gallery' : ''}
                                  </span>
                                </div>
                                <button
                                  className={styles.mediaDelete}
                                  title="Remove from this item (the file stays in the pool)"
                                  onClick={(e) => {
                                    // Without this the card's own onClick also fires,
                                    // opening the asset panel for the file just
                                    // detached and pushing the grid out of view — which
                                    // read as "the × did nothing".
                                    e.stopPropagation();
                                    detachMedia(file);
                                  }}
                                >
                                  ×
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </section>
                )}
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

/**
 * The Studio's only dialog, standing in for both `window.confirm` and `window.prompt` — see
 * the `Ask` type for why neither is used any more.
 *
 * Enter confirms and Escape cancels, so it costs the same keystrokes the native dialogs did.
 * An empty input cancels rather than submitting, which is what `prompt()` returning `""` used
 * to mean at every call site.
 */
const AskDialog: React.FC<{ ask: Ask; onClose: () => void }> = ({ ask, onClose }) => {
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
    <div className={styles.dialogBackdrop} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={ask.title}
        // Clicking the sheet must not reach the backdrop's dismiss handler.
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Enter') {
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
