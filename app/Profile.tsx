"use client"

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import RichText from "./RichText";
import Arrow12 from "./Arrow12";
import styles from "./Profile.module.css";
import Attachments from "./Attachments";

type ProfileProps = {
  cv: any,
};
const Profile: React.FC<ProfileProps> = ({
  cv
}) => {
  return (
    <div className={styles.profile}>
      <div className={styles.profileHeader}>
        <div className={styles.profilePhoto}>
          <Image 
            src={cv.general.profilePhoto} 
            alt="" 
            width={92} 
            height={92}
            priority
            fetchPriority="high"
          />
        </div>
        <div className={styles.profileInfo}>
          <h1>{cv.general.displayName}</h1>
          <div className={styles.byline}>{cv.general.byline}</div>
          {cv.general.buttonLabel ?
            <DownloadDropdown label={cv.general.buttonLabel} />
          : null}
        </div>
      </div>

      {cv.general.about ?
        <section className={`${styles.profileSection} ${styles.about}`}>
          <h3>About</h3>
          <div className={styles.description}>
            <RichText text={cv.general.about}/>
          </div>
        </section>
      : null}

      {cv.allCollections.map((collection: any, index: number) => {
        return (
          <section key={collection.name || index} className={styles.profileSection}>
            <h3>{collection.name}</h3>
            <div className={collection.name === "Contact" ? styles.contacts : styles.experiences}>
              {collection.items.map((experience: any, index: number) => {

                if (collection.name === "Contact") {
                  return <ContactItem key={experience.id} experience={experience}/>
                }

                return (
                  <ProfileItem key={experience.id} experience={experience}/>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  );
};

type ProfileItemProps = {
  experience: any,
};
const ProfileItem: React.FC<ProfileItemProps> = ({
  experience
}) => {

  let title;
  if (experience.url) {
    title = <>
      <a href={experience.url} target="_blank">{experience.heading}</a><span className={styles.linkArrow}>&#xfeff;<Arrow12 fill="var(--grey1)"/></span>
    </>
  } else {
    title = experience.heading
  }
  return (
    <div className={styles.experience}>
      <div className={styles.year}>
        <span>{experience.year}</span>
      </div>
      <div className={styles.experienceContent}>
        <div className={styles.title}>
          {title}
        </div>
        {experience.location ?
        <div className={styles.location}>{experience.location}</div>
        : null}
        {experience.description ?
        <div className={styles.description}>
          <RichText text={experience.description}/>
        </div>
        : null}
        {experience.attachments && experience.attachments.length > 0 ?
          <Attachments attachments={experience.attachments}/>
        : null}
      </div>
    </div>
  )
}

type ContactItemProps = {
  experience: any,
};
const ContactItem: React.FC<ContactItemProps> = ({
  experience
}) => {
  return (
    <div className={styles.experience}>
      <div className={styles.year}>
        <span>{experience.platform}</span>
      </div>
      <div className={styles.experienceContent}>
        <div className={styles.title}>
          <a href={experience.url} target="_blank">{experience.handle}</a><span className={styles.linkArrow}>&#xfeff;<Arrow12/></span>
        </div>
      </div>
    </div>
  )
}

type DownloadDropdownProps = {
  label: string;
};

const DownloadDropdown: React.FC<DownloadDropdownProps> = ({ label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleDownload = (filePath: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = filePath;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsOpen(false);
  };

  return (
    <div className={styles.dropdownContainer} ref={dropdownRef}>
      <button 
        className={styles.website}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {label}
        <span className={`${styles.dropdownArrow} ${isOpen ? styles.dropdownArrowOpen : ''}`}>▼</span>
      </button>
      {isOpen && (
        <div className={styles.dropdownMenu}>
          <button
            className={styles.dropdownItem}
            onClick={() => handleDownload('/resume.pdf', 'resume.pdf')}
          >
            Download Resume (PDF)
          </button>
          <button
            className={styles.dropdownItem}
            onClick={() => handleDownload('/cv.pdf', 'cv.pdf')}
          >
            Download CV (PDF)
          </button>
        </div>
      )}
    </div>
  );
};

export default Profile;
