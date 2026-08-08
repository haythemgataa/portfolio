# Phase 1: Verifiable Baseline - Research

**Researched:** 2026-08-08
**Domain:** Next.js 16 (Turbopack) static export — build-time env gating, App Router client boundaries, DOM scroll-lock lifecycle, manual regression tooling
**Confidence:** HIGH — every mechanical claim in this document was reproduced in an isolated copy of this project against the real `node_modules`. No claim about this repo rests on training data.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**CDN dev bypass (BUILD-01)**

- **D-01:** The `/cdn-cgi/image/...` prefix is decided at **build time**, not runtime. `output: 'export'` bakes the URL string into the emitted HTML — there is no runtime branch available. Any design that defers the decision to the browser is wrong for this codebase.
- **D-02:** The switch reuses the **existing `NEXT_PUBLIC_GIT_BRANCH` signal** that `next.config.ts` already computes (from `CF_PAGES_BRANCH`, falling back to `git rev-parse`). No new independent user-facing flag is introduced.
- **D-03:** The prefix is applied only when the branch is the production branch **AND** the process is a Cloudflare Pages build — gate on `CF_PAGES` being present. This is what distinguishes "production build" from "working locally on `main`", which would otherwise reproduce the exact bug being fixed. Consequence: a local `npm run build && npx serve out` also bypasses the CDN and shows real images, and `dev`-branch `*.pages.dev` previews bypass it too (Cloudflare Image Resizing does not work on `pages.dev` subdomains at all — see PITFALLS.md Pitfall 6).
- **D-04:** `getThumbnailUrl` is **extracted** from `app/Attachments.tsx:16` into `app/lib/cdnImage.ts`, shared going forward. Phase 5 extends it for masonry tiles.
- **D-05:** The extracted helper emits **byte-for-byte identical URLs** for CV attachments — the existing square `width = height = maxHeight * 2`, `quality=50`, `format=auto`. The known-wrong square hardcode is **not** fixed in this phase; that is Phase 5's change, made when the masonry tiles that need `width`-only + `fit=scale-down` actually exist.
- **D-06:** Videos continue to bypass the helper entirely (Cloudflare Image Resizing does not transform video). The current call site already does this correctly — preserve it.
- **D-07:** Criterion 1's "production build still emits `/cdn-cgi/image/...`" is proven by **grepping the built output**: a build under production signals must contain `/cdn-cgi/image/` in `out/index.html`; a dev-mode build must not. Both commands go in `CV-REGRESSION.md`. Not proven by a live-site visual check.

**Scroll-lock rewrite (BUILD-02)**

- **D-08:** Fix is a **capture-and-restore inline** in the existing effect in `app/Lightbox.tsx:27-32`. No ref-counted `useScrollLock()` hook is built in this phase — deferred to Phase 7.
- **D-09:** The lock touches **`overflowY` only** — never the `overflow` shorthand, and never `overflow-x`.
- **D-10:** Cleanup restores the **captured prior inline value**, which for both elements is the empty string today. It must not write `'unset'`, `'visible'`, `'auto'`, or any other literal.
- **D-11:** **Both `html` and `body`** are restored and asserted clean after a full open/close cycle, even though criterion 3 names only `body`.
- **D-12:** `scrollbar-gutter: stable` is **not** added in this phase. Recorded as a decision for Phase 3.

**Client boundary (BUILD-03)**

- **D-13:** Add `"use client"` to the top of `app/Lightbox.tsx`.
- **D-14:** Criterion 2's build proof is a **throwaway server-component probe**: add a temporary server module that imports `Lightbox`, run `npm run build`, confirm it succeeds, then delete the probe and rebuild. No permanent proof artifact ships. The plan must include the deletion and the second build as explicit steps, not as cleanup.
- **D-15:** "Reads no browser global during render" is taken as an absolute and covers **both** offenders: the `useState((window.innerWidth - 48) / (window.innerHeight - 96))` initializer at `app/Lightbox.tsx:198`, and the four inline `isMobile()` render calls at `app/Lightbox.tsx:88, 99, 110, 265`, replaced with the **existing** `useIsMobile()` hook exported from `app/isMobile.tsx:22-30`.
- **D-16:** The container aspect ratio is obtained by **measuring the real container** with the `use-resize-observer` already imported in `Lightbox.tsx` and the `containerRef` already declared at line 197 — not by moving the viewport math into a `useEffect`, and not by rewriting the fit logic in CSS.
- **D-17:** Not in scope: scoping the `window`-level keydown listener, the duplicate-key risk, the divide-by-zero in the mobile scroll handler, focus trapping, and ARIA labels on the Lightbox buttons. All belong to Phase 7.

**CV-regression checklist (BUILD-09)**

- **D-18:** Lives at **`CV-REGRESSION.md` in the repo root**, alongside `CLAUDE.md`. A permanent engineering artifact, not a planning document.
- **D-19:** Every step that **can** be mechanical **is**: paste-ready console snippets and shell greps for the CDN check. Purely visual steps stay prose.
- **D-20:** Structure is a **fast core pass plus phase-flagged extras**:
  - *Core (every walk):* desktop, light **and** dark (`prefers-color-scheme`), the four widths 320 / 480 / 768 / 1440 with no horizontal scrollbar at any, all CV sections render with the year column aligned, attachment strips scroll on desktop and swipe on mobile, thumbnails load, one full lightbox cycle (open from a CV attachment, arrows, Esc, backdrop click), `html` and `body` inline style empty afterward, zero console errors or warnings on load and after that cycle.
  - *Flagged extras:* real-iPhone pass (Phase 6), network-panel bounded-request check (Phase 7).
- **D-21:** `CV-REGRESSION.md` stays a **clean, never-mutated template**. Each phase records its walk in that phase's own verification artifacts.
- **D-22:** Phase 1 walks the checklist at its own exit with zero failures.

### Claude's Discretion

The user chose the recommended option on every question; nothing was explicitly delegated. Planner and executor retain normal latitude on:
- Naming of the exported helper(s) in `app/lib/cdnImage.ts` and the shape of its options argument.
- How the phase is decomposed into plans and commits across the four requirements.
- The exact wording and ordering of `CV-REGRESSION.md`'s core steps, within the content fixed by D-20.
- The location and shape of the throwaway probe in D-14, provided it genuinely imports `Lightbox` from a module graph that does not already establish a client boundary, and provided it is deleted before the phase ends.

### Deferred Ideas (OUT OF SCOPE)

- **`scrollbar-gutter: stable` on `html`** — Phase 3. (D-12)
- **Ref-counted `useScrollLock()` hook** — Phase 7. (D-08)
- **Fixing the square `width = height` CDN params** (`width`-only + `fit=scale-down`) — Phase 5. (D-05)
- **`"use client"` on `Scrollbar.tsx` and `RichText.tsx`** — not load-bearing; corrected in Phase 2's doc pass.
- **Documenting the CDN flag in `CLAUDE.md`** — Phase 2 (BUILD-08).
- **Lightbox keydown scoping, stable keys, divide-by-zero guard, focus trap, ARIA labels** — Phase 7. (D-17)
- **Playwright screenshot tests** — out of scope for v1.1 by explicit requirement.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BUILD-01 | Developer can see content thumbnails when running `next dev` locally | § CDN Gate — root cause reproduced (`/cdn-cgi/...` → 404 in dev, raw `/content/...` → 200); the exact `next.config.ts` `env` gate expression was implemented and built three times under all three signal combinations; D-05 byte-identity verified against the committed `out/index.html`. |
| BUILD-02 | Lightbox restores the previous `overflow` value on close instead of writing `unset` | § Scroll Lock — exact current code at `Lightbox.tsx:27-32` confirmed; empty-string restore semantics and the `getAttribute('style')` / `getComputedStyle().overflowX` before/after signals documented in § Validation Architecture. |
| BUILD-03 | Lightbox declares its own client boundary and does not read `window` during render | § Client Boundary — five build experiments establish which probe shapes prove the fix, which silently pass (false negative), and which fail for an unrelated reason. Includes a **hard blocker** finding on rendering probes. |
| BUILD-09 | A written CV-regression checklist exists in the repo and is walked at each phase boundary | § CV-Regression Checklist Content + § Validation Architecture — every D-20 core item mapped to a paste-ready command or an explicitly-prose visual step. |
</phase_requirements>

---

## Summary

Every mechanical premise in CONTEXT.md holds against the real code, with three exceptions the planner must absorb before writing tasks. First, **a throwaway probe that merely imports `Lightbox` without using the binding silently passes the build even with no `"use client"` directive** — TypeScript/SWC elides the unused import, so the module never enters the server graph and the probe proves nothing. The probe must reference the binding (`typeof Lightbox` is verified to work). Second, **a probe that goes the other way and actually renders `<Lightbox>` fails the build unconditionally** with `ReferenceError: document is not defined` at the `ReactDOM.createPortal(..., document.body)` call — a third render-time browser-global read that D-15 does not enumerate. Third, **a directory named `app/__probe/` is silently excluded from routing** by App Router's private-folder convention, producing another false pass.

The `out/` desync is materially smaller than CONTEXT.md and STATE.md assume. Of the 112 tracked paths under `out/`, 87 (94 MB) are `out/content/` — a verbatim copy of `public/content/` that a rebuild reproduces byte-identically and therefore leaves clean in git. The entire desync lives in `out/_next/` (1.0 MB) plus five root HTML/txt files. Each rebuild churns roughly 5–10 paths and about 1 MB, not 99 MB. Turbopack is *not* fully build-deterministic — two consecutive builds of identical source produced a different build-ID directory and one differing chunk name — so "rebuild produces no diff" is not achievable, but "rebuild produces a small, boring diff" is.

D-16 is smaller than it reads. `use-resize-observer` is not merely imported — it is **already fully wired** at `Lightbox.tsx:236` with an `onResize` handler that already measures the real container via `getBoundingClientRect`, and there is already a mount `useEffect` that measures. The `window.innerWidth` expression is *only* the `useState` initial value, live for exactly one paint before the mount effect overwrites it. D-16's real work is choosing what that first paint shows.

**Primary recommendation:** Sequence the phase as (0) capture the CDN URL baseline from `git show HEAD:out/index.html` before touching anything; (1) CDN extraction + gate, proven by three greps; (2) scroll lock, proven by a console snippet pair; (3) client boundary, proven by a **negative-control-then-positive** probe pair using `typeof Lightbox` in a non-underscore route folder, never rendering it; (4) `CV-REGRESSION.md`; (5) walk it. Decide the `out/` commit policy explicitly in the plan (recommendation: one trailing `chore(build): resync out/` commit per plan, source-only commits otherwise).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Decide whether the CDN prefix is applied | Build tooling (`next.config.ts`) | — | `output: 'export'` emits a frozen HTML string; there is no request-time tier. Verified: the flag is inlined and dead-code-eliminated out of the client bundle entirely. |
| Construct the thumbnail URL string | Shared module (`app/lib/cdnImage.ts`) | Consumed by client component | Pure function of `(url, size)` plus a compile-time constant. No tier ownership beyond "wherever it is bundled". |
| Serve the transformed image | CDN / Cloudflare edge | — | `/cdn-cgi/*` is edge-only. Never exists in `next dev`, never exists in a bare static file server, and per PITFALLS Pitfall 6 does not work on `*.pages.dev`. |
| Serve the untransformed image | Static file tier (`public/` → `out/`) | — | Verified 200 from `next dev` at `/content/...`. |
| Own document scroll lock | Browser / client effect | — | `document.body.style` is a DOM mutation; only reachable after mount. |
| Establish the client boundary | Module graph (`"use client"` directive) | — | Resolved at compile time by Turbopack, not at runtime. |
| Detect mobile | Browser / client effect (`useIsMobile`) | — | `useIsMobile` deliberately returns the module cache (`false` if cold) on first render and syncs in an effect. See the first-render hazard below. |
| Prove the phase's four criteria | Shell + build output + browser console | — | No test framework exists or is being added (PROJECT.md constraint, REQUIREMENTS.md "Out of Scope"). |

