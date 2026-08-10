"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './Studio.module.css';
import {
  KNOWN_SECTION_KEYS,
  fieldsForSection,
  itemLabel,
  sectionSupportsMedia,
} from './lib/schema';

// Mirrors the server types in lib/content-fs.ts. Declared locally so the client
// bundle never reaches for a module that imports node:fs.
interface MediaFile {
  filename: string;
  type: 'image' | 'video';
  width: number;
  height: number;
  attached: boolean;
}
interface ItemNode {
  dir: string;
  prefix: number;
  key: string;
  data: Record<string, any>;
  media: MediaFile[];
}
interface SectionNode {
  dir: string;
  prefix: number;
  key: string;
  displayName: string;
  items: ItemNode[];
}

type Status = { kind: 'idle' | 'busy' | 'saved' | 'error'; message?: string };

async function mutate(op: string, payload: Record<string, unknown> = {}) {
  const res = await fetch('/studio/api/mutate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, ...payload }),
  });
  const json = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

function move<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Native HTML5 drag-and-drop handlers for a row at `index`. */
function useDragHandlers(onReorder: (from: number, to: number) => void) {
  const from = useRef<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  // Only the grip is the drag source. Marking the whole row draggable makes
  // browsers treat a press-and-release on it as an aborted drag and swallow the
  // click, which would break row selection.
  const source = useCallback(
    (index: number) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        from.current = index;
        e.dataTransfer.effectAllowed = 'move';
        // Firefox needs data set for the drag to start at all.
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

export default function Studio() {
  const [sections, setSections] = useState<SectionNode[]>([]);
  const [sectionKey, setSectionKey] = useState<string | null>(null);
  const [itemKey, setItemKey] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [loaded, setLoaded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [rawText, setRawText] = useState('');
  const [rawError, setRawError] = useState<string | null>(null);

  // Selection is tracked by slug, not directory name, because every reorder
  // rewrites the numeric prefixes.
  const section = useMemo(
    () => sections.find((s) => s.key === sectionKey) ?? null,
    [sections, sectionKey]
  );
  const item = useMemo(
    () => section?.items.find((i) => i.key === itemKey) ?? null,
    [section, itemKey]
  );

  const refresh = useCallback(async () => {
    const res = await fetch('/studio/api/tree', { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to load content');
    setSections(json.sections);
    return json.sections as SectionNode[];
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
      }
    },
    [refresh]
  );

  useEffect(() => {
    refresh()
      .then((next) => {
        setSectionKey((cur) => cur ?? next[0]?.key ?? null);
        setLoaded(true);
      })
      .catch((error) => {
        setStatus({ kind: 'error', message: (error as Error).message });
        setLoaded(true);
      });
  }, [refresh]);

  // Clear a stale item selection when switching sections.
  useEffect(() => {
    if (section && itemKey && !section.items.some((i) => i.key === itemKey)) {
      setItemKey(null);
    }
  }, [section, itemKey]);

  useEffect(() => {
    setShowRaw(false);
    setRawError(null);
  }, [itemKey, sectionKey]);

  useEffect(() => {
    if (item) setRawText(JSON.stringify(item.data, null, 2));
  }, [item]);

  // ---- field editing (debounced autosave) --------------------------------
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveField = useCallback(
    (key: string, value: string) => {
      if (!section || !item) return;
      const sectionDir = section.dir;
      const itemDir = item.dir;

      // Optimistic local update so typing stays responsive.
      setSections((prev) =>
        prev.map((s) =>
          s.dir !== sectionDir
            ? s
            : {
                ...s,
                items: s.items.map((i) =>
                  i.dir !== itemDir ? i : { ...i, data: { ...i.data, [key]: value } }
                ),
              }
        )
      );

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        setStatus({ kind: 'busy' });
        mutate('item.update', { sectionDir, itemDir, data: { [key]: value } })
          .then(() => setStatus({ kind: 'saved', message: 'Saved' }))
          .catch((error) => setStatus({ kind: 'error', message: error.message }));
      }, 600);
    },
    [section, item]
  );

  const saveRaw = useCallback(() => {
    if (!section || !item) return;
    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(rawText);
    } catch (error) {
      setRawError((error as Error).message);
      return;
    }
    setRawError(null);
    run(
      () =>
        mutate('item.update', {
          sectionDir: section.dir,
          itemDir: item.dir,
          data: parsed,
          replace: true,
        }),
      'Raw JSON saved'
    );
  }, [section, item, rawText, run]);

  // ---- reordering ---------------------------------------------------------
  const reorderSections = useCallback(
    (from: number, to: number) => {
      const next = move(sections, from, to);
      setSections(next);
      run(() => mutate('section.reorder', { order: next.map((s) => s.dir) }), 'Sections reordered');
    },
    [sections, run]
  );

  const reorderItems = useCallback(
    (from: number, to: number) => {
      if (!section) return;
      const next = move(section.items, from, to);
      setSections((prev) =>
        prev.map((s) => (s.dir === section.dir ? { ...s, items: next } : s))
      );
      run(
        () => mutate('item.reorder', { sectionDir: section.dir, order: next.map((i) => i.dir) }),
        'Items reordered'
      );
    },
    [section, run]
  );

  const reorderMedia = useCallback(
    (from: number, to: number) => {
      if (!section || !item) return;
      const next = move(item.media, from, to);
      run(
        () =>
          mutate('media.reorder', {
            sectionDir: section.dir,
            itemDir: item.dir,
            order: next.map((m) => m.filename),
          }),
        'Media reordered'
      );
    },
    [section, item, run]
  );

  const sectionDrag = useDragHandlers(reorderSections);
  const itemDrag = useDragHandlers(reorderItems);
  const mediaDrag = useDragHandlers(reorderMedia);

  // ---- create / delete ----------------------------------------------------
  const addSection = () => {
    const name = window.prompt(
      `New section name.\n\nKnown names that contentLoader has display labels for:\n${KNOWN_SECTION_KEYS.join(', ')}\n\nAnything else works too — the label is derived from the name.`
    );
    if (!name) return;
    run(async () => {
      await mutate('section.create', { key: name });
      setItemKey(null);
    }, 'Section created');
  };

  const renameSection = () => {
    if (!section) return;
    const name = window.prompt('Rename section', section.key);
    if (!name || name === section.key) return;
    run(async () => {
      const res: any = await mutate('section.rename', { sectionDir: section.dir, key: name });
      setSectionKey(String(res.sectionDir).replace(/^\d{3}-/, ''));
    }, 'Section renamed');
  };

  const removeSection = (target: SectionNode) => {
    const count = target.items.length;
    const confirmed = window.confirm(
      `Delete the "${target.displayName}" section?\n\nThis permanently removes ${count} item${count === 1 ? '' : 's'} and all their media from disk.\n\nUndo with: git checkout -- public/content`
    );
    if (!confirmed) return;
    run(async () => {
      await mutate('section.delete', { sectionDir: target.dir });
      if (target.key === sectionKey) {
        setSectionKey(null);
        setItemKey(null);
      }
    }, 'Section deleted');
  };

  const addItem = () => {
    if (!section) return;
    const label = window.prompt(
      section.key === 'contact' ? 'Platform (e.g. Email)' : 'Heading (e.g. Product designer at InstaDeep)'
    );
    if (!label) return;
    const data =
      section.key === 'contact' ? { platform: label, handle: '', url: '' } : { heading: label, year: '' };
    run(async () => {
      const res: any = await mutate('item.create', { sectionDir: section.dir, data });
      setItemKey(String(res.itemDir).replace(/^\d{3}-/, ''));
    }, 'Item created');
  };

  const removeItem = (target: ItemNode) => {
    if (!section) return;
    const confirmed = window.confirm(
      `Delete "${itemLabel(section.key, target.data)}"?\n\nThis permanently removes the folder and its media from disk.\n\nUndo with: git checkout -- public/content`
    );
    if (!confirmed) return;
    run(async () => {
      await mutate('item.delete', { sectionDir: section.dir, itemDir: target.dir });
      if (target.key === itemKey) setItemKey(null);
    }, 'Item deleted');
  };

  const renameItemFolder = () => {
    if (!section || !item) return;
    const label = itemLabel(section.key, item.data);
    run(async () => {
      const res: any = await mutate('item.rename', {
        sectionDir: section.dir,
        itemDir: item.dir,
        label,
      });
      setItemKey(String(res.itemDir).replace(/^\d{3}-/, ''));
    }, 'Folder renamed');
  };

  // ---- media --------------------------------------------------------------
  const uploadFiles = useCallback(
    (files: FileList | null) => {
      if (!section || !item || !files || files.length === 0) return;
      const form = new FormData();
      form.append('sectionDir', section.dir);
      form.append('itemDir', item.dir);
      Array.from(files).forEach((file) => form.append('files', file));

      run(async () => {
        const res = await fetch('/studio/api/media', { method: 'POST', body: form });
        const json = await res.json().catch(() => ({ error: res.statusText }));
        if (!res.ok) throw new Error(json.error || 'Upload failed');
      }, 'Media uploaded');
    },
    [section, item, run]
  );

  const removeMedia = (filename: string) => {
    if (!section || !item) return;
    if (!window.confirm(`Delete ${filename} from disk?`)) return;
    run(
      () => mutate('media.delete', { sectionDir: section.dir, itemDir: item.dir, filename }),
      'Media deleted'
    );
  };

  const fields = section ? fieldsForSection(section.key) : [];
  const showMedia = section ? sectionSupportsMedia(section.key) : false;

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

      {!loaded ? (
        <div className={styles.empty}>Loading content…</div>
      ) : (
        <div className={styles.columns}>
          {/* ---------------- Sections ---------------- */}
          <aside className={styles.pane}>
            <div className={styles.paneHeader}>
              <h2>Sections</h2>
              <button className={styles.ghostButton} onClick={addSection}>
                + Add
              </button>
            </div>
            <ul className={styles.list}>
              {sections.map((s, index) => (
                <li
                  key={s.dir}
                  {...sectionDrag.target(index)}
                  className={[
                    styles.row,
                    s.key === sectionKey ? styles.rowActive : '',
                    sectionDrag.over === index ? styles.rowOver : '',
                  ].join(' ')}
                  onClick={() => setSectionKey(s.key)}
                >
                  <span className={styles.grip} aria-hidden {...sectionDrag.source(index)}>
                    ⠿
                  </span>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>{s.displayName}</span>
                    <span className={styles.rowMeta}>
                      {s.dir} · {s.items.length} item{s.items.length === 1 ? '' : 's'}
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
                      disabled={index === sections.length - 1}
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
          </aside>

          {/* ---------------- Items ---------------- */}
          <aside className={styles.pane}>
            <div className={styles.paneHeader}>
              <h2>{section ? section.displayName : 'Items'}</h2>
              {section && (
                <span className={styles.paneHeaderActions}>
                  <button className={styles.ghostButton} onClick={renameSection}>
                    Rename
                  </button>
                  <button className={styles.ghostButton} onClick={addItem}>
                    + Add
                  </button>
                </span>
              )}
            </div>
            {!section ? (
              <div className={styles.empty}>Pick a section.</div>
            ) : section.items.length === 0 ? (
              <div className={styles.empty}>No items yet.</div>
            ) : (
              <ul className={styles.list}>
                {section.items.map((i, index) => (
                  <li
                    key={i.dir}
                    {...itemDrag.target(index)}
                    className={[
                      styles.row,
                      i.key === itemKey ? styles.rowActive : '',
                      itemDrag.over === index ? styles.rowOver : '',
                    ].join(' ')}
                    onClick={() => setItemKey(i.key)}
                  >
                    <span className={styles.grip} aria-hidden {...itemDrag.source(index)}>
                      ⠿
                    </span>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>{itemLabel(section.key, i.data)}</span>
                      <span className={styles.rowMeta}>
                        {i.data.year || i.data.handle || i.dir}
                        {i.media.length > 0 ? ` · ${i.media.length} media` : ''}
                      </span>
                    </span>
                    <span className={styles.rowActions}>
                      <button
                        title="Move up"
                        disabled={index === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          reorderItems(index, index - 1);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        title="Move down"
                        disabled={index === section.items.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          reorderItems(index, index + 1);
                        }}
                      >
                        ↓
                      </button>
                      <button
                        title="Delete item"
                        className={styles.danger}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeItem(i);
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
            {!item || !section ? (
              <div className={styles.empty}>Pick an item to edit.</div>
            ) : (
              <>
                <div className={styles.editorHeader}>
                  <h2>{itemLabel(section.key, item.data)}</h2>
                  <code className={styles.path}>
                    public/content/{section.dir}/{item.dir}
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
                          value={item.data[field.key] ?? ''}
                          onChange={(e) => saveField(field.key, e.target.value)}
                        />
                      ) : (
                        <input
                          className={styles.input}
                          type="text"
                          inputMode={field.type === 'url' ? 'url' : 'text'}
                          placeholder={field.placeholder}
                          value={item.data[field.key] ?? ''}
                          onChange={(e) => saveField(field.key, e.target.value)}
                        />
                      )}
                      {field.hint && <span className={styles.hint}>{field.hint}</span>}
                    </label>
                  ))}

                  <button className={styles.ghostButton} onClick={renameItemFolder}>
                    Rename folder to match heading
                  </button>
                </div>

                {showMedia && (
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

                    <div
                      className={styles.dropzone}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        uploadFiles(e.dataTransfer.files);
                      }}
                    >
                      {item.media.length === 0 ? (
                        <span className={styles.empty}>
                          Drop images or videos here, or use Upload.
                        </span>
                      ) : (
                        <ul className={styles.mediaGrid}>
                          {item.media.map((m, index) => (
                            <li
                              key={m.filename}
                              {...mediaDrag.target(index)}
                              className={[
                                styles.mediaCard,
                                mediaDrag.over === index ? styles.rowOver : '',
                              ].join(' ')}
                            >
                              {m.type === 'image' ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  alt={m.filename}
                                  src={`/content/${section.dir}/${item.dir}/media/${m.filename}`}
                                />
                              ) : (
                                <div className={styles.videoThumb}>▶ video</div>
                              )}
                              <div className={styles.mediaMeta}>
                                <span className={styles.grip} aria-hidden {...mediaDrag.source(index)}>
                                  ⠿
                                </span>
                                <span title={m.filename}>{m.filename}</span>
                                <span className={styles.rowMeta}>
                                  {m.width}×{m.height}
                                </span>
                              </div>
                              <button
                                className={styles.mediaDelete}
                                title="Delete file"
                                onClick={() => removeMedia(m.filename)}
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

                <section className={styles.rawSection}>
                  <button
                    className={styles.ghostButton}
                    onClick={() => setShowRaw((v) => !v)}
                  >
                    {showRaw ? 'Hide' : 'Show'} raw item.json
                  </button>
                  {showRaw && (
                    <>
                      <p className={styles.hint}>
                        Every field on disk, including legacy ones the form hides. Saving here
                        replaces the file wholesale.
                      </p>
                      <textarea
                        className={`${styles.textarea} ${styles.mono}`}
                        rows={18}
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                      />
                      {rawError && <p className={styles.error}>{rawError}</p>}
                      <button className={styles.primaryButton} onClick={saveRaw}>
                        Save raw JSON
                      </button>
                    </>
                  )}
                </section>
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
