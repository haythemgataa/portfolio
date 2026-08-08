# Pitfalls Research

**Domain:** Adding a hash-driven tab system + media-heavy masonry gallery to an existing statically-exported Next.js 16 / React 19 portfolio (ReadCV v1.1)
**Researched:** 2026-08-08
**Confidence:** HIGH for repo-specific findings (read directly from source), HIGH for browser/CSS/React behaviour (verified against spec discussions, issue trackers, vendor docs), MEDIUM for performance thresholds (device-dependent, not authoritatively documented)

> **Nine pitfalls in this document are not hypothetical — they are already present in this repository.** They are marked **[CONFIRMED IN REPO]** with file and line citations. Prioritise those.

---

## Suggested phase vocabulary

The roadmap does not exist yet. Pitfalls below are mapped to these topic-shaped phases so the roadmapper can rename freely:

| Ref | Phase topic |
|-----|-------------|
| **P0** | Pre-work / build hygiene (repo state, `out/`, CLAUDE.md drift) |
| **P1** | Tab shell — sticky tab bar, hash state, header persistence |
| **P2** | Gallery content model — `010-gallery/` loader, dimensions, tags |
| **P3** | Masonry grid — images only |
| **P4** | Video in the grid — autoplay, muted, reduced motion |
| **P5** | Tag filter chips |
| **P6** | Lightbox integration |
| **P7** | Polish — a11y, perf, CDN, final visual regression sweep |

---

## Critical Pitfalls

These are ordered by **blast radius on the already-shipped CV view first**, then by new-feature severity.

---

### Pitfall 1: `overflow-x: hidden` on `html`/`body` silently kills the sticky tab bar — **[CONFIRMED IN REPO]**

**What goes wrong:**
The sticky tab bar is written with `position: sticky; top: 0`, looks correct in isolation, and then simply scrolls away with the page. No error, no warning, no devtools indication. Days get burned adding `z-index`, `will-change`, and wrapper divs before someone finds the real cause three files away.

**Why it happens:**
`app/globals.css:55-59` contains:

```css
html,
body {
  max-width: 100vw;
  overflow-x: hidden;
}
```

A sticky element sticks relative to its **nearest scrollport ancestor**, not the viewport. Setting `overflow-x: hidden` on an ancestor makes that ancestor a scroll container; the used value of the other axis is promoted from `visible` to `auto`. Because `body` here is not the propagating root (the root's `overflow` is non-`visible`, so body's own value is used rather than propagated), `body` becomes a scroll container whose scrollport never actually scrolls — the document scroll is on the viewport. The sticky element therefore never reaches an edge it can stick to.

This is the single most common cause of "position: sticky doesn't work" on the web, and this repo has the exact shape of it. It also matters that `max-width: 100vw` is there — `100vw` includes the classic scrollbar gutter on desktop, which is *why* someone originally added `overflow-x: hidden`, so removing the overflow rule alone can reintroduce a horizontal scrollbar.

**How to avoid:**
1. Change both declarations to `overflow-x: clip`. `clip` suppresses overflow **without** creating a scroll container or a new formatting context, so sticky descendants keep working. This is the canonical fix.
2. While there, replace `max-width: 100vw` with `max-width: 100%` (or delete it) — `100vw` is the thing that created the phantom horizontal overflow that `overflow-x: hidden` was papering over.
3. Add a one-line comment in `globals.css` recording *why* it must stay `clip`, so a future "tidy-up" doesn't revert it.
4. **Regression check on the CV view:** `overflow-x: clip` on `body` does not clip `position: fixed` descendants the way people fear, but it *does* establish a clipping context. Verify the Lightbox (`position: fixed; inset: 0` — `app/Lightbox.module.css:1-5`) still covers the full viewport after the change, and that the negative-margin mobile attachment strip (`app/Attachments.module.css`, `.scrollableArea { left: -40px; right: -24px }` under `max-width: 480px`) still bleeds correctly and does not produce a horizontal scrollbar.

**Warning signs:**
- The tab bar scrolls out of view despite `position: sticky; top: 0` and a correct offset.
- In DevTools, the element's computed `position` is `sticky` (so it's not a typo) but no sticky offset is ever applied.
- Quick diagnostic: in the console run `document.body.style.overflow = 'visible'` — if the tab bar starts sticking, this is your pitfall.

**Phase to address:** **P1**, as the *first* task in that phase. Do the `globals.css` change and the CV-view regression check before writing any tab markup, so a working baseline is established.

---

### Pitfall 2: The Lightbox's scroll-lock cleanup permanently overrides `globals.css` — **[CONFIRMED IN REPO]**

**What goes wrong:**
After the visitor opens and closes the Lightbox **once**, the sticky tab bar starts behaving *differently* than it did on page load — or a horizontal scrollbar appears that wasn't there before. The bug is non-deterministic from the user's point of view and impossible to reproduce by reloading, which makes it maddening to diagnose.

**Why it happens:**
`app/Lightbox.tsx:27-32`:

```js
document.body.style.overflow = 'hidden';
document.documentElement.style.overflow = 'hidden';
return () => {
  document.body.style.overflow = 'unset';
  document.documentElement.style.overflow = 'unset';
};
```

Two compounding defects:

1. **It sets the shorthand `overflow`, not `overflow-y`.** So while open it also overrides the `overflow-x` axis.
2. **Cleanup writes `'unset'` rather than restoring the prior value.** `element.style.overflow = 'unset'` produces an *inline* declaration `overflow: unset`. For the non-inherited `overflow` property, `unset` computes to `initial`, i.e. `visible`. Inline styles beat author stylesheets. So from the first close onward, `html` and `body` carry inline `overflow: visible`, which **defeats the `overflow-x: hidden` rule in `globals.css:58` for the remainder of the session.**

Consequence today: the horizontal-overflow guard silently disappears after one lightbox interaction. Consequence in v1.1: whether the sticky tab bar works depends on whether the user has opened the lightbox yet — the *opposite* states before and after. If you "fix" Pitfall 1 by testing after a lightbox open, you will conclude it works and ship a broken tab bar.

**How to avoid:**
- Rewrite the lock to capture-and-restore, and to touch only the y-axis:

  ```js
  const prevBody = document.body.style.overflowY;
  const prevHtml = document.documentElement.style.overflowY;
  document.body.style.overflowY = 'hidden';
  document.documentElement.style.overflowY = 'hidden';
  return () => {
    document.body.style.overflowY = prevBody;
    document.documentElement.style.overflowY = prevHtml;
  };
  ```
- Better, since the Lightbox now has two consumers: extract a **ref-counted** `useScrollLock()` hook. With one consumer the naive version was survivable; with two (Attachments and Gallery) a nested or rapid open→open→close sequence will unlock while something is still open.
- Add `scrollbar-gutter: stable` on `html` if locking causes a visible layout jump when the scrollbar disappears.

**Warning signs:**
- Sticky/overflow behaviour differs between a fresh load and after closing the lightbox.
- `document.body.getAttribute('style')` returns `overflow: unset;` when nothing is open.
- Background page scroll position jumps when the lightbox closes.

**Phase to address:** **P1** (fix it as part of establishing the sticky baseline — it directly corrupts the Pitfall 1 test), re-verified in **P6**.

---

### Pitfall 3: `Lightbox.tsx` has no `"use client"` and calls `window` during render — **[CONFIRMED IN REPO]**

**What goes wrong:**
Adding the Gallery, someone imports `Lightbox` from a new file and the static build fails with `ReferenceError: window is not defined`, or the dev server throws `useState is not a function` / "You're importing a component that needs useState". Because the failure surfaces at build time in `next build` (which produces the committed `out/`), it can also silently break a Cloudflare Pages deploy while local `next dev` looks fine.

**Why it happens:**
`app/Lightbox.tsx` has **no `"use client"` directive at line 1**. It works today purely by inheritance: its only importer, `app/Attachments.tsx:1`, is `"use client"`, so the whole module graph below it is client. That is an implicit, undocumented invariant.

It is also unusually fragile because the component touches browser globals **during render**, not in effects:
- `app/Lightbox.tsx:198` — `useState((window.innerWidth - 48) / (window.innerHeight - 96))` in a `useState` *initializer*, which runs on the first render.
- `app/Lightbox.tsx:88, 99, 110, 265` — `isMobile()` called inline during render. `app/isMobile.tsx:6-8` returns `false` on the server and caches the client value at module level, so a server-rendered Lightbox would produce `data-mobile="false"` markup that disagrees with the client → hydration mismatch on top of everything else.

Today this never fires because the Lightbox is only mounted after a click (`app/Attachments.tsx:71-80`). Any v1.1 design that renders it earlier — e.g. "open the lightbox from a deep link like `#gallery/7`", or keeping it mounted and toggling visibility — walks straight into it.

