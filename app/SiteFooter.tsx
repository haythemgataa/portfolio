import Signature from "./Signature";
import styles from "./SiteFooter.module.css";

/**
 * The page's closing line: a colophon, when the site was last published, and the signature.
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

const SiteFooter = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.row}>
        {/* The emphasis is visual hierarchy, not meaning — "love" is not more *important* than
            the words around it — so these are spans rather than <strong>, which would have a
            screen reader stress them. */}
        <p className={styles.colophon}>
          Made with <span className={styles.strong}>love</span> and{" "}
          <span className={styles.strong}>care</span>.
        </p>
        <p className={styles.updated}>
          Last updated: <span className={styles.strong}>{LAST_UPDATED}</span>
        </p>
      </div>
      <div className={styles.signature}>
        <Signature />
      </div>
    </footer>
  );
};

export default SiteFooter;
