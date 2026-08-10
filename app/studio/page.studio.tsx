import Studio from './Studio';

export const metadata = {
  title: 'Content Studio',
};

/**
 * Dev-only content editor. This file is named `page.studio.tsx` and is only
 * treated as a route while the dev-only pageExtensions in next.config.ts are
 * active, so it disappears from the static export build entirely.
 */
export default function StudioPage() {
  return <Studio />;
}
