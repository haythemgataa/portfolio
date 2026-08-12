"use client"

import { useState } from "react";
import RichText from "./RichText";
import Arrow12 from "./Arrow12";
import styles from "./Profile.module.css";
import Attachments from "./Attachments";
import type { ContactItem, ResolvedCv, ResolvedItem, ResolvedSection } from "./lib/contentTypes";

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
      {cv.sections.map((section) => (
        <Section
          key={section.key}
          section={section}
          showDetails={showDetails}
          onToggleDetails={toggleDetails}
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
};
const Section: React.FC<SectionProps> = ({
  section,
  showDetails,
  onToggleDetails,
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
        {section.items.map((item) => (
          <ProfileItem key={item.id} item={item} showDetails={showDetails}/>
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
      <h3>{label}</h3>
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
};
const ProfileItem: React.FC<ProfileItemProps> = ({
  item,
  showDetails,
}) => {

  let title;
  if (item.url) {
    title = <>
      <a href={item.url} target="_blank">{item.heading}</a><span className={styles.linkArrow}>&#xfeff;<Arrow12 fill="var(--grey1)"/></span>
    </>
  } else {
    title = item.heading
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
          <Attachments attachments={item.attachments} label={item.heading}/>
        : null}
      </div>
    </div>
  )
}

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