**How to avoid:**
- Add `"use client"` to the top of `app/Lightbox.tsx` now, as a zero-risk hardening step. It is already only ever a client module; the directive just makes the invariant explicit and survives refactors.
- Keep the Lightbox **conditionally mounted only after a user interaction**, exactly as `Attachments.tsx` does. Do not hoist it into always-rendered markup.
- If a deep link that opens a specific gallery item is ever wanted, resolve it in a `useEffect` after mount — never during the first render pass.
- Replace the render-time `isMobile()` calls with the already-provided `useIsMobile()` hook (`app/isMobile.tsx:22-30`) if the Lightbox is ever refactored. Do not introduce *new* render-time `isMobile()` calls in the Gallery.

**Warning signs:**
- `next build` fails with `window is not defined` while `next dev` is green.
- Console: "Hydration failed because the server rendered HTML didn't match the client."
- Any new component importing `Lightbox` that is itself a server component.

**Phase to address:** **P0** (add the directive as hardening), enforced in **P6**.

---

### Pitfall 4: Reading `window.location.hash` during render → hydration mismatch, blanked page

**What goes wrong:**
The obvious implementation —

```jsx
const [tab, setTab] = useState(window.location.hash === '#gallery' ? 'gallery' : 'cv');
```

— fails three ways at once on a static export:
1. `window` is undefined during `next build`'s prerender → **the build crashes**.
2. The `typeof window !== 'undefined'` "fix" makes the build pass, but the prerendered HTML always says `cv` while a client landing on `#gallery` renders `gallery` → hydration mismatch. React 18+ responds by **discarding the server HTML and client-rendering the entire root**, which shows as a full-page flash, lost scroll position, and a large CLS spike on the CV view — a regression to something that already worked.
3. The mismatch is invisible in dev if you never test with the hash present.

**Why it happens:**
There is exactly one HTML artefact (`out/index.html`, currently 65 KB) serving every hash. The hash is *never* sent to the server or the CDN, so no prerendered variant can ever match it. Static export makes this structural, not incidental.

Note also: `next/navigation`'s `usePathname` / `useSearchParams` **do not expose the hash**. There is no framework-provided hook here. Also, `useSearchParams()` in an exported app requires a `<Suspense>` boundary — reaching for it as a workaround creates a second problem.

**Does React 19 change the advice?** **No.** React 19 improved hydration *diagnostics* (a single readable server-vs-client diff instead of a wall of warnings) but did not relax the mismatch rules. `suppressHydrationWarning` still only silences the warning for text/attribute-level differences — it does not make a differing subtree render correctly, and React 19 actually changed some `suppressHydrationWarning` edge-case behaviour (see `facebook/react#32975`). Do not reach for it here.

**How to avoid — the correct pattern:**

Render `cv` deterministically, then adopt the hash after mount. Two acceptable forms:

*Form A — `useSyncExternalStore` (preferred; `getServerSnapshot` is exactly the escape hatch for this):*

```js
// module scope — subscribe/getSnapshot must be stable
const subscribe = (cb) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
const getSnapshot = () => window.location.hash;
const getServerSnapshot = () => '';           // what the prerender emitted

const hash = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
```

React uses `getServerSnapshot` for both the prerender **and the hydration pass**, then re-renders with the real value immediately after — no mismatch, and the browser Back/Forward buttons work for free via `hashchange`.

*Form B — `useEffect` adoption:*

```js
const [tab, setTab] = useState('cv');           // always matches the prerender
useEffect(() => {
  const sync = () => setTab(window.location.hash === '#gallery' ? 'gallery' : 'cv');
  sync();
  window.addEventListener('hashchange', sync);
  return () => window.removeEventListener('hashchange', sync);
}, []);
```

Additional rules for both forms:
- **Never give any DOM element `id="gallery"`.** Confirmed: no `id=` attributes exist anywhere in `app/*.tsx` today. If one is added, clicking `<a href="#gallery">` triggers the browser's native fragment jump and yanks the page down before your handler runs.
- Prefer `history.replaceState(null, '', '#gallery')` over an `<a href>` for tab switching, or call `e.preventDefault()` then update history manually. `replaceState` avoids polluting the back stack with every tab toggle; use `pushState` only if you decide Back should undo a tab switch — pick one and write it in the phase's acceptance criteria.
- Accept a **one-frame CV flash** for a `#gallery` deep link. This is the honest cost of static export and is not worth engineering around. Do not try to eliminate it with a "hide everything until mounted" gate — that regresses the CV view's first paint for the 95% of visitors who never use the hash.

**Warning signs:**
- Console: "Hydration failed…" or "There was an error while hydrating."
- Loading `/#gallery` shows the CV for longer than one frame, or the whole page visibly re-renders.
- Back button does nothing after switching tabs.

**Phase to address:** **P1**. Acceptance criteria must include: hard-reload on `/#gallery`, hard-reload on `/`, Back/Forward across a tab switch, and a clean console on all three.

---

### Pitfall 5: Video dimensions are hardcoded to 1920×1080 — masonry will place every video wrong — **[CONFIRMED IN REPO]**

**What goes wrong:**
Masonry column placement depends on knowing each item's aspect ratio *before* the media loads. Portrait videos (phone-shot clips, which a design portfolio will certainly contain) get slotted into a 16:9 box, appear letterboxed or hard-cropped, and when the real metadata arrives the grid reflows — a large, late CLS hit on exactly the tab you built for visual impact.

**Why it happens:**
`app/lib/contentLoader.ts:135-145`:

```js
let width = 1920;  // Default dimensions
let height = 1080;

if (mediaType === 'image') {
  const dimensions = await getImageDimensions(filePath);
  ...
}
```

`sharp` is only invoked for images. **Every video in the content tree is reported as 1920×1080 regardless of its actual dimensions.** There are 4 video files in `public/content/` today. The CV view tolerates this because `Attachments.tsx:132-140` clamps every thumbnail's ratio into a narrow band anyway — the masonry grid will not.

Also note `getImageDimensions` swallows all errors and returns `null` (`contentLoader.ts:13-16`), silently falling back to 1920×1080 for images too. A corrupt or unusual file therefore fails *invisibly*.

**How to avoid:**
- **Do not** call this "good enough because there are only a few videos." The gallery is curated and video-forward by design; wrong ratios are the most visible possible defect.
- Extract real video dimensions at build time. Options, in order of preference for this repo:
  1. Parse the MP4/MOV `tkhd`/`stsd` boxes with a tiny zero-dependency reader, or add a small dependency such as `mp4box`/`get-video-dimensions`. Keeps the build hermetic.
  2. Require an explicit `width`/`height` in each gallery entry's `item.json` and **fail the build loudly** if missing for a video. Given the gallery is hand-curated at ~30 items, this is a legitimate, low-code choice — but the failure must be loud, not a fallback.
  3. `ffprobe` — rejected: introduces a system binary dependency that Cloudflare Pages' build image may not have.
- **Change the error path from silent to loud.** Have `contentLoader` `console.warn` (or throw in CI) when it falls back to defaults, so a bad asset is caught at build rather than in production. The current bare `catch { return null }` is the reason this went unnoticed.
- Store the intrinsic dimensions in the gallery data and render every tile with `aspect-ratio: W / H` on the *container*, so the slot is reserved before a byte of media loads.

**Warning signs:**
- Any video in the gallery shows black bars or a wrong crop.
- The grid visibly reflows a second or two after load.
- Every video in the data dump has `width: 1920, height: 1080`.

