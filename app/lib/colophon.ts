/**
 * What the site is made of, for the colophon in the footer.
 *
 * A colophon in the publishing sense: the note at the back of a book naming the typefaces, the
 * materials and the people. That framing is what decides the shape of the list below — it is an
 * authored note rather than a generated dependency manifest, which is why it is curated by hand,
 * and why the two rules under it (no versions, nothing a reader could already infer) are the ones
 * that matter.
 *
 * **This lives in code rather than in `content/`, and that is the same rule the marks and the
 * favicons follow.** `content/` is authored through the Studio and reference-counted against
 * `media.json`; a colophon is neither authored content nor a pool asset — they are chrome, and a
 * fourth content file would be a fourth thing to keep in sync for a list that changes when a
 * dependency does, not when the CV does. So this is the `TAG_MARKS` / `PLATFORM_MARKS` shape: a
 * hand-authored, closed vocabulary in a module, with an honest empty case (a group with no items
 * simply does not render).
 *
 * **No version numbers, deliberately.** Nothing would keep "Next.js 16" honest against
 * `package.json` — there is no build step that reads one and writes the other — and a version on
 * screen that disagrees with the lockfile is worse than no version at all. It is the same argument
 * this repo already makes about the social card's hand-written pixel dimensions and a video's
 * `media.json` measurements: a copy of a derived fact is the copy that goes stale. `README.md`'s
 * `## Stack` line names the majors; that one is read by people who can see the lockfile beside it.
 *
 * **It credits what a reader could not infer, and nothing else.** TypeScript and CSS Modules were
 * here and are gone: naming them says nothing a developer looking at a 2026 Next.js site does not
 * already assume, and a colophon padded with the obvious is one nobody reads to the end of.
 * The test for an entry is whether someone would be surprised to learn it — a shut-down platform
 * this layout descends from passes, a type system does not.
 */

export type Credit = {
  name: string,
  /**
   * What it does here — or, for `Foundation`, what it was. Sentence case, because these read as
   * short statements beside the name rather than as labels.
   */
  note?: string,
  href?: string,
};

export type CreditGroup = {
  label: string,
  items: Credit[],
};

export const COLOPHON: CreditGroup[] = [
  /**
   * First, because it is the only entry that is not a tool: everything below is something the site
   * is built *with*, and this is what it is built *after*. `README.md` has said since the repo
   * existed that the layout and interaction design started as a rebuild of Read.cv; the platform
   * has since shut down, which is why the entry reads as an epitaph and why it carries no `href` —
   * its domain answers 402.
   */
  {
    label: 'Foundation',
    items: [
      { name: 'Read.cv', note: 'Rest in peace, you served me well' },
    ],
  },
  {
    label: 'Built with',
    items: [
      { name: 'Next.js', note: 'App Router, exported static', href: 'https://nextjs.org' },
      { name: 'React', href: 'https://react.dev' },
    ],
  },
  {
    label: 'Libraries',
    items: [
      { name: 'Framer Motion', note: 'The lightbox and its carousel', href: 'https://motion.dev' },
      { name: 'react-markdown', note: 'Descriptions and case studies', href: 'https://github.com/remarkjs/react-markdown' },
      { name: 'Scrollbooster', note: 'Dragging the thumbnail row', href: 'https://github.com/ilyashubin/scrollbooster' },
      // Not a debugging aid, which is worth stating because the name reads like one: it keeps the
      // thumbnail row's edge fades and arrows, the custom scrollbar's thumb, and the lightbox's
      // media box in step with the viewport. Three shipping components, all of which measure.
      { name: 'use-resize-observer', note: 'Re-measuring the thumbnail row, scrollbar and lightbox', href: 'https://github.com/ZeeCoder/use-resize-observer' },
    ],
  },
  {
    label: 'Type',
    items: [
      { name: 'Switzer', note: 'Indian Type Foundry, via Fontshare', href: 'https://www.fontshare.com/fonts/switzer' },
      { name: 'The Prestige Signature', note: 'Sigit Dwipa, Nirmana Visual — traced to outlines, not shipped as a font', href: 'https://nirmanavisual.com/product/the-prestige-signature/' },
    ],
  },
  /**
   * No note, and none is wanted: the entry is a link to an icon set on a page listing what the
   * site is made of, which is the whole explanation. It also used to carry "Brand and product
   * marks are the property of their owners" — that claim now lives only in `LICENSE-CONTENT`,
   * where it is actually load-bearing, rather than being restated as UI copy.
   */
  {
    label: 'Icons',
    items: [
      { name: 'Phosphor', href: 'https://phosphoricons.com' },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { name: 'Cloudflare Pages', note: 'Hosting', href: 'https://pages.cloudflare.com' },
      { name: 'Cloudflare Images', note: 'Resizing at the edge', href: 'https://developers.cloudflare.com/images/' },
      { name: 'Simple Analytics', note: 'No cookies, no cross-site identifier', href: 'https://www.simpleanalytics.com' },
    ],
  },
  {
    label: 'Built alongside',
    items: [
      { name: 'Claude Code', href: 'https://claude.com/claude-code' },
    ],
  },
];
