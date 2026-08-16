import RichText from "./RichText";
import styles from "./About.module.css";

/**
 * The introduction, rendered by the root layout *below* the tab bar and above the page.
 *
 * It sits below the bar rather than in `ProfileHeader` so that the only thing above the bar is
 * the avatar/name/byline block — which is identical on both routes, and is therefore what makes
 * the sticky bar land at the same height on `/` and `/gallery`. Anything route-specific can
 * then go below the bar freely; the CV's gallery teaser is the first thing that does.
 *
 * It is the layout that renders this, not each page, because the text really is identical on
 * both routes — rendering it per page would be two copies of one fact.
 *
 * No visible title: a sticky section header would have nothing to pin under, and without a
 * heading of its own the text belongs to the byline above it. The `<section>` takes its
 * accessible name from `aria-label` instead.
 */
const About: React.FC<{ about?: string }> = ({ about }) => {
  if (!about) return null;

  return (
    <section className={styles.about} aria-label="About">
      <div className={styles.description}>
        <RichText text={about} />
      </div>
    </section>
  );
};

export default About;
