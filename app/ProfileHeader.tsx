import Image from "next/image";
import RichText from "./RichText";
import styles from "./ProfileHeader.module.css";

type ProfileHeaderProps = {
  profile: {
    profilePhoto: string,
    displayName: string,
    byline?: string,
    about?: string,
  },
};

/**
 * Avatar, name, byline and About. Shared by the CV and the gallery so the tab bar directly
 * beneath it lands in the same place on both routes — without this, switching tabs would
 * shift the (sticky) tab bar vertically.
 *
 * About used to be the CV's first section, below the bar. Up here it is deliberately *not*
 * a section: no sticky header, because a title that pins above the tab bar has nothing to
 * pin below and would just scroll away. It carries no visible title either — the text sits
 * directly under the byline, where it reads as the rest of the introduction rather than as
 * a labelled block. The <section> keeps its accessible name from aria-label instead.
 */
const ProfileHeader: React.FC<ProfileHeaderProps> = ({ profile }) => {
  return (
    <header>
      <div className={styles.profileHeader}>
        <div className={styles.profilePhoto}>
          <Image
            src={profile.profilePhoto}
            alt=""
            width={56}
            height={56}
            priority
            fetchPriority="high"
          />
        </div>
        <div>
          <h1>
            {profile.displayName}
            {process.env.NEXT_PUBLIC_GIT_BRANCH === "dev" && (
              <span className={styles.betaBadge}>beta</span>
            )}
          </h1>
          <div className={styles.byline}>{profile.byline}</div>
        </div>
      </div>

      {profile.about ? (
        <section className={styles.about} aria-label="About">
          <div className={styles.description}>
            <RichText text={profile.about} />
          </div>
        </section>
      ) : null}
    </header>
  );
};

export default ProfileHeader;
