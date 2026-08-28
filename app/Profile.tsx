"use client"

import { useEffect, useRef, useState } from "react";
import RichText from "./RichText";
import Arrow12 from "./Arrow12";
import {
  CheckIcon,
  CopyIcon,
  EnvelopeIcon,
  PlatformIcon,
  hasPlatformIcon,
} from "./ContactIcon";
import { groupContactRows } from "./lib/contentTypes";
import GalleryPreview from "./GalleryPreview";
import SectionNumber from "./SectionNumber";
import styles from "./Profile.module.css";
import Attachments from "./Attachments";
import { cloudflareImageUrl } from "./lib/cloudflareImage";
import type {
  ContactItem,
  HeadingSegment,
  ResolvedCv,
  ResolvedIcon,
  ResolvedItem,
  ResolvedSection,
} from "./lib/contentTypes";

/**
 * Displayed size of an inline heading icon, in CSS px. Declared here rather than only in the
 * stylesheet because the Cloudflare request is derived from it too, and a second copy of the
 * number would drift from the box it is meant to fill. It reaches the CSS as a custom
 * property for the same reason.
 */
const ICON_SIZE = 20;

type ProfileProps = {
  cv: ResolvedCv,
};

/**
 * Contact is pinned last and only `sections` is orderable. That is why nothing here
 * branches on a section's label: every entry in `sections` renders identically, so
 * renaming one is always safe.
 *
 * About is pinned too, but it is no longer rendered here — it sits above the tab bar with
 * the rest of the profile, in `ProfileHeader`.
 */
const Profile: React.FC<ProfileProps> = ({
  cv
}) => {
  // One piece of state for the whole page rather than one per section: every section's
  // control reads and writes it, so opening details anywhere opens them everywhere.
  // **Closed by default**, which is a reversal: it was open on the reasoning that a reader who
  // never noticed the quiet control should still get the CV's substance. Closed, the whole CV is
  // its headings — every role, project and award on a couple of screens — and the prose is there
  // for whoever wants it. That is the better first read, and it is the one the control exists to
  // let a reader change.
  const [showDetails, setShowDetails] = useState(false);
  const toggleDetails = () => setShowDetails(open => !open);

  return (
    <>
      {/* Opens the CV, directly under the shared About the layout renders above it. It lives
          in the page rather than the layout precisely because it is CV-only: the layout is not
          told which route it is rendering, so anything conditional up there needs a pathname
          test, whereas down here being on the CV *is* the condition. */}
      <GalleryPreview items={cv.profile.galleryPreview} />

      {cv.sections.map((section, sectionIndex) => (
        <Section
          key={section.key}
          section={section}
          showDetails={showDetails}
          onToggleDetails={toggleDetails}
          // Only the first item of the first section is on screen when the page loads, so it
          // is the only thumbnail row whose images should skip the browser's viewport logic.
          // The decision has to be made here: a row renders per item, so from inside one an
          // index says nothing about where it sits in the document — testing that index was
          // what put the first few thumbnails of *every* section into the initial fetch.
          priority={sectionIndex === 0}
          index={sectionIndex}
        />
      ))}

      {cv.contact.items.length > 0 ?
        <section className={styles.profileSection}>
          {/* Contact is pinned last rather than living in `sections`, so its ordinal continues
              the sequence from the end of that array instead of being counted with it. */}
          <SectionHeader label={cv.contact.label} index={cv.sections.length}/>
          {/* Grouped rather than laid out flat, so a row too wide for the column breaks between
              the address and the marks instead of stranding one lone mark up beside it — see
              `groupContactRows`. Every run is still in array order. */}
          <div className={styles.contacts}>
            {groupContactRows(cv.contact.items).map((run) =>
              run.kind === 'address'
                ? <ContactAddress key={run.item.id} item={run.item}/>
                : (
                  <div key={run.items[0].id} className={styles.contactProfiles}>
                    {run.items.map((item) => (
                      <ContactProfile key={item.id} item={item}/>
                    ))}
                  </div>
                )
            )}
          </div>
        </section>
      : null}
    </>
  );
};

