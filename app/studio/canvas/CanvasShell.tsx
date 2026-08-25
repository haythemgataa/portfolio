'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import About from '../../About.module.css';
import LastUpdated from '../../LastUpdated';
import RichText from '../../RichText';
import footer from '../../SiteFooter.module.css';
import header from '../../ProfileHeader.module.css';
import layout from '../../layout.module.css';
import tabs from '../../Tabs.module.css';
import { splitMuted } from '../../lib/contentTypes';
import { useStudio } from '../lib/studioContext';
import Editable from './Editable';
import styles from './canvas.module.css';

/**
 * Everything the site's root layout renders around a page — the glow, the avatar block, the tab
 * bar, About and the footer — with the text made editable.
 *
 * It is the layout's markup restated rather than the layout itself, and that boundary is worth
 * being clear about. `layout.tsx` is a server component that reads `content/cv.json` off disk,
 * so it renders what is *saved*; the canvas has to render what is being typed. The stylesheets
 * are imported from the real modules, so everything measurable here — the 540px column, the
 * bar's height and its two gaps, the avatar's well, About's margins — comes from the site's own
 * files and cannot drift. What is restated is only the shape of the DOM.
 */

/** Where the site's sticky section headers park, restated from `layout.tsx`. */
const STICKY_TOP =
  'calc(var(--tab-bar-height) + var(--tab-bar-gap-top) + var(--tab-bar-gap-bottom))';

/**
 * The site's tab bar, switching the canvas instead of navigating.
 *
 * The travelling pill is the same construction as `Tabs.tsx` — one masked cell per tab, a
 * counter-slid copy of the row inside each, and the two custom properties its geometry is
 * derived from. It is restated for one reason: the site's tabs are `<Link>`s, because they are
 * real routes and that is the whole design. Here they select which document the canvas is
 * showing, which is not navigation and must not unmount the editor.
 *
 * `data-stuck` is driven by the same zero-height sentinel `Tabs.tsx` uses, and pinning it to
 * `true` was wrong in both directions: the fade hanging below the bar washed out the top of
 * About at rest, and the pill's glow reflection — which fades out precisely because a stuck bar
 * has no glow overhead any more — was off while the glow was still on screen. The observer's
 * root is the canvas rather than the viewport, because the canvas is the scroller here.
 */
