'use client';

import { useMemo, useState } from 'react';
import { DateIcon, TagIcon } from '../../TagIcon';
import gallery from '../../Gallery.module.css';
import type { GalleryEntry } from '../../lib/galleryTypes';
import { inferMediaType } from '../../lib/contentTypes';
import { resolveMedia, resolveTags, silent } from '../../lib/resolveContent';
import { sameSelection, useStudio } from '../lib/studioContext';
import { useDragHandlers } from '../lib/useDragHandlers';
import Editable from './Editable';
import styles from './canvas.module.css';

/**
 * The gallery route, editable. `Gallery.module.css` supplies the list, the frame, the caption
 * and the metadata line, so the column width, the frame's shadow and hairline, and the byline's
 * middots are the page's.
 *
 * The one thing deliberately not reproduced is `Gallery.tsx`'s video behaviour — the
 * intersection observer, the dwell timer before `play()`, the hover scrubber. All of that exists
 * to keep a *reader* from downloading clips they only scrolled past, and in an editor it becomes
 * a page of videos starting and stopping while you try to type. A `<video controls>` resting on
 * its poster shows the same frame at rest and plays when asked.
 */

const Tool: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, danger, children }) => (
  <button
    type="button"
    className={[styles.toolButton, danger ? styles.toolDanger : ''].filter(Boolean).join(' ')}
    title={label}
    aria-label={label}
    disabled={disabled}
    onMouseDown={(e) => e.stopPropagation()}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
  >
    {children}
  </button>
);

