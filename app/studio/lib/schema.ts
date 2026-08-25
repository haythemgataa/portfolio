/**
 * The Studio's remaining form fields.
 *
 * This file used to declare one of these tables per region — profile, item, contact, gallery —
 * because every field was a labelled box in a form. Editing on the page retired all of them: a
 * heading is edited by clicking the heading, so its label, its placeholder and its type are the
 * rendered text itself rather than a row in a table. What is left is the one table that has no
 * on-page form to fall back on.
 *
 * `MediaAsset`'s fields are facts about a *file* — its intrinsic pixels, its poster frame, and
 * two flags that change how it is treated. None of them is text a visitor reads, so none of them
 * can be clicked on the canvas, and the hints below are the only place the rules are stated.
 *
 * Keep this file free of Node built-ins — it is imported by the client UI.
 */

export type FieldType = 'text' | 'checkbox';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  hint?: string;
  /** `checkbox` only: what an absent value means, so an unset flag shows its real state. */
  defaultChecked?: boolean;
}

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
    placeholder: 'award-ceremony-poster.webp',
    hint: 'Video only. Must already be in the pool. Clear to remove.',
  },
  {
    key: 'framed',
    label: 'Mat this thumbnail',
    type: 'checkbox',
    defaultChecked: true,
    hint: 'On: the CV thumbnail insets the image in a bordered mat with a shadow, in a frame locked to 14:9. Off: it fills the thumbnail edge to edge at its own ratio. Suits screenshots on, photographs off.',
  },
  {
    key: 'floating',
    label: 'No rectangle of its own',
    type: 'checkbox',
    defaultChecked: false,
    hint: 'For collages and montages sitting on transparency. Opened, the image drops its border and rounded corners — which would trace an edge the artwork has not got — and keeps a shadow following its silhouette instead. Leave off for anything that fills its frame.',
  },
];
