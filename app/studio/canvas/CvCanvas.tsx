'use client';

import { useMemo, useState } from 'react';
import Arrow12 from '../../Arrow12';
import Attachments from '../../Attachments';
import GalleryPreview from '../../GalleryPreview';
import RichText from '../../RichText';
import {
  CheckIcon,
  CopyIcon,
  EnvelopeIcon,
  PlatformIcon,
  hasPlatformIcon,
} from '../../ContactIcon';
import profile from '../../Profile.module.css';
import type { ContactItem, CvItem, CvSection, ResolvedMedia } from '../../lib/contentTypes';
import { groupContactRows, isAddressContact } from '../../lib/contentTypes';
import { resolveHeading, resolveMedia, silent } from '../../lib/resolveContent';
import { sameSelection, useStudio } from '../lib/studioContext';
import { useDragHandlers } from '../lib/useDragHandlers';
import Editable from './Editable';
import styles from './canvas.module.css';
import SectionNumber from '../../SectionNumber';

/**
 * The CV route, editable.
 *
 * Markup and classes are `Profile.tsx`'s, so the column, the sticky titles, the year gutter and
 * the thumbnail rows are the page's rather than an approximation of it. Three things differ,
 * and each is a deliberate editor affordance rather than a divergence:
 *
 * - **Empty fields are still there.** The site omits a missing subheading entirely; here it
 *   becomes a ghost slot so there is something to click. It appears only inside the *selected*
 *   item — see `.showGhosts` — so at rest the canvas measures exactly like the page.
 * - **Sections with no items render.** `contentLoader` drops those, which is right for a build
 *   and wrong here: a section you just created has to be visible to put the first item in.
 * - **Pressing a thumbnail selects its asset** instead of opening the lightbox, via the one
 *   optional prop `Attachments` takes for it.
 */

