/**
 * Field definitions driving the Studio's forms.
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

/** Pinned to the top of the page. */
export const PROFILE_FIELDS: FieldDef[] = [
  { key: 'displayName', label: 'Name', type: 'text', placeholder: 'Haythem Gataa' },
  {
    key: 'byline',
    label: 'Byline',
    type: 'text',
    placeholder: 'Software Designer & Engineer in Tunisia',
  },
  {
    key: 'about',
    label: 'About',
    type: 'markdown',
    hint: 'Markdown. Rendered as the first section, above everything orderable.',
  },
];

/**
 * Items in `sections[]`. Every orderable section uses this one form, which is
 * the point — they all render identically, so reordering them is safe.
 */
export const ITEM_FIELDS: FieldDef[] = [
  { key: 'year', label: 'Year', type: 'text', placeholder: '2023 — Now' },
  {
    key: 'heading',
    label: 'Heading',
    type: 'text',
    placeholder: 'Product designer at InstaDeep',
  },
  {
    key: 'role',
    label: 'Role',
    type: 'text',
    placeholder: 'Product designer',
    hint: 'Not rendered. Structured half of the heading, kept for future JSON-LD.',
  },
  { key: 'org', label: 'Organisation', type: 'text', placeholder: 'InstaDeep' },
  { key: 'url', label: 'Link', type: 'url', placeholder: 'https://example.com' },
  { key: 'location', label: 'Location', type: 'text', placeholder: 'Tunis, Tunisia' },
  {
    key: 'description',
    label: 'Description',
    type: 'markdown',
    hint: 'Markdown. Start a line with "* " for a bullet, blank line between bullets.',
  },
];

/** Rows in the pinned contact section. */
export const CONTACT_FIELDS: FieldDef[] = [
  { key: 'platform', label: 'Platform', type: 'text', placeholder: 'Email' },
  { key: 'handle', label: 'Handle', type: 'text', placeholder: 'you@example.com' },
  { key: 'url', label: 'Link', type: 'url', placeholder: 'mailto:you@example.com' },
];

/** Gallery entries carry presentation only; dimensions live in media.json. */
export const GALLERY_FIELDS: FieldDef[] = [
  { key: 'title', label: 'Title', type: 'text', placeholder: 'Poster series' },
  {
    key: 'caption',
    label: 'Caption',
    type: 'markdown',
    placeholder: 'Print work for We Are Kairouan.',
    hint: 'Shown beneath the item. Also used as the image alt text.',
  },
  { key: 'date', label: 'Date', type: 'text', placeholder: '2026 — or "March 2026"' },
];

/** Editable facts about a pooled asset, shared by both tabs. */
export const ASSET_FIELDS: FieldDef[] = [
  {
    key: 'width',
    label: 'Intrinsic width',
    type: 'text',
    hint: 'Video cannot be measured on upload, so a new video lands on 1600x900 until corrected. ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 <file>',
  },
  { key: 'height', label: 'Intrinsic height', type: 'text' },
  {
    key: 'poster',
    label: 'Poster frame',
    type: 'text',
    placeholder: 'award-ceremony-poster.jpg',
    hint: 'Video only. Must already be in the pool. Clear to remove.',
  },
];

/** Suggestions only — any key works, and the label is what renders. */
export const SECTION_SUGGESTIONS = [
  'workExperience',
  'education',
  'awards',
  'speaking',
  'certifications',
  'features',
  'volunteering',
  'projects',
  'sideProjects',
  'exhibitions',
  'writing',
];
