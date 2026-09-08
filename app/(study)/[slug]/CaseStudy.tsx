import Link from "next/link";
import ArrowRight12 from "../../ArrowRight12";
import { ProseImageViewer } from "../../ProseImage";
import RichText from "../../RichText";
import SectionNumber from "../../SectionNumber";
import profile from "../../Profile.module.css";
import styles from "./CaseStudy.module.css";
import type { CaseStudyDoc } from "../../lib/caseStudyDoc";
import type { ResolvedCaseStudy, ResolvedMedia } from "../../lib/contentTypes";

/**
 * A case study, rendered as the CV is: a title block, then numbered sections with sticky titles.
 *
 * **The section chrome is the CV's own, imported rather than restated** — `Profile.module.css`'s
 * `.profileSection` and `.sectionHeader`, and `SectionNumber` itself. That is the same reuse the
 * Studio's canvas makes, and for the same reason: these are the site's section titles, so they
 * should be *the* section titles. It buys the sticky handover for free too, which depends on the
 * section box using `padding-bottom` rather than a margin so consecutive boxes touch.
 *
 * The ordinal is derived from position, never from the markdown. The draft numbers its own
 * headings ("## 1. Board Viewer…") because it was written as one flat document; `parseCaseStudy`
 * strips that, so there is no way for the printed numeral and an authored one to disagree.
 */

type CaseStudyProps = {
  study: ResolvedCaseStudy,
  doc: CaseStudyDoc,
  /** Pool media for the `![alt](file)` references in the prose, keyed by filename. */
  images: Record<string, ResolvedMedia>,
};

const CaseStudy: React.FC<CaseStudyProps> = ({ study, doc, images }) => (
  /* The viewer is a client boundary wrapping server-rendered children — the supported shape, and
     what keeps `RichText` and this component on the server. See `ProseImage.tsx`. */
  <ProseImageViewer>
    <header className={styles.head}>
      {/* Above the title, which is where a way out belongs: it is the first thing in the reading
          order and the first thing Tab reaches, so it is answerable before the document starts.

          `next/link` rather than the plain `<a>` the 404 needs. That page *replaces* the root
          layout and so has no app tree for the router to reconcile into; this route has one — it
          simply has a different root layout, which Next handles by doing a full page load. The
          arrow is `ArrowRight12` mirrored in CSS rather than a second path: see `.backArrow`. */}
      <Link href="/" className={styles.back}>
        <span className={styles.backArrow} aria-hidden="true"><ArrowRight12 /></span>
        Back
      </Link>

      <div className={styles.titleRow}>
        {/* The study's mark, in the study's own colour. Only rendered when there is one — the
            title takes the whole row otherwise, rather than leaving an empty square. */}
        {study.logoUrl ? (
          <span
            className={styles.badge}
            aria-hidden="true"
            style={{
              '--badge-color': study.color,
              '--logo-url': `url("${study.logoUrl}")`,
            } as React.CSSProperties}
          />
        ) : null}
        {/* The page's only `h1`. `ProfileHeader`'s is not rendered on this route, so there is
            nothing here for it to compete with. */}
        <h1 className={styles.title}>{study.title}</h1>
      </div>

      {study.subtitle ? <p className={styles.subtitle}>{study.subtitle}</p> : null}
    </header>

    {/* Anything between the `h1` and the first `h2`, which is usually nothing. It is also what
        catches a study written as one stretch of prose with no `##` headings at all: the route is
        derived from the directory rather than from the document, so such a file has to render
        rather than come out blank. */}
    {doc.intro ? (
      <div className={styles.intro}>
        <RichText text={doc.intro} images={images} />
      </div>
    ) : null}

    {doc.sections.map((section, index) => (
      // Index keys: the list is derived from the markdown and rebuilt whenever the file changes,
      // so there is no identity to preserve across renders — the same call `headingSegments`
      // makes in `Profile.tsx`.
      <section key={index} className={profile.profileSection}>
        <div className={profile.sectionHeader}>
          <SectionNumber index={index} />
          <h2>{section.label}</h2>
        </div>
        <div className={styles.body}>
          <RichText text={section.body} images={images} />
        </div>
      </section>
    ))}
  </ProseImageViewer>
);

export default CaseStudy;
