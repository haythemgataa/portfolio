"use client"

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

  const tabs = [
    { href: "/", label: "CV" },
    ...(showGallery ? [{ href: "/gallery", label: "Gallery" }] : []),
  ];

  // With only one destination there is nothing to navigate between.
  if (tabs.length < 2) {
    return null;
  }

  return (
    <nav className={styles.tabs} aria-label="Sections">
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
  );
};

export default Tabs;
