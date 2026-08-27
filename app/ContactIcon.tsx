/**
 * The contact row's marks: one brand glyph per platform, plus the envelope and the copy/copied
 * pair the email pill carries.
 *
 * Inline rather than files in `public/`, for the reason `Arrow12.tsx` and `TagIcon.tsx` are:
 * these are monochrome shapes tinted by the page, and `currentColor` only sees the page's colour
 * when the SVG is part of the document. As an `<img>` each would have needed either a `-dark`
 * sibling or a filter, plus a request apiece — and they are chrome, so `public/media/` is the
 * wrong home for them anyway (that pool is reference-counted against `media.json`, and anything
 * in it with no content record reads as an orphan).
 *
 * Drawn on a 16x16 grid with the glyph occupying the middle ~11px, the same proportion
 * `TAG_PATHS` uses at 14 — which is what lets a 16px mark sit in a 32px pill without filling it.
 * The Figma export gave each mark twice, one copy at `#111` under another at `#222`; the two `d`
 * strings are byte-identical (checked, not assumed), so one copy is kept and painted with
 * `currentColor`. Four of the five also arrived inside a `clipPath` whose rect is exactly the
 * glyph's own bounding box — a no-op, dropped rather than repeated five times.
 *
 * `PLATFORM_MARKS`'s keys **are** the vocabulary, the same closed set `TAG_PATHS` is: a contact
 * row is drawn with a mark exactly when `content/cv.json` spells its `platform` the way it is
 * spelled here. Unlike a tag, though, an unmarked platform cannot simply render unadorned — a
 * compact pill with no glyph in it is an unlabelled dot — so `Profile.tsx` falls back to a pill
 * carrying the platform's *name*. Nothing breaks; the row is spelled out instead of drawn.
 *
 * **The marks carry no brand colour.** Each was briefly tinted to its platform's own colour on
 * hover, and the row read as five logos rather than as one set of controls — the pill's fill and
 * the ink coming forward already say which one the pointer is on, and they say it in the page's
 * own voice. Monochrome is the treatment, not a limitation waiting to be lifted.
 */
type PlatformMark = {
  d: string;
  /** The export's own fill rule. GitHub's octocat and Unsplash's notch both need it. */
  evenOdd?: boolean;
};