---

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md` exists and is **known-inaccurate** (Phase 2 / BUILD-08 corrects it). Directives extracted, each annotated with verification status:

| CLAUDE.md directive | Verified? | Note for the planner |
|---|---|---|
| Commands: `npm run dev`, `npm run build`, `npm run lint`, `npm run migrate` | Partially | `dev` and `build` verified working. **`npm run lint` will fail** — `eslint` is not in `package.json` and not in `node_modules/.bin`. Do not put `npm run lint` in `CV-REGRESSION.md`; BUILD-06 (Phase 2) resolves it. |
| "No test framework is configured" | ✅ VERIFIED | Confirmed. Reinforced by PROJECT.md and REQUIREMENTS.md "Out of Scope: Adding a test framework". |
| "Next.js 15 (App Router) + React 19 + TypeScript" | ❌ **FALSE** | Actual: `next@16.3.0`, `react@19.0.0`. |
| "`output: 'export'` … deployed to Cloudflare Pages" | ✅ VERIFIED | `next.config.ts:17`. |
| "Client components (`"use client"`): `Profile.tsx`, `Attachments.tsx`, `Lightbox.tsx`, `Scrollbar.tsx`, `RichText.tsx`" | ❌ **FALSE** | Only `Profile.tsx:1` and `Attachments.tsx:1` declare it. This is the invariant BUILD-03 makes real for `Lightbox.tsx`. |
| "Font: Inter (loaded via `next/font/google`)" | ❌ **FALSE** | `layout.tsx` loads Switzer via `<link href="https://api.fontshare.com/v2/css?f[]=switzer@1&display=swap">`. `globals.css:6` sets `--default-font: "Switzer", sans-serif`. |
| "CSS Modules for component-scoped styles; CSS custom properties in `globals.css`" | ✅ VERIFIED | Follow this. Any new colour must come from a `globals.css` custom property. |
| "`Attachments.tsx` references Cloudflare Image Resizing via `/cdn-cgi/image/...` in `getThumbnailUrl()`" | ✅ VERIFIED | This is the function D-04 extracts. |
| "Images are unoptimized by Next.js" | ✅ VERIFIED | `next.config.ts:18-20`. Confirmed downstream: the built HTML contains **zero** `srcset` attributes, so `quality={50}` at `Attachments.tsx:155` is genuinely a no-op (D-04/PITFALLS agree). |
| "Media files in `media/` are auto-detected if not explicitly listed" | Not checked | Out of this phase's blast radius. |

**Standing directive for this phase:** do not "fix" any CLAUDE.md claim in Phase 1 — BUILD-08 owns that in Phase 2.

**Project skills:** No `.claude/skills/` or `.agents/skills/` directory exists (`.claude/` contains only `launch.json` and `settings.local.json`). No project skill patterns to account for.

---

## Line-Citation Audit

CONTEXT.md's citations were checked one by one against the working tree. **One is wrong.** Everything else is exact.

| Citation | Status | Actual |
|---|---|---|
| `app/Attachments.tsx:1` — `"use client"` | ✅ EXACT | — |
| `app/Attachments.tsx:16` — `getThumbnailUrl` definition | ✅ EXACT | Arrow fn declared at 16; template literal at 18; closes at 20. Doc comment at 13-15. |
| `app/Attachments.tsx:148` — image call site | ✅ EXACT | `const thumbnailUrl = getThumbnailUrl(media.url, height);` |
| `app/Attachments.tsx:155` — `quality={50}` no-op | ✅ EXACT | — |
| `app/Attachments.tsx:157-165` — video branch (bypasses helper) | ✅ EXACT | `} else if (media.type === "video") {` at 157, closes at 165. |
| `app/Attachments.tsx:70-80` — conditional Lightbox creation | ✅ EXACT | `let lightbox;` at 70, block closes at 80. Rendered inside `<AnimatePresence>` at 110-112. (PITFALLS says 71-80; 70-80 is the fuller range.) |
| `app/Lightbox.tsx:3` — `use-resize-observer` import | ✅ EXACT | `import useResizeObserver from "use-resize-observer";` |
| `app/Lightbox.tsx:27-32` — scroll-lock effect body | ✅ EXACT | Byte-for-byte as quoted in PITFALLS Pitfall 2. |
| `app/Lightbox.tsx:88` — `data-mobile={isMobile()}` | ✅ EXACT | — |
| `app/Lightbox.tsx:99` — `shouldRender` | ✅ EXACT | `const shouldRender = isVisible \|\| isAdjacent \|\| isMobile();` |
| `app/Lightbox.tsx:110` — `display={isVisible \|\| isMobile() ? …}` | ✅ EXACT | — |
| `app/Lightbox.tsx:265` — `{prev && next && !isMobile() ? …}` | ✅ EXACT | — |
| `app/Lightbox.tsx:197` — `containerRef` declaration | ✅ EXACT | `const containerRef = useRef<HTMLDivElement>(null);` |
| `app/Lightbox.tsx:198` — `window.innerWidth` initializer | ✅ EXACT | — |
| `app/isMobile.tsx:22-30` — `useIsMobile()` | ✅ EXACT | — |
| `next.config.ts:26-28` — `env` block | ✅ EXACT | — |
| `app/Profile.tsx:31-33` — beta badge branch read | ✅ EXACT | — |
| `app/globals.css:12` — `--transparentBorder` | ✅ EXACT | — |
| `app/globals.css:55-59` — `overflow-x: hidden` (PITFALLS cite) | ✅ EXACT | — |
| `app/Profile.module.css:97-113` — year-column `::before` trick | ✅ EXACT | `.year` 97-102, `.year::before` 104-107, `.year span` 109-113. |
| **`app/Lightbox.module.css:39` — `var(--transparent-border)`** | ❌ **DRIFT** | **Actual line 46.** Line 39 is the closing `}` of `.imageWrap`. The dead-variable reference is `border: 1px solid var(--transparent-border);` inside `.imageWrap::after` (41-49). Fix the citation wherever it is reused (it also appears in PITFALLS Pitfall 14 and CONTEXT.md's "Known traps"). |

### Uncited call sites the planner must not miss

| Location | Why it matters |
|---|---|
| `app/Lightbox.tsx:22` — a **fifth** `isMobile()` call, inside the mount `useEffect` | Not a render-time read, so D-15 correctly excludes it. But it gates the `startingIndex` scroll restore on mobile and interacts with the D-15 swap — see the hazard below. Do not delete it, and do not "consistently" convert it. |
| `app/Lightbox.tsx:182` — `ReactDOM.createPortal(…, document.body)` | **A third browser-global read during render.** See § Conflict with a Locked Decision. |
| `app/Lightbox.tsx:221-223` — `useEffect(() => { setRatio(); }, [])` | Already measures the container on mount. D-16's ground truth. |
| `app/Lightbox.tsx:226-230` — `setRatio()` | Already does `getBoundingClientRect()` on `containerRef`. |
| `app/Lightbox.tsx:236` — `useResizeObserver({ ref: containerRef as any, onResize })` | **Already wired.** D-16 is not "wire it up"; it is "pick the pre-measurement value". |
| `app/Attachments.tsx:47` — `shouldScroll: () => { return !isMobile() }` | The only thing that plausibly warms `isMobile`'s module cache before the Lightbox mounts. Relevant to the D-15 hazard. |

### ⚠ All `Lightbox.tsx` line numbers shift by +2 after D-13

Prepending `"use client"` plus a blank line moves every cited line down by two (`:27-32` → `:29-34`, `:88/99/110/265` → `:90/101/112/267`, `:197-198` → `:199-200`, `:236` → `:238`). The planner should either (a) order D-13 last within its plan, or (b) write task actions against symbols and code snippets rather than line numbers. Option (b) is safer given three edits land in the same file.

---

## Standard Stack

**This phase installs nothing.** All four requirements are satisfied with code already in the repo.

### Verified environment

| Component | Version | Source | Note |
|-----------|---------|--------|------|
| `next` | **16.3.0** | `[VERIFIED: node_modules/next/package.json]` | Not 15, as CLAUDE.md claims. |
| `react` / `react-dom` | **19.0.0** | `[VERIFIED: node_modules/*/package.json]` | — |
| Bundler | **Turbopack** | `[VERIFIED: build banner "▲ Next.js 16.3.0 (Turbopack)"]` | Default in Next 16. `next build --webpack` exists as an opt-out; the repo does not use it. `next.config.ts:22-25` pins `turbopack.root`. |
| `use-resize-observer` | **9.1.0** | `[VERIFIED: node_modules]` | Already a dependency, already wired. React 19 compatibility forced via the `overrides` block in `package.json:29-34`. |
| `framer-motion` | **11.18.2** | `[VERIFIED: node_modules]` | Range is `^11.14.4`. Upgrading to 13.x is explicitly out of scope (REQUIREMENTS.md). |
| Node | v22.13.1 | `[VERIFIED: node --version]` | — |
| npm | 11.12.1 | `[VERIFIED: npm --version]` | — |
| Python 3 | 3.14.1 | `[VERIFIED: python3 --version]` | Available as a zero-install static file server — see § Environment Availability. |
| `eslint` | **absent** | `[VERIFIED: package.json + node_modules/.bin]` | `npm run lint` will fail. BUILD-06 / Phase 2. |
| `serve` | **absent** | `[VERIFIED: command -v serve]` | D-03's `npx serve out` would trigger an unverified registry download. Use `python3 -m http.server` instead. |

### `use-resize-observer@9.1.0` API (relevant to D-16)

`[VERIFIED: node_modules/use-resize-observer/dist/index.d.ts + README.md]`

```ts
useResizeObserver<T extends Element>(opts?: {
  ref?: RefObject<T> | T | null | undefined;
  onResize?: (size: { width: number | undefined; height: number | undefined }) => void;
  box?: "border-box" | "content-box" | "device-pixel-content-box";
  round?: (n: number) => number;
}): { ref: RefCallback<T>; width: number | undefined; height: number | undefined }
```

Two facts the planner needs:

1. **"If `onResize` is given, then the hook will not return the size, and instead will call this callback."** `[CITED: node_modules/use-resize-observer/README.md § Options]` The current call site passes `onResize`, so `width`/`height` are **not** available from the return value as written. Switching to the returned-value form means *removing* `onResize` — a larger change than D-16 needs.
2. `width` and `height` are typed `number | undefined` — the library itself models the "not yet observed" state. Whatever form is chosen, the first-render undefined case must have a defined behaviour.

---

## Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.**

Every locked decision (D-01 … D-22) is satisfied using `next`, `react`, and `use-resize-observer`, all of which are already installed, already imported by the files this phase edits, and pinned in `package-lock.json`. `slopcheck` was therefore not run; there is nothing for it to evaluate.

**If the executor finds itself reaching for `npm install`, the plan has drifted.** Two adjacent temptations, both to be refused:

| Temptation | Why it is out of scope |
|---|---|
| `npx serve out` (mentioned in D-03's consequence text) | Would auto-download an unverified package. Use `python3 -m http.server 8080` from inside `out/` — Python 3.14.1 is verified present. |
| Installing `eslint` to make `npm run lint` pass | BUILD-06, Phase 2. Not this phase. |

---

## The CDN Build-Time Gate (BUILD-01 / D-01 … D-07)

### Current code, verbatim

`next.config.ts` in full `[VERIFIED: read]`:

```ts
import type { NextConfig } from "next";
import { execSync } from "child_process";

function getGitBranch(): string {
  // Cloudflare Pages uses detached HEAD, so prefer CF_PAGES_BRANCH
  if (process.env.CF_PAGES_BRANCH) {
    return process.env.CF_PAGES_BRANCH;
  }
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: false,
  // Pin the workspace root so Turbopack doesn't pick up stray lockfiles above the repo
  turbopack: { root: __dirname },
  env: {
    NEXT_PUBLIC_GIT_BRANCH: getGitBranch(),
  },
};

export default nextConfig;
```

`getGitBranch()` is a plain synchronous function called once at config evaluation. It runs for **both** `next dev` and `next build` — the same expression therefore governs both, which is what makes D-01's build-time decision work uniformly.

### Is `NEXT_PUBLIC_*` inlined at build time in Next 16.3?

**Yes — and further, dead-code-eliminated.** `[VERIFIED: reproduced build + grep]`

Evidence, strongest first:

1. The committed `out/index.html` contains the beta badge, and `Profile.tsx:31` reads `process.env.NEXT_PUBLIC_GIT_BRANCH === "dev"`. The current branch is `dev`. The comparison was therefore resolved at build time and baked into static HTML.
2. In a reproduced build with a new `NEXT_PUBLIC_CDN_IMAGES` key added to the `env` block, **the literal string `NEXT_PUBLIC_CDN_IMAGES` appears nowhere in `out/_next/`.** The reference was replaced with its value and the `if (!CDN_ENABLED) return originalUrl;` branch folded away.
3. PITFALLS Pitfall 17's security note is confirmed in the same breath: `next.config.ts` `env` values are inlined into public JS. Nothing sensitive may ever go in that block.

### The gate expression, built and grepped under all three signal states

The following was added to the `env` block in a throwaway copy of this project and built three times `[VERIFIED: reproduced]`:

```ts
env: {
  NEXT_PUBLIC_GIT_BRANCH: getGitBranch(),
  NEXT_PUBLIC_CDN_IMAGES: String(
    Boolean(process.env.CF_PAGES) && getGitBranch() === "main"
  ),
},
```

with a helper mirroring D-04/D-05:

```ts
// app/lib/cdnImage.ts
const CDN_ENABLED = process.env.NEXT_PUBLIC_CDN_IMAGES === "true";

export function cvThumbnailUrl(originalUrl: string, maxHeight: number): string {
  if (!CDN_ENABLED) return originalUrl;
  return `/cdn-cgi/image/width=${maxHeight * 2},height=${maxHeight * 2},quality=50,format=auto${originalUrl}`;
}
```

Results:

| Build environment | Simulates | `grep -o "/cdn-cgi/image/" out/index.html \| wc -l` | Emitted `src` |
|---|---|---|---|
| *(no env vars)* | `npm run build` locally, on any branch | **0** | `/content/002-workExperience/…/Product-designer-at-InstaDeep-1.png` |
| `CF_PAGES=1 CF_PAGES_BRANCH=main` | Cloudflare production deploy | **53** | `/cdn-cgi/image/width=180,height=180,quality=50,format=auto/content/…` |
| `CF_PAGES=1 CF_PAGES_BRANCH=dev` | Cloudflare `dev` preview deploy | **0** (beta badge still present) | raw `/content/…` |

All three match D-03's stated intent exactly, including the deliberate consequence that a local production-branch build bypasses the CDN.

**Note the helper's signature choice is deliberately not prescribed here** — naming and the options-argument shape are explicitly Claude's Discretion per CONTEXT.md. What is prescribed is the emitted string (below).

### D-05 byte-for-byte identity — mechanically provable, no build required for the baseline

The committed `out/index.html` contains **53 occurrences across 27 unique URLs**, all sharing exactly one parameter string `[VERIFIED: grep]`:

```
/cdn-cgi/image/width=180,height=180,quality=50,format=auto
```

`180 = galleryHeight (90) × 2` — `Attachments.tsx:34` sets `galleryHeight = 90` and passes it as `maxHeight`. There is exactly one size in play for CV attachments.

The baseline is extractable from git without building anything, and HEAD and the working tree agree `[VERIFIED: reproduced]`:

```bash
git show HEAD:out/index.html | grep -o '/cdn-cgi/image/[^"]*' | sort -u > /tmp/cdn-baseline.txt
# → 27 lines
```

After the change, a simulated-production build must reproduce that set exactly:

```bash
CF_PAGES=1 CF_PAGES_BRANCH=main npm run build
grep -o '/cdn-cgi/image/[^"]*' out/index.html | sort -u | diff - /tmp/cdn-baseline.txt && echo "D-05 byte-identity: PASS"
```

This is a complete, automated proof of D-05. Capturing the baseline should be the **first task of the phase**, before any file is touched.

### `next dev` root cause, reproduced

With the dev server running `[VERIFIED: curl]`:

| Request | Status |
|---|---|
| `/content/002-workExperience/001-product-designer-at-instadeep/media/Product-designer-at-InstaDeep-1.png` | **200** |
| `/cdn-cgi/image/width=180,height=180,quality=50,format=auto/content/…/Product-designer-at-InstaDeep-1.png` | **404** |

And with the fix in place, `curl -s http://localhost:3000/ | grep -c "/cdn-cgi/image/"` returns **0**. Both halves of criterion 1 are curl-provable without opening a browser (though D-20's visual step still applies).

### Cloudflare environment variables — authoritative

`[CITED: developers.cloudflare.com/pages/configuration/build-configuration/ § System environment variables]`

| Variable | Value |
|---|---|
| `CI` | `true` |
| **`CF_PAGES`** | **`1`** |
| `CF_PAGES_COMMIT_SHA` | commit hash |
| `CF_PAGES_BRANCH` | deployment branch name |
| `CF_PAGES_URL` | deployment URL |

The docs note these "can be overridden with custom values" via the dashboard. `CF_PAGES=1` is a truthy string, so `Boolean(process.env.CF_PAGES)` is the correct presence test; a `=== "1"` equality test is also safe but slightly more brittle if an operator ever overrides it.

`CF_PAGES_URL` is **not** usable as a production discriminator — it carries the `*.pages.dev` deployment URL on production deployments too, not the custom domain. Branch-name comparison, as D-02/D-03 specify, is the only available signal.

### Open question: which branch is production?

`origin/HEAD → origin/main` `[VERIFIED: git symbolic-ref]`, and `Profile.tsx:31` already treats `"dev"` as the preview/beta branch. Together these make `main` the overwhelmingly likely Cloudflare Pages production branch — but the Pages project's production branch is a dashboard setting and **has not been confirmed**. See § Open Questions. The ROADMAP already carries a related open decision into Phase 2 ("Does Cloudflare Pages build from source, or deploy a prebuilt directory?"); confirming the production branch name is one dashboard screen away from that same answer.

---

## The Client Boundary Probe (BUILD-03 / D-13, D-14)

Five builds were run against an isolated copy of this project to establish exactly which probe shapes prove what. **Three of the five produce a wrong answer.**

| # | Probe shape | `"use client"` on Lightbox? | Result | Verdict |
|---|---|---|---|---|
| A | *(no probe — baseline)* | no | ✓ Build succeeds. Routes: `/`, `/_not-found`, `/[slug]` | Baseline confirmed green |
| B | `app/__probe/page.tsx`, uses `typeof Lightbox` | no | ✓ Build succeeds. **`/__probe` absent from the route table** | ❌ **FALSE PASS** — underscore folder |
| C | `app/probe-tmp/page.tsx`, uses `typeof Lightbox` | no | ✗ **Build fails** with the client-boundary error and a full import trace | ✅ Correct negative control |
| D | `app/probe-tmp/page.tsx`, uses `typeof Lightbox` | **yes** | ✓ Build succeeds. **`/probe-tmp` present in the route table** | ✅ Correct positive proof |
| E | `app/probe-tmp/page.tsx`, **unused** `import Lightbox` | no | ✓ Build succeeds | ❌ **FALSE PASS** — import elided |
| F | `app/probe-tmp/page.tsx`, **renders** `<Lightbox …/>` | **yes** | ✗ **Build fails** — `ReferenceError: document is not defined` at `Lightbox.tsx:184` (`createPortal`) | ❌ Fails for an unrelated reason |

### The verified probe (Experiment D)

```tsx
// app/probe-tmp/page.tsx — TEMPORARY BUILD PROBE. Delete before the phase ends (D-14).
import Lightbox from '../Lightbox';

export default function ProbePage() {
  return <div>{typeof Lightbox}</div>;
}
```

Three non-obvious properties, each empirically required:

1. **The folder name must not begin with `_`.** `app/__probe/` was silently dropped — App Router treats `_folderName` as a private folder excluded from routing. The build went green and the route never appeared. `[VERIFIED: reproduced, Experiment B]` `[CITED: nextjs.org/docs/app/getting-started/project-structure — private folders]`
2. **The imported binding must be *used*.** An unused `import Lightbox from '../Lightbox'` is elided by TypeScript/SWC before the module graph is analysed, so `Lightbox.tsx` never enters the server graph. The build passes with no directive. `typeof Lightbox` is sufficient and verified. `[VERIFIED: reproduced, Experiment E]`
3. **The probe must not render `<Lightbox>`.** See below — it is not survivable.

### The exact failure signal (Experiment C — the negative control)

```
./app/isMobile.tsx:1:21
Error: You're importing a module that depends on `useState` into a React Server Component module.
This API is only available in Client Components. To fix, mark the file (or its parent) with the
`"use client"` directive.

Import traces:
  Server Component:
    ./app/isMobile.tsx
    ./app/Lightbox.tsx
    ./app/probe-tmp/page.tsx
```

Two details worth noting. First, this is a **compile-time** failure, not a prerender failure — it happens before any page is rendered, which is why an import-only probe is a valid proof of the boundary. Second, the error names `isMobile.tsx`, not `Lightbox.tsx`; the import trace is what identifies the real culprit. An executor grepping the build log for "Lightbox" alone will think the probe misfired.

### ⚠ Run the negative control *before* the fix

Experiments B and E both demonstrate that a probe can go green while proving nothing. D-14 as written only specifies the positive build. **Strongly recommended (and within Claude's Discretion on probe shape):** the plan should run the probe build once *before* adding `"use client"` and require it to **fail**, then add the directive and require it to **pass**. Without the negative control, criterion 2's evidence is indistinguishable from a mis-shaped probe.

Suggested sequence, all four steps as explicit plan tasks:

```
1. Create app/probe-tmp/page.tsx (typeof form)
2. npm run build                    → MUST FAIL with the client-boundary error + import trace
3. Add "use client" to app/Lightbox.tsx (D-13)
4. npm run build                    → MUST SUCCEED, and "/probe-tmp" MUST appear in the Route table
5. rm -rf app/probe-tmp
6. npm run build                    → MUST SUCCEED; out/probe-tmp.html MUST NOT exist   (D-14)
```

### ⚠ Exit-code masking

`npm run build 2>&1 | tail -30` returns **tail's** exit status, not the build's. Experiment C printed `EXIT=0` on a build that had definitively failed. `[VERIFIED: observed]` Any verification command in a plan or in `CV-REGRESSION.md` that pipes the build must use `set -o pipefail`, or capture with `tee` and read `${PIPESTATUS[0]}`, or simply not pipe. `[CITED: bash manual — pipefail]`

### Positive-proof marker

On success the build prints:

```
Route (app)
┌ ○ /
├ ○ /_not-found
├   /[slug]
│ └ ● /__placeholder__
└ ○ /probe-tmp
```

`/probe-tmp` appearing in that table is the assertion that the probe genuinely entered the build graph. Grepping the build log for `probe-tmp` is the mechanical check, and it is the one that catches Experiment B's failure mode.

---

## ⚠ Conflict with a Locked Decision: `document.body` at render time

**This is the one place where a locked decision does not survive contact with the code, and it must be surfaced to the user rather than silently resolved by the planner.**

D-15 states: *"'Reads no browser global during render' is taken as an absolute and covers **both** offenders"* — `window.innerWidth` at `:198` and the four `isMobile()` calls. Roadmap criterion 2 uses the same absolute phrasing.

There is a **third** render-time browser-global read that neither D-15 nor D-17 enumerates. `app/Lightbox.tsx:182`:

```tsx
  return ReactDOM.createPortal(
    <div data-mobile={isMobile()} className={styles.lightbox}>
      …
    </div>
  , document.body);          // ← line 182: `document` read during render
```

This is not theoretical. Experiment F rendered `<Lightbox>` from a server component **with `"use client"` already applied**, and the build failed `[VERIFIED: reproduced]`:

```
Error occurred prerendering page "/probe-tmp".
ReferenceError: document is not defined
    at <unknown> (app/Lightbox.tsx:184:5)
  > 184 |   , document.body);
```

(Line 184 rather than 182 because the probe build had the two-line `"use client"` prefix applied — a live demonstration of the +2 line shift.)

### What this means, precisely

| Claim | After this phase |
|---|---|
| Criterion 2's **stated proof mechanism** ("an `npm run build` that succeeds while importing Lightbox from a module graph that does not already establish a client boundary") | ✅ **Satisfiable.** Import-only probes never render, so `document` is never touched. Experiment D passes. |
| Criterion 2's **literal wording** ("reads no browser global during render") | ❌ **Still false.** `document.body` remains a render-time read. |
| Practical risk today | **Zero.** `Attachments.tsx:70-80` mounts the Lightbox only after a click; D-17 and PITFALLS Pitfall 3 both require preserving that pattern. |
| Practical risk in Phase 7 | **Zero, if** the gallery follows the same mount-on-click pattern — which PITFALLS Pitfall 10 already mandates ("Mount/unmount, never toggle"). |

### Options for the planner — do not pick one silently

1. **Scope it out explicitly (recommended).** Add a line to the plan and to the phase's verification notes: *"`Lightbox.tsx` retains one render-time browser-global read — `document.body` as the `createPortal` target. It is structural to the portal design, harmless under the mount-on-click invariant, and out of scope for BUILD-03."* Costs nothing, keeps the record honest, and hands Phase 7 the fact it needs.
2. **Guard it.** `ReactDOM.createPortal(…, document.body)` → return `null` when `typeof document === 'undefined'`. Four lines. Makes criterion 2 literally true and makes Lightbox safely importable-and-renderable from any graph. But it is a source change beyond D-13/D-15/D-16, and it invites the executor to keep going.
3. **Do nothing and say nothing.** Ships a phase whose stated exit criterion is not literally met. Given this phase exists to make later phases *trustworthy*, this is the worst option.

The planner should carry this to the user as a decision, framed as option 1 vs option 2. It is genuinely small — but "reads no browser global during render" was written as an absolute, and the code will not satisfy it.

### How to actually verify the D-15 half of criterion 2

Because the build cannot exercise Lightbox's render path (option 1) and Experiment F is a dead end, the D-15 half needs a **static** proof. Verified-shape command:

```bash
grep -n 'window\.\|document\.\|navigator\.\|isMobile()' app/Lightbox.tsx
```

Expected surviving hits after the phase, and nothing else:

| Line (post-`"use client"`) | Hit | Why it is allowed |
|---|---|---|
| ~24 | `isMobile()` | inside the mount `useEffect` |
| ~29-34 | `document.body.style.overflowY`, `document.documentElement.style.overflowY` | inside the mount `useEffect` |
| ~52, ~55 | `window.addEventListener` / `removeEventListener` | inside a `useEffect` |
| ~184 | `document.body` (`createPortal`) | the known exception above — must be listed explicitly if option 1 is chosen |

Any hit at any other line is a regression. Zero hits of `window.innerWidth`, `window.innerHeight`, and zero `isMobile()` outside an effect body.

---

## The Resize-Observer Rewiring (BUILD-03 / D-16)

### Ground truth: it is already wired

`app/Lightbox.tsx` `LightboxImage`, lines 196-236 `[VERIFIED: read]`:

```tsx
const containerRef = useRef<HTMLDivElement>(null);                                    // 197
const [containerAspectRatio, setContainerAspectRatio] =
  useState((window.innerWidth - 48) / (window.innerHeight - 96));                     // 198
const imageAspectRatio = media.width / media.height;                                  // 199
…
useEffect(() => { setRatio(); }, []);                                                 // 221-223

const setRatio = () => {                                                              // 226-230
  if (!containerRef.current) { return }
  let bounds = containerRef.current.getBoundingClientRect();
  setContainerAspectRatio(bounds.width / bounds.height);
}

const onResize = () => { setRatio(); }                                                // 232-234

useResizeObserver({ ref: containerRef as any, onResize });                            // 236
```

CONTEXT.md's code-context section says D-16 "wires two things that already exist". More precisely: **they are already wired to each other.** The observer already fires `setRatio`, `setRatio` already measures the real container, and a mount `useEffect` already measures once. The `window.innerWidth` expression is *only* the value used for the very first paint, before `useEffect` runs.

D-16's actual scope is therefore: **delete the `window` expression from the `useState` initializer, and decide what the pre-measurement paint shows.** That is a two-line change plus a decision.

### What the value feeds

`containerAspectRatio` is consumed only at lines 261-262, in the fit logic:

```tsx
width:  containerAspectRatio > imageAspectRatio ? "auto"  : "100%",
height: containerAspectRatio > imageAspectRatio ? "100%"  : "auto",
```

Classic contain-fit: if the container is wider than the image, constrain by height; otherwise constrain by width.

### What the container actually is, and why D-16 is more correct

`containerRef` attaches to `.lightboxInner`, whose box is fully determined by CSS `[VERIFIED: Lightbox.module.css:15-31]`:

```css
.lightboxImage { padding: 48px 24px; width: 100dvw; height: 100dvh; }
.lightboxInner { width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; }
```

So the measured box is exactly `(100dvw − 48px) × (100dvh − 96px)`. The hardcoded `(window.innerWidth − 48) / (window.innerHeight − 96)` was hand-computing that same expression using `innerWidth`/`innerHeight` instead of `dvw`/`dvh`. Those diverge on mobile, where `dvh` tracks the dynamic viewport (collapsing browser chrome) and `innerHeight` does not. **D-16's "strictly more correct" claim is confirmed against the CSS**, and this is a real behavioural improvement on mobile, not just a `window`-removal workaround.

`.lightboxInner` has no padding or border, so content-box (the observer's default) equals border-box equals the value `getBoundingClientRect()` returns. The two measurement paths agree.

`getBoundingClientRect()` on a `motion.div` carrying `initial={{ opacity: 0, scale: 0.98 }}` returns the **transformed** rect — but width and height are scaled by the same factor, so the *ratio* is unaffected. Not a hazard.

### The first-render case — the planner must specify a behaviour

Between mount and the first measurement there is one render with no measured value. Three shapes, in order of recommendation:

**Option A (recommended): keep the current wiring; change the initializer and promote the mount effect to `useLayoutEffect`.**

```tsx
const [containerAspectRatio, setContainerAspectRatio] = useState(0);
…
useLayoutEffect(() => { setRatio(); }, []);   // was useEffect at :221-223
```

`useLayoutEffect` runs after DOM mutation but **before paint**, and a `setState` inside it forces a synchronous re-render before paint. The initial `0` is therefore never painted, and the choice of initial value stops mattering. Nothing else changes: `onResize`, `setRatio`, and the `useResizeObserver` call at :236 all stay exactly as they are, which is the minimal-diff reading of D-16.

*Caveat, and why it is safe here:* React warns when `useLayoutEffect` runs during server rendering. `Lightbox` is only ever mounted after a click (`Attachments.tsx:70-80`), so it never server-renders — and as § Conflict establishes, it *cannot* be server-rendered at all while `createPortal(…, document.body)` stands. The warning is unreachable. If option 2 of that section is ever taken, revisit this.

**Option B: sentinel + explicit first-paint rule.** `useState<number | null>(null)` and read `containerAspectRatio !== null && containerAspectRatio > imageAspectRatio`. `null` then falls to the `width: "100%"` branch — a full-bleed-width first paint, corrected one frame later. Explicit and readable; costs one visible frame of possible wrong sizing, which is what the current code already does.

**Option C: switch to the returned `width`/`height`.** Requires *removing* `onResize` (the library suppresses the return values when `onResize` is supplied — `[CITED: use-resize-observer README § Options]`), then computing `width && height ? width / height : fallback`. Largest diff, and it deletes wiring D-16 says to keep. Not recommended.

Whichever is chosen, the plan must state it as an explicit task action. "Remove the window read" without specifying the replacement leaves the executor guessing.

---

## ⚠ The D-15 Mobile First-Render Hazard

`useIsMobile()` and `isMobile()` are **not** drop-in equivalents on the first render, and one of the four call sites has a downstream consequence.

`app/isMobile.tsx:22-30` `[VERIFIED: read]`:

```tsx
export function useIsMobile(): boolean {
  const [localMobileValue, setLocalMobileValue] = useState(isMobileValue ?? false);
  useEffect(() => { setLocalMobileValue(isMobile()); }, []);
  return localMobileValue;
}
```

`isMobileValue` is a module-level cache, `null` until the first `isMobile()` call. So on a real phone, `useIsMobile()` returns `false` on the first render **if the cache is cold**, then `true` one commit later.

### Why that matters beyond a cosmetic flash

`Lightbox.tsx:88` feeds `data-mobile`, and the entire mobile carousel is driven off that attribute `[VERIFIED: Lightbox.module.css:147-171]`:

```css
.lightbox[data-mobile="true"] .carouselScroll { position: absolute; inset: 0; width: 100%; height: 100%;
                                                overflow-x: scroll; scroll-snap-type: x mandatory; }
.lightbox[data-mobile="true"] .carousel      { display: flex; flex-direction: row; flex-wrap: nowrap; }
.lightbox[data-mobile="true"] .lightboxImage { flex-shrink: 0; scroll-snap-align: center; }
```

There is **no** rule for `.carouselScroll` outside the `[data-mobile="true"]` selector — on desktop it is an unstyled static `div` with no overflow.

Now the mount effect at `Lightbox.tsx:21-25`:

```tsx
if (scrollRef.current && isMobile() && startingIndex > 0) {
  let bounds = scrollRef.current.getBoundingClientRect();
  scrollRef.current.scrollLeft = bounds.width * startingIndex;
}
```

If `data-mobile` is still `"false"` when this effect runs, `.carouselScroll` has no `overflow-x: scroll`, so **`scrollLeft` is not settable** — the assignment silently clamps to 0. Tapping the 4th attachment on a phone would open the lightbox on the 1st.

Effect ordering makes this concrete: `useIsMobile`'s internal effect is registered when the hook is called (top of `Lightbox`), so it runs *before* the scroll-lock/scroll-restore effect in the same commit — but its `setState` schedules a re-render, it does not apply synchronously. At the moment the scroll-restore effect runs, the DOM still carries the old `data-mobile`.

### Is the cache warm in practice?

Probably, but by accident. `Attachments.tsx:47` passes `shouldScroll: () => { return !isMobile() }` to `react-scrollbooster`, which invokes it on pointer events. On a touch device, the tap that opens the lightbox fires a pointer event through scrollbooster first, warming `isMobileValue` to `true` before `Lightbox` ever renders. That is real, but it is incidental coupling across two files and is exactly the kind of thing this phase exists to stop relying on.

### What the planner must do

1. **Specify a behaviour for the `Lightbox.tsx:22` scroll restore**, since D-15 changes the state it depends on. The cheapest correct shape: keep the direct `isMobile()` call at :22 (D-15 does not list it as an offender — it is inside an effect) *and* re-run the restore when the hook's value flips, e.g. by adding the hook value to that effect's dependency array with a one-shot guard. Alternatively, gate the restore on `useLayoutEffect` after the mobile value settles.
2. **Add an explicit checklist step**: on a touch device (or DevTools device emulation with touch enabled), open the lightbox from an attachment at index ≥ 3 and confirm it lands on that item. This is a D-20 core-pass candidate — it is the swipe/mobile step already listed, sharpened.
3. **Do not** attempt to warm the cache at module scope. `isMobile()` reads `window` and would break the import into any server graph — reintroducing exactly the BUILD-03 defect.

`data-mobile` also gates `shouldRender` (:99), `display` (:110), and the desktop nav buttons (:265). Those three self-correct one frame later and are cosmetic. Only the `:22` scroll restore is load-bearing.

---

## The Scroll Lock (BUILD-02 / D-08 … D-11)

### Current code (`Lightbox.tsx:27-32`), verbatim

```js
document.body.style.overflow = 'hidden';
document.documentElement.style.overflow = 'hidden';
return () => {
  document.body.style.overflow = 'unset';
  document.documentElement.style.overflow = 'unset';
};
```

### The replacement shape D-08/D-09/D-10 describe

```js
const prevBodyOverflowY = document.body.style.overflowY;
const prevHtmlOverflowY = document.documentElement.style.overflowY;
document.body.style.overflowY = 'hidden';
document.documentElement.style.overflowY = 'hidden';
return () => {
  document.body.style.overflowY = prevBodyOverflowY;
  document.documentElement.style.overflowY = prevHtmlOverflowY;
};
```

This lives inside the same effect that also holds the `:22` scroll restore. That effect's `[]` dependency array must be preserved — a dependency change would re-run the lock.

### Why the empty-string restore produces an *empty* style attribute

CSSOM semantics, which is what criterion 3 actually tests `[CITED: CSSOM spec — CSSStyleDeclaration setProperty/removeProperty; MDN element.style]`:

| Step | `body.getAttribute('style')` |
|---|---|
| Before any lightbox is opened | `null` (attribute absent) |
| While open, after `style.overflowY = 'hidden'` | `"overflow-y: hidden;"` |
| After cleanup, `style.overflowY = prev` where `prev === ''` | `""` (attribute present but empty) |
| *(current buggy code)* after `style.overflow = 'unset'` | `"overflow: unset;"` |

Assigning `''` to a CSSOM property removes that declaration. With no declarations left, the attribute remains but serialises to the empty string. Criterion 3's "is empty" is satisfied by `""`; a fresh page that has never opened the lightbox returns `null`. Both are "empty"; neither is `"overflow: unset;"`.

**The check must therefore accept both `""` and `null`.** A naive `=== ''` assertion fails on a fresh page, and a naive `=== null` assertion fails after a cycle. See § Validation Architecture for the snippet.

### The stronger, more meaningful assertion

The *point* of BUILD-02 is that `globals.css`'s guard comes back into force. That is directly observable and gives a clean before/after signal `[VERIFIED: globals.css:55-59 defines `overflow-x: hidden` on `html, body`]`:

```js
getComputedStyle(document.body).overflowX
// before the fix, after one open/close cycle → "visible"   (inline `overflow: unset` wins)
// after  the fix, after one open/close cycle → "hidden"    (globals.css back in force)
```

This is the assertion that actually protects Phase 3's sticky work. Recommend putting **both** in `CV-REGRESSION.md`: `getAttribute('style')` because criterion 3 names it, and `getComputedStyle(…).overflowX` because it is the one that would catch a future regression that happens to leave an empty style attribute for a different reason.

Note the deliberate interaction with Phase 3: `globals.css` currently sets `overflow-x: hidden`, which Phase 3 changes to `clip` (PITFALLS Pitfall 1). The expected value of `getComputedStyle(document.body).overflowX` therefore changes from `"hidden"` to `"clip"` at Phase 3. `CV-REGRESSION.md` should express this as *"matches whatever `globals.css` declares"* rather than hardcoding `"hidden"`, or D-21's never-mutated-template rule will be violated at Phase 3.

`overflow-y` is deliberately not asserted: when `overflow-x` is non-`visible`, the used value of the other axis is promoted to `auto`, and browsers disagree about whether `getComputedStyle` reports the computed or used value. `overflow-x` is unambiguous.

---

## The `out/` Desync — Precise State and Options

CONTEXT.md says *"Any `npm run build` in this phase rewrites ~99MB of tracked output."* **That is not what happens.** Measured `[VERIFIED: git ls-files, git status, du, diff -rq]`:

### Current state

| Metric | Value |
|---|---|
| Tracked paths under `out/` | **112** |
| On-disk size of `out/` | **96 MB** |
| `out/content/` | 87 tracked paths, **94 MB** — a verbatim copy of `public/content/` |
| `out/_next/` | 18 tracked paths, **1.0 MB** |
| Root files (`index.html`, `index.txt`, `404.html`, `__placeholder__.*`, `favicon.ico`, `_headers`) | 7 tracked paths, ~150 KB |
| Dirty paths under `out/` | **41** — 18 deleted, 18 untracked, 5 modified |
| Where the dirt is | **Entirely** `out/_next/` + the 5 root HTML/txt files. `out/content/` is 100% clean. |

The 18 deletions are the Webpack-era chunks (`webpack-c8fea456a7af0230.js`, `framework-372c62845e5ba996.js`, the `_next/static/css/*.css` pair, the `xABxEphi-…` build-ID directory). The 18 untracked entries are the Turbopack replacements (`turbopack-0xd61oejbnjpu.js`, base36-named chunks, `_next/static/media/`, `_next/static/0xheb7QJaGAxdblMYWMpZ/`) plus three `__next.*.txt` files and the `_not-found` / `__placeholder__` route variants. This is a bundler migration, exactly as PITFALLS Pitfall 13 describes.

### What a rebuild actually costs

`[VERIFIED: reproduced — a fresh build in an isolated copy, diffed against the repo]`

- `out/content/` from a fresh build is **byte-identical** to the committed `out/content/` (`diff -rq` clean). A rebuild leaves all 87 paths / 94 MB untouched in git.
- **Turbopack is not fully deterministic.** Two consecutive builds of identical source produced a different build-ID directory (`hiqD6xiEy-2zze63-KAR7` vs `T-BAEBx-gwApAjp8hkqCy`) and one differing chunk name (`1hghruwrie97d.js` vs `33gypiycetea0.js`). Most chunk names *are* content-stable; the build ID never is.
- Net per-rebuild churn: roughly **5–10 paths, ~1 MB** — one or two renamed chunks, a renamed build-ID directory (2 small files), and the 5 HTML/txt files that embed the build ID.

So "rebuild produces zero diff" is unreachable, but "rebuild produces a small, boring, reviewable diff" is the actual situation. This substantially de-risks the decision CONTEXT.md flags.

### Options, with honest tradeoffs

| # | Option | Pros | Cons | Fit |
|---|--------|------|------|-----|
| 1 | **Resync `out/` in a dedicated first commit**, then source-only commits, then one trailing `chore(build): resync out/` commit per plan | Matches PITFALLS Pitfall 13's explicit recommendation ("run a clean build, commit the resulting `out/` as a single dedicated commit"); leaves `HEAD` self-consistent at every plan boundary; each plan's source diff is readable in isolation | Two commits per plan; the resync commit is noise | ✅ **Recommended** |
| 2 | Resync once at phase start, leave `out/` dirty until the phase's final commit | One resync commit for the whole phase | Intermediate commits have `out/` disagreeing with source — precisely the state STATE.md calls out as harmful | Acceptable if the phase is one plan |
| 3 | Leave `out/` untouched; `git checkout -- out/` after every build | Zero `out/` churn in git | Restores *tracked* files only; the 18 untracked Turbopack artifacts persist and accumulate. Also leaves the repo shipping a `out/` that is stale relative to a phase that edits `Lightbox.tsx` and the CDN helper — a live-site risk if Pages deploys prebuilt | ❌ Not recommended |
| 4 | Untrack `out/` now | Removes the problem permanently | **Explicitly BUILD-07 / Phase 2, and gated** on confirming Cloudflare Pages builds from source. Doing it here could take the live site down. Also steals a requirement from another phase | ❌ Out of scope |
| 5 | Add `out/** linguist-generated=true` / `out/** -diff` to `.gitattributes` | Collapses the diff on GitHub, stops textual merge attempts | Cosmetic only; PITFALLS lists it as the fallback *if* `out/` must stay tracked. Also touches `.gitattributes`, which currently holds only `* text=auto` | Optional add-on to option 1 |

**Recommendation: option 1, optionally with option 5.** Whichever the planner picks, it must be written into the plan as explicit tasks with commit messages — not left to the executor. The phase runs at minimum four builds (D-05 baseline check, probe negative control, probe positive, post-probe rebuild) and probably six.

**One hard requirement regardless of option:** the phase's *final* build must be a normal `npm run build` with **no** `CF_PAGES` env vars set, so the committed `out/` reflects what a local build produces. If the last build run is the simulated-production one, the committed `out/index.html` will contain `/cdn-cgi/image/` URLs produced under fake environment variables — misleading, and it would make the dev-side grep in `CV-REGRESSION.md` fail on a fresh clone.

Also: `.gitattributes` contains `* text=auto`, which applies LF normalisation to the generated `.js`/`.html`/`.css` in `out/`. Harmless on macOS/Linux but worth knowing if a diff ever looks larger than expected.

---

## CV-Regression Checklist Content (BUILD-09 / D-18 … D-22)

D-20 fixes the content; D-19 fixes the mechanical/prose split; wording and ordering are Claude's Discretion. This maps each core item to its cheapest honest proof.

| D-20 core item | Mechanical? | Proof |
|---|---|---|
| All CV sections render | prose | Visual scan |
| Year column aligned | prose | Visual. Fragile per PITFALLS Pitfall 14 — `Profile.module.css:97-113` uses a `.year::before { content: "0000 — 0000"; visibility: hidden }` ghost-text trick that breaks on any font or type-size change |
| Attachment strips scroll on desktop | prose | Drag a strip horizontally (react-scrollbooster) |
| Attachment strips swipe on mobile | prose (+ sharpen) | Swipe. **Add:** open the lightbox from an attachment at index ≥ 3 and confirm the correct item — see § D-15 Mobile Hazard |
| Thumbnails load | ✅ | `curl -s http://localhost:3000/ \| grep -c "/cdn-cgi/image/"` → `0` in dev; visual confirm no broken-image icons |
| Production still emits CDN URLs (D-07) | ✅ | `CF_PAGES=1 CF_PAGES_BRANCH=main npm run build` then `grep -c "/cdn-cgi/image/" out/index.html` → non-zero. **Reset with a plain `npm run build` afterwards** |
| Lightbox opens / arrows / Esc / backdrop | prose | Full cycle from a CV attachment |
| `html` + `body` inline style empty after (D-11) | ✅ | Console snippet — see § Validation Architecture |
| No horizontal scrollbar at 320/480/768/1440 | ✅-ish | `document.documentElement.scrollWidth <= document.documentElement.clientWidth` at each width, in DevTools responsive mode |
| Light **and** dark (`prefers-color-scheme`) | prose | DevTools → Rendering → Emulate CSS media feature. Note `Lightbox.module.css:46`'s dead `var(--transparent-border)` (`globals.css:12` defines `--transparentBorder`) — the image border is invisible in **both** themes today; do not "discover" it as a Phase 1 regression |
| Zero console errors/warnings, on load and after one cycle | prose | Console must be empty. Filter set to "All levels" |

**Flagged extras (D-20):** real-iPhone pass → Phase 6; network-panel bounded-request check → Phase 7. Mark them as skippable outside those phases, in-line, so the walker does not have to decide.

### Two commands that must NOT appear

- `npm run lint` — will fail; no eslint installed. BUILD-06 / Phase 2.
- `npx serve out` — `serve` is not installed and `npx` would auto-download an unverified package. Use `cd out && python3 -m http.server 8080` (Python 3.14.1 verified present). Caveat: a plain static server does not replicate Cloudflare's `trailingSlash: false` routing, so it is only good for spot-checking `/`.

### D-21 template discipline — one landmine

`CV-REGRESSION.md` must stay a never-mutated template (D-21), but two of its expected values change in later phases:

| Value | Phase 1 | Changes at |
|---|---|---|
| `getComputedStyle(document.body).overflowX` | `"hidden"` | Phase 3 → `"clip"` (PITFALLS Pitfall 1) |
| Presence of a sticky tab bar in the visual scan | absent | Phase 3 |

Write these as relative assertions ("matches the `overflow-x` value declared in `globals.css`") rather than literals, or the template acquires a Phase-1-only truth that a later phase must edit — violating D-21.

---

## Architecture Patterns

### Data flow — where the CDN decision is made

```
                  BUILD TIME                                    RUN TIME
  ┌────────────────────────────────────────────┐        ┌──────────────────────┐
  │ shell env: CF_PAGES?  CF_PAGES_BRANCH?     │        │       browser        │
  └────────────────┬───────────────────────────┘        └──────────┬───────────┘
                   │                                               │
                   v                                               │
  ┌────────────────────────────────────────────┐                   │
  │ next.config.ts                             │                   │
  │   getGitBranch()  ── CF_PAGES_BRANCH       │                   │
  │                   └─ git rev-parse (local) │                   │
  │   env: {                                   │                   │
  │     NEXT_PUBLIC_GIT_BRANCH  ─────────┐     │                   │
  │     NEXT_PUBLIC_CDN_IMAGES  ───┐     │     │                   │
  │   }                            │     │     │                   │
  └────────────────────────────────┼─────┼─────┘                   │
                                   │     │                         │
        (inlined as a literal,     │     └──> app/Profile.tsx:31   │
         dead code eliminated)     │            beta badge         │
                                   v                               │
  ┌────────────────────────────────────────────┐                   │
  │ app/lib/cdnImage.ts   [NEW — D-04]         │                   │
  │   CDN_ENABLED ? "/cdn-cgi/image/…"+url     │                   │
  │                : url                       │                   │
  └────────────────┬───────────────────────────┘                   │
                   │ imported by                                   │
                   v                                               │
  ┌────────────────────────────────────────────┐                   │
  │ app/Attachments.tsx:148  (image branch)    │                   │
  │ app/Attachments.tsx:157  (video branch)  ──┼── bypasses  D-06  │
  └────────────────┬───────────────────────────┘                   │
                   │ Turbopack prerender                           │
                   v                                               │
  ┌────────────────────────────────────────────┐                   │
  │ out/index.html   ← frozen URL strings      │───── served ──────┘
  └────────────────────────────────────────────┘
                   │
      ┌────────────┴──────────────┐
      v                           v
  raw /content/…            /cdn-cgi/image/…
  ├ next dev        → 200   ├ next dev         → 404   [VERIFIED]
  ├ python3 http    → 200   ├ python3 http     → 404
  ├ *.pages.dev     → 200   ├ *.pages.dev      → fails (Pitfall 6)
  └ custom domain   → 200   └ custom domain    → transformed
```

### Client-boundary topology, before and after

```
BEFORE (boundary by inheritance — an implicit, undocumented invariant)

  app/layout.tsx  [server]
  app/page.tsx    [server]
       └─ Profile.tsx      "use client"  ◄── boundary declared here
             └─ Attachments.tsx  "use client"
                   ├─ Scrollbar.tsx      (client only by inheritance)
                   └─ Lightbox.tsx       (client only by inheritance)  ◄── BUILD-03
                         └─ isMobile.tsx (client only by inheritance)

AFTER (Lightbox owns its boundary; Scrollbar/RichText deliberately unchanged)

  app/page.tsx    [server]
       └─ Profile.tsx      "use client"
             └─ Attachments.tsx  "use client"
                   └─ Lightbox.tsx     "use client"  ◄── D-13
                                                          now importable from ANY graph

TRANSIENT (probe present — deleted before phase exit, D-14)

  app/probe-tmp/page.tsx  [server, NO "use client"]
       └─ Lightbox.tsx    ── referenced via `typeof`, never rendered
```

### Anti-patterns to avoid in this phase

- **Runtime CDN branching.** `const isDev = typeof window !== 'undefined' && location.hostname === 'localhost'` — D-01 forbids this, and it is genuinely impossible: the URL is baked into `out/index.html` at build time and re-deriving it in the browser would either produce a hydration mismatch or require rewriting every `src` in an effect.
- **A probe that renders `<Lightbox>`.** Fails on `document.body` regardless of the fix. Verified. See § Conflict.
- **A probe in an underscore-prefixed folder.** Silently excluded from routing. Verified.
- **A probe with an unused import.** Silently elided. Verified.
- **Piping the build to `tail`/`head` without `pipefail`.** Masks the exit code. Verified.
- **`document.body.style.overflow = ''` (shorthand) instead of `overflowY`.** D-09 exists structurally, not as a matter of care: touching the shorthand is what let the lock stomp the `overflow-x` guard. Writing `''` to the shorthand happens to clear both axes, which is why it *looks* fine — but it also clears any future `overflow-x` inline value, re-creating the coupling.
- **Calling `isMobile()` at module scope** to warm the cache. Reads `window` at import time — reintroduces BUILD-03 in a worse form.
- **Ending the phase with a simulated-production build committed.** See § `out/` Desync.
- **Fixing `--transparent-border`.** Not this phase's (CONTEXT.md "Known traps"). Note it, do not touch it — and correct the line citation to 46.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Detecting "is this a Cloudflare production build?" | A custom `.env.production` file, a `--mode` CLI flag, or a `package.json` script variant | The existing `next.config.ts` `env` block + `CF_PAGES` / `CF_PAGES_BRANCH` | D-02/D-03. The pattern already exists and already ships to production correctly via `NEXT_PUBLIC_GIT_BRANCH`. A second mechanism is a second thing to keep true. |
| Element size measurement | A `window.resize` listener + manual `getBoundingClientRect` bookkeeping | `use-resize-observer@9.1.0`, already installed and **already wired** at `Lightbox.tsx:236` | D-16. `window.resize` does not fire on container-only size changes (dvh collapse on mobile scroll, for one). |
| Mobile detection | A `navigator.userAgent` regex | `useIsMobile()` from `app/isMobile.tsx:22-30` | D-15. Already written, already SSR-safe, already returns `false` on the server. Note the cold-cache first-render behaviour above. |
| Scroll lock | A ref-counted `useScrollLock()` hook, or a `body-scroll-lock` dependency | Inline capture-and-restore | D-08 defers the hook to Phase 7 explicitly — building shared infrastructure against one real caller and one guessed one is how the wrong abstraction gets locked in. |
| Regression detection | Playwright, Vitest, or any test framework | `CV-REGRESSION.md` | REQUIREMENTS.md "Out of Scope: Adding a test framework". PROJECT.md constraint. STATE.md session continuity. Three documents agree. |
| A permanent build-time boundary guard | A committed `app/boundary-check/` route or a lint rule | The throwaway probe + `CV-REGRESSION.md` | D-14: "the repo gains nothing dead, and the standing guarantee is the checklist rather than a decoy module." |
| Static file serving for a built-output spot check | `npx serve` | `cd out && python3 -m http.server 8080` | `serve` is not installed; `npx` would download an unverified package. Python 3.14.1 is present. |

**Key insight:** this phase's entire job is to make later phases *checkable*. Every new abstraction it introduces is a new thing that could be wrong and that nothing yet verifies. The correct instinct throughout is the smallest change that makes a criterion mechanically provable — which is exactly how D-05, D-08, D-12, and D-14 are already written.

---

## Common Pitfalls

### Pitfall A: The probe passes and proves nothing
**What goes wrong:** `npm run build` is green with the probe in place, criterion 2 is marked satisfied, and `Lightbox.tsx` never entered the server graph.
**Why:** two independent silent-exclusion mechanisms, both reproduced — underscore-prefixed folders are private in App Router, and unused imports are elided before boundary analysis.
**Avoid:** non-underscore folder name; reference the binding (`typeof Lightbox`); **run the negative control first** and require a failure; grep the build log for `probe-tmp` in the Route table.
**Warning sign:** the build's Route table does not list the probe route.

### Pitfall B: The probe fails for the wrong reason and the fix gets "corrected"
**What goes wrong:** the executor makes the probe render `<Lightbox>` to strengthen the proof, hits `ReferenceError: document is not defined`, concludes `"use client"` did not work, and starts changing `createPortal` or the mount pattern.
**Why:** Next.js prerenders client components to HTML during static export. `createPortal(…, document.body)` is a render-time `document` read, unfixable by a directive.
**Avoid:** the plan must state explicitly that the probe is **import-only** and must never render Lightbox, with the reason.
**Warning sign:** `Error occurred prerendering page "/probe-tmp"` rather than a compile-time client-boundary error.

### Pitfall C: A failing build reports success
**What goes wrong:** `npm run build 2>&1 | tail -30` exits 0 on a failed build.
**Avoid:** `set -o pipefail`, or `tee` + `${PIPESTATUS[0]}`, or do not pipe.
**Warning sign:** an error block in the log next to a green summary line.

### Pitfall D: The scroll-lock assertion fails on a fresh page
**What goes wrong:** `document.body.getAttribute('style') === ''` returns `false` before the lightbox has ever been opened, because the attribute is absent and the call returns `null`.
**Avoid:** accept both `""` and `null`. Better: assert `getComputedStyle(document.body).overflowX` matches what `globals.css` declares.
**Warning sign:** a checklist step that fails on a page where nothing has happened yet.

### Pitfall E: Mobile lightbox opens on the wrong item after D-15
**What goes wrong:** tapping the 4th attachment on a phone opens the 1st.
**Why:** `useIsMobile()` returns `false` on a cold cache during the first render, so `.carouselScroll` has no `overflow-x: scroll` when the mount effect assigns `scrollLeft`, and the assignment clamps to 0.
**Avoid:** specify the scroll-restore behaviour as an explicit task action; verify on a touch device at index ≥ 3.
**Warning sign:** works in the desktop simulator, wrong on a real phone, only when opening a non-first attachment.

### Pitfall F: The committed `out/` ends the phase in a fake-production state
**What goes wrong:** the last build run was `CF_PAGES=1 CF_PAGES_BRANCH=main npm run build`, so the committed HTML contains CDN URLs a real local build would not produce, and the dev-side grep in `CV-REGRESSION.md` fails on a fresh clone.
**Avoid:** always end with a plain `npm run build` before the resync commit.
**Warning sign:** `grep -c "/cdn-cgi/image/" out/index.html` returns non-zero on a plain checkout.

### Pitfall G: Line-number drift within the phase's own edits
**What goes wrong:** a task says "edit `Lightbox.tsx:198`" but D-13 already shifted it to 200.
**Avoid:** symbol/snippet-based task actions, or order D-13 last within its plan.

### Pitfall H: The line-46 citation propagates
**What goes wrong:** `Lightbox.module.css:39` is copied into `CV-REGRESSION.md` or a Phase 3 doc; someone opens line 39, finds a closing brace, and concludes the dead-variable note is stale.
**Avoid:** cite line 46. The dead reference is `border: 1px solid var(--transparent-border);` inside `.imageWrap::after`.

---

## Code Examples

All snippets below were compiled and built in an isolated copy of this project.

### The `next.config.ts` gate (D-01/D-02/D-03) — verified across three environments

```ts
// next.config.ts — env block only; getGitBranch() is unchanged
env: {
  NEXT_PUBLIC_GIT_BRANCH: getGitBranch(),
  NEXT_PUBLIC_CDN_IMAGES: String(
    Boolean(process.env.CF_PAGES) && getGitBranch() === "main"
  ),
},
```

`String(...)` matters: `next.config.ts`'s `env` values must be strings. A raw boolean would be stringified anyway, but making it explicit keeps the consumer's `=== "true"` comparison honest.

### The extracted helper (D-04/D-05) — emits byte-identical URLs

```ts
// app/lib/cdnImage.ts   (naming and options shape are Claude's Discretion)
const CDN_ENABLED = process.env.NEXT_PUBLIC_CDN_IMAGES === "true";

export function cvThumbnailUrl(originalUrl: string, maxHeight: number): string {
  if (!CDN_ENABLED) return originalUrl;
  return `/cdn-cgi/image/width=${maxHeight * 2},height=${maxHeight * 2},quality=50,format=auto${originalUrl}`;
}
```

Verified to produce exactly the 27 unique URLs present in the committed `out/index.html`. Reading `process.env.NEXT_PUBLIC_CDN_IMAGES` once at module scope (rather than inside the function) is what lets Turbopack fold the branch away entirely — confirmed: the identifier appears nowhere in `out/_next/`.

### The call-site change (D-04/D-06)

```diff
  import isMobile from "./isMobile";
  import useResizeObserver from "use-resize-observer";
+ import { cvThumbnailUrl } from "./lib/cdnImage";
  import styles from "./Attachments.module.css";

- // Helper to get optimized thumbnail URL
- // For Cloudflare Pages, you can use Cloudflare Image Resizing: …
- const getThumbnailUrl = (originalUrl: string, maxHeight: number): string => {
-   return `/cdn-cgi/image/width=${maxHeight * 2},…${originalUrl}`;
- };
...
-   const thumbnailUrl = getThumbnailUrl(media.url, height);
+   const thumbnailUrl = cvThumbnailUrl(media.url, height);
```

The video branch at `Attachments.tsx:157-165` is untouched — it already passes `media.url` raw (D-06). `quality={50}` at `:155` stays as-is; it is a no-op under `images.unoptimized` (confirmed: zero `srcset` in the built HTML) and CONTEXT.md explicitly says not to "fix" it here.

### The probe (D-14) — the only shape that proves anything

```tsx
// app/probe-tmp/page.tsx — TEMPORARY. Deleted before phase exit (D-14).
// Server component: no "use client". Imports Lightbox and USES the binding
// so the import is not elided. Must NOT render <Lightbox/> — createPortal
// reads document.body during render and crashes the prerender regardless
// of the client-boundary fix.
import Lightbox from '../Lightbox';

export default function ProbePage() {
  return <div>{typeof Lightbox}</div>;
}
```

### Build commands, exit-code safe

```bash
set -o pipefail

# negative control — MUST fail
npm run build 2>&1 | tee /tmp/probe-before.log; echo "exit=${PIPESTATUS[0]}"
grep -q "You're importing a module that depends on \`useState\`" /tmp/probe-before.log \
  && echo "NEGATIVE CONTROL OK: boundary genuinely missing"

# after adding "use client" — MUST succeed AND list the route
npm run build 2>&1 | tee /tmp/probe-after.log; echo "exit=${PIPESTATUS[0]}"
grep -q "/probe-tmp" /tmp/probe-after.log \
  && echo "POSITIVE PROOF OK: probe was in the build graph"

# after deleting the probe
rm -rf app/probe-tmp
npm run build
test ! -e out/probe-tmp.html && echo "PROBE FULLY REMOVED"
```

### Scroll-lock console assertions (criterion 3, D-10/D-11)

```js
// Paste after a full lightbox open → arrows → Esc (or backdrop) cycle.
(() => {
  const empty = v => v === '' || v === null;
  const h = document.documentElement.getAttribute('style');
  const b = document.body.getAttribute('style');
  console.log('html style:', JSON.stringify(h), '| body style:', JSON.stringify(b));
  console.log('overflow-x now:',
    getComputedStyle(document.documentElement).overflowX,
    '/', getComputedStyle(document.body).overflowX);
  console.log(empty(h) && empty(b) ? 'PASS — no residue' : 'FAIL — inline style left behind');
})();
```

Expected after the fix: `PASS`, and `overflow-x now: hidden / hidden` (matching `globals.css:55-59`; this becomes `clip / clip` after Phase 3). Before the fix this prints `FAIL` with `"overflow: unset;"` and `visible / visible`.

### Horizontal-overflow check (D-20 four-widths step)

```js
(() => {
  const d = document.documentElement;
  console.log(`${window.innerWidth}px:`, d.scrollWidth <= d.clientWidth ? 'PASS' : `FAIL (${d.scrollWidth} > ${d.clientWidth})`);
})();
```

---

## State of the Art

| Old approach | Current approach | When changed | Impact on this phase |
|---|---|---|---|
| Webpack as the default `next build` bundler | **Turbopack is the default in Next 16**; `--webpack` is the opt-out | Next 16 | Explains the `out/` desync entirely. Chunk naming is base36 and the build ID is non-deterministic across builds. |
| `next export` as a separate command | `output: 'export'` in `next.config.ts` | Next 13.3+ | Already adopted here (`next.config.ts:17`). |
| Client components are "not server-rendered" | App Router **prerenders client components to HTML** at build time | Next 13 App Router | This is why Experiment F crashes on `document`. A `"use client"` directive is a *bundling* boundary, not a "skip the server" instruction. Widely misunderstood. |
| Hydration mismatch → patch the DOM | React 18+ **discards server HTML and client-renders the whole root** | React 18 | Not triggered in Phase 1 (the Lightbox is client-only), but it is why D-15's `isMobile()` swap matters for Phase 3/7. |
| `next/image` optimisation | Delegated to Cloudflare Image Resizing via `images.unoptimized: true` | Project decision | Confirmed downstream: zero `srcset` in the built HTML, so `quality`/`sizes` props are genuinely inert. |

**Deprecated / outdated in this repo:**
- The `getThumbnailUrl` doc comment at `Attachments.tsx:13-15` says *"For now, returns original URL (you can enable Cloudflare Image Resizing later)"* — the opposite of what the code does. It goes away with the extraction (D-04). Do not carry the comment across.
- `npm run lint` in `package.json:9` and in CLAUDE.md — no eslint installed. BUILD-06 / Phase 2.

---

## Runtime State Inventory

Included because BUILD-01's change alters what URLs the deployed HTML contains — a mechanical string change with a runtime footprint.

| Category | Items found | Action required |
|----------|-------------|-----------------|
| **Stored data** | **None.** No database, no CMS, no client-side persisted state. Verified: zero `localStorage` / `sessionStorage` / `indexedDB` usage in `app/`; content is files under `public/content/` read at build time by `contentLoader.ts`. | None |
| **Live service config** | **One, and it is out of this phase's scope.** The Cloudflare Pages project holds (a) the production-branch name, (b) build-from-source vs prebuilt-directory, (c) whether Image Resizing is enabled on the zone. None is in git. (a) is the assumption behind D-03's `=== "main"`; (b) is already ROADMAP's Phase 2 open decision. | Confirm the production-branch name in the CF dashboard — see § Open Questions. No change to CF config in this phase. |
| **OS-registered state** | **None.** No launchd/systemd units, no cron, no scheduled tasks. Verified: `package.json` scripts are `dev`/`build`/`start`/`lint`/`migrate` only. | None |
| **Secrets / env vars** | `CF_PAGES`, `CF_PAGES_BRANCH` are **injected by Cloudflare**, never set by the repo. This phase adds a *derived* `NEXT_PUBLIC_CDN_IMAGES` computed inside `next.config.ts` — no new dashboard variable, no `.env` file (none exists). D-02 is satisfied: no new user-facing flag. | None. ⚠ `next.config.ts` `env` values are **inlined into public JS** — never put a secret there. |
| **Build artifacts** | `out/` — 112 tracked paths, 96 MB, 41 currently dirty, all of the dirt in `out/_next/` + 5 root files. `.next/` is gitignored. No `egg-info`-style installed-package artifacts (no Python/Rust packaging). | See § The `out/` Desync. Requires an explicit commit-policy task in the plan. |
| **CDN edge cache** | `public/_headers` sets `Cache-Control: immutable, max-age=31536000` on `/_next/static/*`, `/content/media/*`, and `/*.{jpg,png,mp4,webp}`; HTML gets `max-age=3600, must-revalidate`. Changing image URLs from `/cdn-cgi/image/…/content/x.png` to `/content/x.png` changes the *request path*, so no stale-cache risk — different keys. HTML revalidates hourly. | None. Noted so nobody chases a phantom cache-invalidation task. |

---

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `next build` / `next dev` | ✓ | v22.13.1 | — |
| npm | scripts | ✓ | 11.12.1 | — |
| `next` | all criteria | ✓ | 16.3.0 (Turbopack) | — |
| `react` / `react-dom` | all | ✓ | 19.0.0 | — |
| `use-resize-observer` | D-16 | ✓ | 9.1.0 | — |
| `git` | `getGitBranch()` fallback; `git show HEAD:out/index.html` baseline | ✓ | 2.50.1 | — |
| `grep` / `diff` / `curl` | every mechanical check | ✓ | system | — |
| Python 3 | static-serving `out/` for a spot check | ✓ | 3.14.1 | — |
| A browser with DevTools | D-20 visual + console steps | assumed present (macOS) | — | none — criterion 3 and the dark-mode/width steps require it |
| `eslint` | — | ✗ | — | **Not needed.** `npm run lint` fails; BUILD-06 / Phase 2 |
| `serve` | — | ✗ | — | `cd out && python3 -m http.server 8080` |
| Cloudflare Pages dashboard access | confirming the production-branch name | unknown | — | Ship the gate with `=== "main"` and flag it; ROADMAP already carries the related question into Phase 2 |
| A physical iPhone | — | n/a | — | **Not needed** — D-20 flags the real-device pass as a Phase 6 extra. DevTools device emulation with touch enabled covers the Phase 1 mobile step |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** `serve` → `python3 -m http.server`. `eslint` → not required this phase.

**Note on `getGitBranch()`'s stderr:** in a directory that is not a git repo, `git rev-parse` prints `fatal: not a git repository` to stderr before the `catch` returns `""`. Observed during the reproduced builds. Harmless and never occurs in the real repo, but worth recognising if it ever shows up in a CI log.

---

## Validation Architecture

No test framework exists and none is being added — this is a locked project constraint restated in PROJECT.md, REQUIREMENTS.md ("Out of Scope: Adding a test framework"), CLAUDE.md, and STATE.md. Nyquist sampling is therefore satisfied by shell commands, build-log assertions, greps over `out/`, and paste-ready browser-console snippets. Every command below has been executed against this repo or an exact copy of it.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | **None** — deliberate project constraint. Substitute: `CV-REGRESSION.md` (BUILD-09) |
| Config file | none — and none is to be created |
| Quick run command | `set -o pipefail; npm run build` (~5 s cold in the reproduced environment) |
| Full suite command | `npm run build` + the mechanical block below + a `CV-REGRESSION.md` walk |
| Phase gate | All four criteria mechanically green **and** a zero-failure checklist walk (D-22) |

### Phase Requirements → Proof Map

| Req | Behaviour to prove | Type | Automated command | Exists? |
|-----|--------------------|------|-------------------|---------|
| BUILD-01 | Dev serves real images | smoke | `npm run dev &` then `curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/content/002-workExperience/001-product-designer-at-instadeep/media/Product-designer-at-InstaDeep-1.png"` → `200` | ✅ verified |
| BUILD-01 | Dev HTML carries no CDN prefix | smoke | `curl -s http://localhost:3000/ \| grep -c "/cdn-cgi/image/"` → `0` | ✅ verified |
| BUILD-01 | Thumbnails visibly render (not broken-image icons) | manual | Load `localhost:3000`, scan every attachment strip | prose — D-20 |
| BUILD-01 / D-07 | Production build still emits CDN URLs | build+grep | `CF_PAGES=1 CF_PAGES_BRANCH=main npm run build && grep -c "/cdn-cgi/image/" out/index.html` → non-zero | ✅ verified (53) |
| BUILD-01 / D-03 | Local build on any branch bypasses the CDN | build+grep | `npm run build && grep -c "/cdn-cgi/image/" out/index.html` → `0` | ✅ verified |
| BUILD-01 / D-03 | `dev`-branch preview bypasses the CDN | build+grep | `CF_PAGES=1 CF_PAGES_BRANCH=dev npm run build && grep -c "/cdn-cgi/image/" out/index.html` → `0` | ✅ verified |
| BUILD-01 / D-05 | Emitted URLs are byte-identical to pre-change | diff | baseline: `git show HEAD:out/index.html \| grep -o '/cdn-cgi/image/[^"]*' \| sort -u > /tmp/cdn-baseline.txt`; after: same grep on the prod build, `diff` → empty | ✅ verified (27 URLs) |
| BUILD-01 / D-06 | Videos still bypass the helper | grep | `grep -n 'cvThumbnailUrl\|cdnImage' app/Attachments.tsx` → hits only in the image branch; `grep -c '/cdn-cgi' out/index.html` unchanged by video count | ✅ shape verified |
| BUILD-02 / D-10 | No inline style residue after a cycle | console | the snippet in § Code Examples → `PASS` | ✅ semantics verified |
| BUILD-02 / D-11 | Both `html` and `body` clean | console | same snippet — it reads both | ✅ |
| BUILD-02 | `globals.css` overflow guard back in force | console | `getComputedStyle(document.body).overflowX` → matches `globals.css` (`hidden` in Phase 1) | ✅ |
| BUILD-02 / D-09 | Only the y-axis is ever touched | grep | `grep -n "style.overflow" app/Lightbox.tsx` → every hit is `.overflowY`, zero bare `.overflow` | ✅ |
| BUILD-03 / D-14 | Boundary genuinely missing before the fix | build (**must fail**) | probe present, no directive → build fails with `You're importing a module that depends on \`useState\`` + import trace naming `probe-tmp` | ✅ verified (Exp. C) |
| BUILD-03 / D-13 | Boundary present after the fix | build (**must pass**) | probe present, directive added → build succeeds **and** `/probe-tmp` appears in the Route table | ✅ verified (Exp. D) |
| BUILD-03 / D-14 | Probe actually entered the graph | log grep | `grep "/probe-tmp" build.log` → present | ✅ verified (catches Exp. B) |
| BUILD-03 / D-14 | Probe removed and build still green | build + fs | `rm -rf app/probe-tmp && npm run build && test ! -e out/probe-tmp.html` | ✅ verified |
| BUILD-03 / D-15 | No browser global read during render | grep + review | `grep -n 'window\.\|document\.\|navigator\.\|isMobile()' app/Lightbox.tsx` → every hit inside an effect, except the known `createPortal` exception | ✅ verified; see § Conflict |
| BUILD-03 / D-15 | Mobile lightbox still opens on the right item | manual (touch) | Touch-emulated or real device: open attachment index ≥ 3, confirm the item shown | prose — **must be added**, see § D-15 Hazard |
| BUILD-03 / D-16 | Fit logic still correct at multiple sizes | manual | Open a portrait and a landscape attachment; resize the window; both stay contained without overflow or letterbox drift | prose |
| BUILD-09 / D-18 | Checklist exists at the repo root | fs | `test -f CV-REGRESSION.md` | ✅ |
| BUILD-09 / D-19 | Mechanical steps are paste-ready | grep | `grep -c '```' CV-REGRESSION.md` → non-zero; every command copy-pastes and runs | ✅ |
| BUILD-09 / D-20 | All core items present | grep | Grep the file for each of: `320`, `480`, `768`, `1440`, `prefers-color-scheme`, `getAttribute('style')`, `cdn-cgi`, `console` | ✅ |
| BUILD-09 / D-22 | Walked at phase exit with zero failures | manual | Walk it; record date/result in the phase's verification artifacts, **not** in the file (D-21) | prose |

### Sampling Rate

- **Per task commit:** `set -o pipefail; npm run build` must exit 0 (except the one task whose *expected* outcome is a failing negative-control build — the plan must mark that task as inverted, or a naive "build must pass" gate will flag a correct step as broken).
- **Per plan merge:** the full mechanical block below, plus a plain `npm run build` so the committed `out/` is a real local build (see Pitfall F).
- **Phase gate:** every row of the map above green, plus a complete `CV-REGRESSION.md` walk with zero failures (D-22).

### The mechanical block

Runnable end to end from the repo root; every command verified.

```bash
set -o pipefail
cd /Users/haythem/Developer/ReadCV

# ── 0. baseline (run BEFORE any edit) ────────────────────────────────────────
git show HEAD:out/index.html | grep -o '/cdn-cgi/image/[^"]*' | sort -u > /tmp/cdn-baseline.txt
wc -l < /tmp/cdn-baseline.txt          # expect 27

# ── 1. local build → CDN OFF ─────────────────────────────────────────────────
npm run build
test "$(grep -c '/cdn-cgi/image/' out/index.html)" -eq 0 && echo "C1 dev-side: PASS"

# ── 2. simulated production → CDN ON, byte-identical ─────────────────────────
CF_PAGES=1 CF_PAGES_BRANCH=main npm run build
test "$(grep -c '/cdn-cgi/image/' out/index.html)" -gt 0 && echo "C1 prod-side: PASS"
grep -o '/cdn-cgi/image/[^"]*' out/index.html | sort -u | diff - /tmp/cdn-baseline.txt \
  && echo "D-05 byte-identity: PASS"

# ── 3. dev server ────────────────────────────────────────────────────────────
npm run dev >/tmp/dev.log 2>&1 &
until curl -sf -o /dev/null http://localhost:3000/; do sleep 1; done
IMG=/content/002-workExperience/001-product-designer-at-instadeep/media/Product-designer-at-InstaDeep-1.png
test "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000$IMG")" = 200 && echo "raw image 200: PASS"
test "$(curl -s http://localhost:3000/ | grep -c '/cdn-cgi/image/')" -eq 0 && echo "dev HTML clean: PASS"
pkill -f "next dev"

# ── 4. static-read assertions on Lightbox.tsx ────────────────────────────────
head -1 app/Lightbox.tsx | grep -q '"use client"' && echo "D-13: PASS"
grep -q 'style.overflow[^Y]' app/Lightbox.tsx && echo "D-09: FAIL (shorthand present)" || echo "D-09: PASS"
grep -q "'unset'" app/Lightbox.tsx && echo "D-10: FAIL ('unset' present)" || echo "D-10: PASS"
grep -q 'window.innerWidth' app/Lightbox.tsx && echo "D-15a: FAIL" || echo "D-15a: PASS"
echo "--- review each hit below; all must be inside an effect (plus the known createPortal exception) ---"
grep -n 'window\.\|document\.\|navigator\.\|isMobile()' app/Lightbox.tsx

# ── 5. checklist exists ──────────────────────────────────────────────────────
test -f CV-REGRESSION.md && echo "BUILD-09 file: PASS"

# ── 6. leave the tree in a real local-build state ────────────────────────────
npm run build
test "$(grep -c '/cdn-cgi/image/' out/index.html)" -eq 0 && echo "final out/ state: PASS"
```

### Wave 0 Gaps

No test infrastructure is required or permitted. Two ordering prerequisites, both real tasks:

- [ ] **Capture `/tmp/cdn-baseline.txt` from `git show HEAD:out/index.html` before any file is edited.** Without it, D-05's byte-identity claim degrades from a diff to an eyeball. Cheap, and it must be first.
- [ ] **Decide and write down the `out/` commit policy** (§ The `out/` Desync). The phase runs 4–6 builds; leaving this to the executor produces incoherent commits. Recommendation: resync commit first, then source-only commits, then one `chore(build): resync out/` per plan.

Everything else the phase needs already exists.

---

## Security Domain

`security_enforcement` is not set in `.planning/` (no `config.json` exists), so it is treated as enabled. The attack surface here is genuinely minimal — a static export with no server runtime, no auth, no forms, no user input, no API routes.

### Applicable ASVS categories

| ASVS category | Applies | Standard control |
|---------------|---------|------------------|
| V2 Authentication | no | No auth surface anywhere in the project |
| V3 Session Management | no | No sessions, no cookies set by the app |
| V4 Access Control | no | Fully public static site; every file under `public/` is public by definition |
| V5 Input Validation | **marginal** | The only "input" this phase touches is `media.url` from repo-authored `item.json`, interpolated into a `/cdn-cgi/image/…` path. Not attacker-controlled. **Rule to carry forward:** the CDN transform parameters (`width`, `height`, `quality`, `format`) must stay **hardcoded in `app/lib/cdnImage.ts`** and never be interpolated from content files — PITFALLS' security table flags unbounded CF transform params as a billing/DoS vector on the Cloudflare account. D-05 already fixes them; Phase 5 must keep them from an in-code allowlist. |
| V6 Cryptography | no | No crypto in scope |
| V14 Configuration | **yes** | `next.config.ts`'s `env` values are **inlined into public JavaScript** — verified. This phase adds `NEXT_PUBLIC_CDN_IMAGES`, a boolean derived from `CF_PAGES` presence and a branch name. Both are non-sensitive and `NEXT_PUBLIC_GIT_BRANCH` already ships. The `NEXT_PUBLIC_` prefix is the correct signal that a value is public. **Never extend this block with anything sensitive.** |

### Known threat patterns for this stack

| Pattern | STRIDE | Mitigation | Status in this phase |
|---------|--------|-----------|---------------------|
| Build-time secret leaked via `NEXT_PUBLIC_*` inlining | Information Disclosure | Only non-sensitive values in the `env` block; `NEXT_PUBLIC_` prefix as the marker | ✅ Both current and added values are non-sensitive |
| Unbounded CDN transform params → CF billing/DoS | DoS | Hardcode dimensions/quality; never interpolate from content | ✅ D-05 hardcodes; noted for Phase 5 |
| Unintended publication of files under `public/` | Information Disclosure | Everything under `public/` is served verbatim — `backup-media.bak/` ships today | Out of scope — BUILD-05 / Phase 2 |
| XSS via markdown | Tampering | `react-markdown` default sanitising; do **not** add `rehype-raw` | Untouched this phase; noted for Phase 4 captions |
| Reverse tabnabbing on `target="_blank"` | Tampering | `rel="noopener noreferrer"` | Out of scope (`Profile.tsx` links, not this phase's files) |
| Supply-chain / slopsquatting on a new dependency | Tampering | N/A — **this phase installs nothing** | ✅ No exposure |
| A throwaway probe route shipping to production | Information Disclosure (trivial) | D-14 mandates deletion + rebuild; verified by `test ! -e out/probe-tmp.html` | ✅ Covered — and this is a concrete reason the deletion must be a plan task, not "cleanup" |

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | Cloudflare Pages' **production branch is `main`** | CDN Gate | The D-03 gate never fires on production and the live site loses all image optimisation — silent, and invisible from any local build. Evidence is strong (`origin/HEAD → origin/main`; `Profile.tsx:31` treats `dev` as preview) but the Pages production-branch setting is a dashboard value that was not read. **Confirm before merging to production.** |
| A2 | Cloudflare **Image Resizing is enabled** on the production zone and `/cdn-cgi/image/` currently works there | CDN Gate | If it never worked, this phase preserves a broken behaviour behind a flag rather than fixing it. Not verifiable from the repo — no custom domain is referenced anywhere in the codebase. `[ASSUMED]` |
| A3 | `CF_PAGES` is **not** overridden to a falsy value in the Pages dashboard | CDN Gate | `Boolean(process.env.CF_PAGES)` would be false on production and the gate would never fire. CF docs explicitly permit overriding system variables. Low likelihood. |
| A4 | Turbopack's non-determinism across builds is limited to the build-ID directory and content-addressed chunk names, not a broader instability | `out/` Desync | Underestimates per-rebuild churn. Measured across two consecutive builds only — a larger sample could show more variance. `[VERIFIED: n=2]` |
| A5 | `useLayoutEffect` in `LightboxImage` (D-16 Option A) never triggers React's server-rendering warning | Resize-Observer | A console warning would fail D-20's "zero console warnings" step. Sound as long as Lightbox is mount-on-click only — which `createPortal` currently enforces absolutely. Re-check if the § Conflict option 2 is ever taken. |
| A6 | On a real touch device, `react-scrollbooster`'s `shouldScroll` warms `isMobile`'s module cache before the Lightbox first renders | D-15 Hazard | If cold, the mobile `startingIndex` scroll restore silently fails and the lightbox opens on the wrong item. Reasoned from source, **not** observed on a device. This is why the checklist step at index ≥ 3 is being recommended. `[ASSUMED]` |
| A7 | A plain `python3 -m http.server` over `out/` is adequate for the optional static spot check | Environment | It does not replicate `trailingSlash: false` routing, so deep links may 404. Fine for `/`. |
| A8 | Nyquist validation is enabled (`.planning/config.json` absent → default on) | Validation Architecture | If the user intended it off, this section is surplus — harmless. |

---

## Open Questions (RESOLVED)

All five were resolved during planning. Each carries its resolution inline below; the
technical content above each `**RESOLVED:**` line is unchanged from the original research.

1. **Which branch does Cloudflare Pages treat as production?**
   - **Known:** `origin/HEAD → origin/main`; `Profile.tsx:31` treats `"dev"` as the preview/beta branch; `getGitBranch()` prefers `CF_PAGES_BRANCH`.
   - **Unclear:** the Pages project's configured production branch is a dashboard setting that has not been read. `CF_PAGES_URL` cannot substitute — it carries a `*.pages.dev` URL on production deployments too.
   - **Recommendation:** implement with `=== "main"`, and add the confirmation to the same dashboard visit ROADMAP already schedules for Phase 2's BUILD-07 gate. If the planner wants belt-and-braces, define the production branch name as a single named constant at the top of `next.config.ts` so it is one line to change.
   - **RESOLVED (planning):** recommendation taken, with the belt-and-braces variant. Plan `01-01` Task 2 adds `const PRODUCTION_BRANCH = "main";` at module scope in `next.config.ts` so the branch name is one line to change. The question is **downgraded to assumption A1** rather than answered — the dashboard setting is still unread — and **no dashboard task is added to Phase 1**; ROADMAP already schedules that visit in Phase 2 alongside the BUILD-07 gate. A1 is carried forward verbatim in the `01-01` and `01-05` SUMMARYs.

2. **`document.body` at `createPortal` — scope it out explicitly, or guard it?**
   - **Known:** it is a render-time browser-global read; it crashes any prerender of Lightbox; it is unreachable in practice under the mount-on-click invariant; D-15 does not enumerate it and D-17 does not defer it.
   - **Unclear:** whether "reads no browser global during render" was meant as literally absolute, or as "the two that were found".
   - **Recommendation:** surface it to the user as a one-line decision (§ Conflict, options 1 vs 2). Do not resolve it silently in either direction.
   - **RESOLVED (user — Decision A):** option 1. The `createPortal` read is **scoped out explicitly** and handed to Phase 7; no guard is added and no source change is made for it. The honesty separation is binding on every plan: criterion 2's *stated proof mechanism* (the import-only probe build in plan `01-03`) is satisfied, its *literal wording* ("reads no browser global during render") is **not**, and no acceptance criterion anywhere in this phase may claim the literal wording is met. Recorded in plans `01-02`, `01-03`, and `01-05`, and in `01-VALIDATION.md` § Known Exceptions.

3. **What does the first paint of `LightboxImage` show before the container is measured?**
   - **Known:** the current code paints a `window`-derived guess for one frame. Any replacement must define a behaviour.
   - **Unclear:** whether the user cares about that single frame at all.
   - **Recommendation:** Option A (`useState(0)` + `useLayoutEffect`) — it makes the question moot by never painting the unmeasured value, and keeps the D-16 diff to two lines.
   - **RESOLVED (planner's discretion):** Option A taken. Plan `01-02` Task 3 replaces the initializer with `useState(0)` and promotes the mount effect to `useLayoutEffect`, so the unmeasured value is never painted and the question of what it shows becomes moot. The existing `setRatio` / `onResize` / `useResizeObserver` wiring is left byte-unchanged. Assumption A5 (the `useLayoutEffect` server-render warning is unreachable) is carried forward and is what plan `01-05`'s "zero console warnings" walk step would catch.

4. **`out/` commit policy for this phase.**
   - **Known:** 4–6 builds will run; churn is ~5–10 paths and ~1 MB per build, not 96 MB; `out/content/` stays clean; Turbopack build IDs are non-deterministic.
   - **Unclear:** the user's tolerance for extra commits.
   - **Recommendation:** option 1 (resync-first, source-only middle, one `chore(build): resync out/` per plan). Write it into the plan; do not leave it to the executor.
   - **RESOLVED (user — Decision B):** option 1, written into the plans as explicit tasks rather than left to executor judgement. Plan `01-01` Task 1 takes the dedicated resync-first commit (`chore(deps)` then `chore(build): resync out/`); every middle commit is source-only; each plan ends with one trailing `chore(build): resync out/`. `out/` stays **tracked** — untracking is Phase 2's BUILD-07 and is gated on reading the Cloudflare Pages build configuration first.

5. **Should the negative-control build be a required plan task?**
   - **Known:** three of five probe shapes produce a false pass. D-14 as written specifies only the positive build.
   - **Unclear:** whether the user considers the negative control in scope or scope creep.
   - **Recommendation:** include it. It costs one `npm run build` (~5 s) and it is the only thing that distinguishes "the fix works" from "the probe is broken." Probe shape is explicitly Claude's Discretion, so this is within the planner's latitude.
   - **RESOLVED (planner's discretion):** included. Plan `01-03` Task 1 is a dedicated **inverted** task whose expected outcome is a failing `npm run build`, with three independent assertions (non-zero exit, the client-boundary message, and an import trace ending at `probe-tmp`) plus two that rule out the wrong failure mode (`Error occurred prerendering` and `document is not defined` must both be absent). Task 2's positive proof additionally requires `/probe-tmp` in the Route table, which is what catches the underscore-folder and elided-import false passes.

---

## Sources

### Primary (HIGH confidence)

- **Direct reads of this repository's working tree** — `app/Lightbox.tsx`, `app/Attachments.tsx`, `app/isMobile.tsx`, `app/Profile.tsx`, `app/layout.tsx`, `app/page.tsx`, `app/[slug]/page.tsx`, `app/globals.css`, `app/Lightbox.module.css`, `app/Profile.module.css`, `next.config.ts`, `package.json`, `public/_headers`, `.gitignore`, `.gitattributes`
- **Reproduced builds** in an isolated copy of this project against the real `node_modules` — six `next build` runs covering: baseline, underscore-folder probe, routable `typeof` probe without/with `"use client"`, unused-import probe, rendering probe; plus three CDN-gate builds under `(none)`, `CF_PAGES=1 CF_PAGES_BRANCH=main`, `CF_PAGES=1 CF_PAGES_BRANCH=dev`; plus a determinism pair
- **Live `next dev` probing** — HTTP status of `/content/…` (200) vs `/cdn-cgi/image/…/content/…` (404), and the emitted HTML's CDN count (0)
- `node_modules/use-resize-observer/dist/index.d.ts` and `README.md` — v9.1.0 option/return semantics
- `git ls-files`, `git status --porcelain`, `git show HEAD:out/index.html`, `diff -rq`, `du -sh` — `out/` state and rebuild-churn measurements
- `.planning/phases/01-verifiable-baseline/01-CONTEXT.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/research/PITFALLS.md`
- [developers.cloudflare.com/pages/configuration/build-configuration/](https://developers.cloudflare.com/pages/configuration/build-configuration/) — system environment variables; `CF_PAGES=1`

### Secondary (MEDIUM confidence)

- App Router private-folder (`_folder`) routing exclusion — **behaviour reproduced here**, semantics cross-checked against Next.js project-structure documentation
- CSSOM empty-string-assignment semantics (`element.style.prop = ''` removes the declaration; the attribute serialises to `""`) — spec/MDN behaviour, consistent with the observed `overflow: unset` residue this phase removes
- Bash `pipefail` / `PIPESTATUS` — standard shell semantics; the exit-code masking itself was **observed** in a reproduced build

### Tertiary (LOW confidence — flagged for validation)

- Cloudflare Pages production-branch name for *this specific project* (A1) — inferred from `origin/HEAD` and `Profile.tsx`, not read from the dashboard
- Cloudflare Image Resizing being enabled on the production zone (A2) — not verifiable from the repo; no custom domain appears anywhere in the codebase
- `react-scrollbooster` warming the `isMobile` module cache before the Lightbox mounts (A6) — reasoned from source, not observed on a device

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Line-citation audit | **HIGH** | Every file read directly; the one drift found is exact and reproducible |
| CDN gate (D-01…D-07) | **HIGH** | Implemented and built under all three signal states; D-05 byte-identity diffed against the committed output |
| Client boundary (D-13/D-14) | **HIGH** | Six builds; three distinct false-pass modes reproduced; the rendering blocker reproduced with its exact error and line |
| Scroll lock (D-08…D-11) | **HIGH** for the code shape and the residue mechanism; **MEDIUM** for `getComputedStyle` cross-browser reporting of `overflow-y` (which is why only `overflow-x` is asserted) |
| Resize observer (D-16) | **HIGH** for the current wiring and the CSS-derived container box; **MEDIUM** for the `useLayoutEffect` recommendation (sound reasoning, not executed in a browser) |
| D-15 mobile hazard | **MEDIUM-HIGH** | Code path and CSS dependency verified by reading; the practical trigger depends on scrollbooster's pointer-event timing (A6), which was not observed on a device |
| `out/` state and churn | **HIGH** | Measured, not estimated; determinism from n=2 builds (A4) |
| Cloudflare environment | **HIGH** for the variable names/values (official docs); **LOW** for this project's dashboard configuration (A1, A2) |
| Validation architecture | **HIGH** | Every command in the mechanical block was executed |
| Pitfalls | **HIGH** | Every pitfall in this document was reproduced, not predicted |

**Research date:** 2026-08-08
**Valid until:** 2026-09-07 (30 days). Repo-specific findings are stable until the files change; the Next.js 16 / Turbopack behaviours are the fastest-moving part and should be re-verified if `next` is upgraded.
