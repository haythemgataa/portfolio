/**
 * Shared (client + server) content schema for the Studio.
 *
 * Keep this file free of Node built-ins — it is imported by the client UI.
 */

export type FieldType = 'text' | 'url' | 'markdown';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  hint?: string;
}

/**
 * Fields Profile.tsx actually renders for a standard collection item.
 * Anything else in item.json is legacy migration data — still editable via the
 * raw JSON panel, but deliberately kept out of the main form.
 */
export const DEFAULT_FIELDS: FieldDef[] = [
  { key: 'year', label: 'Year', type: 'text', placeholder: '2023 — Now' },
  { key: 'heading', label: 'Heading', type: 'text', placeholder: 'Product designer at InstaDeep' },
  { key: 'url', label: 'Link', type: 'url', placeholder: 'https://example.com' },
  { key: 'location', label: 'Location', type: 'text', placeholder: 'Tunis, Tunisia' },
  {
    key: 'description',
    label: 'Description',
    type: 'markdown',
    hint: 'Markdown. Start a line with "* " for a bullet, blank line between bullets.',
  },
];

/** The contact section renders a different shape entirely. */
export const CONTACT_FIELDS: FieldDef[] = [
  { key: 'platform', label: 'Platform', type: 'text', placeholder: 'Email' },
  { key: 'handle', label: 'Handle', type: 'text', placeholder: 'you@example.com' },
  { key: 'url', label: 'Link', type: 'url', placeholder: 'mailto:you@example.com' },
];

export function fieldsForSection(sectionKey: string): FieldDef[] {
  return sectionKey === 'contact' ? CONTACT_FIELDS : DEFAULT_FIELDS;
}

/** Contact rows have no gallery, so hide the media panel there. */
export function sectionSupportsMedia(sectionKey: string): boolean {
  return sectionKey !== 'contact';
}

/** The label used for an item row in the list, per section shape. */
export function itemLabel(sectionKey: string, data: Record<string, unknown>): string {
  if (sectionKey === 'contact') {
    return String(data.platform || data.handle || 'Untitled');
  }
  return String(data.heading || data.title || 'Untitled');
}

export const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
export const VIDEO_EXTS = ['mp4', 'webm', 'ogg', 'mov', 'avi'];

/** Mirrors getMediaType() in app/lib/contentLoader.ts. */
export function getMediaType(filename: string): 'image' | 'video' | null {
  const ext = filename.toLowerCase().split('.').pop() || '';
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  return null;
}

/** "sideProjects" -> "Side Projects". Mirrors the contentLoader fallback. */
export function humanizeSectionName(name: string): string {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Section keys contentLoader knows about, for the "add section" picker. */
export const KNOWN_SECTION_KEYS = [
  'workExperience',
  'education',
  'awards',
  'speaking',
  'certifications',
  'features',
  'volunteering',
  'contact',
  'projects',
  'sideProjects',
  'exhibitions',
  'writing',
];