type SectionProps = {
  section: ResolvedSection,
  showDetails: boolean,
  onToggleDetails: () => void,
  /** Whether this is the first section, and so the one on screen at load. */
  priority?: boolean,
  /** Its position in `sections`, which is also its ordinal — see `SectionNumber`. */
  index: number,
};
const Section: React.FC<SectionProps> = ({
  section,
  showDetails,
  onToggleDetails,
  priority = false,
  index,
}) => {
  // Descriptions are the only thing the control hides, so a section whose items carry none
  // — Awards and Speaking, today — gets no control at all rather than a dead one. Media and
  // subheadings are not "details": they stay put either way. The state is still shared, so
  // a section without a control follows the others; it just has nothing to show or hide.
  const hasDetails = section.items.some((item) => Boolean(item.description));

  return (
    <section className={styles.profileSection}>
      <SectionHeader
        label={section.label}
        index={index}
        toggle={hasDetails ? { open: showDetails, onToggle: onToggleDetails } : undefined}
      />
      <div className={styles.experiences}>
        {section.items.map((item, itemIndex) => (
          <ProfileItem
            key={item.id}
            item={item}
            showDetails={showDetails}
            priority={priority && itemIndex === 0}
          />
        ))}
      </div>
    </section>
  );
};

type SectionHeaderProps = {
  label: string,
  /** Zero-based position in the numbered sequence; `SectionNumber` renders it 1-based and padded. */
  index: number,
  toggle?: { open: boolean, onToggle: () => void },
};

/**
 * The section's title, pinned directly beneath the tab bar for as long as the section is on
 * screen. It is full-bleed for the same reason the tab bar is: the attachment carousel
 * bleeds past the content column below 480px and would otherwise stay visible beside the
 * title as it scrolls under.
 *
 * The pinning relies on section spacing being padding rather than margin (see
 * Profile.module.css), so consecutive section boxes touch and each title is pushed out at
 * exactly the scroll position where the next one arrives.
 */
const SectionHeader: React.FC<SectionHeaderProps> = ({
  label,
  index,
  toggle,
}) => {
  return (
    <div className={styles.sectionHeader}>
      {/* First in source order, but out of flow — it is positioned against this header, which is
          already sticky. Being absolutely positioned it is not a flex item either, so it takes no
          part in the `space-between` that pushes the toggle to the far edge. */}
      <SectionNumber index={index} />
      {/* h2, not h3. `ProfileHeader`'s is the page's only h1 and this is the only other heading
          on either route, so an h3 left every section title two levels below the page title with
          no h2 anywhere to bridge them — a hole in the outline, and nothing for a screen
          reader's "next level 2" to land on. Purely semantic: `.profileSection h2` overrides the
          UA sizing, so the tag carries no visual weight of its own. */}
      <h2>{label}</h2>
      {toggle ?
        /* The visible label already states what the button does, so there is no aria-pressed
           here: a toggle that renames itself and one that announces a pressed state are two
           different patterns, and combining them makes a screen reader say both.

           The accessible name says "in every section" rather than naming this one. Each
           section renders its own button but they all drive the same state, so naming the
           section would promise a scope the control does not have. */
        <button
          type="button"
          className={styles.detailsToggle}
          onClick={toggle.onToggle}
          aria-label={`${toggle.open ? "Hide" : "Show"} details in every section`}>
          {toggle.open ? "Hide Details" : "Show Details"}
        </button>
      : null}
    </div>
  );
};

