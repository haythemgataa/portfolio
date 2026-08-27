/**
 * The contact row's marks: one brand glyph per platform, plus the envelope and the copy/copied
 * pair the email pill carries.
 *
 * Inline rather than files in `public/`, for the reason `Arrow12.tsx` and `TagIcon.tsx` are:
 * each is a single monochrome shape, and `currentColor` only sees the page's colour when the
 * SVG is part of the document. As an `<img>` each would have needed either a `-dark` sibling or
 * a filter, plus a request apiece — and they are chrome, so `public/media/` is the wrong home
 * for them anyway (that pool is reference-counted against `media.json`, and anything in it with
 * no content record reads as an orphan).
 *
 * `PLATFORM_PATHS`'s keys **are** the vocabulary, the same closed set `TAG_PATHS` is: a contact
 * row is drawn with a mark exactly when `content/cv.json` spells its `platform` the way it is
 * spelled here. Unlike a tag, though, an unmarked platform cannot simply render unadorned — a
 * compact pill with no glyph in it is an unlabelled dot — so `Profile.tsx` falls back to a pill
 * carrying the platform's *name*. Nothing breaks; the row is spelled out instead of drawn.
 *
 * Everything is drawn on a 24x24 grid and sized by the caller's CSS. The brand marks are filled
 * and the two UI marks are stroked, which is the reference: a logo is a solid object, an
 * interface glyph is a drawn line.
 */
const PLATFORM_PATHS: Record<string, string> = {
  // The "in" alone, not the boxed lockup — three subpaths (the n, the i's dot, the i's stem)
  // with the containing square dropped, so the mark reads as letters on the pill's own ground
  // rather than as a tile sitting inside a circle.
  LinkedIn:
    'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452z',
  Dribbble:
    'M12 24C5.385 24 0 18.615 0 12S5.385 0 12 0s12 5.385 12 12-5.385 12-12 12zm10.12-10.358c-.35-.11-3.17-.953-6.384-.438 1.34 3.684 1.887 6.684 1.992 7.308 2.3-1.555 3.936-4.02 4.395-6.87zm-6.115 7.808c-.153-.9-.75-4.032-2.19-7.77l-.066.02c-5.79 2.015-7.86 6.025-8.04 6.4 1.73 1.358 3.92 2.166 6.29 2.166 1.42 0 2.77-.29 4-.816zm-11.62-2.58c.232-.4 3.045-5.055 8.332-6.765.135-.045.27-.084.405-.12-.26-.585-.54-1.167-.832-1.74C7.17 11.775 2.206 11.71 1.756 11.7l-.004.312c0 2.633.998 5.037 2.634 6.855zm-2.42-8.955c.46.008 4.683.026 9.477-1.248-1.698-3.018-3.53-5.558-3.8-5.928-2.868 1.35-5.01 3.99-5.676 7.17zM9.6 2.052c.282.38 2.145 2.914 3.822 6 3.645-1.365 5.19-3.44 5.373-3.702-1.81-1.61-4.19-2.586-6.795-2.586-.825 0-1.63.1-2.4.285zm10.335 3.483c-.218.29-1.935 2.493-5.724 4.04.24.49.47.985.68 1.486.08.18.15.36.22.53 3.41-.43 6.8.26 7.14.33-.02-2.42-.88-4.64-2.31-6.38z',
  GitHub:
    'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23A11.5 11.5 0 0 1 12 5.803c1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  Unsplash: 'M7.5 6.75V0h9v6.75h-9zm9 3.75H24V24H0V10.5h7.5v6.75h9V10.5z',
  Twitter:
    'M23.953 4.57a10 10 0 0 1-2.825.775 4.958 4.958 0 0 0 2.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 0 0-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 0 0-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 0 1-2.228-.616v.06a4.923 4.923 0 0 0 3.946 4.827 4.996 4.996 0 0 1-2.212.085 4.936 4.936 0 0 0 4.604 3.417 9.867 9.867 0 0 1-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 0 0 7.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0 0 24 4.59z',
};

/** Whether a platform has a mark drawn for it — the test `Profile.tsx` picks its pill by. */
export function hasPlatformIcon(platform: string): boolean {
  return platform in PLATFORM_PATHS;
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
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

export function PlatformIcon({ platform, className }: IconProps & { platform: string }) {
  const d = PLATFORM_PATHS[platform];
  if (!d) return null;
  return (
    <Svg className={className}>
      <path d={d} fill="currentColor" />
    </Svg>
  );
}

/**
 * The stroked pair. `vector-effect: non-scaling-stroke` is deliberately *not* used — these are
 * rendered at a single size in a single place, so the 1.7 is a real 1.7 at 18px and scaling it
 * is not a case that arises.
 */
function Stroked({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <Svg className={className}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
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
      <path d="M5.5 5.5h13A2.5 2.5 0 0 1 21 8v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16V8a2.5 2.5 0 0 1 2.5-2.5Z" />
      <path d="m3.6 7 8.4 5.7L20.4 7" />
    </Stroked>
  );
}

export function CopyIcon({ className }: IconProps) {
  return (
    <Stroked className={className}>
      <path d="M11 9h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </Stroked>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Stroked className={className}>
      <path d="m4.5 12.5 4.8 4.8L19.5 7" />
    </Stroked>
  );
}
