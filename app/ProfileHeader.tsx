import Image from "next/image";
import styles from "./ProfileHeader.module.css";
import glow from "./EdgeGlow.module.css";
import Signature from "./Signature";
import { SIGNATURE } from "./lib/signature";
import { IS_DEV_BRANCH } from "./lib/site";

type ProfileHeaderProps = {
  profile: {
    profilePhoto: string,
    displayName: string,
  },
};

/**
 * The photo and the signature — the whole of the block the name lives in.
 *
 * It is no longer the whole of what sits above the tab bar: About moved back up beside it, which
 * it is free to do because the text is identical on `/` and `/gallery`. That is the only rule
 * this side of the bar has, and it is not about *which* block sits here but about whether the
 * block is route-dependent: the bar is sticky and shared, so its resting height is however tall
 * everything above it is, and anything that differs per route makes it jump when the tabs are
 * switched. The CV's gallery teaser is why that matters and why it stays below.
 *
 * The byline is gone from the page. It was "Product Designer {& Engineer}" directly under the
 * name, and the description that replaced it says the same thing in full a few pixels lower —
 * two versions of one claim stacked on each other. The field itself stays in `cv.json`, because
 * it was never only a line on the page: it is the site's `description`, `og:description` and
 * `twitter:description`, where a short phrase is worth more than the paragraph now on screen.
 */
const ProfileHeader: React.FC<ProfileHeaderProps> = ({ profile }) => {
  return (
    <header className={styles.header}>
      <div className={`${styles.profilePhoto} ${glow.ring} ${glow.onBorder}`}>
        <Image
          src={profile.profilePhoto}
          alt=""
          width={48}
          height={48}
          priority
          fetchPriority="high"
        />
      </div>
      {/* The heading's text is the SVG's `aria-label`; there is no glyph in the document to
          read. `.name` overlaps the photo above it, so the signature's own ascender crosses
          the picture rather than sitting under it — see the note in the stylesheet. */}
      <h1
        className={styles.name}
        // The generator's own padding, handed to the stylesheet so the negative margin that
        // cancels it cannot drift from it. See `.name`.
        style={{ '--signature-pad': `${SIGNATURE.pad}px` } as React.CSSProperties}
      >
        <Signature label={profile.displayName} />
        {/* Shares `IS_DEV_BRANCH` with the title's ` | Dev` suffix rather than repeating the
            branch literal, so the badge and the tab cannot end up marking different things. */}
        {IS_DEV_BRANCH && <span className={styles.betaBadge}>beta</span>}
      </h1>
    </header>
  );
};

export default ProfileHeader;
