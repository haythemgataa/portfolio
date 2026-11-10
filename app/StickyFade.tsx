"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./StickyFade.module.css";

/**
 * The band content dissolves into as it scrolls under the top of the page.
 *
 * Two callers with two different ideas of "stuck", which is why the state can come from either
 * side:
 *
 * - **`Tabs` passes it in.** The bar already computes its own stuck state — the same flag drives
 *   its background and switches off the pill's glow reflection — so a second observer here would
 *   be a second answer to a question already answered.
 * - **A case study leaves it out** and this observes for itself. There is no bar on that route,
 *   so nothing else needs to know, and the alternative was making the layout carry an effect for
 *   a purely visual detail.
 *
 * Extracted from `Tabs.module.css` when the case study needed the same band: the ramp is nine
 * transcribed stops, and two copies of it would drift in exactly the way that is hard to see.
 */
const StickyFade: React.FC<{ stuck?: boolean }> = ({ stuck }) => {
  const controlled = stuck !== undefined;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [observed, setObserved] = useState(false);

  useEffect(() => {
    if (controlled) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => setObserved(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [controlled]);

  return (
    <>
      {!controlled && <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />}
      <div
        className={styles.fade}
        data-stuck={controlled ? stuck : observed}
        aria-hidden="true"
      />
    </>
  );
};

export default StickyFade;