const PLATFORM_MARKS: Record<string, PlatformMark> = {
  LinkedIn: {
    d: 'M2.5 4.21969C2.5 3.86615 2.62388 3.57449 2.87162 3.3447C3.11937 3.1149 3.44145 3 3.83784 3C4.22716 3 4.54215 3.11312 4.78282 3.33939C5.03056 3.57273 5.15444 3.87676 5.15444 4.25151C5.15444 4.59091 5.03411 4.87373 4.79344 5.1C4.54569 5.33333 4.22008 5.45 3.8166 5.45H3.80598C3.41666 5.45 3.10168 5.33333 2.861 5.1C2.62033 4.86666 2.5 4.57323 2.5 4.21969ZM2.63803 13.5V6.41515H4.99517V13.5H2.63803ZM6.30116 13.5H8.6583V9.54393C8.6583 9.29645 8.68662 9.10554 8.74324 8.9712C8.84234 8.7308 8.99276 8.52751 9.1945 8.36135C9.39624 8.19519 9.64929 8.11211 9.95367 8.11211C10.7465 8.11211 11.1429 8.64595 11.1429 9.71363V13.5H13.5V9.43787C13.5 8.3914 13.2523 7.59772 12.7568 7.05681C12.2613 6.5159 11.6065 6.24545 10.7925 6.24545C9.87934 6.24545 9.16795 6.63787 8.6583 7.42272V7.44393H8.64768L8.6583 7.42272V6.41515H6.30116C6.31531 6.6414 6.32239 7.34494 6.32239 8.52575C6.32239 9.70655 6.31531 11.3646 6.30116 13.5Z',
  },
  Dribbble: {
    d: 'M2 8.25C2 7.20733 2.25684 6.24517 2.7705 5.3635C3.28417 4.48183 3.98184 3.78417 4.8635 3.2705C5.74517 2.75683 6.70734 2.5 7.75 2.5C8.79267 2.5 9.75484 2.75683 10.6365 3.2705C11.5182 3.78417 12.2158 4.48183 12.7295 5.3635C13.2432 6.24517 13.5 7.20733 13.5 8.25C13.5 9.29267 13.2432 10.2548 12.7295 11.1365C12.2158 12.0182 11.5182 12.7158 10.6365 13.2295C9.75484 13.7432 8.79267 14 7.75 14C6.70734 14 5.74517 13.7432 4.8635 13.2295C3.98184 12.7158 3.28417 12.0182 2.7705 11.1365C2.25684 10.2548 2 9.29267 2 8.25ZM2.9545 8.25C2.9545 9.446 3.357 10.5002 4.162 11.4125C4.53 10.6918 5.11267 10.0057 5.91 9.354C6.70734 8.70233 7.4855 8.29217 8.2445 8.1235C8.1295 7.85517 8.01834 7.61367 7.911 7.399C6.59234 7.82067 5.16634 8.0315 3.633 8.0315C3.334 8.0315 3.11167 8.02767 2.966 8.02C2.966 8.05067 2.96409 8.089 2.96025 8.135C2.95642 8.181 2.9545 8.21933 2.9545 8.25ZM3.104 7.0655C3.27267 7.08083 3.52184 7.0885 3.8515 7.0885C5.13184 7.0885 6.347 6.916 7.497 6.571C6.91434 5.536 6.27417 4.6735 5.5765 3.9835C4.97084 4.29017 4.45142 4.71567 4.01825 5.26C3.58509 5.80433 3.28034 6.40617 3.104 7.0655ZM4.8175 12.0335C5.68384 12.7082 6.66134 13.0455 7.75 13.0455C8.31734 13.0455 8.88084 12.9382 9.4405 12.7235C9.28717 11.4125 8.98817 10.1437 8.5435 8.917C7.83817 9.07033 7.12709 9.4575 6.41025 10.0785C5.69342 10.6995 5.1625 11.3512 4.8175 12.0335ZM6.577 3.6155C7.25167 4.31317 7.8765 5.18333 8.4515 6.226C9.49417 5.789 10.28 5.23317 10.809 4.5585C9.91967 3.8225 8.9 3.4545 7.75 3.4545C7.359 3.4545 6.968 3.50817 6.577 3.6155ZM8.8655 7.0425C8.9805 7.28783 9.11084 7.59833 9.2565 7.974C9.82384 7.92033 10.441 7.8935 11.108 7.8935C11.5833 7.8935 12.0548 7.905 12.5225 7.928C12.4612 6.88533 12.0855 5.95767 11.3955 5.145C10.8972 5.88867 10.0538 6.52117 8.8655 7.0425ZM9.544 8.779C9.935 9.91367 10.1995 11.079 10.3375 12.275C10.9432 11.884 11.4377 11.3818 11.821 10.7685C12.2043 10.1552 12.4343 9.492 12.511 8.779C11.9513 8.74067 11.4415 8.7215 10.9815 8.7215C10.5598 8.7215 10.0807 8.74067 9.544 8.779Z',
  },
  GitHub: {
    d: 'M8 2C4.685 2 2 4.75291 2 8.15176C2 10.8739 3.7175 13.1731 6.1025 13.9882C6.4025 14.0421 6.515 13.8575 6.515 13.696C6.515 13.5499 6.5075 13.0655 6.5075 12.5503C5 12.8348 4.61 12.1735 4.49 11.8274C4.4225 11.6506 4.13 11.1046 3.875 10.9585C3.665 10.8432 3.365 10.5586 3.8675 10.551C4.34 10.5433 4.6775 10.997 4.79 11.1815C5.33 12.112 6.1925 11.8505 6.5375 11.689C6.59 11.2892 6.7475 11.02 6.92 10.8662C5.585 10.7124 4.19 10.1818 4.19 7.8288C4.19 7.15979 4.4225 6.60613 4.805 6.17551C4.745 6.02171 4.535 5.39116 4.865 4.54529C4.865 4.54529 5.3675 4.38381 6.515 5.17585C6.995 5.03743 7.505 4.96823 8.015 4.96823C8.525 4.96823 9.035 5.03743 9.515 5.17585C10.6625 4.37612 11.165 4.54529 11.165 4.54529C11.495 5.39116 11.285 6.02171 11.225 6.17551C11.6075 6.60613 11.84 7.1521 11.84 7.8288C11.84 10.1895 10.4375 10.7124 9.1025 10.8662C9.32 11.0585 9.5075 11.4276 9.5075 12.0043C9.5075 12.8271 9.5 13.4884 9.5 13.696C9.5 13.8575 9.6125 14.0498 9.9125 13.9882C12.2825 13.1731 14 10.8662 14 8.15176C14 4.75291 11.315 2 8 2Z',
    evenOdd: true,
  },
  Unsplash: {
    d: 'M6.12506 3H9.87506V5.8125H6.12506V3ZM3.00006 7.375H6.13412V10.2125H9.89235V7.375H13.0001V13H3.00006V7.375Z',
    evenOdd: true,
  },
  Twitter: {
    d: 'M13.8205 4.56478C13.4041 4.74553 12.9568 4.86772 12.4866 4.92264C12.9665 4.64152 13.3342 4.19603 13.5078 3.66583C13.0519 3.9307 12.553 4.11717 12.0327 4.21714C11.6093 3.77564 11.0055 3.5 10.3376 3.5C9.05542 3.5 8.0156 4.5168 8.0156 5.7718C8.0156 5.94962 8.03607 6.1231 8.07543 6.28966C6.14534 6.19477 4.43419 5.29033 3.28883 3.91605C3.08884 4.25169 2.97436 4.64193 2.97436 5.0583C2.97436 5.84637 3.3844 6.5417 4.00743 6.94901C3.63861 6.93783 3.27787 6.84043 2.95539 6.66498V6.69368C2.95539 7.7945 3.75576 8.71239 4.81821 8.92115C4.62304 8.97346 4.41822 9.00079 4.20632 9.00079C4.0565 9.00079 3.91115 8.98692 3.76916 8.96079C4.06469 9.86306 4.92234 10.5198 5.93827 10.5384C5.14347 11.1479 4.14199 11.5112 3.05428 11.5112C2.86693 11.5112 2.68177 11.5003 2.5 11.4788C3.52789 12.1236 4.74834 12.5 6.05985 12.5C10.3312 12.5 12.6673 9.03827 12.6673 6.03621C12.6673 5.93766 12.6651 5.83983 12.6602 5.74236C13.1153 5.42032 13.5082 5.02156 13.8205 4.56478Z',
  },
};