type ProfileItemProps = {
  item: ResolvedItem,
  showDetails: boolean,
  /** Whether this item's thumbnail row is on screen at load. */
  priority?: boolean,
};
const ProfileItem: React.FC<ProfileItemProps> = ({
  item,
  showDetails,
  priority = false,
}) => {

  // Icons sit wherever the author put their token, so they are part of the heading's own flow —
  // inside the anchor when there is one, which is what keeps a mid-title logo travelling with
  // the words around it instead of being pinned to one end.
  const heading = <Heading segments={item.headingSegments} />;

  let title;
  if (item.url) {
    title = <>
      <a href={item.url} target="_blank">{heading}</a><span className={styles.linkArrow}>&#xfeff;<Arrow12 fill="var(--foreground-primary)"/></span>
    </>
  } else {
    title = heading
  }
  return (
    <div className={styles.experience}>
      <div className={styles.year}>
        <span>{item.year}</span>
      </div>
      <div className={styles.experienceContent}>
        <div className={styles.title}>
          {title}
        </div>
        {item.subheading ?
        <div className={styles.subheading}>{item.subheading}</div>
        : null}
        {item.description ?
        /* Collapsed by animating the grid track from 0fr to 1fr, which is the only way to
           transition to a content-determined height. `inert` rather than `aria-hidden`
           because the description contains links: aria-hidden would leave them focusable
           but unreadable, whereas inert removes them from the tab order too. */
        <div className={styles.details} data-open={showDetails} inert={!showDetails}>
          <div className={styles.detailsInner}>
            <div className={styles.description}>
              <RichText text={item.description}/>
            </div>
          </div>
        </div>
        : null}
        {item.attachments.length > 0 ?
          <Attachments attachments={item.attachments} label={item.heading} priority={priority}/>
        : null}
      </div>
    </div>
  )
}

/** A heading, with its `[filename]` tokens rendered as inline icons in place. */
const Heading: React.FC<{ segments: HeadingSegment[] }> = ({ segments }) => (
  <>
    {segments.map((segment, index) =>
      segment.kind === 'text' ? (
        segment.text
      ) : (
        // Index keys: segments are positional by nature and the array is rebuilt whenever the
        // heading changes, so there is no identity to preserve across renders.
        <TitleIcon key={index} icon={segment.icon} />
      )
    )}
  </>
);

/**
 * An inline icon inside a heading. `alt=""` because the words around it already name the thing —
 * "Figma" beside Figma's mark read twice is noise, not information.
 *
 * `fit: 'contain'` rather than the `cover` the thumbnails use: these are a mixed set. A square
 * app icon fills the box either way, but a wordmark or a non-square logo would be cropped by
 * `cover`, and losing the edge of a logo is worse than a little space around it.
 *
 * The dark variant is swapped by `<picture>` and a `media` query, not by JavaScript. This is a
 * static export whose dark mode is `prefers-color-scheme` — there is no theme state to read, so a
 * scripted swap would render the light file first and change it after hydration, and would do
 * nothing at all with JS off. `<picture>` is resolved before the request is made, so exactly one
 * file is downloaded and the correct one paints on the first frame. `next/image` cannot emit it,
 * hence the plain elements here.
 */
const TitleIcon: React.FC<{ icon: ResolvedIcon }> = ({ icon }) => {
  const variant = (url: string) =>
    cloudflareImageUrl(url, { width: ICON_SIZE, height: ICON_SIZE, fit: 'contain' });

  return (
    <picture>
      {icon.darkUrl && (
        <source srcSet={variant(icon.darkUrl)} media="(prefers-color-scheme: dark)" />
      )}
      {/* A plain <img> rather than next/image, which renders a bare element and so cannot
          participate in the <picture> the theme swap depends on. `no-img-element` does not fire
          here — the rule accepts an <img> inside a <picture>. */}
      <img
        className={styles.titleIcon}
        src={variant(icon.url)}
        alt=""
        width={ICON_SIZE}
        height={ICON_SIZE}
        style={{ '--icon-size': `${ICON_SIZE}px` } as React.CSSProperties}
      />
    </picture>
  );
};

type ContactRowProps = {
  item: ContactItem,
};