const CanvasGalleryRow: React.FC<{
  entry: GalleryEntry;
  index: number;
  total: number;
  dragSource: ReturnType<ReturnType<typeof useDragHandlers>['source']>;
  dragTarget: ReturnType<ReturnType<typeof useDragHandlers>['target']>;
  dragOver: boolean;
}> = ({ entry, index, total, dragSource, dragTarget, dragOver }) => {
  const {
    assets,
    urlFor,
    selection,
    select,
    selectAsset,
    setGalleryField,
    deleteGalleryEntry,
    moveGalleryEntry,
  } = useStudio();

  const selected = sameSelection(selection, { kind: 'galleryEntry', id: entry.id });
  const media = useMemo(
    () => resolveMedia(entry.file, assets, urlFor, `gallery.json ${entry.id}`, silent),
    [entry.file, entry.id, assets, urlFor]
  );
  const tags = useMemo(() => resolveTags(entry.tags, entry.id, silent), [entry.tags, entry.id]);

  const selectSelf = () => {
    select({ kind: 'galleryEntry', id: entry.id });
    selectAsset(entry.file);
  };

  const aspectRatio = media ? media.width / media.height : 16 / 9;
  const hasByline = Boolean(entry.date) || tags.length > 0 || selected;

  return (
    <li
      {...dragTarget}
      className={[
        gallery.row,
        styles.node,
        styles.galleryNode,
        selected ? styles.nodeSelected : '',
        selected ? styles.showGhosts : '',
        dragOver ? styles.dropping : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseDown={(e) => {
        e.stopPropagation();
        selectSelf();
      }}
    >
      <div className={styles.tools}>
        <span {...dragSource} className={styles.toolButton} title="Drag to reorder" aria-hidden>
          ⠿
        </span>
        <Tool label="Move up" disabled={index === 0} onClick={() => moveGalleryEntry(index, index - 1)}>
          ↑
        </Tool>
        <Tool
          label="Move down"
          disabled={index === total - 1}
          onClick={() => moveGalleryEntry(index, index + 1)}
        >
          ↓
        </Tool>
        <Tool label="Remove this entry from the gallery" danger onClick={() => deleteGalleryEntry(entry)}>
          ×
        </Tool>
      </div>

      <div className={gallery.frame} style={{ aspectRatio }}>
        {media === null ? (
          <p className={styles.emptySection}>
            {entry.file} is not in media.json, so the site skips this entry.
          </p>
        ) : inferMediaType(entry.file) === 'video' ? (
          <video
            src={media.url}
            poster={media.posterUrl ?? undefined}
            controls
            muted
            playsInline
            preload="none"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.url} alt={entry.caption ?? ''} loading="lazy" />
        )}
      </div>

      <div className={gallery.meta}>
        <div className={gallery.title}>
          <Editable
            value={entry.title ?? ''}
            onChange={(next) => setGalleryField(entry.id, 'title', next)}
            placeholder="Title"
            label="Title"
            onEdit={selectSelf}
          />
        </div>
        {entry.caption || selected ? (
          <div className={gallery.caption}>
            {/* Plain text, deliberately — `Gallery.tsx` renders `{item.caption}` straight into
                the div with no markdown pass. Rendering it here with `RichText` would have shown
                bold and links on the canvas that the published page prints as literal asterisks
                and brackets, which is the one failure an edit-in-place editor must not have.
                It stays a textarea, because a caption is often two sentences. */}
            <Editable
              as="div"
              multiline
              value={entry.caption ?? ''}
              onChange={(next) => setGalleryField(entry.id, 'caption', next)}
              placeholder="Caption. Plain text, and also the image's alt text."
              label="Caption"
              onEdit={selectSelf}
            />
          </div>
        ) : null}
        {hasByline ? (
          <div className={gallery.byline}>
            {/* The date's span is what decides whether the middot before the tags is drawn —
                `.tags:not(:first-child)::before` — so it is rendered exactly when the site would
                render it, plus while this entry is selected so an empty date can be filled in. */}
            {entry.date || selected ? (
              <span className={gallery.date}>
                <DateIcon className={gallery.metaIcon} />
                <Editable
                  layout="inline"
                  value={entry.date ?? ''}
                  onChange={(next) => setGalleryField(entry.id, 'date', next)}
                  placeholder="Date"
                  label="Date"
                  onEdit={selectSelf}
                />
              </span>
            ) : null}
            {tags.length > 0 || selected ? (
              // The wrapper keeps `.tags` a direct child of `.byline`, which is what the leading
              // middot's `:not(:first-child)` is measured against. The tags themselves sit inside
              // the editable, where the same rule spaces them from each other.
              <span className={gallery.tags}>
                <Editable
                  layout="inline"
                  value={tags.join(', ')}
                  onChange={(next) => {
                    // Forgiving mid-edit on purpose: "DeepPCB, " is a real intermediate state
                    // and the server drops blanks and repeats again on write.
                    const parsed = [
                      ...new Set(next.split(',').map((part) => part.trim()).filter(Boolean)),
                    ];
                    // Emptied means *remove the key*, never `"tags": []`. `null` rather than
                    // `undefined`: `JSON.stringify` drops undefined values, so the key would never
                    // reach the server and the removal would silently do nothing. See
                    // `setProfileField`.
                    setGalleryField(entry.id, 'tags', parsed.length ? parsed : null);
                  }}
                  placeholder="Tags, comma separated"
                  label="Tags"
                  onEdit={selectSelf}
                >
                  {tags.map((tag) => (
                    <span key={tag} className={gallery.tag}>
                      <span className={gallery.tagButton}>
                        <TagIcon tag={tag} className={gallery.metaIcon} />
                        {tag}
                      </span>
                    </span>
                  ))}
                </Editable>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
};

const GalleryCanvas: React.FC = () => {
  const { gallery: file, moveGalleryEntry, addGalleryEntry, upload, pickAsset, galleryUses } =
    useStudio();
  const [dropping, setDropping] = useState(false);
  const entries = file.items ?? [];
  const drag = useDragHandlers(moveGalleryEntry);

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        setDropping(false);
        if (!e.dataTransfer.files?.length) return;
        e.preventDefault();
        upload(e.dataTransfer.files, { kind: 'gallery' });
      }}
      className={[styles.dropzone, dropping ? styles.dropping : ''].filter(Boolean).join(' ')}
    >
      <ul role="list" className={gallery.list}>
        {entries.map((entry, index) => (
          <CanvasGalleryRow
            key={entry.id}
            entry={entry}
            index={index}
            total={entries.length}
            dragSource={drag.source(index)}
            dragTarget={drag.target(index)}
            dragOver={drag.over === index}
          />
        ))}
      </ul>

      <button
        type="button"
        className={styles.addRow}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() =>
          pickAsset({
            title: 'Add a gallery entry',
            used: galleryUses,
            onPick: (chosen) => addGalleryEntry(chosen),
          })
        }
      >
        ＋ Add an entry from the pool, or drop files anywhere on this page
      </button>
    </div>
  );
};

export default GalleryCanvas;
