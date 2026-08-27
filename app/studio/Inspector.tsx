'use client';

import { useMemo, useState } from 'react';
import { ASSET_FIELDS } from './lib/schema';
import { inferMediaType } from '../lib/contentTypes';
import type { CvItem } from '../lib/contentTypes';
import { useStudio } from './lib/studioContext';
import styles from './Studio.module.css';

/**
 * The right rail: everything about the selected thing that the page does not show.
 *
 * That boundary is the whole design. Anything a visitor can read — a heading, a year, a caption,
 * a tag — is edited by clicking it on the canvas, because that is where you can see what it will
 * look like. What is left over has no rendered form to click: a link's *target* (the page shows
 * only an arrow), a file's intrinsic dimensions, a poster frame, the mat and floating flags, a
 * section's machine-facing key, which pool files are unreferenced. Those are facts about the
 * document rather than things on it, so they get a panel.
 *
 * It is deliberately not a mirror of the canvas. A field that appears in both places is a field
 * with two truths on screen at once, and the one you are not looking at is the one that will
 * surprise you.
 */

const Row: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
  label,
  hint,
  children,
}) => (
  <label className={styles.field}>
    <span className={styles.fieldLabel}>{label}</span>
    {children}
    {hint && <span className={styles.hint}>{hint}</span>}
  </label>
);

/** The pooled asset panel — the only way to fix a video's dimensions, since nothing measures one. */
const AssetPanel: React.FC<{ file: string }> = ({ file }) => {
  const { assets, urlFor, setAssetField, cvUses, galleryUses } = useStudio();
  /**
   * The raw text of whichever box is being typed into.
   *
   * Without it the field is controlled straight off the registry, and the registry stores
   * numbers — so select-all-and-delete, the ordinary way to retype a dimension, went through
   * `Number('') || 0` and optimistically wrote a width of 0. `resolveMedia` (correctly) refuses
   * an asset with no dimensions, so the thumbnail vanished off the canvas mid-keystroke and the
   * server rejected the write a moment later. The draft keeps the empty box empty and simply
   * does not send until there is a value to send.
   */
  const [draft, setDraft] = useState<{ key: string; text: string } | null>(null);
  const asset = assets[file];
  if (!asset) return null;

  const isVideo = inferMediaType(file) === 'video';
  const preview = isVideo && asset.poster ? asset.poster : file;

  return (
    <section className={styles.panel}>
      <h3 className={styles.panelTitle}>Asset</h3>
      <div className={styles.assetPreview}>
        {isVideo && !asset.poster ? (
          <span className={styles.pickerVideo}>▶</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urlFor(preview)} alt="" />
        )}
      </div>
      <p className={styles.path}>public/media/{file}</p>
      <p className={styles.hint}>
        Shared by both tabs, so editing this changes it everywhere the file is used
        {cvUses.has(file) && galleryUses.has(file)
          ? ' — the CV and the gallery both show it.'
          : cvUses.has(file)
            ? ' — the CV shows it.'
            : galleryUses.has(file)
              ? ' — the gallery shows it.'
              : '.'}
      </p>
      <div className={styles.form}>
        {ASSET_FIELDS.map((field) => {
          const stored = (asset as unknown as Record<string, unknown>)[field.key];
          if (field.type === 'checkbox') {
            return (
              <label key={field.key} className={styles.checkboxField}>
                <input
                  type="checkbox"
                  // An absent value is not "off" here — the field declares what omitting it
                  // means, so the box shows the treatment the asset actually gets.
                  checked={stored === undefined ? field.defaultChecked === true : stored === true}
                  onChange={(e) => setAssetField(file, field.key, e.target.checked)}
                />
                <span>
                  <span className={styles.fieldLabel}>{field.label}</span>
                  {field.hint && <span className={styles.hint}>{field.hint}</span>}
                </span>
              </label>
            );
          }
          return (
            <Row key={field.key} label={field.label} hint={field.hint}>
              <input
                className={styles.input}
                type="text"
                placeholder={field.placeholder}
                value={draft?.key === field.key ? draft.text : String(stored ?? '')}
                onChange={(e) => {
                  const text = e.target.value;
                  setDraft({ key: field.key, text });
                  // `poster` is a filename, where clearing it legitimately means "remove the
                  // poster". The dimensions are numbers, where an empty box is a half-typed
                  // value and not an instruction.
                  if (field.key === 'poster' || text.trim() !== '') {
                    setAssetField(file, field.key, text);
                  }
                }}
                onBlur={() => setDraft(null)}
              />
            </Row>
          );
        })}
      </div>
    </section>
  );
};

