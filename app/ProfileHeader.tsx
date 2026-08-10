import Image from "next/image";
import styles from "./ProfileHeader.module.css";

type ProfileHeaderProps = {
  general: {
    profilePhoto: string,
    displayName: string,
    byline: string,
  },
};

/**
 * Avatar, name and byline. Shared by the CV and the gallery so the tab bar directly
 * beneath it lands in the same place on both routes — without this, switching tabs would
 * shift the (sticky) tab bar vertically.
 */
const ProfileHeader: React.FC<ProfileHeaderProps> = ({ general }) => {
  return (
    <div className={styles.profileHeader}>
      <div className={styles.profilePhoto}>
        <Image
          src={general.profilePhoto}
          alt=""
          width={92}
          height={92}
          priority
          fetchPriority="high"
        />
      </div>
      <div>
        <h1>
          {general.displayName}
          {process.env.NEXT_PUBLIC_GIT_BRANCH === "dev" && (
            <span className={styles.betaBadge}>beta</span>
          )}
        </h1>
        <div className={styles.byline}>{general.byline}</div>
      </div>
    </div>
  );
};

export default ProfileHeader;
