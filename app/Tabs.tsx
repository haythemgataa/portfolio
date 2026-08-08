"use client"

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Tabs.module.css";

const TABS = [
  { href: "/", label: "CV" },
  { href: "/gallery", label: "Gallery" },
];

/**
 * Top-level navigation between the CV and the gallery. These are separate routes rather
 * than client-side tab state, so each is linkable and statically exported — which means
 * real <a> elements, not role="tab". aria-current marks the active one.
 */
const Tabs: React.FC = () => {
  const pathname = usePathname();

  return (
    <nav className={styles.tabs} aria-label="Sections">
      {TABS.map(tab => {
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
