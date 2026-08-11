"use client"

import RichText from "./RichText";
import Arrow12 from "./Arrow12";
import styles from "./Profile.module.css";
import Attachments from "./Attachments";
import type { ContactItem, ResolvedCv, ResolvedItem } from "./lib/contentTypes";

type ProfileProps = {
  cv: ResolvedCv,
};

/**
 * About and Contact are pinned — About first, Contact last — and only `sections`
 * is orderable. That is why nothing here branches on a section's label: every
 * entry in `sections` renders identically, so renaming one is always safe.
 */
const Profile: React.FC<ProfileProps> = ({
  cv
}) => {
  return (
    <>

      {cv.profile.about ?
        <section className={`${styles.profileSection} ${styles.about}`}>
          <h3>About</h3>
          <div className={styles.description}>
            <RichText text={cv.profile.about}/>
          </div>
        </section>
      : null}

      {cv.sections.map((section) => (
        <section key={section.key} className={styles.profileSection}>
          <h3>{section.label}</h3>
          <div className={styles.experiences}>
            {section.items.map((item) => (
              <ProfileItem key={item.id} item={item}/>
            ))}
          </div>
        </section>
      ))}

      {cv.contact.items.length > 0 ?
        <section className={styles.profileSection}>
          <h3>{cv.contact.label}</h3>
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

type ProfileItemProps = {
  item: ResolvedItem,
};
const ProfileItem: React.FC<ProfileItemProps> = ({
  item
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
        {item.location ?
        <div className={styles.location}>{item.location}</div>
        : null}
        {item.description ?
        <div className={styles.description}>
          <RichText text={item.description}/>
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