/** An item's media: which files, in what order. The canvas shows the row; this is what edits it. */
const MediaPanel: React.FC<{ sectionKey: string; item: CvItem }> = ({ sectionKey, item }) => {
  const {
    assets,
    urlFor,
    assetFile,
    selectAsset,
    attachMedia,
    detachMedia,
    moveMedia,
    upload,
    pickAsset,
  } = useStudio();
  const files = useMemo(() => item.media ?? [], [item.media]);
  const used = useMemo(() => new Set(files), [files]);

  return (
    <section className={styles.panel}>
      <h3 className={styles.panelTitle}>Media</h3>
      {files.length === 0 ? (
        <p className={styles.hint}>
          Nothing attached. Drop files onto the item on the canvas, or add one from the pool.
        </p>
      ) : (
        <ul className={styles.mediaList}>
          {files.map((file, index) => (
            <li
              key={file}
              className={[styles.mediaRow, assetFile === file ? styles.mediaRowActive : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => selectAsset(file)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.mediaThumb}
                src={urlFor(
                  inferMediaType(file) === 'video' && assets[file]?.poster
                    ? assets[file].poster!
                    : file
                )}
                alt=""
              />
              <span className={styles.mediaName} title={file}>
                {file}
              </span>
              <span className={styles.mediaActions}>
                <button
                  type="button"
                  title="Move left"
                  disabled={index === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    moveMedia(sectionKey, item.id, index, index - 1);
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  title="Move right"
                  disabled={index === files.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    moveMedia(sectionKey, item.id, index, index + 1);
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={styles.danger}
                  // Detach, not delete: the file stays in public/media/ and in media.json so it
                  // can be attached elsewhere. Nothing is destroyed, so there is no confirm.
                  title="Remove from this item — the file stays in the pool"
                  onClick={(e) => {
                    e.stopPropagation();
                    detachMedia(sectionKey, item.id, file);
                  }}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.panelActions}>
        <button
          type="button"
          className={styles.ghostButton}
          onClick={() =>
            pickAsset({
              title: 'Attach an asset already in the pool',
              used,
              onPick: (file) => attachMedia(sectionKey, item.id, file),
            })
          }
        >
          From pool
        </button>
        <label className={styles.ghostButton}>
          Upload
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            hidden
            onChange={(e) => {
              upload(e.target.files, { kind: 'item', sectionKey, itemId: item.id });
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </section>
  );
};

/** What the panel is currently describing, for the collapsed bar's label. */
function describe(selection: ReturnType<typeof useStudio>['selection']): string {
  switch (selection.kind) {
    case 'profile':
      return 'Profile';
    case 'section':
      return 'Section';
    case 'item':
      return 'Item';
    case 'contact':
      return 'Contact';
    case 'contactRow':
      return 'Contact row';
    case 'gallery':
      return 'Gallery';
    case 'galleryEntry':
      return 'Gallery entry';
    default:
      return 'Inspector';
  }
}

const Inspector: React.FC = () => {
  /**
   * Collapsed, the panel is just its own title bar.
   *
   * It earns its place below ~1080px, where the rail does not fit in the gutter beside a 540px
   * column and becomes a sheet along the bottom — which is a lot of canvas to cover while reading
   * the page you are editing. State lives here rather than in `Studio` because the panel never
   * unmounts, and because it is a view preference rather than anything about the document.
   */
  const [collapsed, setCollapsed] = useState(false);
  const {
    cv,
    gallery,
    assets,
    urlFor,
    orphans,
    selection,
    assetFile,
    setItemField,
    setContactField,
    setProfileField,
    setGalleryEntryFile,
    insertHeadingIcon,
    pickAsset,
    galleryUses,
    cvUses,
  } = useStudio();

  const section =
    selection.kind === 'section' || selection.kind === 'item'
      ? cv.sections.find((s) => s.key === selection.sectionKey)
      : undefined;

  const item =
    selection.kind === 'item' ? section?.items.find((i) => i.id === selection.itemId) : undefined;

  const contactRow =
    selection.kind === 'contactRow'
      ? cv.contact?.items?.find((i) => i.id === selection.itemId)
      : undefined;

  const entry =
    selection.kind === 'galleryEntry'
      ? (gallery.items ?? []).find((e) => e.id === selection.id)
      : undefined;

  const preview = cv.profile.galleryPreview ?? [];

  return (
    <aside
      className={[styles.inspector, collapsed ? styles.inspectorCollapsed : ''].filter(Boolean).join(' ')}
      aria-label="Inspector"
    >
      <div className={styles.inspectorBar}>
        <span className={styles.inspectorTitle}>{describe(selection)}</span>
        <button
          type="button"
          className={styles.inspectorToggle}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((open) => !open)}
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>

      {selection.kind === 'none' && (
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Nothing selected</h3>
          <p className={styles.hint}>
            Click any text on the page to edit it in place. Click an item, a section title or a
            thumbnail to see what does not render here — links, dimensions, the media pool.
          </p>
        </section>
      )}

      {selection.kind === 'profile' && (
        <>
          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>Profile</h3>
            <p className={styles.path}>content/cv.json → profile</p>
            <p className={styles.hint}>
              Name, byline, About and the footer location are edited on the page. Braces set a run
              in the lighter grey — <code>Software Designer {'{& Engineer}'}</code> — and are
              stripped from the search-result and social-card description.
            </p>
            <Row
              label="Photo"
              hint="The one field with no picker: the pool protects this filename, so the photo changes by replacing the file on disk."
            >
              <input className={styles.input} type="text" value={cv.profile.photo} readOnly />
            </Row>
          </section>

          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>Gallery teaser</h3>
            <p className={styles.hint}>
              The 2×2 grid under About, on the CV only. Pool filenames, in display order.
            </p>
            <ul className={styles.mediaList}>
              {preview.map((file, index) => (
                <li key={file} className={styles.mediaRow}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className={styles.mediaThumb} src={urlFor(file)} alt="" />
                  <span className={styles.mediaName} title={file}>
                    {file}
                  </span>
                  <span className={styles.mediaActions}>
                    <button
                      type="button"
                      title="Move up"
                      disabled={index === 0}
                      onClick={() => {
                        const next = preview.slice();
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        setProfileField('galleryPreview', next);
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      title="Move down"
                      disabled={index === preview.length - 1}
                      onClick={() => {
                        const next = preview.slice();
                        [next[index + 1], next[index]] = [next[index], next[index + 1]];
                        setProfileField('galleryPreview', next);
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={styles.danger}
                      title="Remove from the teaser"
                      onClick={() => {
                        const next = preview.filter((f) => f !== file);
                        // Emptied means the key goes, not `"galleryPreview": []`. `null`, not
                        // `undefined` — see the note on `setProfileField`.
                        setProfileField('galleryPreview', next.length ? next : null);
                      }}
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <div className={styles.panelActions}>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() =>
                  pickAsset({
                    title: 'Add a tile to the gallery teaser',
                    imagesOnly: true,
                    used: new Set(preview),
                    // Deduped on the way in, mirroring `appendMedia`'s guard on the server. A
                    // repeat is not merely untidy here: the rows key on the filename, so two
                    // copies collide as React keys and `×` — a `filter(f => f !== file)` —
                    // removes both at once. `GalleryPreview.tsx` keys its tiles on the url, so a
                    // cv.json written that way carries the collision to the published site.
                    onPick: (file) => {
                      if (preview.includes(file)) return;
                      setProfileField('galleryPreview', [...preview, file]);
                    },
                  })
                }
              >
                Add a tile
              </button>
            </div>
          </section>
        </>
      )}

      {selection.kind === 'section' && section && (
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Section</h3>
          <p className={styles.path}>content/cv.json → sections[{section.key}]</p>
          <Row
            label="Key"
            hint="Machine-facing and stable. Derived from the title when the section was created and deliberately not renamed with it — the title is free text, this is the address."
          >
            <input className={styles.input} type="text" value={section.key} readOnly />
          </Row>
          <p className={styles.hint}>
            {section.items.length} item{section.items.length === 1 ? '' : 's'}. Array order is
            display order — reorder with the arrows or the grip on the canvas.
          </p>
        </section>
      )}

      {selection.kind === 'item' && item && section && (
        <>
          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>Item</h3>
            <p className={styles.path}>
              content/cv.json → {section.key}[{item.id}]
            </p>
            <Row
              label="Link"
              hint="The heading becomes a link and gains the arrow beside it. Nothing on the page shows the target, which is why it lives here."
            >
              <input
                className={styles.input}
                type="text"
                inputMode="url"
                placeholder="https://example.com"
                value={item.url ?? ''}
                onChange={(e) => setItemField(section.key, item.id, 'url', e.target.value)}
              />
            </Row>
            <div className={styles.panelActions}>
              <button
                type="button"
                className={styles.ghostButton}
                // `onMouseDown` with the default prevented, so focus never leaves an open
                // heading field — this is the toolbar-button pattern, and without it the field
                // would blur and close before the click landed, leaving nothing to insert into.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  pickAsset({
                    title: 'Insert an inline icon into the heading',
                    imagesOnly: true,
                    // The token is positional, so the open heading field has to survive the
                    // pick — it is the only thing that knows where the caret is. See `keepFocus`.
                    keepFocus: true,
                    onPick: (file) => insertHeadingIcon(section.key, item.id, file),
                  })
                }
              >
                Insert heading icon
              </button>
            </div>
            <p className={styles.hint}>
              Drops <code>[filename]</code> into the heading at the cursor, which renders that pool
              image inline at 20px right where the token sits. The spaces you leave around it are
              the gaps you get.
            </p>
          </section>
          <MediaPanel sectionKey={section.key} item={item} />
        </>
      )}

      {selection.kind === 'contact' && (
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Contact</h3>
          <p className={styles.path}>content/cv.json → contact</p>
          <p className={styles.hint}>
            Pinned to the bottom of the CV. Its rows are orderable; its position is not.
          </p>
        </section>
      )}

      {selection.kind === 'contactRow' && contactRow && (
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Contact row</h3>
          <p className={styles.path}>content/cv.json → contact.items[{contactRow.id}]</p>
          <Row label="Link" hint="mailto: for an address, https:// for a profile.">
            <input
              className={styles.input}
              type="text"
              inputMode="url"
              placeholder="mailto:you@example.com"
              value={contactRow.url ?? ''}
              onChange={(e) => setContactField(contactRow.id, 'url', e.target.value)}
            />
          </Row>
          {/* Both of these are on the canvas for a `mailto:` row — it is wide and shows its
              address — and neither is on a compact one, which shows a mark and nothing else.
              They live here because for that pill they stopped being text a visitor reads and
              became facts about the link, which is the split the whole inspector is for. */}
          <Row
            label="Platform"
            hint="Draws this row's mark when it is one of the names ContactIcon.tsx knows. Anything else spells itself out on the pill instead."
          >
            <input
              className={styles.input}
              type="text"
              placeholder="LinkedIn"
              value={contactRow.platform ?? ''}
              onChange={(e) => setContactField(contactRow.id, 'platform', e.target.value)}
            />
          </Row>
          <Row label="Handle" hint="The address on an email pill; the tooltip and the spoken name on the rest.">
            <input
              className={styles.input}
              type="text"
              placeholder="you@example.com"
              value={contactRow.handle ?? ''}
              onChange={(e) => setContactField(contactRow.id, 'handle', e.target.value)}
            />
          </Row>
        </section>
      )}

      {selection.kind === 'galleryEntry' && entry && (
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Gallery entry</h3>
          <p className={styles.path}>content/gallery.json → {entry.id}</p>
          <p className={styles.hint}>
            Title, caption, date and tags are edited on the page. A tag is the filter key, so two
            entries agreeing on one is what puts them in the same filtered set.
          </p>
          <div className={styles.panelActions}>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() =>
                pickAsset({
                  title: 'Point this entry at a different asset',
                  used: galleryUses,
                  onPick: (file) => setGalleryEntryFile(entry.id, file),
                })
              }
            >
              Change asset
            </button>
          </div>
          <p className={styles.hint}>
            Currently <code>{entry.file}</code>
            {cvUses.has(entry.file) ? ' — the CV shows it too, so reusing it costs no extra bytes.' : '.'}
          </p>
        </section>
      )}

      {/* `key` is not cosmetic here. The panel holds a local draft of whichever dimension box is
          being typed into, and without an identity React reuses the same instance when
          `assetFile` changes — carrying one asset's half-typed number onto the next. The obvious
          way to switch assets makes it worse rather than better: Scrollbooster preventDefaults
          the thumbnail row's `mousedown`, so the input never blurs and the `onBlur` reset never
          runs. Keying on the file discards the draft with the subject. */}
      {assetFile && assets[assetFile] && <AssetPanel key={assetFile} file={assetFile} />}

      {(orphans.unregistered.length > 0 || orphans.unreferenced.length > 0) && (
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Pool</h3>
          {orphans.unregistered.length > 0 && (
            <p className={styles.hint}>
              In public/media/ but absent from media.json, so unusable:{' '}
              {orphans.unregistered.join(', ')}.
            </p>
          )}
          {orphans.unreferenced.length > 0 && (
            <p className={styles.hint}>
              Registered but referenced by nothing: {orphans.unreferenced.join(', ')}. A detached
              file stays here until something points at it again.
            </p>
          )}
        </section>
      )}
    </aside>
  );
};

export default Inspector;
