import Studio from './Studio';
import { findOrphanMedia, readDoc } from './lib/cv-fs';
import type { CvFile } from '../lib/contentTypes';

export const metadata = {
  title: 'Content Studio',
};

/**
 * Dev-only content editor. This file is named `page.studio.tsx` and is only
 * treated as a route while the dev-only pageExtensions in next.config.ts are
 * active, so it disappears from the static export build entirely.
 *
 * The document is read here rather than fetched on mount, so the editor renders
 * with content on the first paint and needs no load-on-mount effect. The
 * /studio/api/tree route still exists for re-reading after each mutation.
 */
export default async function StudioPage() {
  let loaded: { cv: CvFile; hash: string; orphans: Record<string, string[]> } | null = null;
  let loadError: string | undefined;

  // Only the read is guarded — constructing JSX inside try/catch would swallow
  // render errors that belong to an error boundary.
  try {
    const { cv, hash } = await readDoc();
    loaded = { cv, hash, orphans: await findOrphanMedia(cv) };
  } catch (error) {
    loadError = (error as Error).message;
  }

  if (!loaded) return <Studio loadError={loadError} />;

  return (
    <Studio
      initialCv={loaded.cv}
      initialHash={loaded.hash}
      initialOrphans={loaded.orphans}
    />
  );
}