/**
 * A profile: the compact pill, its mark and nothing else.
 *
 * The tooltip names the platform, and it replaced the native `title` rather than joining it —
 * two tooltips over one pill is one too many, and the native one arrives after a delay the
 * browser owns, in a chrome that is nobody's design. It is deliberately *not* rendered on an
 * unmarked pill: that pill's whole visible content is already the platform's name, so a label
 * repeating it hovers a word over itself.
 */
const ContactProfile: React.FC<ContactRowProps> = ({
  item
}) => {
  const marked = hasPlatformIcon(item.platform);

  return (
    <a
      className={[
        styles.contactPill,
        styles.contactCompact,
        marked ? '' : styles.contactCompactLabel,
      ].filter(Boolean).join(' ')}
      href={item.url}
      target="_blank"
      rel="noreferrer"
    >
      {marked
        ? <PlatformIcon platform={item.platform} className={styles.contactIcon}/>
        : <span aria-hidden="true">{item.platform}</span>}
      {/* Real text rather than `aria-label`: the pill's visible content is a glyph, or the
          platform alone, and neither says whose account it is. The unmarked pill's label is
          hidden from the tree above so this is the only name either shape has, which keeps the
          two announcing identically. */}
      <span className={styles.srOnly}>{item.platform}: {item.handle}</span>
      {/* `aria-hidden` because the name above already says this, and a tooltip that repeats the
          platform into the accessible name would have it announced twice. */}
      {marked
        ? <span className={styles.contactTip} aria-hidden="true">{item.platform}</span>
        : null}
    </a>
  );
}

/** How long the check stays up before the copy glyph comes back, in ms. */
const COPIED_MS = 1600;

/**
 * An address: the wide pill, and **the whole pill copies**. It carried a `mailto:` link with a
 * copy button beside it, which is the arrangement a mail client deserves and almost nobody
 * wants — a press on an address is nearly always a press meaning *give me that address*. One
 * control also retires the invalid-nesting problem the split had (a `<button>` inside an `<a>`),
 * and puts the pill's hover fill back where it belongs: the whole surface is now the thing being
 * pointed at, so filling all of it points at the thing.
 *
 * The row still stores a `mailto:` URL, and that is what `isAddressContact` reads. The scheme is
 * the fact that makes this row an address; whether the browser is asked to open it is a
 * separate question, and the answer is now no.
 */
const ContactAddress: React.FC<ContactRowProps> = ({
  item
}) => {
  const [copied, setCopied] = useState(false);
  // The reset has to be cancellable: a second press while the first is still counting down
  // would otherwise be cleared by the earlier timer, and an unmount mid-countdown would set
  // state on a component that is gone.
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const copy = async () => {
    try {
      // Absent outside a secure context, and it rejects when the permission is refused. Either
      // way the address is still on screen, so a failure asks for nothing more than leaving the
      // pill as it was.
      await navigator.clipboard?.writeText(item.handle);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <button
      type="button"
      className={`${styles.contactPill} ${styles.contactAddress}`}
      onClick={copy}
      data-copied={copied || undefined}
    >
      {/* Before the address, so the name reads "Copy email address <address>". The button's
          name has to keep saying what a press *does*, which is why the copied state is the live
          region at the end rather than a rename — that would tell a reader arriving a second
          later about something they never did. */}
      <span className={styles.srOnly}>Copy email address</span>
      <EnvelopeIcon className={styles.contactIcon}/>
      <span className={styles.contactAddressText}>{item.handle}</span>
      {/* Both glyphs are always mounted, stacked in one grid cell, so the swap is a crossfade
          rather than a replacement — there is nothing to animate between two elements where one
          of them does not exist yet. The same reason `Lightbox.module.css` gives for the close
          cross being two real spans instead of a pair of pseudo-elements. */}
      <span className={styles.contactCopyMark} aria-hidden="true">
        <CopyIcon className={styles.contactCopyGlyph}/>
        <CheckIcon className={styles.contactCheckGlyph}/>
      </span>
      <span className={styles.srOnly} role="status" aria-live="polite">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </button>
  );
}

export default Profile;