**Phase to address:** **P2** — this is a content-model problem, not a rendering problem, and must be solved before **P3**/**P4** build on top of it.

---

### Pitfall 6: `/cdn-cgi/image/` breaks in local dev **and** on `*.pages.dev` previews — **[CONFIRMED IN REPO]**

**What goes wrong:**
Every gallery thumbnail is a broken image icon on `localhost:3000` and on the `dev`-branch preview deploy, but fine on the production custom domain. The developer, unable to see the grid locally, either reverts to raw URLs (destroying the performance story and shipping 4 MB PNGs) or spends hours debugging a non-bug.

**Why it happens:**
`app/Attachments.tsx:16-20` unconditionally rewrites every image URL:

```js
const getThumbnailUrl = (originalUrl, maxHeight) =>
  `/cdn-cgi/image/width=${maxHeight*2},height=${maxHeight*2},quality=50,format=auto${originalUrl}`;
```

`/cdn-cgi/*` is an edge-only path handled by Cloudflare's proxy. It does not exist in `next dev` (404), it does not exist in a bare `npx serve out/` (404), and — **verified** — Cloudflare's Image Resizing at `/cdn-cgi/image/` **does not work on `*.pages.dev` subdomains**; it requires a custom domain on a zone with Image Resizing/Images enabled. This affects the `dev`-branch preview deploy that the `beta` badge (`Profile.tsx:31-33`) exists to mark.

Three more traps in the same area:
- **Cloudflare Image Resizing does not transform video.** Video `src` must remain the raw `/content/...` URL. Do not pass gallery videos through `getThumbnailUrl`.
- The current call site hardcodes a **square** `width = height = maxHeight*2` (`Attachments.tsx:18, 148`). For a masonry grid that preserves aspect ratio, passing both dimensions forces an unwanted box; specify **width only** plus `fit=scale-down` and let height follow.
- `next/image` is used with `images.unoptimized: true` (`next.config.ts:18-20`), so `quality={50}` at `Attachments.tsx:155` is a **no-op** — only the `quality=50` inside the `/cdn-cgi/image/` string does anything. Do not assume `next/image` props are doing work here.

**How to avoid:**
- Factor `getThumbnailUrl` out of `Attachments.tsx` into a shared `app/lib/cdnImage.ts` used by both the CV attachments and the gallery, so sizing policy lives in one place.
- Add an **environment-aware bypass** so local dev renders real images:

  ```js
  const CDN = process.env.NEXT_PUBLIC_CDN_IMAGES === 'true';
  export const cdnImage = (url, opts) =>
    CDN ? `/cdn-cgi/image/${serialize(opts)}${url}` : url;
  ```

  Default it **on** for production builds and **off** for `next dev`. The existing `next.config.ts` `env` block (lines 26-28) already shows the pattern for injecting build-time env vars.
- Alternatively, gate on the same `NEXT_PUBLIC_GIT_BRANCH` signal already in use, so `dev`-branch preview builds skip the CDN path too — otherwise the beta preview looks broken to reviewers.
- Add `fit=scale-down` and `format=auto`; use **width only** for masonry tiles.
- **Document the flag in CLAUDE.md** — this is precisely the class of "works in prod, broken locally" knowledge that must not live only in someone's head.

**Warning signs:**
- Broken-image icons on `localhost` but not production.
- Network tab: `404` on `/cdn-cgi/image/width=.../content/...`.
- Someone proposes "just remove the CDN prefix" to unblock local work.

**Phase to address:** **P0** (extract + add the dev bypass, fixing the existing CV attachments at the same time), applied in **P3**.

---

### Pitfall 7: ~30 simultaneously autoplaying videos — memory, battery, and thermal collapse

**What goes wrong:**
The grid is smooth on a desktop dev machine and then on an iPhone it stutters, the device gets hot, scrolling drops to single-digit fps, Safari discards the tab, or iOS silently refuses to play most of them. Data usage is enormous — the largest video already in this repo is **6.5 MB** (`public/content/005-speaking/.../Design-for-non-designers-at-RNAAI-with-BioNTech.mp4`); a handful of those is a multi-tens-of-megabyte page.

**Why it happens:**
On iOS/iPadOS, video decoding is performed by the **system**, not the page, and the number of concurrent hardware decode sessions is a device-level constraint that is not documented and not feature-detectable. Chrome and Firefox have no hard cap but each `<video>` still carries its own decoder, buffer, and compositor layer. Naively rendering `<video autoPlay loop>` for every tile also defeats any lazy loading — `<video>` has **no `loading="lazy"`** equivalent.

The existing code already models the wrong instinct: `app/Attachments.tsx:157-165` renders `<video autoPlay loop muted playsInline>` unconditionally with no viewport gating. That is survivable for a horizontal strip of 1-3 clips; it is not survivable for a 30-item grid.

**How to avoid:**
- **Poster-first, play-on-visible.** Render a static poster image (extracted at build, served through Cloudflare Image Resizing) with `preload="none"`. Use a single shared `IntersectionObserver` to `play()` only tiles intersecting the viewport and `pause()` everything else.
- **Cap concurrency explicitly.** Allow at most ~3-4 videos playing at once; keep a small LRU of active elements and pause the oldest. This is the difference between "works on my M-series Mac" and "works on a mid-range Android".
- **Do not autoplay at all on mobile.** Show the poster with a play affordance; the visitor taps into the Lightbox anyway. This is the cheapest correct answer and should be the default unless testing proves otherwise.
- Set `disablePictureInPicture` and `disableRemotePlayback` so grid tiles don't offer PiP/AirPlay chrome.
- **Budget the bytes.** Add a hard rule to the content model: gallery videos must be ≤ ~2 MB, H.264 baseline, ≤ 1080p on the long edge. The 6.5 MB source in the repo is over budget; if it is curated into the gallery it must be re-encoded.
- Pair every `<video>` with a `poster` so the tile is never blank — this also fixes the known Safari/iOS "blank first frame" behaviour.

**Warning signs:**
- Device warm to the touch; fan spin-up on laptops.
- Chrome DevTools Performance shows continuous compositing work while idle.
- On iOS, some videos play and others show a frozen first frame with no pattern.
- Total transfer for `#gallery` exceeds ~5 MB.

**Phase to address:** **P4**, with the byte-budget rule written into **P2**'s content model.

---

### Pitfall 8: React does not reliably reflect `muted` to the DOM — autoplay fails on iOS

**What goes wrong:**
`<video autoPlay muted playsInline loop>` looks correct in JSX, works in Chrome desktop, and does nothing on iOS Safari. Inspecting the element in Safari's Web Inspector shows **no `muted` attribute** on the DOM node.

**Why it happens:**
A long-standing React issue (`facebook/react#10389`, `#22045`): React sets `muted` as a **property** rather than emitting the **content attribute**, and depending on ordering the browser's autoplay gate — which is evaluated against the attribute at parse/attach time — sees an unmuted video and blocks it. Safari on iOS requires **both** `muted` and `playsinline` to even consider unattended autoplay.

The repo already ships this exact shape in two places: `app/Attachments.tsx:157-165` and `app/Lightbox.tsx:210-219`. If videos currently autoplay on the author's devices, that is luck-of-ordering, not a guarantee.

**How to avoid:**
Set `muted` imperatively on the element, which is deterministic:

```jsx
const ref = useRef(null);
useEffect(() => {
  if (ref.current) ref.current.muted = true;   // property, before any play()
}, []);
return <video ref={ref} muted playsInline loop preload="none" poster={poster} />;
```

- Keep the JSX `muted` **as well** (belt and braces) and add `playsInline` — note React's prop is camelCase `playsInline`, which *does* emit the lowercase `playsinline` attribute correctly.
- **Always handle the rejected promise from `play()`.** `video.play()` returns a promise that rejects with `NotAllowedError` when the browser blocks autoplay. An unhandled rejection is both a console error and a missed opportunity to fall back to the poster:

  ```js
  el.play().catch(() => { /* leave poster visible, show play affordance */ });
  ```
- Build the UI so a blocked autoplay is **not a broken state**: poster + subtle play indicator. Autoplay must be an enhancement.
- Blocking is not only an iOS story. Chrome's Media Engagement Index can block muted autoplay on low-engagement origins, Chrome's Data Saver / Lite mode suppresses it, and **iOS Low Power Mode disables automatic playback outright**. A portfolio site is by definition a low-engagement origin for first-time visitors.

**Warning signs:**
- No `muted` attribute on the node in Safari Web Inspector.
- Console: "Unhandled Promise Rejection: NotAllowedError: The request is not allowed by the user agent."
- Videos play on desktop and freeze on the first frame on iPhone.

**Phase to address:** **P4**. Also worth back-porting the fix to `Attachments.tsx` and `Lightbox.tsx` in the same phase — same bug, already shipped.

---

### Pitfall 9: `prefers-reduced-motion` is not handled anywhere in the codebase — **[CONFIRMED IN REPO]**

**What goes wrong:**
A visitor with vestibular sensitivity opens the Gallery tab and is met with ~30 simultaneously looping videos and spring-animated tile entrances. This is a genuine accessibility harm, and it is also a WCAG 2.2 concern: content that moves/auto-updates for more than 5 seconds must have a mechanism to pause it (SC 2.2.2 Pause, Stop, Hide). A looping autoplay video grid with no pause control fails that outright.

**Why it happens:**
Verified by grep: **there is no `prefers-reduced-motion` media query and no `useReducedMotion` call anywhere in `app/`.** Meanwhile framer-motion springs are used unconditionally in `Lightbox.tsx:119-133, 146-160, 163-178, 245-253`. The new gallery will naturally follow the same house style and inherit the same gap.

**How to avoid:**
- Treat reduced motion as a **hard gate on autoplay, not a nice-to-have**:
  ```js
  const reduce = useReducedMotion();          // framer-motion, already a dependency
  // ...
  autoPlay={!reduce}
  ```
  When `reduce` is true, render the poster and never call `play()`.
- Add a global fallback in `globals.css`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
  ```
  This also improves the *existing* CV view — a free win.
