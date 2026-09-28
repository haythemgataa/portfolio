import Colophon from "./Colophon";
import LastUpdated from "./LastUpdated";
import LocalTime from "./LocalTime";
import styles from "./SiteFooter.module.css";
import type { MutedSegment } from "./lib/contentTypes";

type SiteFooterProps = {
  /** `profile.location`, already split — see `splitMuted`. Omitted or empty renders nothing. */
  location?: MutedSegment[],
};

/**
 * The page's closing line: where its author is, when the site was last published, and what it is
 * made of.
 *
 * A server component with no state, so `LAST_UPDATED` below is evaluated once during the build
 * and baked into the export — which is exactly what "last updated" means for a static site. It
 * is deliberately not a content field: a date that has to be remembered is a date that goes
 * stale, and this one cannot, because the only way to change what is published is to rebuild.
 *
 * `timeZone: 'UTC'` pins the answer to the build machine's clock rather than its locale. Without
 * it a build a few hours either side of midnight on the 1st could name the wrong month.
 *
 * **The layout is a stack against a control, and which end each thing sits at is load-bearing.**
 * The place goes above the date because the cursor animation ends *below* the date and hangs some
 * 61px past it — `.footer`'s `padding-bottom` is the room reserved for that — so anything under
 * the date is something the hand lands on top of. The colophon sits at the far right of the row rather
 * than in the stack for the same kind of reason: it is a control, and the stack is two lines of
 * text the cursor is measured against.
 */
const LAST_UPDATED = new Date().toLocaleDateString("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const SiteFooter: React.FC<SiteFooterProps> = ({ location }) => {
  return (
    <footer className={styles.footer}>
      <div className={styles.row}>
        <div className={styles.stack}>
          {/* The place, and its `{(GMT+1)}` run swapped for the actual clock on hover, focus or a
              press. A client component beside a server one, which is the whole point: this one is
              the visitor's *now*, where the date below it must stay the build's. */}
          <LocalTime segments={location} />
          {/* The date is computed here, in a server component, so it stays the build's date —
              see the note on LastUpdated for why that boundary matters. It renders the whole
              line, label included, because the cursor is positioned against it. */}
          <LastUpdated date={LAST_UPDATED} />
        </div>
        <Colophon />
      </div>
    </footer>
  );
};

export default SiteFooter;