/** Whether a platform has a mark drawn for it — the test `Profile.tsx` picks its pill by. */
export function hasPlatformIcon(platform: string): boolean {
  return platform in PLATFORM_MARKS;
}

type IconProps = {
  /** Applied by the caller so the mark can be sized from CSS. */
  className?: string,
};

/**
 * Every mark here is decorative: the pill it sits in carries its own accessible name, spelling
 * out both the platform and the handle. So `aria-hidden`, and no `<title>`.
 */
function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

export function PlatformIcon({ platform, className }: IconProps & { platform: string }) {
  const mark = PLATFORM_MARKS[platform];
  if (!mark) return null;
  return (
    <Svg className={className}>
      <path d={mark.d} fill="currentColor" fillRule={mark.evenOdd ? 'evenodd' : undefined} />
    </Svg>
  );
}

/**
 * The stroked trio. They are interface glyphs rather than logos, which is why they are drawn
 * rather than filled — and the 1.25 is tuned to sit at the brand marks' optical weight at 16px,
 * where a heavier stroke reads as a different family sitting in the same row.
 */
function Stroked({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <Svg className={className}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </Svg>
  );
}

export function EnvelopeIcon({ className }: IconProps) {
  return (
    <Stroked className={className}>
      <path d="M4 4h8a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 12 12H4a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 4 4Z" />
      <path d="m2.9 5.15 5.1 3.6 5.1-3.6" />
    </Stroked>
  );
}

export function CopyIcon({ className }: IconProps) {
  return (
    <Stroked className={className}>
      <path d="M7.5 6H12a1.5 1.5 0 0 1 1.5 1.5V12a1.5 1.5 0 0 1-1.5 1.5H7.5A1.5 1.5 0 0 1 6 12V7.5A1.5 1.5 0 0 1 7.5 6Z" />
      <path d="M4 10h-.5A1.5 1.5 0 0 1 2 8.5v-5A1.5 1.5 0 0 1 3.5 2h5A1.5 1.5 0 0 1 10 3.5V4" />
    </Stroked>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Stroked className={className}>
      <path d="m3 8.4 3.2 3.2L13 4.8" />
    </Stroked>
  );
}