- Provide a **visible pause-all-motion control** in the gallery toolbar (next to the filter chips). This satisfies SC 2.2.2 for visitors who have not set the OS preference and is roughly ten lines of code.
- Use framer-motion's `useReducedMotion` for the tile-entrance and filter animations too, not only for video.

**Warning signs:**
- macOS System Settings → Accessibility → Display → Reduce motion is on, and the gallery is unchanged.
- No pause control exists for looping media.
- Lighthouse/axe accessibility audit flags auto-updating content.

**Phase to address:** **P4** for the video gate; **P7** for the global CSS fallback and the pause control.

---

### Pitfall 10: Reusing the Lightbox for a second consumer — index, keys, and stale closures — **[CONFIRMED IN REPO]**

**What goes wrong:**
The Gallery opens the Lightbox and it shows the wrong image; or clicking a second tile after closing shows the *previous* tile; or arrow keys advance two items per press; or React throws "Encountered two children with the same key."

**Why it happens — four distinct defects in the current implementation:**

1. **`startingIndex` is captured once, at mount.** `app/Lightbox.tsx:18` — `useState(startingIndex)`. Changing the prop on an already-mounted Lightbox does nothing. `Attachments.tsx:70-80` accidentally does the right thing by conditionally *creating* the element. A Gallery that keeps `<Lightbox>` mounted and flips an `open` prop will show a stale item every time.

2. **Keys are `media.url`.** `app/Lightbox.tsx:102, 109, 140` all key on `media.url`. The gallery is curated by hand — the same asset appearing in two entries (e.g. a hero shot reused) produces **duplicate React keys**, which manifests as images rendering into the wrong slots and pager dots desynchronising from the carousel. The CV view never hit this because each item's `media/` folder has unique filenames by construction.

3. **The keydown listener is `window`-level with `[]` deps.** `app/Lightbox.tsx:49-55` binds `handleKey` to `window` once at mount. `next`/`prev` are safe (they use functional `setState`, lines 57-75), but **`close` is captured from the mount-time render**. More importantly for v1.1: this is a **global** listener with no `stopPropagation` and no capture-phase guard. Filter chips and the tab bar will very reasonably want ArrowLeft/ArrowRight for roving tabindex — with the Lightbox open, **both** handlers fire, so one arrow press moves the lightbox *and* the chip focus.

4. **Divide-by-zero in the mobile scroll handler.** `app/Lightbox.tsx:81` computes `view.scrollLeft / (view.scrollWidth - view.offsetWidth)`. With a single item that denominator is `0` → `NaN` → `setCurrentIndex(NaN)`. A filtered gallery that narrows to exactly one result is a very plausible way to trigger this.

**How to avoid:**
- **Mount/unmount, never toggle.** Copy the `Attachments.tsx:70-80` pattern exactly: build the element only when open, wrap in `<AnimatePresence>`. Add a `key={`${source}-${startingIndex}`}` on the `<Lightbox>` element to force a remount if the index changes while open.
- **Give the Lightbox stable synthetic ids.** Either add an `id` field to gallery entries in **P2** and key on `media.id ?? media.url`, or pass `key={media.url + '-' + index}`. Prefer the former — index-in-key defeats reconciliation during filtering (see Pitfall 12).
- **Scope the keyboard handler.** Render the Lightbox root with `tabIndex={-1}`, focus it on open, and attach `onKeyDown` to that element rather than `window`. Call `event.stopPropagation()`. This fixes double-binding structurally rather than by coordination.
- **Guard the scroll math:** `const denom = view.scrollWidth - view.offsetWidth; if (denom <= 0) return;`
- **The Lightbox must receive the *filtered* array, not the full one.** If the visitor filters to "Branding" and opens item 3, next/prev must traverse the 6 branding items — not all 30. Pass `visibleItems` and the index *within* `visibleItems`. Getting this wrong is subtle and only shows up when filtering is combined with next/prev.
- **Fix the missing focus trap while you're here.** The Lightbox currently has no focus management at all: no focus-on-open, no trap, no focus restoration on close. Tabbing while it is open walks invisibly through the CV behind the backdrop. Add: focus the container on open, trap Tab within it, restore focus to the triggering tile on close, and add `role="dialog" aria-modal="true"` plus an accessible label on the close button (`app/Lightbox.tsx:163-180` renders a `<motion.button>` with **no text content and no `aria-label`** — it is announced as an unlabelled button today).
- **Z-index:** `app/Lightbox.module.css:1-5` uses `z-index: 999`. Keep the sticky tab bar at something small (`z-index: 10`) so it can never paint over the lightbox. Also verify the sticky bar does not create a stacking context that traps the portal — it cannot, since the portal renders to `document.body` (`Lightbox.tsx:182`), but a `transform` or `filter` added to an ancestor *would* trap a `position: fixed` child, so avoid those on the tab bar's ancestors.

**Warning signs:**
- "Encountered two children with the same key" in the console.
- Opening the second gallery item shows the first.
- One arrow press moves two things.
- Tab key focus disappears while the lightbox is open.
- Pager dots highlight the wrong index on mobile.

**Phase to address:** **P6**, with the `media.id` decision made back in **P2**.

---

### Pitfall 11: Masonry layout shift — what build-time dimensions fix, and what they don't

**What goes wrong:**
The grid assembles, then visibly reshuffles once or twice as media loads. On the tab whose entire purpose is visual polish, this reads as broken.

**Why it happens, and what actually fixes it:**

| CLS source | Fixed by build-time `sharp` dimensions? | What to do |
|---|---|---|
| Image with no reserved box collapses to 0px, then jumps to full height | **Yes** | Set `aspect-ratio: W / H` on the tile *container* and `width:100%; height:auto` on the `<img>`. Never rely on `<img width height>` alone. |
| Video with no reserved box | **No** — dimensions are wrong (Pitfall 5) | Fix the loader first; then reserve the slot the same way |
| **Web font swap** | **No** | `layout.tsx:21` loads Switzer from `api.fontshare.com` with `display=swap`. Captions under tiles will reflow when the font swaps, changing tile heights and reshuffling columns. Reserve caption height with a fixed `min-height`/`line-clamp`, or move captions to an overlay so they cannot affect tile height. |
| **JS-measured masonry** (a library, or a `useLayoutEffect` measuring pass) | **No** | This is the big one. Any measure-then-position approach produces a single-column stack on first paint that reorganises after hydration. Use **CSS-only** layout. |
| Scrollbar appearing when the tab's content exceeds the viewport | **No** | `scrollbar-gutter: stable` on `html` |
| Lazy-loaded below-fold images | Yes, if the slot is reserved | `loading="lazy"` + reserved `aspect-ratio` |
| The sticky tab bar being inserted above existing content | **No** | This shifts the *CV* view too. Reserve its height in the layout from first paint; do not conditionally render it. |

**How to avoid:**
- **Use CSS-only masonry.** Two viable options for ~30 items:
  - `column-count` / `column-width` + `break-inside: avoid` — simplest, zero JS, but **fills top-to-bottom per column**, so DOM order ≠ visual reading order. For a curated portfolio where order is editorial, this is a real content problem and also an a11y/tab-order problem. Verify the owner accepts column-major ordering.
  - CSS Grid with `grid-auto-rows: 8px` and a per-tile `grid-row: span N` computed **at build time** from the known aspect ratio. Preserves left-to-right reading order, still zero runtime measurement, and works perfectly with a static export. **This is the recommended approach here** precisely because dimensions are known at build.
  - Native CSS `masonry` / `grid-template-rows: masonry` is still not broadly shipped — do not depend on it.
- Avoid a JS masonry library entirely. `react-scrollbooster` is already the one bit of layout JS in the codebase and it required a `useResizeObserver` scaffold to keep in sync (`Attachments.tsx:63-68`); do not add a second.
- Measure with Lighthouse or a `PerformanceObserver` for `layout-shift` on `#gallery` — target CLS < 0.1.

**Warning signs:**
- Tiles visibly reflow after load.
- Lighthouse CLS > 0.1 on the gallery tab.
- The grid is a single column for a beat before snapping into place.

**Phase to address:** **P3**, with the span-computation depending on **P2**'s correct dimensions.

---

### Pitfall 12: Filtering + masonry — reconciliation bugs and re-layout thrash

**What goes wrong:**
Clicking a tag chip produces images swapped between slots, videos that restart or keep playing after being filtered out, a visible flash-of-everything before the filter applies, or a janky multi-hundred-millisecond reflow on each chip press.

