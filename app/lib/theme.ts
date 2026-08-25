/**
 * The `localStorage` key the theme switch writes and the inline script in `layout.tsx` reads.
 *
 * It lives in its own module with no component code so that the layout can name the key without
 * importing `ThemeSwitch.tsx`. That import is what previously pulled the switch's code into the
 * client bundle on every build, including production ones where the button is never rendered —
 * a static `import` is not removed just because the only *use* of it sits behind a false constant.
 */
export const THEME_STORAGE_KEY = "theme";

/**
 * Whether this build gets the theme switch. Set from the git branch in `next.config.ts` — off on
 * the production branch, on for preview deploys and local dev.
 *
 * `NEXT_PUBLIC_*` is inlined at build time, so this is a literal and both the button and the
 * pre-paint script are dead code on production: **no markup, no script tag, and no `data-theme`
 * ever set.** Measured on a `CF_PAGES_BRANCH=main` export — zero occurrences of either in `out/`.
 *
 * What it does *not* do is keep `ThemeSwitch.tsx` out of the client bundle. Its importers use a
 * static `import`, and Next registers every client component in its manifest whether or not a
 * branch renders it, so the code still lands in a shared chunk. Verified rather than assumed.
 * Fighting that is not worth it for a component this size, but the claim is worth stating
 * accurately: the switch cannot *appear* on production, it is simply also not free.
 *
 * It lives beside the storage key rather than in either of the two files that read it, because
 * `layout.tsx` and `global-not-found.tsx` both gate on it and a second copy of the comparison is
 * a second thing to get wrong.
 */
export const THEME_SWITCH_ENABLED = process.env.NEXT_PUBLIC_THEME_SWITCH === "true";
