/**
 * The `localStorage` key the theme switch writes and the inline script in `layout.tsx` reads.
 *
 * It lives in its own module with no component code so that the layout can name the key without
 * importing `ThemeSwitch.tsx`. That import is what previously pulled the switch's code into the
 * client bundle on every build, including production ones where the button is never rendered —
 * a static `import` is not removed just because the only *use* of it sits behind a false constant.
 */
export const THEME_STORAGE_KEY = "theme";