**Why it happens:**
- **Index-based keys.** `key={index}` (or `key={url + index}`) means filtering changes which key maps to which item. React reuses DOM nodes across different content: an `<img>` keeps its old `src` for a frame, a `<video>` keeps playing the wrong clip, and CSS transitions animate between unrelated images.
- **Unmounting instead of hiding.** Removing filtered-out tiles from the DOM forces a full column recomputation and destroys/recreates video elements — the most expensive DOM operation on the page.
- **framer-motion `layout` animations on 30 tiles.** `layout` / `<AnimatePresence>` on a masonry grid triggers per-frame FLIP measurement of every tile. This is exactly where "smooth on desktop, unusable on mobile" comes from.
- **Multi-select ambiguity.** Nobody decides up front whether chips are single-select or multi-select AND/OR, and the implementation ends up inconsistent with the visual design.

**How to avoid:**
- **Stable content-derived ids.** Add an explicit `id` to every gallery entry in **P2** (derived from its directory name, exactly like `generateItemId` at `contentLoader.ts:90-96`). Key on that id and only that id. Never on array index.
- **Render all tiles always; hide filtered-out ones with CSS.** `display: none` on a non-matching tile keeps its DOM node, its decoded image, and its React identity. With a CSS-Grid-span masonry the remaining tiles re-flow natively — no JS, no measurement. At ~30 items the memory cost is trivial and the correctness win is large.
- **Pause hidden videos explicitly.** `display: none` does *not* stop a `<video>` from playing or downloading. Pause every non-matching video when the filter changes, or the "invisible" tiles keep burning battery.
- **Keep filter animation to opacity/scale only** — properties that run on the compositor. Do not use framer-motion `layout` on the grid. If tiles must animate into place, cap it at a short `transition: opacity 150ms` and test on a real phone.
- **Decide the filter semantics in the phase brief:** single-select with an "All" chip is the right default for ~30 items and 4-8 tags. Multi-select OR is defensible; multi-select AND will frequently produce zero results and needs an empty state.
- **Design the empty state before building the filter.** A tag that matches nothing must say so, not render a blank tab.
- **Reflect filter state in the URL or explicitly don't.** The hash is already carrying `#gallery`. Either extend it (`#gallery/branding`) or decide filters are ephemeral — but decide, and put it in the acceptance criteria. Ephemeral is the smaller, defensible choice for v1.1.

**Warning signs:**
- Wrong image briefly visible in a slot after filtering.
- Audio-less video continues playing after being filtered out (check `document.querySelectorAll('video')` and inspect `.paused`).
- Chip clicks feel laggy; Performance panel shows long "Recalculate Style" / "Layout" tasks.
- Console key warnings.

**Phase to address:** **P5**, with the stable-id decision made in **P2** and the CSS-hiding strategy established in **P3**.

---

### Pitfall 13: The committed 99 MB `out/` directory — **[CONFIRMED IN REPO, currently broken]**

**What goes wrong:**
Every code change produces a second diff of hundreds of generated files. PRs become unreviewable, merges conflict on binary and hashed-filename assets, and — worst case — someone resolves a conflict by keeping a stale `out/` and **ships an old build**.

**Why it happens:**
`out/` is tracked. It is currently **99 MB across 118 tracked paths**, and it contains a full copy of `public/`, including `public/content/backup-media.bak/` — roughly half the media bytes, shipped to production for no reason.

**This is already broken right now.** `git status` shows the working tree mid-migration: every Webpack-era chunk (`webpack-c8fea456a7af0230.js`, `framework-372c62845e5ba996.js`, …) deleted, and a parallel set of Turbopack chunks (`turbopack-0xd61oejbnjpu.js`, `0cz1d0mv5g_q7.js`, …) untracked. **The committed `out/` does not correspond to the committed source.** Starting a multi-phase milestone on top of that guarantees confusing diffs.

**How to avoid:**
- **Resolve the current desync before writing any v1.1 code.** Run a clean `npm run build`, commit the resulting `out/` as a single dedicated commit with a message that says exactly that, and get to a state where `out/` matches `HEAD`.
- **Then decide the policy.** Strongly recommended: **stop committing `out/`.** Cloudflare Pages builds from source; there is no technical reason for the artefact to be in git. `git rm -r --cached out && echo "out/" >> .gitignore` and set the Pages build command to `npm run build`, output directory `out`. This removes an entire class of merge pain from a six-phase milestone. Confirm with the owner that Pages is configured to build rather than to deploy a prebuilt directory before doing this.
- **If `out/` must stay committed:** rebuild-and-commit as a **separate, final commit per phase**, never mixed with source changes. Add `out/** linguist-generated=true` and `out/** -diff` to `.gitattributes` so GitHub collapses it and git stops attempting textual merges. Review PRs with `?w=1&files=app` or `git diff -- . ':!out'`.
- **Delete or relocate `public/content/backup-media.bak/` regardless.** Anything under `public/` is copied verbatim into the export. Move it outside `public/` (or out of the repo). This alone roughly halves the deployed payload and the `out/` diff.

**Warning signs:**
- `git status` shows `out/` changes you did not intend.
- A PR diff claims 100+ changed files for a one-line CSS edit.
- Merge conflicts in `out/_next/static/chunks/*`.
- Production serves a stale build after a merge.

**Phase to address:** **P0**, before any feature work. This is cheap now and expensive later.

---

### Pitfall 14: No test framework — regressions to the shipped CV view go unnoticed

**What goes wrong:**
Phase 5 changes a shared CSS custom property or the scroll-lock helper, and the CV view's attachment strip breaks on mobile Safari. Nobody notices for three phases because everyone has been staring at the Gallery tab.

**Why it happens:**
Verification is entirely manual and visual (`PROJECT.md` constraints), and the shared surface between old and new is larger than it looks: `globals.css` (Pitfall 1 modifies it), `Lightbox.tsx` (Pitfall 2, 3, 10 all modify it), `getThumbnailUrl` (Pitfall 6 extracts it), and `contentLoader.ts` (Pitfall 5 modifies it). **Four of the highest-value fixes in this document touch code the CV view depends on.**

**How to avoid:**
- **Write a CV-view regression checklist once, in P0, and re-run it at the end of every phase.** It costs about three minutes and is the single highest-leverage process change available here. Minimum contents:
  - [ ] CV renders all sections; year column alignment intact (`Profile.module.css:97-113` uses a `::before` ghost-text trick that is fragile to font/size changes)
  - [ ] Attachment strips scroll horizontally on desktop (scrollbooster) and swipe on mobile
  - [ ] Attachment thumbnails load (prod) / load unproxied (dev)
  - [ ] Lightbox opens from a CV attachment, arrows work, Esc closes, backdrop click closes
  - [ ] `document.body.getAttribute('style')` is empty after closing the lightbox
  - [ ] No horizontal scrollbar at 320px, 480px, 768px, 1440px
  - [ ] Light **and** dark mode (`prefers-color-scheme`) — the gallery must theme through the `globals.css` custom properties, not hardcoded colours
  - [ ] Zero console errors/warnings on load and after one lightbox cycle
- **Consider adding Playwright with 3-4 screenshot tests** rather than a unit framework. For a visual, static site this is a far better fit than Vitest, runs against `out/` after `next build`, and catches exactly the class of regression that matters. Roughly a half-day. If that is too much for v1.1, at minimum add it as a follow-up requirement.
- **Do not skip the manual dark-mode pass.** Every new colour in the gallery must come from `globals.css` custom properties. Note `Lightbox.module.css:39` already references `var(--transparent-border)` while `globals.css:12` defines `--transparentBorder` — **a real dead variable, silently falling back to nothing.** Don't add more.

**Warning signs:**
- A phase ships with "I only touched the gallery" in the commit message but the diff includes `globals.css` or `Lightbox.tsx`.
- Dark mode was never opened during a phase.
- Nobody loaded the site on a real phone.

**Phase to address:** Checklist authored in **P0**; executed as an exit gate on **every** phase. Playwright is a **P7** stretch or a v1.2 requirement.

---

### Pitfall 15: Hand-rolled tabs and chips ship without ARIA

**What goes wrong:**
The tab bar is `<div>`s with `onClick`. It cannot be reached by keyboard, screen readers announce nothing, and the filter chips give no indication of which are active beyond colour — which also fails colour-contrast-only signalling.

**Why it happens:**
No UI library, all components custom (`PROJECT.md` constraints), and the existing codebase has no ARIA precedent to copy — `Lightbox.tsx:163-180` ships an unlabelled close button, and `Lightbox.tsx:268-269` ships two unlabelled nav buttons. The house style genuinely does not include accessibility today, so the new code will inherit that unless it is made an explicit acceptance criterion.

**How to avoid:**

*Tabs* — implement the WAI-ARIA Tabs pattern properly; it is about 30 lines:
- Container `role="tablist"`, each tab `role="tab"` with `aria-selected` and `aria-controls`, each panel `role="tabpanel"` with `aria-labelledby` and `tabIndex={0}`.
- **Roving tabindex:** exactly one tab has `tabIndex={0}`, the rest `tabIndex={-1}`. ArrowLeft/ArrowRight move focus *and* selection (automatic activation is correct for 2 cheap tabs); Home/End jump to first/last.
- Use real `<button type="button">` elements. Do not put `role="tab"` on an `<a href="#gallery">` — an anchor and a tab have different keyboard contracts, and it re-introduces the fragment-jump problem from Pitfall 4.
- **Coordinate with the Lightbox's window-level arrow-key handler** (Pitfall 10.3) or the two will fight.

