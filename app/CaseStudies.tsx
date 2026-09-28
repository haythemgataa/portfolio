import Link from "next/link";
import CaseStudyFolder from "./CaseStudyFolder";
import glow from "./EdgeGlow.module.css";
import styles from "./CaseStudies.module.css";
import type { ResolvedCaseStudy } from "./lib/contentTypes";

/**
 * The list of case study cards, pinned above `sections[]`.
 *
 * It is its own section shape rather than an entry in `sections[]`, and that follows the rule
 * CONTENT-SCHEMA.md sets out under "Fixed vs. orderable sections": that array holds *only* the
 * homogeneous timeline-shaped sections, which is what makes reordering it safe. Anything that
 * renders differently is hoisted to its own pinned key — `contact` and `profile.galleryPreview`
 * are the precedents, and an earlier `kind` discriminator was deleted precisely so that no entry
 * in the array could need different CSS.
 *
 * The `<section>` and its sticky `SectionHeader` stay up in `Profile.tsx`, exactly as the contact
 * block's do. Only the list is here, so the header geometry every sticky title depends on lives in
 * one file.
 */

type CaseStudiesProps = {
  items: ResolvedCaseStudy[],
  /**
   * `'static'` renders each card as a plain `<span>` instead of a link.
   *
   * One optional prop rather than a second renderer — the escape hatch `Attachments` already takes
   * with `onSelect`, and for the same reason: the Studio's canvas needs these cards to look exactly
   * like the site's, and a copy of this file is a copy that drifts in the one direction that
   * matters. There a press must not navigate away from `/studio`.
   */
  as?: 'link' | 'static',
};

const CaseStudies: React.FC<CaseStudiesProps> = ({ items, as = 'link' }) => (
  <div className={styles.list}>
    {items.map((study) => (
      <CaseStudyCard key={study.slug} study={study} as={as} />
    ))}
  </div>
);

const CaseStudyCard: React.FC<{ study: ResolvedCaseStudy, as: 'link' | 'static' }> = ({
  study,
  as,
}) => {
  const inner = (
    <>
      <CaseStudyFolder study={study} />
      <span className={styles.text}>
        <span className={styles.title}>{study.title}</span>
        {study.subtitle ? <span className={styles.subtitle}>{study.subtitle}</span> : null}
      </span>
    </>
  );

  // Lit under the cursor like every other hairline on the page: the card's hairline is its own
  // `border`, so it takes `.onBorder`, as the tab and contact pills do. The Studio's static copy
  // keeps it too, since the canvas sits under the same light.
  const className = `${styles.card} ${glow.ring} ${glow.onBorder}`;

  if (as === 'static') {
    return <span className={className} data-static="true">{inner}</span>;
  }

  // `next/link`, not a plain anchor: this is a real route inside the app tree. The bare-`<a>`
  // rule in CLAUDE.md is specific to `global-not-found`, which replaces the root layout and so
  // has no tree for the client router to reconcile a new route into.
  return <Link className={className} href={`/${study.slug}`}>{inner}</Link>;
};

export default CaseStudies;
