"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './Studio.module.css';
import { CONTACT_FIELDS, ITEM_FIELDS, PROFILE_FIELDS, SECTION_SUGGESTIONS } from './lib/schema';
import type { FieldDef } from './lib/schema';
import { inferMediaType } from '../lib/contentTypes';
import type { ContactItem, CvFile, CvItem, CvSection, MediaEntry } from '../lib/contentTypes';

type Status = { kind: 'idle' | 'busy' | 'saved' | 'error'; message?: string };

/** Which region the editor is showing. Profile and contact are pinned. */
type Selection =
  | { kind: 'profile' }
  | { kind: 'section'; key: string }
  | { kind: 'contact' };

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

type StudioProps = {
  initialCv?: CvFile;
  initialHash?: string;
  initialOrphans?: Record<string, string[]>;
  loadError?: string;
};

export default function Studio({
  initialCv,
  initialHash = '',
  initialOrphans = {},
  loadError,
}: StudioProps) {
  const [cv, setCv] = useState<CvFile | null>(initialCv ?? null);
  const [orphans, setOrphans] = useState<Record<string, string[]>>(initialOrphans);
  const [selection, setSelection] = useState<Selection>({ kind: 'profile' });
  const [itemId, setItemId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(
    loadError ? { kind: 'error', message: loadError } : { kind: 'idle' }
  );

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
    hashRef.current = json.hash;
    setOrphans(json.orphans ?? {});
    return json.cv as CvFile;
  }, []);

  const mutate = useCallback(async (op: string, payload: Record<string, unknown> = {}) => {
    const res = await fetch('/studio/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, hash: hashRef.current, ...payload }),
    });
    const json = await res.json().catch(() => ({ error: res.statusText }));
    if (!res.ok) throw new Error(json.error || 'Request failed');
    if (json.hash) hashRef.current = json.hash;
    return json;
  }, []);

  const run = useCallback(
    async (fn: () => Promise<unknown>, successMessage = 'Saved') => {
      setStatus({ kind: 'busy' });
      try {
        await fn();
        await refresh();
        setStatus({ kind: 'saved', message: successMessage });
      } catch (error) {
        setStatus({ kind: 'error', message: (error as Error).message });
        // Resync so the next edit is not also rejected as stale.
        await refresh().catch(() => {});
      }
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

  const rows = useMemo<(CvItem | ContactItem)[]>(() => {
    if (!cv) return [];
    if (selection.kind === 'section') return section?.items ?? [];
    if (selection.kind === 'contact') return cv.contact?.items ?? [];
    return [];
  }, [cv, section, selection]);

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
      } else if (selection.kind === 'section') {
        run(() => mutate('item.reorder', { sectionKey: selection.key, order }), 'Items reordered');
      }
    },
    [rows, selection, mutate, run]
  );

  const media = useMemo<MediaEntry[]>(
    () =>
      selection.kind === 'section' && activeItem ? ((activeItem as CvItem).media ?? []) : [],
    [selection, activeItem]
  );

  const reorderMedia = useCallback(
    (from: number, to: number) => {
      if (selection.kind !== 'section' || !activeItem) return;
      const order = move(media, from, to).map((m) => m.file);
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
    const label = window.prompt(
      `New section heading.\n\nAny name works — the heading is what renders and nothing branches on it. Keys already in use:\n${SECTION_SUGGESTIONS.join(', ')}`
    );
    if (!label) return;
    run(async () => {
      const res: { sectionKey?: string } = await mutate('section.create', { label });
      if (res.sectionKey) setSelection({ kind: 'section', key: res.sectionKey });
      setItemId(null);
    }, 'Section created');
  };

  const renameRegion = () => {
    if (selection.kind === 'contact') {
      const label = window.prompt('Contact heading', cv?.contact?.label ?? 'Contact');
      if (!label) return;
      run(() => mutate('contact.rename', { label }), 'Contact renamed');
      return;
    }
    if (!section) return;
    const label = window.prompt(
      'Section heading — safe to change, nothing branches on it',
      section.label
    );
    if (!label || label === section.label) return;
    run(() => mutate('section.rename', { sectionKey: section.key, label }), 'Section renamed');
  };

  const removeSection = (target: CvSection) => {
    const count = target.items.length;
    const confirmed = window.confirm(
      `Delete the "${target.label}" section?\n\nRemoves ${count} item${count === 1 ? '' : 's'} from cv.json and deletes their media folders.\n\nUndo with: git checkout -- content public/media`
    );
    if (!confirmed) return;
    run(async () => {
      await mutate('section.delete', { sectionKey: target.key });
      if (selection.kind === 'section' && selection.key === target.key) {
        setSelection({ kind: 'profile' });
        setItemId(null);
      }
    }, 'Section deleted');
  };

  const addRow = () => {
    if (selection.kind === 'contact') {
      const platform = window.prompt('Platform (e.g. Email)');
      if (!platform) return;
      run(async () => {
        const res: { itemId?: string } = await mutate('contact.create', {
          data: { platform, handle: '' },
        });
        if (res.itemId) setItemId(res.itemId);
      }, 'Contact row added');
      return;
    }
    if (selection.kind !== 'section') return;
    const heading = window.prompt('Heading (e.g. Product designer at InstaDeep)');
    if (!heading) return;
    run(async () => {
      const res: { itemId?: string } = await mutate('item.create', {
        sectionKey: selection.key,
        data: { heading },
      });
      if (res.itemId) setItemId(res.itemId);
    }, 'Item created');
  };

  const rowLabel = (row: CvItem | ContactItem) =>
    'platform' in row ? row.platform : (row as CvItem).heading || row.id;

  const removeRow = (target: CvItem | ContactItem) => {
    if (
      !window.confirm(
        `Delete "${rowLabel(target)}"?\n\nUndo with: git checkout -- content public/media`
      )
    )
      return;

    if (selection.kind === 'contact') {
      run(() => mutate('contact.delete', { itemId: target.id }), 'Contact row deleted');
    } else if (selection.kind === 'section') {
      run(
        () => mutate('item.delete', { sectionKey: selection.key, itemId: target.id }),
        'Item deleted'
      );
    }
  };

  // ---- media --------------------------------------------------------------
  const uploadFiles = (files: FileList | null) => {
    if (selection.kind !== 'section' || !activeItem || !files || files.length === 0) return;
    const form = new FormData();
    form.append('sectionKey', selection.key);
    form.append('itemId', activeItem.id);
    form.append('hash', hashRef.current);
    Array.from(files).forEach((file) => form.append('files', file));

    run(async () => {
      const res = await fetch('/studio/api/media', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({ error: res.statusText }));
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      if (json.hash) hashRef.current = json.hash;
      if (json.warning) throw new Error(json.warning);
    }, 'Media uploaded');
  };

  const removeMedia = (file: string) => {
    if (selection.kind !== 'section' || !activeItem) return;
    if (!window.confirm(`Delete ${file} from disk?`)) return;
    run(
      () => mutate('media.delete', { sectionKey: selection.key, itemId: activeItem.id, file }),
      'Media deleted'
    );
  };

  // ---- render -------------------------------------------------------------
  const fields: FieldDef[] =
    selection.kind === 'profile'
      ? PROFILE_FIELDS
      : selection.kind === 'contact'
        ? CONTACT_FIELDS
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
        : (section?.label ?? 'Items');

  return (
    <div className={styles.studio}>
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
          </aside>

          {/* ---------------- Rows ---------------- */}
          <aside className={styles.pane}>
            <div className={styles.paneHeader}>
              <h2>{middleTitle}</h2>
              {selection.kind !== 'profile' && (
                <span className={styles.paneHeaderActions}>
                  <button className={styles.ghostButton} onClick={renameRegion}>
                    Rename
                  </button>
                  <button className={styles.ghostButton} onClick={addRow}>
                    + Add
                  </button>
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
                        {'platform' in row
                          ? row.handle
                          : [
                              (row as CvItem).year,
                              (row as CvItem).media?.length
                                ? `${(row as CvItem).media!.length} media`
                                : null,
                              orphans[row.id]?.length
                                ? `${orphans[row.id].length} unlisted`
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

                {selection.kind === 'section' && activeItem && (
                  <section className={styles.mediaSection}>
                    <div className={styles.paneHeader}>
                      <h2>Media</h2>
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

                    {orphans[activeItem.id]?.length ? (
                      <p className={styles.hint}>
                        On disk but not listed in cv.json, so not rendered:{' '}
                        {orphans[activeItem.id].join(', ')}
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
                          {media.map((m, index) => (
                            <li
                              key={m.file}
                              {...mediaDrag.target(index)}
                              className={[
                                styles.mediaCard,
                                mediaDrag.over === index ? styles.rowOver : '',
                              ].join(' ')}
                            >
                              {inferMediaType(m.file) === 'image' ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img alt={m.file} src={`/media/cv/${activeItem.id}/${m.file}`} />
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
                                <span title={m.file}>{m.file}</span>
                                <span className={styles.rowMeta}>
                                  {m.width}×{m.height}
                                </span>
                              </div>
                              <button
                                className={styles.mediaDelete}
                                title="Delete file"
                                onClick={() => removeMedia(m.file)}
                              >
                                ×
                              </button>
                            </li>
                          ))}
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