*Filter chips* — chips are **not** tabs:
- Single-select: `role="radiogroup"` + `role="radio"` with `aria-checked`, or simply `<button aria-pressed>`.
- Multi-select: `<button type="button" aria-pressed={active}>`.
- Announce the result count in an `aria-live="polite"` region ("12 items"), otherwise a screen-reader user gets no feedback that anything happened.
- Active state must be conveyed by more than colour — a border, a checkmark, or a filled background all work.

*Also*
- `role="tabpanel"` should be `tabIndex={0}` so keyboard users can scroll the panel.
- The `alt=""` on every gallery image is defensible only if the tile is decorative; since gallery entries have **captions** in the content model, use the caption as `alt` (or as a visible `<figcaption>` in a `<figure>`).
- Visible focus rings. `globals.css` has no `:focus-visible` styling; add one globally — it improves the CV view too.
- Run axe DevTools on both tabs before calling the milestone done.

**Warning signs:**
- Tab key does not reach the tab bar or the chips.
- VoiceOver announces "button" with no name or state.
- Active chip differs from inactive only in background colour.
- `role="tab"` on an `<a>`.

**Phase to address:** ARIA for tabs in **P1** (build it right the first time — retrofitting roving tabindex is worse than writing it), chips in **P5**, focus-visible + axe sweep in **P7**.

---

### Pitfall 16: The whole content tree is serialised into the HTML twice

**What goes wrong:**
`out/index.html` grows past a few hundred KB and time-to-first-render on the CV view — currently excellent — degrades. The regression is invisible locally on fast hardware.

**Why it happens:**
`app/page.tsx:6-12` is a server component that loads the *entire* CV object and passes it as a single prop into `Profile`, which is `"use client"` (`Profile.tsx:1`). Everything crossing that boundary is serialised into the RSC flight payload and inlined into the static HTML. Today: `out/index.html` is 65 KB and `out/index.txt` is 20 KB. Adding ~30 gallery entries with captions, tags, urls, and dimensions grows both, and because `Profile` is a client component the data is effectively shipped twice (once as HTML, once as flight data).

**How to avoid:**
- Keep gallery entries **lean**: `id`, `url`, `type`, `width`, `height`, `caption`, `tags`. Resist adding anything speculative — `PROJECT.md` already scoped out per-item links and years, which helps.
- Do **not** widen the boundary further. Consider narrowing it instead: `Profile` is `"use client"` only because it renders `Attachments`; pushing the client boundary down to the leaves would shrink the payload. Out of scope for v1.1, but note it rather than making it worse.
- Watch `wc -c out/index.html` before and after each phase. Set a soft budget (~150 KB) and flag if exceeded.
- Precompute the masonry grid spans at build time (Pitfall 11) — that is a small number per item, far cheaper than shipping a layout library.

**Warning signs:**
- `out/index.html` grows disproportionately to the content added.
- Lighthouse flags a large DOM or excessive main-thread parse time.

**Phase to address:** **P2** (keep the schema lean), monitored in **P7**.

---

### Pitfall 17: Documentation drift compounds — **[CONFIRMED IN REPO]**

**What goes wrong:**
An executor reads `CLAUDE.md`, believes the project is on Next.js 15 with Webpack, and reaches for guidance that no longer applies. Turbopack-specific behaviour (different chunk naming — visible in the current `out/` desync — and different CSS-module output) causes confusing errors.

**Why it happens:**
`CLAUDE.md` states "Next.js 15 (App Router)". Verified installed versions: **`next@16.3.0`, `react@19.0.0`**. `next.config.ts:22-25` pins a Turbopack workspace root. `CLAUDE.md` also documents `npm run lint` as ESLint, but there is **no ESLint config or `eslint` dependency in `package.json`** — that script will fail if anyone runs it.

**How to avoid:**
- Fix `CLAUDE.md` in **P0**: correct the Next version, note Turbopack, remove or fix the lint script claim, and **add the two pieces of tribal knowledge this milestone surfaces**: (a) `/cdn-cgi/image/` only works on the production custom domain — see the dev bypass flag; (b) `globals.css` must use `overflow-x: clip`, not `hidden`, or sticky positioning breaks.
- Either add ESLint properly or remove the script. A lint command that errors out is worse than none.

**Warning signs:**
- `npm run lint` errors.
- Advice in a plan references Webpack config or `next/font` behaviour that doesn't match reality.

**Phase to address:** **P0**, revisited at milestone close.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|---|---|---|---|
| Leave `overflow-x: hidden` and wrap the tab bar in a `position: fixed` shim instead | Sticky "works" without touching shared CSS | Fixed bar doesn't respect the 540px content column, needs manual offset maths at every breakpoint, and the underlying overflow bug stays to bite the next feature | **Never.** The `clip` fix is one word. |
| Ship the naive `Lightbox` scroll-lock unchanged (`Lightbox.tsx:29-32`) | Zero risk to CV view today | Non-deterministic sticky behaviour; makes every subsequent sticky/overflow bug unreproducible | **Never** — it directly invalidates the Pitfall 1 test |
| Hardcode video aspect ratio to 16:9 in the gallery | Skips build-tooling work in P2 | Portrait video is visibly wrong on the marquee feature; fixing later means touching the loader, the data, and the grid | Only if the curated set is verified all-landscape **and** the loader throws on anything else |
| Autoplay all videos with no viewport gating (mirroring `Attachments.tsx:157-165`) | Simplest possible code, matches house style | Unusable on mobile; battery/thermal complaints; the feature reads as broken on the device most visitors use | Only with ≤ 4 videos total in the gallery |
| Use `column-count` CSS masonry | Ten lines, zero JS, ships today | Column-major fill breaks editorial reading order and DOM/tab order | Acceptable if the owner explicitly OKs column-major ordering; otherwise use grid-span |
| Key gallery tiles on array index | Nothing — same effort as an id | Wrong images in wrong slots the moment filtering exists | **Never** |
| Keep committing `out/` | No Cloudflare config change | Unreviewable PRs and merge-conflict risk across a 6-phase milestone; already desynced | Only if Pages is genuinely configured for prebuilt deploys — verify, don't assume |
| Ship without a focus trap in the Lightbox | Matches existing behaviour | Keyboard users get lost behind a modal backdrop; the Gallery makes the lightbox a primary interaction, not an incidental one | Only if explicitly deferred to a v1.2 accessibility requirement |
| Skip `prefers-reduced-motion` | Saves ~20 lines | WCAG 2.2.2 failure on the flagship feature; a portfolio site being inaccessible is reputationally self-defeating | **Never** for a 30-video autoplay grid |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|---|---|---|
| **Cloudflare Image Resizing** | Assuming `/cdn-cgi/image/` works everywhere | Verified: **does not work on `*.pages.dev`**, does not exist in `next dev`. Gate behind an env flag defaulting off outside production. |
| **Cloudflare Image Resizing** | Piping `<video>` src through it | It transforms images only. Videos use raw `/content/...` URLs; use CF Image Resizing for the **poster** frame instead. |
| **Cloudflare Image Resizing** | Passing fixed `width` **and** `height` (as `Attachments.tsx:18` does) for a ratio-preserving grid | Pass `width` only plus `fit=scale-down,format=auto`; let height follow the source ratio |
| **Cloudflare Pages `_headers`** | Assuming new gallery media is covered | `public/_headers` matches `/content/media/*` — the actual paths are `/content/010-gallery/<item>/media/*`, so that rule already misses. The `/*.jpg`, `/*.png`, `/*.mp4`, `/*.webp` rules do cover it, but `.mov`, `.gif`, `.avif` and `.jpeg` are **not** listed. Add them, or replace with `/content/*`. |
| **`next/image` with `unoptimized: true`** | Expecting `quality` / `sizes` / srcset generation to do anything | They are no-ops. All sizing must be expressed in the `/cdn-cgi/image/` URL. Consider plain `<img>` for gallery tiles — `next/image` adds no value here and adds constraints. |
| **framer-motion 11 + React 19** | Adding `layout` animations to a 30-item grid | Compositor-only properties (`opacity`, `transform`) only. Use `useReducedMotion` from the same package. |
| **`react-scrollbooster`** | Trying to reuse it for the gallery | It is a horizontal-drag helper for the CV attachment strip and needs a `useResizeObserver` scaffold (`Attachments.tsx:37-68`). The masonry grid scrolls vertically and natively — do not involve it. |
| **`sharp`** | Assuming it reads video | `contentLoader.ts:139` only calls it for `mediaType === 'image'` — verified. Video needs a separate path. |
| **Fontshare CDN** | Ignoring `display=swap` reflow (`layout.tsx:21`) | Reserve caption heights so the font swap cannot reshuffle masonry columns. Consider `size-adjust` metrics or self-hosting the font. |
| **Browser history** | `pushState` on every tab click | Back button then requires N presses to leave the page. Use `replaceState` for tab switches unless Back-undoes-tab is a stated requirement. |

