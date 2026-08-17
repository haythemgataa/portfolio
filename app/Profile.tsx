"use client"

import { useState } from "react";
import RichText from "./RichText";
import Arrow12 from "./Arrow12";
import GalleryPreview from "./GalleryPreview";
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
  // control reads and writes it, so opening details anywhere opens them everywhere. Open
  // by default — the control is deliberately quiet, and a reader who never notices it
  // should still get the CV's substance rather than only its headings.
  const [showDetails, setShowDetails] = useState(true);
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
        />
      ))}

      {cv.contact.items.length > 0 ?
        <section className={styles.profileSection}>
          <SectionHeader label={cv.contact.label}/>
          <div className={styles.contacts}>
            {cv.contact.items.map((item) => (
              <ContactRow key={item.id} item={item}/>
            ))}
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
};
const Section: React.FC<SectionProps> = ({
  section,
  showDetails,
  onToggleDetails,
  priority = false,
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
  toggle,
}) => {
  return (
    <div className={styles.sectionHeader}>
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
const ContactRow: React.FC<ContactRowProps> = ({
  item
}) => {
  return (
    <div className={styles.experience}>
      <div className={styles.year}>
        <span>{item.platform}</span>
      </div>
      <div className={styles.experienceContent}>
        <div className={styles.title}>
          <a href={item.url} target="_blank">{item.handle}</a><span className={styles.linkArrow}>&#xfeff;<Arrow12/></span>
        </div>
      </div>
    </div>
  )
}

export default Profile;
