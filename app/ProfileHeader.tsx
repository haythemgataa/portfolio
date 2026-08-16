import Image from "next/image";
import styles from "./ProfileHeader.module.css";
import type { MutedSegment } from "./lib/contentTypes";

type ProfileHeaderProps = {
  profile: {
    profilePhoto: string,
    displayName: string,
    byline?: string,
    bylineSegments?: MutedSegment[],
  },
};

/**
 * Avatar, name and byline — and deliberately nothing else.
 *
 * This is the *entire* content above the tab bar, and that is the point: the bar is sticky and
 * shared by both routes, so its resting position is however tall this block is. Keeping it to
 * the three things that are identical on `/` and `/gallery` is what stops the bar landing at a
 * different height per route and jumping when the tabs are switched.
 *
 * About used to live here for that reason, back when it was the only thing that wanted to sit
 * above the bar. It has moved below it (see `About.tsx`), which is what freed the space under
 * the tabs for content that differs per route — the CV's gallery teaser being the first.
 */
const ProfileHeader: React.FC<ProfileHeaderProps> = ({ profile }) => {
  return (
    <header className={styles.header}>
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
          {/* Segments when the loader supplied them, the plain string otherwise — so a caller
              that only has the raw byline still renders, just without the muted runs. */}
          <div className={styles.byline}>
            {profile.bylineSegments?.length
              ? profile.bylineSegments.map((segment, i) =>
                  segment.kind === "muted" ? (
                    <span key={i} className={styles.bylineMuted}>{segment.text}</span>
                  ) : (
                    <span key={i}>{segment.text}</span>
                  ),
                )
              : profile.byline}
          </div>
        </div>
      </div>
    </header>
  );
};

export default ProfileHeader;
