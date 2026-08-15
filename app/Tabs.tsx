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
  // The doc above says the gallery page always passes true. It cannot: the bar is rendered by
  // the shared root layout, which computes `showGallery` once for both routes — so an emptied
  // gallery.json (a supported state) took the bar off /gallery itself, and a visitor arriving
  // from a link got a page with no way back to the CV on it. Being *on* the route is the same
  // answer the prop was meant to carry.
  const showGalleryTab = showGallery || pathname === "/gallery";
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  /**
   * The tab that has been clicked but not yet navigated to.
   *
   * `usePathname()` only changes once the router has the new route, so driving the pill
   * straight off it meant the pill sat still for however long that took and then moved. The
   * delay is short on a static export and still long enough to read as the animation being
   * unresponsive — the pointer is already over the other tab by the time anything happens.
   * Starting the travel on the click instead decouples the two: the pill is showing where the
   * reader has asked to go, and the route catches up underneath it.
   */
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [lastPathname, setLastPathname] = useState(pathname);

  // The navigation landed, or went somewhere this tab never asked for (a Back, say) — either
  // way the guess has been superseded and the pathname is the truth again. Discarding it here
  // rather than in an effect is React's documented way to adjust state when an input changes:
  // it re-runs the render immediately with the corrected value, where an effect would let one
  // frame paint with the stale pill first — exactly the flicker this whole mechanism exists to
  // remove. The comparison is against the previous pathname, not against `pendingHref`, so a
  // guess that never arrives is dropped rather than left pointing at a tab nobody is on.
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setPendingHref(null);
  }

  const selectedHref = pendingHref ?? pathname;

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
    ...(showGalleryTab ? [{ href: "/gallery", label: "Gallery" }] : []),
  ];

  // With only one destination there is nothing to navigate between.
  if (tabs.length < 2) {
    return null;
  }

  const activeIndex = tabs.findIndex(tab => tab.href === selectedHref);

  return (
    <>
      <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
      <div className={styles.sticky} data-stuck={isStuck}>
        <nav
          className={styles.tabs}
          aria-label="Sections"
          // The two numbers the pill's geometry is derived from. Everything else about it
          // lives in the stylesheet; these are the only parts that depend on runtime state.
          style={{
            '--tab-count': tabs.length,
            '--active-index': Math.max(activeIndex, 0),
          } as React.CSSProperties}>
          {tabs.map(tab => (
            <Link
              key={tab.href}
              href={tab.href}
              className={styles.tab}
              // Only for clicks that will actually navigate *this* tab. `onClick` runs before
              // next/link decides, and it bails on a modified event — so cmd-clicking Gallery
              // opened a new tab and left this page's pill parked on Gallery with `data-active`
              // there while `aria-current` stayed on CV, for the rest of the session. Nothing
              // resets it either: the reset is keyed on the pathname changing, and it never did.
              onClick={(e) => {
                if (
                  e.defaultPrevented ||
                  e.button !== 0 ||
                  e.metaKey || e.ctrlKey || e.shiftKey || e.altKey ||
                  tab.href === pathname
                ) {
                  return;
                }
                setPendingHref(tab.href);
              }}
              // `data-active` follows the pill, since it only suppresses the hover colour on
              // whichever tab the pill is covering. `aria-current` follows the real pathname:
              // it is a claim about which page is open, and during the navigation that is
              // still the old one.
              data-active={selectedHref === tab.href}
              aria-current={pathname === tab.href ? "page" : undefined}>
              {tab.label}
            </Link>
          ))}

          {/* The travelling pill, and the reason the labels invert *as it passes* rather
              than cross-fading: each cell holds a copy of the whole row — the pill's ground
              and its inverted labels — seen through a window in the shape of one tab. Only
              the window moves, so the pill and the colour flip are the same movement by
              construction and cannot drift apart.

              Three nested boxes, each doing one job:
                pillCell   — static mask, fixed in the shape of its own tab
                pillWindow — the moving mask, slid to sit over the active tab
                pillTravel — the row copy, counter-slid so it stays put in the bar

              The two masks are what keep the ground inside the pills. Their intersection is
              the travelling pill ∩ the pill shapes — so crossing the gap, the ground is cut
              off at one pill's edge and picks up again at the next, instead of sliding across
              the space between them.

              One cell per tab because a single rectangular window cannot be in two places.
              Duplicated text, hence aria-hidden; the real links underneath stay the
              accessible ones. */}
          {activeIndex >= 0 && (
            <span className={styles.pillLayer} aria-hidden="true">
              {tabs.map((cell, cellIndex) => (
                <span
                  key={cell.href}
                  className={styles.pillCell}
                  style={{ '--cell-index': cellIndex } as React.CSSProperties}>
                  <span className={styles.pillWindow}>
                    <span className={styles.pillTravel}>
                      <span className={styles.pillFill} />
                      {tabs.map(tab => (
                        <span key={tab.href} className={styles.pillLabel}>
                          {tab.label}
                        </span>
                      ))}
                    </span>
                  </span>
                </span>
              ))}
            </span>
          )}
        </nav>
      </div>
      {/* Sibling rather than the bar's own pseudo-element, so sticky section headers can
          paint over it — see the comment on `.fade` in Tabs.module.css. */}
      <div className={styles.fade} data-stuck={isStuck} aria-hidden="true" />
    </>
  );
};

export default Tabs;