---

## Performance Traps

| Trap | Symptoms | Prevention | When it breaks |
|---|---|---|---|
| N simultaneous autoplay videos | Device heat, fps collapse, tab discard on iOS | IntersectionObserver + cap ~3-4 concurrent; poster-first; no autoplay on mobile | Noticeable at ~5 videos on mid-range mobile; severe at ~10 |
| Unoptimised source media | Multi-MB page; slow first paint on 4G | Byte budget in the content model: images ≤ 500 KB source, videos ≤ 2 MB. Repo already has a **6.5 MB MP4** and **4 MB PNGs** | Immediately on mobile networks |
| `backup-media.bak/` inside `public/` | 99 MB `out/`, doubled build and deploy time | Move outside `public/` | Already broken |
| All 30 tiles eager-loading | Huge initial burst, tab feels slow | `loading="lazy"` + reserved `aspect-ratio`; eager only the first ~6 | ~15+ items |
| framer-motion `layout` on the grid | Long Layout/Recalculate-Style tasks on chip click | Opacity/transform only; no `layout` prop | ~20+ animated children |
| Filtering by unmounting | Video teardown/re-create cost; column recompute | `display: none` + explicit `pause()` | Any grid with video |
| Both tabs' DOM always mounted | Doubled node count; gallery media loads for CV-only visitors | Mount the Gallery panel lazily on first activation, then keep it mounted (so re-switching is instant). **Do not** keep it mounted from first paint. | Immediately — this is a regression to the CV view's load time |
| Growing flight payload (Pitfall 16) | `out/index.html` bloat | Lean gallery schema; watch `wc -c out/index.html` per phase | Above ~150 KB HTML |

---

## Security Mistakes

Attack surface is genuinely small — a static site with no auth, no forms, no user input, no server runtime. Still worth noting:

| Mistake | Risk | Prevention |
|---|---|---|
| Rendering gallery captions through `react-markdown` with `rehype-raw` | Raw HTML injection from content files | Don't add `rehype-raw`. Captions are plain text; if markdown is wanted, keep the default sanitising behaviour. Check `RichText.tsx` before reusing it for captions. |
| Unbounded `/cdn-cgi/image/` params from data | An attacker-supplied content file could request enormous transforms (billing/DoS on the CF account) | Content is repo-authored so risk is near-zero, but construct CDN URLs from a **fixed allowlist of widths** in code, never interpolate values from `item.json` |
| Shipping `backup-media.bak/` to production | Unintended publication of files never meant to be public | Move out of `public/`. Anything under `public/` is served — treat that directory as fully public by definition. |
| `target="_blank"` without `rel="noopener"` | Reverse-tabnabbing | Modern browsers imply `noopener`, but existing links (`Profile.tsx:81, 124`) lack it. Add `rel="noopener noreferrer"` if the gallery introduces outbound links. |
| Leaking branch info via `NEXT_PUBLIC_GIT_BRANCH` | Trivial info disclosure | Already shipped and harmless; just don't extend the pattern to anything sensitive — `next.config.ts:26-28` values are **inlined into public JS**. |

---

## UX Pitfalls

| Pitfall | User Impact | Better approach |
|---|---|---|
| Tab switch resets scroll to top, or preserves the *other* tab's scroll | Disorienting; returning to CV loses the visitor's place | Store each tab's `scrollY` and restore on re-activation. Test explicitly — this is the most-noticed tab bug. |
| `#gallery` deep link shows the CV for a beat | Looks broken to anyone sharing the link | Unavoidable in static export; keep it to a single frame and never mask it with a full-page loading gate |
| No visible loading state for a 30-tile grid | Blank rectangles on slow connections | Reserved slots (Pitfall 11) tinted with `var(--wash2)` — the pattern `Attachments.module.css:.media` already uses |
| Autoplaying video with no way to stop it | Actively hostile on metered connections and for motion-sensitive visitors | Reduced-motion gate + a visible pause control (Pitfall 9) |
| Filter chips with no result count and no empty state | Visitor can't tell if a filter did anything | Show counts on chips or a live "N items" line; design the empty state |
| Filter state lost on tab switch | Visitor filters, checks the CV, comes back to an unfiltered grid | Persist filter state in component state that survives the tab toggle (keep the panel mounted after first activation) |
| Lightbox next/prev traverses all 30 items while a filter is active | Breaks the visitor's mental model | Pass the filtered array (Pitfall 10) |
| Tab bar occupying too much vertical space on mobile | Pushes the header content off a small screen | Keep it compact; the CV is the primary content and must not regress |
| Gallery has no captions visible without opening the lightbox | Grid reads as decoration rather than portfolio | Show captions on hover/focus (desktop) and always or on tap (mobile); ensure caption text does not affect tile height (Pitfall 11) |

---

## "Looks Done But Isn't" Checklist

- [ ] **Sticky tab bar:** verified sticky *after* a lightbox open/close cycle, not just on fresh load (Pitfall 2)
- [ ] **Hash tabs:** hard-reload on `/#gallery` and on `/` both hydrate with a clean console; Back/Forward work
- [ ] **Hash tabs:** no element carries `id="gallery"` (would cause a native fragment jump)
- [ ] **Masonry:** portrait *videos* sized correctly, not just portrait images (Pitfall 5)
- [ ] **Masonry:** CLS measured < 0.1 with a throttled network, not just eyeballed on a fast machine
- [ ] **Video:** `muted` attribute confirmed present on the DOM node in **Safari** Web Inspector (Pitfall 8)
- [ ] **Video:** `play()` promise rejection handled; no unhandled rejections in console
- [ ] **Video:** tested on a real iPhone, including Low Power Mode
- [ ] **Video:** filtered-out videos are actually paused, not merely `display: none`
- [ ] **Reduced motion:** OS setting on → no autoplay, no springs; a pause control exists regardless
- [ ] **Filter:** stable ids used as React keys — grep for `key={index}`
- [ ] **Filter:** empty state designed and reachable
- [ ] **Lightbox:** opened from **both** a CV attachment and a gallery tile in the same session; index correct in both
- [ ] **Lightbox:** next/prev respects the active filter
- [ ] **Lightbox:** Esc closes, focus returns to the triggering tile, Tab is trapped while open
- [ ] **Lightbox:** arrow keys don't also move filter-chip focus (Pitfall 10.3)
- [ ] **Lightbox:** close button has an `aria-label` (`Lightbox.tsx:163-180` currently has none)
- [ ] **CDN:** gallery images load on the production custom domain **and** are visible in local dev via the bypass
- [ ] **CDN:** `public/_headers` covers the real gallery media paths and extensions
- [ ] **Dark mode:** every new colour comes from a `globals.css` custom property; no hardcoded hex; no typo'd variable names (cf. the dead `--transparent-border` at `Lightbox.module.css:39`)
- [ ] **A11y:** keyboard-only pass across tabs → chips → tiles → lightbox → close; axe reports zero criticals
- [ ] **Regression:** full CV-view checklist re-run (Pitfall 14)
- [ ] **Build:** `out/` regenerated and committed as its own commit, matching source
- [ ] **Docs:** `CLAUDE.md` updated with the gallery content structure, the CDN dev flag, and the `overflow-x: clip` requirement

---

## Recovery Strategies

| Pitfall | Recovery cost | Recovery steps |
|---|---|---|
| Sticky bar not sticking (Pitfall 1) | **LOW** | One-word CSS change (`hidden` → `clip`) + regression sweep of the CV view at 4 breakpoints |
| Scroll-lock clobbering (Pitfall 2) | **LOW** | Rewrite the effect to capture/restore `overflowY`; ~10 lines |
| Hydration mismatch (Pitfall 4) | **LOW-MEDIUM** if caught in P1; **HIGH** if the tab shell is built on `useState(window…)` and every downstream component assumes synchronous hash access | Convert to `useSyncExternalStore` with `getServerSnapshot`. Catch it in P1. |
| Wrong video dimensions (Pitfall 5) | **MEDIUM** — touches loader, content files, and grid spans | Add a video-dimension probe to `contentLoader`; rebuild; re-verify every gallery tile |
| CDN broken locally (Pitfall 6) | **LOW** | Extract the helper + env flag; ~20 lines |
| Video performance collapse (Pitfall 7) | **MEDIUM-HIGH** — may require re-encoding source media and rearchitecting the tile component | Add IntersectionObserver gating + posters; re-encode over-budget assets. Prevent by setting the byte budget in P2. |
| Wrong images after filtering (Pitfall 12) | **LOW** if ids exist; **MEDIUM** if the content model has no ids and must be regenerated | Add ids in the loader (mirror `generateItemId`), swap keys, retest |
| Lightbox index/regression bugs (Pitfall 10) | **MEDIUM** — must re-verify the CV view too, since the component is shared | Mount/unmount pattern, scoped key handler, guarded scroll math, pass filtered array |
| `out/` merge conflict | **LOW** per incident, **HIGH** cumulatively | `git checkout --ours out && npm run build && git add out`. Prevent by untracking in P0. |
| Accessibility retrofit (Pitfall 15) | **MEDIUM** — roving tabindex is invasive to retrofit | Build it correctly in P1/P5; retrofitting means rewriting the tab component |

