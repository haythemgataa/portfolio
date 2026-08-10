"use client"

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Tabs.module.css";

type TabsProps = {
  /**
   * Whether to advertise the gallery. The CV page passes false while the gallery has no
   * media, so visitors are never offered an empty tab; it appears on its own once media
   * is added. The gallery page always passes true, since you are already there.
   */
  showGallery?: boolean,
};

/**
 * Top-level navigation between the CV and the gallery. These are separate routes rather
 * than client-side tab state, so each is linkable and statically exported — which means
 * real <a> elements, not role="tab". aria-current marks the active one.
 */
const Tabs: React.FC<TabsProps> = ({ showGallery = true }) => {
  const pathname = usePathname();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  // The fade below the bar is only wanted once the bar is actually pinned. A zero-height
  // sentinel sits exactly where the bar's top rests, so it leaving the viewport is the
  // moment the bar sticks. Gating on that keeps the fade from dimming content at rest,
  // which is what previously capped its height at the size of the gap beneath the bar.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) { return }

    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const tabs = [
    { href: "/", label: "CV" },
    ...(showGallery ? [{ href: "/gallery", label: "Gallery" }] : []),
  ];

  // With only one destination there is nothing to navigate between.
  if (tabs.length < 2) {
    return null;
  }

  const activeIndex = tabs.findIndex(tab => tab.href === pathname);

  return (
    <>
      <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
      <div className={styles.sticky} data-stuck={isStuck}>
        <nav
          className={styles.tabs}
          aria-label="Sections"
          style={{ '--tab-count': tabs.length } as React.CSSProperties}>
          {/* One pill that slides, rather than a background handed between links. Tabs are
              equal width (flex: 1 1 0) with no gaps, so its position is exactly
              index x its own width — no measuring required. */}
          {activeIndex >= 0 && (
            <span
              className={styles.pill}
              aria-hidden="true"
              // The offset is the only part that depends on runtime state, so it is set
              // here while the rest of the pill stays in the stylesheet.
              style={{ transform: `translateX(${activeIndex * 100}%)` }}
            />
          )}
          {tabs.map(tab => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={styles.tab}
                data-active={isActive}
                aria-current={isActive ? "page" : undefined}>
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
};

export default Tabs;