const CanvasTabs: React.FC = () => {
  const { tab, setTab } = useStudio();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    // `root: null` would measure against the viewport, which the canvas is not: it is a
    // scroller inset below the toolbar, so the sentinel leaves *its* box, not the window's.
    const root = sentinel.closest(`.${styles.canvas}`);
    const observer = new IntersectionObserver(([entry]) => setIsStuck(!entry.isIntersecting), {
      root,
      threshold: 0,
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const entries = [
    { key: 'cv' as const, label: 'CV' },
    { key: 'gallery' as const, label: 'Gallery' },
  ];
  const activeIndex = entries.findIndex((entry) => entry.key === tab);

  return (
    <>
      <div ref={sentinelRef} className={tabs.sentinel} aria-hidden="true" />
      <div className={tabs.sticky} data-stuck={isStuck}>
        <nav
          className={tabs.tabs}
          aria-label="Canvas"
          style={
            {
              '--tab-count': entries.length,
              '--active-index': Math.max(activeIndex, 0),
            } as React.CSSProperties
          }
        >
          {entries.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={[tabs.tab, styles.canvasTab].join(' ')}
              onClick={() => setTab(entry.key)}
              data-active={tab === entry.key}
              aria-current={tab === entry.key ? 'page' : undefined}
            >
              {entry.label}
            </button>
          ))}
          {activeIndex >= 0 && (
            <span className={tabs.pillLayer} aria-hidden="true">
              {entries.map((cell, cellIndex) => (
                <span
                  key={cell.key}
                  className={tabs.pillCell}
                  style={{ '--cell-index': cellIndex } as React.CSSProperties}
                >
                  <span className={tabs.pillWindow}>
                    <span className={tabs.pillTravel}>
                      <span className={tabs.pillFill} />
                      {entries.map((entry) => (
                        <span key={entry.key} className={tabs.pillLabel}>
                          {entry.label}
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
      <div className={tabs.fade} data-stuck={isStuck} aria-hidden="true" />
    </>
  );
};

/** The avatar, name and byline — the only thing above the bar, exactly as on the site. */
const CanvasHeader: React.FC = () => {
  const { cv, urlFor, select, setProfileField } = useStudio();
  const profile = cv.profile;
  const bylineSegments = useMemo(() => splitMuted(profile.byline ?? ''), [profile.byline]);

  return (
    <header className={header.header}>
      <div className={header.profileHeader}>
        <button
          type="button"
          className={[header.profilePhoto, styles.photoButton].join(' ')}
          onClick={() => select({ kind: 'profile' })}
          title="The photo is swapped on disk — see the inspector"
        >
          <Image src={urlFor(profile.photo)} alt="" width={56} height={56} priority />
        </button>
        <div>
          <h1>
            <Editable
              value={profile.displayName ?? ''}
              onChange={(next) => setProfileField('displayName', next)}
              placeholder="Your name"
              label="Name"
              onEdit={() => select({ kind: 'profile' })}
            />
          </h1>
          <div className={header.byline}>
            <Editable
              value={profile.byline ?? ''}
              onChange={(next) => setProfileField('byline', next)}
              placeholder="Byline"
              label="Byline"
              onEdit={() => select({ kind: 'profile' })}
            >
              {/* `{braces}` set a run in the lighter grey — the same split the site renders,
                  so what you type reads the way it will publish. The raw string with its
                  braces is what the field opens on. */}
              {bylineSegments.map((segment, i) =>
                segment.kind === 'muted' ? (
                  <span key={i} className={header.bylineMuted}>
                    {segment.text}
                  </span>
                ) : (
                  <span key={i}>{segment.text}</span>
                )
              )}
            </Editable>
          </div>
        </div>
      </div>
    </header>
  );
};

/** The introduction, below the bar and shared by both tabs — the layout renders it once. */
const CanvasAbout: React.FC = () => {
  const { cv, select, setProfileField } = useStudio();
  const about = cv.profile.about ?? '';

  return (
    <section className={About.about} aria-label="About">
      <div className={About.description}>
        <Editable
          as="div"
          multiline
          value={about}
          onChange={(next) => setProfileField('about', next)}
          placeholder="Markdown. Rendered directly under the tabs, on both routes."
          label="About"
          onEdit={() => select({ kind: 'profile' })}
        >
          {about ? <RichText text={about} /> : null}
        </Editable>
      </div>
    </section>
  );
};

/**
 * The closing line. "Last updated" is the *build's* date on the site and cannot be authored, so
 * here it shows today's — which is what the next build would stamp. The location beside it is
 * content, and is editable.
 */
const CanvasFooter: React.FC = () => {
  const { cv, select, setProfileField } = useStudio();
  const location = cv.profile.location ?? '';
  const segments = useMemo(() => splitMuted(location), [location]);
  const today = useMemo(
    () => new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
    []
  );

  return (
    <footer className={footer.footer}>
      <div className={footer.row}>
        <LastUpdated date={today} />
        <p className={footer.location}>
          <Editable
            value={location}
            onChange={(next) => setProfileField('location', next)}
            placeholder="Location"
            label="Location"
            onEdit={() => select({ kind: 'profile' })}
          >
            {segments.map((segment, i) =>
              segment.kind === 'muted' ? (
                <span key={i} className={footer.locationMuted}>
                  {segment.text}
                </span>
              ) : (
                <span key={i}>{segment.text}</span>
              )
            )}
          </Editable>
        </p>
      </div>
    </footer>
  );
};

const CanvasShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { select } = useStudio();

  return (
    <div
      className={styles.canvas}
      // A press on the page's own background is how you stop editing one thing without
      // starting another. Anything selectable stops the event before it gets here.
      onMouseDown={() => select({ kind: 'none' })}
    >
      <div className={layout.page}>
        <div className={layout.column} style={{ '--sticky-top': STICKY_TOP } as React.CSSProperties}>
          <div className={layout.dotTexture} aria-hidden="true" />
          <div className={layout.topGradient} aria-hidden="true">
            <div className={layout.topGradientBand} />
          </div>
          <CanvasHeader />
          <CanvasTabs />
          <CanvasAbout />
          {children}
          <CanvasFooter />
        </div>
      </div>
    </div>
  );
};

export default CanvasShell;