---

## Pitfall-to-Phase Mapping

| # | Pitfall | Prevention phase | Verification |
|---|---|---|---|
| 13 | Committed `out/` desync | **P0** | `git status` clean after a fresh `npm run build`; policy decision recorded |
| 6 | `/cdn-cgi/image/` local + preview breakage | **P0** (extract) → **P3** (apply) | Images render on `localhost:3000`; `/cdn-cgi/` requests present only in prod builds |
| 3 | Missing `"use client"` in `Lightbox.tsx` | **P0** | Directive present; `npm run build` green |
| 17 | CLAUDE.md drift (Next 15 vs 16, phantom lint) | **P0** | Doc states 16.3 + Turbopack; lint script fixed or removed |
| 14 | No regression safety net | **P0** (author checklist) → every phase (execute) | Checklist committed to `.planning/`; re-run recorded at each phase exit |
| 1 | `overflow-x: hidden` kills sticky | **P1** (first task) | Tab bar sticks; no horizontal scrollbar at 320/480/768/1440; lightbox still full-viewport |
| 2 | Scroll-lock writes `overflow: unset` | **P1** | `document.body.getAttribute('style')` empty after close; sticky identical before/after a lightbox cycle |
| 4 | Hash read during render | **P1** | Clean console on hard-reload of `/` and `/#gallery`; Back/Forward correct |
| 15a | Tabs missing ARIA / roving tabindex | **P1** | Keyboard-only tab switch; VoiceOver announces tab name + selected state |
| 5 | Video dimensions hardcoded 1920×1080 | **P2** | Every gallery video's data shows its true dimensions; loader warns loudly on fallback |
| 12a | Missing stable ids | **P2** | Every gallery entry has a unique `id`; no `key={index}` anywhere |
| 16 | Flight-payload bloat | **P2** | `wc -c out/index.html` within budget |
| 7b | Media byte budget | **P2** (rule) → **P4** (enforce) | No gallery asset exceeds budget; total `#gallery` transfer < ~5 MB |
| 11 | Masonry CLS | **P3** | Lighthouse CLS < 0.1 on throttled network; spans computed at build |
| 8 | React `muted` not reflected | **P4** | `muted` attribute visible in Safari Web Inspector; autoplay works on a real iPhone |
| 7 | N-video decode/battery collapse | **P4** | ≤ 4 videos playing concurrently; no thermal throttling during a 60s scroll on device |
| 9 | `prefers-reduced-motion` unhandled | **P4** (video gate) → **P7** (global CSS + pause control) | Reduce-motion on → posters only, no springs; pause control present |
| 12 | Filter reconciliation + thrash | **P5** | Rapid chip toggling shows no wrong images; no long Layout tasks; filtered videos paused |
| 15b | Chips missing ARIA/state | **P5** | `aria-pressed` correct; live region announces result count; active state not colour-only |
| 10 | Lightbox reuse regressions | **P6** | Lightbox correct from both consumers in one session; filter-aware next/prev; focus trapped and restored; no duplicate-key warnings |
| — | Full CV-view regression | **P7** (final) | Complete checklist, light + dark, real mobile device, axe clean |

---

## Sources

**Repository (primary, read directly — HIGH confidence):**
- `app/globals.css:55-59` — `html, body { max-width: 100vw; overflow-x: hidden }` (sticky-breaking)
- `app/globals.css` (full file) — no `prefers-reduced-motion`, no `:focus-visible`; `--transparentBorder` defined at line 12
- `app/Lightbox.tsx:18, 27-32, 49-55, 81, 95-114, 163-180, 198, 210-219, 265-270` — no `"use client"`, scroll-lock cleanup, window-level keydown, url-keyed children, render-time `window`/`isMobile()`, unlabelled buttons
- `app/Lightbox.module.css:1-5, 39` — `z-index: 999`; dead `var(--transparent-border)` (name mismatch)
- `app/Attachments.tsx:16-20, 148-165` — unconditional `/cdn-cgi/image/`, no-op `quality` prop, ungated `<video autoPlay>`
- `app/Attachments.module.css` — mobile negative-margin bleed under `max-width: 480px`
- `app/lib/contentLoader.ts:13-16, 135-145, 90-96` — silent dimension fallback; video dimensions hardcoded 1920×1080; `generateItemId` pattern
- `app/Profile.tsx:1, 19-26, 81, 124`; `app/page.tsx:5-13`; `app/layout.tsx:19-27`; `app/isMobile.tsx:6-30`; `next.config.ts:16-29`; `public/_headers`; `package.json`
- Verified installed: `next@16.3.0`, `react@19.0.0`; `out/` = 99 MB / 118 tracked paths; `git status` shows Webpack→Turbopack chunk desync; largest media 6.5 MB MP4 and 4 MB PNG

**External (MEDIUM-HIGH confidence, cross-checked):**
- [CSS `position: sticky` not working? Try `overflow: clip`, not `overflow: hidden` — Terluin Webdesign](https://www.terluinwebdesign.nl/en/blog/position-sticky-not-working-try-overflow-clip-not-overflow-hidden/)
- [Dealing with overflow and `position: sticky` — CSS-Tricks](https://css-tricks.com/dealing-with-overflow-and-position-sticky/)
- [csswg-drafts #865 — sticky inside `overflow: hidden|auto` ancestors](https://lists.w3.org/Archives/Public/public-css-archive/2022Feb/0226.html)
- [facebook/react #10389 — `<video>` `muted` attribute needed but not guaranteed by React](https://github.com/facebook/react/issues/10389)
- [react/react #22045 — HTML `<video>` doesn't work with `muted` attribute](https://github.com/react/react/issues/22045)
- [facebook/react #32975 — React 19 `suppressHydrationWarning` behaviour change](https://github.com/facebook/react/issues/32975)
- [Avoiding hydration mismatches with `useSyncExternalStore` — TkDodo](https://tkdodo.eu/blog/avoiding-hydration-mismatches-with-use-sync-external-store)
- [Next.js — Text content does not match server-rendered HTML](https://nextjs.org/docs/messages/react-hydration-error)
- [Cloudflare Community — Image resizing `/cdn-cgi/` on a pages.dev project (requires custom domain)](https://community.cloudflare.com/t/images-cdn-cgi-on-pages-dev-project/843481)
- [Cloudflare Images — Troubleshooting](https://developers.cloudflare.com/images/reference/troubleshooting/)
- [Cloudflare Images — Serve images from custom domains](https://developers.cloudflare.com/images/optimization/hosted-images/serve-from-custom-domains/)
- [Mux — Best practices for video playback](https://www.mux.com/articles/best-practices-for-video-playback-a-complete-guide-2025)
- [SiteLint — Fixing HTML video autoplay, blank poster, and performance in Safari/iOS](https://www.sitelint.com/blog/fixing-html-video-autoplay-blank-poster-first-frame-and-improving-performance-in-safari-and-ios-devices)
- [W3C WCAG 2.2 — F93: Failure due to auto-playing content](https://www.w3.org/WAI/WCAG22/Techniques/failures/F93.html)

**Confidence caveats:**
- The exact interaction of `overflow-x: hidden` on `html` **and** `body` simultaneously (viewport propagation) has browser-specific nuance. The *fix* (`overflow-x: clip`) is correct regardless; the phase-1 verification step exists precisely so this is confirmed empirically rather than assumed. — MEDIUM on mechanism, HIGH on remedy.
- Concurrent-video decode limits on iOS are device-dependent and not authoritatively documented. Thresholds cited are heuristic. — MEDIUM.
- The claim that `element.style.overflow = 'unset'` computes to `visible` and overrides author styles follows directly from CSS cascade + `unset`-on-non-inherited-property semantics — HIGH, and trivially verifiable in DevTools.

---
*Pitfalls research for: hash-tabbed masonry gallery added to an existing statically-exported Next.js 16 / React 19 portfolio*
*Researched: 2026-08-08*
