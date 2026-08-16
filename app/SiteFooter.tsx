import LastUpdated from "./LastUpdated";
import styles from "./SiteFooter.module.css";
import type { MutedSegment } from "./lib/contentTypes";

type SiteFooterProps = {
  /** `profile.location`, already split — see `splitMuted`. Omitted or empty renders nothing. */
  location?: MutedSegment[],
};

/**
 * The page's closing line: when the site was last published, and where its author is.
 *
 * A server component with no state, so `LAST_UPDATED` below is evaluated once during the build
 * and baked into the export — which is exactly what "last updated" means for a static site. It
 * is deliberately not a content field: a date that has to be remembered is a date that goes
 * stale, and this one cannot, because the only way to change what is published is to rebuild.
 *
 * `timeZone: 'UTC'` pins the answer to the build machine's clock rather than its locale. Without
 * it a build a few hours either side of midnight on the 1st could name the wrong month.
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
        {/* The date is computed here, in a server component, so it stays the build's date —
            see the note on LastUpdated for why that boundary matters. It renders the whole
            line, label included, because the cursor is positioned against it. */}
        <LastUpdated date={LAST_UPDATED} />
        {location?.length ? (
          <p className={styles.location}>
            {location.map((segment, i) =>
              segment.kind === "muted" ? (
                <span key={i} className={styles.locationMuted}>{segment.text}</span>
              ) : (
                <span key={i}>{segment.text}</span>
              ),
            )}
          </p>
        ) : null}
      </div>
    </footer>
  );
};

export default SiteFooter;
