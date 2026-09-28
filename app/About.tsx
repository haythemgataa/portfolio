import RichText from "./RichText";
import styles from "./About.module.css";

/**
 * The introduction, rendered by the root layout *above* the tab bar, under the signature.
 *
 * It sat below the bar for one release, and the reason it could move back up is the only rule
 * this side of the bar has: whatever is above a sticky, shared bar decides where the bar rests,
 * so it has to be identical on `/` and `/gallery` or the bar jumps when the tabs are switched.
 * This text is identical on both — which is also why the *layout* renders it and not each page;
 * a copy per route would be two copies of one fact. Anything genuinely route-specific still
 * goes below the bar, and the CV's gallery teaser is what that space is for.
 *
 * What moved up with it is the job the byline used to do. That line — "Product Designer
 * {& Engineer}" — is no longer drawn at all: this paragraph opens with the same claim in full,
 * so the two together were one sentence said twice. The field stays in `cv.json` as the site's
 * `description` and card copy, where a short phrase beats a paragraph.
 *
 * No visible title: a sticky section header would have nothing to pin under, and without a
 * heading of its own the text belongs to the signature above it. The `<section>` takes its
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