/** Icon-only buttons, so the glyph and the accessible name are declared together. */
const Tool: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, danger, wide, children }) => (
  <button
    type="button"
    className={[styles.toolButton, danger ? styles.toolDanger : '', wide ? styles.toolWide : '']
      .filter(Boolean)
      .join(' ')}
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

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

type ItemProps = {
  item: CvItem;
  sectionKey: string;
  index: number;
  total: number;
  showDetails: boolean;
  priority: boolean;
  dragSource: ReturnType<ReturnType<typeof useDragHandlers>['source']>;
  dragTarget: ReturnType<ReturnType<typeof useDragHandlers>['target']>;
  dragOver: boolean;
};

const CanvasItem: React.FC<ItemProps> = ({
  item,
  sectionKey,
  index,
  total,
  showDetails,
  priority,
  dragSource,
  dragTarget,
  dragOver,
}) => {
  const {
    assets,
    urlFor,
    selection,
    select,
    selectAsset,
    setItemField,
    deleteItem,
    moveItem,
    upload,
  } = useStudio();
  const [dropping, setDropping] = useState(false);

  const selected = sameSelection(selection, { kind: 'item', sectionKey, itemId: item.id });

  const heading = useMemo(
    () => resolveHeading(item.heading, assets, urlFor, `cv.json ${sectionKey}/${item.id}`, silent),
    [item.heading, assets, urlFor, sectionKey, item.id]
  );

  /**
   * Filenames paired with what they resolved to, rather than `resolveItem`'s bare list.
   * Unresolvable references are dropped from the row, so a bare index into it would name the
   * wrong file the moment one reference is broken — and pressing a thumbnail here edits the
   * file, so that mistake would be silent and destructive.
   */
  const attached = useMemo(
    () =>
      (item.media ?? [])
        .map((file) => ({
          file,
          media: resolveMedia(file, assets, urlFor, `cv.json ${sectionKey}/${item.id}`, silent),
        }))
        .filter((entry): entry is { file: string; media: ResolvedMedia } => entry.media !== null),
    [item.media, assets, urlFor, sectionKey, item.id]
  );

  const selectSelf = () => select({ kind: 'item', sectionKey, itemId: item.id });

  return (
    <div
      {...dragTarget}
      className={[
        profile.experience,
        styles.node,
        selected ? styles.nodeSelected : '',
        selected ? styles.showGhosts : '',
        dropping || dragOver ? styles.dropping : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseDown={(e) => {
        e.stopPropagation();
        selectSelf();
      }}
      onDragOver={(e) => {
        dragTarget.onDragOver(e);
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={() => {
        dragTarget.onDragLeave();
        setDropping(false);
      }}
      onDrop={(e) => {
        dragTarget.onDrop(e);
        if (e.dataTransfer.files?.length) {
          e.preventDefault();
          upload(e.dataTransfer.files, { kind: 'item', sectionKey, itemId: item.id });
        }
        setDropping(false);
      }}
    >
      <div className={styles.tools}>
        <span {...dragSource} className={styles.toolButton} title="Drag to reorder" aria-hidden>
          ⠿
        </span>
        <Tool label="Move up" disabled={index === 0} onClick={() => moveItem(sectionKey, index, index - 1)}>
          ↑
        </Tool>
        <Tool
          label="Move down"
          disabled={index === total - 1}
          onClick={() => moveItem(sectionKey, index, index + 1)}
        >
          ↓
        </Tool>
        <Tool label="Delete this item" danger onClick={() => deleteItem(sectionKey, item)}>
          ×
        </Tool>
      </div>

      <div className={profile.year}>
        <span className={styles.yearSlot}>
          <Editable
            value={item.year ?? ''}
            onChange={(next) => setItemField(sectionKey, item.id, 'year', next)}
            placeholder="Year"
            label="Year"
            onEdit={selectSelf}
          />
        </span>
      </div>

      <div className={profile.experienceContent}>
        <div className={profile.title}>
          <Editable
            value={item.heading ?? ''}
            onChange={(next) => setItemField(sectionKey, item.id, 'heading', next)}
            placeholder="Heading"
            label="Heading"
            onEdit={selectSelf}
          >
            {/* The site's own segments: `[filename]` tokens render as inline icons exactly
                where they sit. The field opens on the raw string, tokens and all, which is the
                only thing that can be edited back. */}
            {heading.segments.map((segment, i) =>
              segment.kind === 'text' ? (
                <span key={i}>{segment.text}</span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  className={profile.titleIcon}
                  src={segment.icon.url}
                  alt=""
                  width={20}
                  height={20}
                  style={{ '--icon-size': '20px' } as React.CSSProperties}
                />
              )
            )}
          </Editable>
          {item.url ? (
            <span className={profile.linkArrow}>
              &#xfeff;
              <Arrow12 fill="var(--foreground-primary)" />
            </span>
          ) : null}
        </div>

        {/* An unset optional field is rendered only once its item is selected. Hiding it at
            rest is what keeps the canvas measuring like the page — the site omits these
            entirely — and an always-present empty `.details` would be worse than invisible:
            `.subheading ~ .details .detailsInner` carries a top padding, so it would leave a
            phantom gap under every item that has no description. The year and heading take the
            other approach, since their boxes exist either way; see `.ghost`. */}
        {item.subheading || selected ? (
          <div className={profile.subheading}>
            <Editable
              value={item.subheading ?? ''}
              onChange={(next) => setItemField(sectionKey, item.id, 'subheading', next)}
              placeholder="Subheading"
              label="Subheading"
              onEdit={selectSelf}
            />
          </div>
        ) : null}

        {item.description || selected ? (
          <div className={profile.details} data-open={showDetails}>
            <div className={profile.detailsInner}>
              <div className={profile.description}>
                <Editable
                  as="div"
                  multiline
                  value={item.description ?? ''}
                  onChange={(next) => setItemField(sectionKey, item.id, 'description', next)}
                  placeholder='Markdown. Start a line with "* " for a bullet.'
                  label="Description"
                  onEdit={selectSelf}
                >
                  {item.description ? <RichText text={item.description} /> : null}
                </Editable>
              </div>
            </div>
          </div>
        ) : null}

        {attached.length > 0 ? (
          <Attachments
            attachments={attached.map((entry) => entry.media)}
            label={heading.plain}
            priority={priority}
            onSelect={(i) => {
              selectSelf();
              selectAsset(attached[i].file);
            }}
          />
        ) : null}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

const CanvasSection: React.FC<{
  section: CvSection;
  index: number;
  total: number;
  showDetails: boolean;
  onToggleDetails: () => void;
  priority: boolean;
  dragSource: ReturnType<ReturnType<typeof useDragHandlers>['source']>;
  dragTarget: ReturnType<ReturnType<typeof useDragHandlers>['target']>;
  dragOver: boolean;
}> = ({
  section,
  index,
  total,
  showDetails,
  onToggleDetails,
  priority,
  dragSource,
  dragTarget,
  dragOver,
}) => {
  const { selection, select, renameSection, deleteSection, moveSection, addItem, moveItem } =
    useStudio();
  const itemDrag = useDragHandlers((from, to) => moveItem(section.key, from, to));

  const selected = sameSelection(selection, { kind: 'section', sectionKey: section.key });
  const hasDetails = section.items.some((item) => Boolean(item.description));

  return (
    <section className={profile.profileSection} {...dragTarget}>
      <div
        className={[
          profile.sectionHeader,
          styles.sectionHeaderRow,
          styles.node,
          selected ? styles.nodeSelected : '',
          dragOver ? styles.dropping : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onMouseDown={(e) => {
          e.stopPropagation();
          select({ kind: 'section', sectionKey: section.key });
        }}
      >
        {/* The site's ordinal, same component and same stylesheet. It is derived from position
            there too, so dragging a section here renumbers it on the canvas exactly as the
            rebuilt page will show it. */}
        <SectionNumber index={index} />
        <h2 className={styles.sectionTitleSlot}>
          <Editable
            value={section.label}
            onChange={(next) => renameSection(section.key, next)}
            placeholder="Section title"
            label="Section title"
            onEdit={() => select({ kind: 'section', sectionKey: section.key })}
          />
        </h2>
        <span className={styles.sectionTools}>
          <span {...dragSource} className={styles.toolButton} title="Drag to reorder" aria-hidden>
            ⠿
          </span>
          <Tool label="Move section up" disabled={index === 0} onClick={() => moveSection(index, index - 1)}>
            ↑
          </Tool>
          <Tool
            label="Move section down"
            disabled={index === total - 1}
            onClick={() => moveSection(index, index + 1)}
          >
            ↓
          </Tool>
          <Tool label="Add an item to this section" onClick={() => addItem(section.key)}>
            ＋
          </Tool>
          <Tool label="Delete this section" danger onClick={() => deleteSection(section)}>
            ×
          </Tool>
        </span>
        {hasDetails ? (
          <button
            type="button"
            className={profile.detailsToggle}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onToggleDetails}
            aria-label={`${showDetails ? 'Hide' : 'Show'} details in every section`}
          >
            {showDetails ? 'Hide Details' : 'Show Details'}
          </button>
        ) : null}
      </div>

      {section.items.length === 0 ? (
        <p className={styles.emptySection}>
          Empty. The published site omits a section with no items — add one below.
        </p>
      ) : (
        <div className={profile.experiences}>
          {section.items.map((item, itemIndex) => (
            <CanvasItem
              key={item.id}
              item={item}
              sectionKey={section.key}
              index={itemIndex}
              total={section.items.length}
              showDetails={showDetails}
              priority={priority && itemIndex === 0}
              dragSource={itemDrag.source(itemIndex)}
              dragTarget={itemDrag.target(itemIndex)}
              dragOver={itemDrag.over === itemIndex}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        className={styles.addRow}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => addItem(section.key)}
      >
        ＋ Add item to {section.label}
      </button>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

/**
 * A contact pill, editable — and the one row where the canvas/inspector split moved when the
 * design did.
 *
 * The site's pills are an `<a>` and a `<button>`; these are spans. The canvas navigates nowhere
 * and copies nothing — the same choice the item headings already make — and a real control here
 * would compete with the node's own press for the selection.
 *
 * What changed with the pills is *which* strings are readable. A compact pill shows a mark and
 * nothing else, so its platform and handle stopped being things a visitor reads and became facts
 * about the link — inspector, by the rule in CLAUDE.md. What a visitor can still read stays on
 * the canvas: the address, and the *name* of a platform with no mark drawn for it, which is that
 * pill's whole visible content.
 *
 * The site's hover tooltip is the one piece of the pill deliberately not reproduced: it occupies
 * exactly the space `.tools` does, directly above the pill, and both appear on hover. The
 * toolbar is what a hover means here, so a plain `title` carries the handle instead.
 */
const CanvasContactRow: React.FC<{
  item: ContactItem;
  index: number;
  total: number;
  dragSource: ReturnType<ReturnType<typeof useDragHandlers>['source']>;
  dragTarget: ReturnType<ReturnType<typeof useDragHandlers>['target']>;
  dragOver: boolean;
}> = ({ item, index, total, dragSource, dragTarget, dragOver }) => {
  const { selection, select, setContactField, deleteContactRow, moveContactRow } = useStudio();
  const selected = sameSelection(selection, { kind: 'contactRow', itemId: item.id });
  const selectSelf = () => select({ kind: 'contactRow', itemId: item.id });

  // Both tests come from the same place `Profile.tsx` gets them, rather than being restated
  // here: the canvas showing one treatment where the build emits the other is the one failure an
  // edit-in-place editor must not have.
  const isAddress = isAddressContact(item);
  const marked = hasPlatformIcon(item.platform ?? '');

  return (
    <div
      {...dragTarget}
      className={[
        styles.node,
        styles.contactNode,
        selected ? styles.nodeSelected : '',
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
        <Tool label="Move up" disabled={index === 0} onClick={() => moveContactRow(index, index - 1)}>
          ↑
        </Tool>
        <Tool
          label="Move down"
          disabled={index === total - 1}
          onClick={() => moveContactRow(index, index + 1)}
        >
          ↓
        </Tool>
        <Tool label="Delete this row" danger onClick={() => deleteContactRow(item)}>
          ×
        </Tool>
      </div>

      {isAddress ? (
        <span className={`${profile.contactPill} ${profile.contactAddress}`}>
          <EnvelopeIcon className={profile.contactIcon} />
          <span className={profile.contactAddressText}>
            <Editable
              value={item.handle ?? ''}
              onChange={(next) => setContactField(item.id, 'handle', next)}
              placeholder="you@example.com"
              label="Email address"
              onEdit={selectSelf}
            />
          </span>
          {/* Both glyphs, as the site mounts them — the check rests at `opacity: 0`, so what
              shows is the copy mark and the pair costs the canvas nothing. */}
          <span className={profile.contactCopyMark} aria-hidden>
            <CopyIcon className={profile.contactCopyGlyph} />
            <CheckIcon className={profile.contactCheckGlyph} />
          </span>
        </span>
      ) : (
        <span
          className={[
            profile.contactPill,
            profile.contactCompact,
            marked ? '' : profile.contactCompactLabel,
          ]
            .filter(Boolean)
            .join(' ')}
          title={item.handle}
        >
          {marked ? (
            <PlatformIcon platform={item.platform} className={profile.contactIcon} />
          ) : (
            <Editable
              value={item.platform ?? ''}
              onChange={(next) => setContactField(item.id, 'platform', next)}
              placeholder="Platform"
              label="Platform"
              onEdit={selectSelf}
            />
          )}
        </span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// The route
// ---------------------------------------------------------------------------

const CvCanvas: React.FC = () => {
  const {
    cv,
    assets,
    urlFor,
    selection,
    select,
    addSection,
    renameContact,
    addContactRow,
    moveContactRow,
    moveSection,
  } = useStudio();

  // One piece of state for the whole canvas, exactly as `Profile.tsx` holds it: every section's
  // control drives it, so collapsing anywhere collapses everywhere.
  const [showDetails, setShowDetails] = useState(true);
  const [newSection, setNewSection] = useState<string | null>(null);

  const sectionDrag = useDragHandlers(moveSection);
  const contactDrag = useDragHandlers(moveContactRow);

  // The pills render in runs (see `groupContactRows`), so a row's position inside its run is no
  // longer its position in the document. Everything that reorders — the drag, the arrows, the
  // disabled ends — addresses `contact.items`, so the document index is looked up by id.
  const contactItems = useMemo(() => cv.contact?.items ?? [], [cv.contact?.items]);
  const contactTotal = contactItems.length;
  const contactIndex = useMemo(
    () => new Map(contactItems.map((item, index) => [item.id, index])),
    [contactItems],
  );

  const teaser = useMemo(
    () =>
      (cv.profile.galleryPreview ?? [])
        .map((file) => resolveMedia(file, assets, urlFor, 'cv.json: profile.galleryPreview', silent))
        .filter((media): media is ResolvedMedia => media !== null),
    [cv.profile.galleryPreview, assets, urlFor]
  );

  const contactSelected = sameSelection(selection, { kind: 'contact' });

  return (
    <>
      {teaser.length > 0 ? (
        <div
          className={[styles.node, sameSelection(selection, { kind: 'profile' }) ? styles.nodeSelected : '']
            .filter(Boolean)
            .join(' ')}
          onMouseDown={(e) => {
            e.stopPropagation();
            select({ kind: 'profile' });
          }}
          // The teaser ends in a real <Link> to /gallery. On the site that is the point; here
          // it would navigate out of the Studio mid-edit, so the press is cancelled before
          // next/link ever sees it. The Gallery tab above is how you get there.
          onClickCapture={(e) => e.preventDefault()}
        >
          <GalleryPreview items={teaser} />
        </div>
      ) : null}

      {cv.sections.map((section, index) => (
        <CanvasSection
          key={section.key}
          section={section}
          index={index}
          total={cv.sections.length}
          showDetails={showDetails}
          onToggleDetails={() => setShowDetails((open) => !open)}
          priority={index === 0}
          dragSource={sectionDrag.source(index)}
          dragTarget={sectionDrag.target(index)}
          dragOver={sectionDrag.over === index}
        />
      ))}

      {newSection === null ? (
        <button
          type="button"
          className={styles.addRow}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setNewSection('')}
        >
          ＋ Add section
        </button>
      ) : (
        // Inline rather than a dialog, and the one create that asks for text up front: a
        // section's `key` is derived from this label and is machine-facing and permanent, where
        // the label itself stays free to rename. Typing it in the title's own type is the
        // closest an inline field gets to showing what it will become.
        <input
          autoFocus
          className={styles.addSectionField}
          placeholder="Section title, e.g. Speaking"
          value={newSection}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setNewSection(e.target.value)}
          onBlur={() => setNewSection(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setNewSection(null);
            if (e.key === 'Enter' && newSection.trim()) {
              addSection(newSection.trim());
              setNewSection(null);
            }
          }}
        />
      )}

      <section className={profile.profileSection}>
        <div
          className={[
            profile.sectionHeader,
            styles.sectionHeaderRow,
            styles.node,
            contactSelected ? styles.nodeSelected : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onMouseDown={(e) => {
            e.stopPropagation();
            select({ kind: 'contact' });
          }}
        >
          <SectionNumber index={cv.sections.length} />
          <h2 className={styles.sectionTitleSlot}>
            <Editable
              value={cv.contact?.label ?? 'Contact'}
              onChange={renameContact}
              placeholder="Contact"
              label="Contact section title"
              onEdit={() => select({ kind: 'contact' })}
            />
          </h2>
          <span className={styles.sectionTools}>
            <Tool label="Add a contact row" onClick={addContactRow}>
              ＋
            </Tool>
          </span>
        </div>
        {/* Grouped into runs exactly as the page groups them, so the canvas breaks its row in
            the same place. The drag index is still the row's index in `contact.items` — it has
            to be, since that is what `moveContactRow` reorders — so it is read off the map
            rather than off the position within a run. */}
        <div className={profile.contacts}>
          {groupContactRows(cv.contact?.items ?? []).map((run) =>
            run.kind === 'address' ? (
              <CanvasContactRow
                key={run.item.id}
                item={run.item}
                index={contactIndex.get(run.item.id) ?? 0}
                total={contactTotal}
                dragSource={contactDrag.source(contactIndex.get(run.item.id) ?? 0)}
                dragTarget={contactDrag.target(contactIndex.get(run.item.id) ?? 0)}
                dragOver={contactDrag.over === contactIndex.get(run.item.id)}
              />
            ) : (
              <div key={run.items[0].id} className={profile.contactProfiles}>
                {run.items.map((item) => {
                  const index = contactIndex.get(item.id) ?? 0;
                  return (
                    <CanvasContactRow
                      key={item.id}
                      item={item}
                      index={index}
                      total={contactTotal}
                      dragSource={contactDrag.source(index)}
                      dragTarget={contactDrag.target(index)}
                      dragOver={contactDrag.over === index}
                    />
                  );
                })}
              </div>
            ),
          )}
        </div>
        <button
          type="button"
          className={styles.addRow}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={addContactRow}
        >
          ＋ Add contact row
        </button>
      </section>
    </>
  );
};

export default CvCanvas;
