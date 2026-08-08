# Phase 1: Verifiable Baseline - Pattern Map

**Mapped:** 2026-08-08
**Files analyzed:** 6 (3 created — one of them throwaway, 3 modified)
**Analogs found:** 6 / 6 (2 exact, 3 self/role-match, 1 partial)

The file set is fixed by CONTEXT.md § Phase Boundary + § Integration Points. It is **not** expanded here. `app/globals.css` and `app/Lightbox.module.css` are read-only in this phase (see § Out of Scope).

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/lib/cdnImage.ts` **(new)** | utility | transform (pure string) | `app/lib/contentLoader.ts` (location/export style only) + `app/Attachments.tsx:13-20` (the body being moved) + `app/Profile.tsx:31` (env-flag read) | **partial** — location & export style transfer, data flow does not |
| `CV-REGRESSION.md` **(new)** | config / engineering doc | batch (human-run checklist) | `CLAUDE.md` (repo root) | **partial** — heading/tone exact, fenced-command pattern absent |
| `app/probe-tmp/page.tsx` **(new, throwaway)** | route (server component) | request-response (build-time prerender) | `app/page.tsx` | **exact** (role) |
| `app/Lightbox.tsx` **(modified ×3)** | component (client) | event-driven + DOM lifecycle | `app/Attachments.tsx:1-11` (directive), `app/isMobile.tsx:22-30` (hook), `app/Lightbox.tsx:221-236` (self — measurement already wired) | **exact** |
| `app/Attachments.tsx` **(modified, call site only)** | component (client) | transform (URL string at render) | itself — `:146-166` (image vs video branch) | **self** |
| `next.config.ts` **(modified)** | config | build-time / batch | itself — `env` block `:26-28` + `getGitBranch()` `:4-14` | **self** |

**Import-path convention (applies to every file above):** `tsconfig.json:21-23` defines a `@/*` alias, but **zero files in `app/` or `scripts/` use it** — every import is relative (`./lib/contentLoader`, `../lib/contentLoader`, `./isMobile`). Do not introduce `@/lib/cdnImage`; use `./lib/cdnImage` from `Attachments.tsx` and `../Lightbox` from the probe.

---

## Pattern Assignments

### `app/lib/cdnImage.ts` (new — utility, pure transform)

**Primary analog:** `app/lib/contentLoader.ts` — the **only** other file in `app/lib/`.

**What transfers from `contentLoader.ts`:**

| Convention | Evidence |
|---|---|
| Flat `app/lib/*.ts` — no `index.ts` barrel, no subdirectories | `ls app/lib` → `contentLoader.ts` only |
| **Named** `export function`, never `export default` | `contentLoader.ts:237` — `export async function loadProfileData(): Promise<any> {` (the file's only export) |
| Consumers import by name from a relative path | `app/page.tsx:3` — `import { loadProfileData } from "./lib/contentLoader";`; `app/[slug]/page.tsx:5` — `import { loadProfileData } from '../lib/contentLoader';` |
| Module-scope constants above the functions | `contentLoader.ts:20-34` — `const SECTION_MAP: Record<...> = { ... }` |
| JSDoc block comment above exported functions | `contentLoader.ts:234-236` |

`contentLoader.ts` JSDoc + export shape (lines 234-238):

```ts
/**
 * Load profile data from the new directory structure
 */
export async function loadProfileData(): Promise<any> {
  const contentPath = join(process.cwd(), 'public', 'content');
```

**⚠ Where the `contentLoader.ts` pattern does NOT transfer — do not copy these:**

| `contentLoader.ts` trait | Why it must not carry over |
|---|---|
| `import { promises as fs } from 'fs';` / `import { join } from 'path';` (`:1-2`) | Node built-ins make the module **server-only**. `cdnImage.ts` is imported by `Attachments.tsx`, a `"use client"` module — a `fs` import there would break the client bundle. `cdnImage.ts` must have **zero imports**. |
| `async` + `Promise<...>` return (`:237`) | The helper is synchronous and pure. Making it async would force a call-site rewrite that D-04's "call site only" scope forbids. |
| `try { ... } catch { return null }` silent-failure wrapping (`:6-16`, `:121`, `:172`, `:269`) | There is nothing to fail. String interpolation cannot throw. Adding a `try/catch` here is noise — and note the codebase has **zero** `try/catch` in any client component; it appears only in server data loaders. |
| `Promise<any>` / loose `any` typing | The RESEARCH-verified helper uses explicit `string` params and a `string` return (RESEARCH.md:981). Prefer the explicit types; the `any` habit is a legacy of the content-loading path, not a convention to extend. |

**Secondary analog — the exact body being moved.** `app/Attachments.tsx:13-20`, verbatim (this whole block is deleted from `Attachments.tsx`):

```ts
// Helper to get optimized thumbnail URL
// For Cloudflare Pages, you can use Cloudflare Image Resizing: /cdn-cgi/image/width=W,height=H,quality=Q,format=auto/URL
// For now, returns original URL (you can enable Cloudflare Image Resizing later)
const getThumbnailUrl = (originalUrl: string, maxHeight: number): string => {
  // If you want to use Cloudflare Image Resizing, uncomment and adjust:
  return `/cdn-cgi/image/width=${maxHeight * 2},height=${maxHeight * 2},quality=50,format=auto${originalUrl}`;
  //return originalUrl;
};
```

Two things to note. The template literal on line 18 is the **byte-exact string D-05 must preserve** (`width=${maxHeight * 2},height=${maxHeight * 2},quality=50,format=auto`). The comment block on lines 13-15 and the dead `//return originalUrl;` on line 19 are **stale and self-contradicting** — RESEARCH.md:1085 says do not carry them across. The moved function keeps an arrow-function-vs-`function`-declaration choice open; `contentLoader.ts` uses `export function` declarations (`:237`, `:52`, `:64`), so `export function` is the `app/lib/` convention even though the source site used a `const` arrow.

**Third analog — the build-time env-flag read.** `app/Profile.tsx:31-33` is the only existing consumer of a `NEXT_PUBLIC_*` value and the precedent D-02/D-03 extend:

```tsx
{process.env.NEXT_PUBLIC_GIT_BRANCH === "dev" && (
  <span className={styles.betaBadge}>beta</span>
)}
```

Pattern to copy: `process.env.NEXT_PUBLIC_*` compared with `===` against a **string literal**, never coerced to boolean via truthiness. Difference for `cdnImage.ts`: `Profile.tsx` reads it inline in JSX; the helper should hoist it to a module-scope `const` (RESEARCH.md:979, 987) so Turbopack folds the dead branch out of the client bundle entirely — verified: the identifier appears nowhere in `out/_next/`.

**Error handling / validation:** none, deliberately. See § Shared Patterns → Error handling.

---

### `app/Attachments.tsx` (modified — call site only)

**Analog:** itself. The image branch and the video branch already differ correctly; the diff must touch only the former.

**Import block to extend** (`:1-11`) — note double-quoted specifiers and that `"use client"` sits on line 1 with a blank line 2:

```tsx
"use client"

import { useRef, useState, useCallback } from "react";
import Image from "next/image";
import Scrollbar from "./Scrollbar";
import Lightbox from "./Lightbox";
import { AnimatePresence } from "framer-motion";
import { useScrollBoost } from 'react-scrollbooster';
import isMobile from "./isMobile";
import useResizeObserver from "use-resize-observer";
import styles from "./Attachments.module.css";
```

The new named import goes in this block (RESEARCH.md:991-995 places it after `use-resize-observer`, before the `styles` import — `styles` is last in every component file in this repo; keep it last).

**The two branches, verbatim (`:145-166`)** — the diff target is line 148 only:

```tsx
  let item;
  if (media.type === "image") {
    // Use optimized thumbnail URL for smaller file size
    const thumbnailUrl = getThumbnailUrl(media.url, height);   // ← :148  ONLY LINE THAT CHANGES
    item = <Image
      alt=""
      src={thumbnailUrl}
      height={height}
      width={height * returnThumbnailAspectRatio(media.width / media.height)}
      loading={shouldLoadEagerly ? "eager" : "lazy"}
      quality={50}                                             // ← :155  no-op, DO NOT TOUCH
    />
  } else if (media.type === "video") {
    item = <video
      src={media.url}                                          // ← :159  raw url, D-06: DO NOT TOUCH
      autoPlay
      loop
      muted
      playsInline
      preload={shouldLoadEagerly ? "auto" : "metadata"}
    />
  }
```

D-06 is already satisfied by line 159 passing `media.url` raw. `quality={50}` at `:155` is inert under `images.unoptimized` (`next.config.ts:18-20`; zero `srcset` in built HTML) — CONTEXT.md forbids "fixing" it.

**Net diff for this file:** delete `:13-20`, add one import line, change one identifier on `:148`. Nothing else.

---

### `next.config.ts` (modified — config, build-time)

**Analog:** itself. D-02/D-03 **extend the established flag pattern**; they do not add a mechanism.

**Current file, verbatim and complete:**

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
  images: {
    unoptimized: true,
  },
  trailingSlash: false,
  // Pin the workspace root so Turbopack doesn't pick up stray lockfiles above the repo
  turbopack: {
    root: __dirname,
  },
  env: {
    NEXT_PUBLIC_GIT_BRANCH: getGitBranch(),
  },
};

export default nextConfig;
```

Patterns to copy:
- **`getGitBranch()` is called, not cached.** It is a plain sync function invoked once at config evaluation, for both `next dev` and `next build`. The new key calls it again — that is fine and matches the existing shape (RESEARCH.md:269).
- **`env` values are strings.** The existing value is a `string` return. The new key must wrap its boolean in `String(...)` (RESEARCH.md:973) so the consumer's `=== "true"` comparison is honest.
- **`NEXT_PUBLIC_` prefix** on anything in this block — it is inlined into public JS (verified). Never put a secret here.
- **A `//` comment above any non-obvious line**, matching the two existing comments (`:5`, `:22`).

**Verified gate expression** (RESEARCH.md:965-970, built and grepped under all three signal states):

```ts
env: {
  NEXT_PUBLIC_GIT_BRANCH: getGitBranch(),
  NEXT_PUBLIC_CDN_IMAGES: String(
    Boolean(process.env.CF_PAGES) && getGitBranch() === "main"
  ),
},
```

RESEARCH.md Open Question 1 recommends hoisting `"main"` to a named module-scope constant so the unconfirmed production-branch assumption (A1) is one line to change. There is no existing named-constant analog in this file; `contentLoader.ts:20` (`const SECTION_MAP`) is the codebase's module-scope-constant style.

---

### `app/Lightbox.tsx` (modified — three separate edits)

Three edits land in this file. Sequence them per § Line-Shift Warning below.

#### Edit 1 — D-13: the client directive

**Analogs (both exact, both identical):** `app/Attachments.tsx:1-3` and `app/Profile.tsx:1-3`.

```tsx
"use client"

import Image from "next/image";
```

Exact conventions in both files: **double quotes**, **no semicolon**, line 1, followed by a **blank line 2**, then the import block. Copy that byte-for-byte — note `Lightbox.tsx`'s own imports use *single* quotes (`:1-6`), but the directive convention comes from the two files that already have one.

Current `Lightbox.tsx:1-6` (what the directive is prepended to):

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useResizeObserver from "use-resize-observer";
import ReactDOM from 'react-dom';
import isMobile from './isMobile';
import styles from './Lightbox.module.css';
```

#### Edit 2 — D-08/D-09/D-10/D-11: scroll lock

**Analog:** the effect being replaced, plus `Lightbox.tsx:49-55` for the capture/restore *shape* the file already uses for listeners.

Current effect, verbatim (`:21-33`) — note the scroll-restore and the lock share one `useEffect` with a `[]` dep array that must be preserved:

```tsx
  useEffect(() => {
    if (scrollRef.current && isMobile() && startingIndex > 0) {
      let bounds = scrollRef.current.getBoundingClientRect();
      scrollRef.current.scrollLeft = bounds.width * startingIndex;
    }

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
      document.documentElement.style.overflow = 'unset';
    };
  }, []);
```

The file's existing **setup-then-teardown-in-cleanup** idiom to mirror (`:49-55`):

```tsx
  useEffect(() => {
    window.addEventListener('keydown', handleKey);

    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, []);
```

Replacement shape (RESEARCH.md:676-683) — `overflowY` only, capture into `const`s before mutating, restore the captured values:

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

Verified context: `app/globals.css:54-58` declares `html, body { max-width: 100vw; overflow-x: hidden; }` — **line 58** is the `overflow-x: hidden` this lock currently stomps via the shorthand. That guard coming back into force is the observable proof (`getComputedStyle(document.body).overflowX`).

#### Edit 3 — D-15/D-16: render-time browser globals

**The `useIsMobile()` swap — no call-site analog exists in the repo.** `app/isMobile.tsx:22-30` exports the hook, and `grep -rn "useIsMobile" app` returns **only the declaration**. It has zero consumers today; `Attachments.tsx:47` and all five `Lightbox.tsx` sites use the direct `isMobile()` function instead. The planner must specify the call shape rather than point at an example.

The hook, verbatim (`app/isMobile.tsx:22-30`):

```tsx
export function useIsMobile(): boolean {
  const [localMobileValue, setLocalMobileValue] = useState(isMobileValue ?? false);

  useEffect(() => {
    setLocalMobileValue(isMobile());
  }, []);

  return localMobileValue;
}
```

Import must become a **mixed default + named** import (the module has both — default `isMobile` at `:32`, named `useIsMobile` at `:22`), because `Lightbox.tsx:22` keeps the direct call:

```tsx
import isMobile, { useIsMobile } from './isMobile';
```

The four render-time call sites to replace, verbatim:

```tsx
      data-mobile={isMobile()}                                          // :88
            const shouldRender = isVisible || isAdjacent || isMobile(); // :99
                display={isVisible || isMobile() ? true : false}        // :110
          {prev && next && !isMobile() ?                                // :265
```

⚠ `:88`, `:99`, `:110` are in `Lightbox`; **`:265` is in a different component** (`LightboxImage`, declared `:191`). `LightboxImage` needs its own `useIsMobile()` call at the top of its body — the value cannot be threaded from the parent without a prop change that is outside D-15's scope.

⚠ `Lightbox.tsx:22` (`if (scrollRef.current && isMobile() && ...)`) is the **fifth** call and is inside an effect. D-15 does not list it; RESEARCH.md:166 and Pitfall E say keep it and specify a behaviour for the mobile scroll restore (the `data-mobile` attribute may still be `"false"` in the DOM when this effect runs, which silently clamps `scrollLeft` to 0).

**The D-16 measurement — already wired. Do not rewrite it.** `Lightbox.tsx:197-198` and `:221-236`, verbatim:

```tsx
  const containerRef = useRef<HTMLDivElement>(null);                                              // 197
  const [containerAspectRatio, setContainerAspectRatio] =
    useState((window.innerWidth - 48) / (window.innerHeight - 96));                               // 198  ← the ONLY window read
  const imageAspectRatio = media.width / media.height;                                            // 199
  ...
  useEffect(() => {
    setRatio();                                                                                   // 221-223
  }, []);

  const setRatio = () => {                                                                        // 226-230
    if (!containerRef.current) { return }
    let bounds = containerRef.current.getBoundingClientRect();
    setContainerAspectRatio(bounds.width / bounds.height);
  }

  const onResize = () => {                                                                        // 232-234
    setRatio();
  }

  useResizeObserver({ ref: containerRef as any, onResize });                                       // 236
```

`setRatio`, `onResize`, and the `useResizeObserver` call already do everything D-16 describes. The change is line 198's initializer plus a decision about the pre-measurement paint. RESEARCH.md Option A (recommended) is `useState(0)` plus promoting `:221-223` to `useLayoutEffect`.

⚠ **`useLayoutEffect` has no analog in this codebase** — `grep -rn "useLayoutEffect" app` returns nothing. If Option A is chosen, this is a new-to-the-repo hook and the import on `:1` must be extended (`import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';`).

**The `useResizeObserver({ ref: x as any, onResize })` call form is already the repo-wide convention** — identical at `Attachments.tsx:67-68` and used in `Scrollbar.tsx`. Do not "improve" the `as any` cast here; it is consistent across three files.

**What `containerAspectRatio` feeds (`:261-262`)** — the only consumer, and the reason the first-paint value matters:

```tsx
            width: containerAspectRatio > imageAspectRatio ? "auto" : "100%",
            height: containerAspectRatio > imageAspectRatio ? "100%" : "auto",
```

**Known exception to leave in place (`:182`):**

```tsx
  , document.body);
```

`createPortal`'s target is a render-time `document` read that D-15 does not enumerate. RESEARCH.md § Conflict raises it as a user decision (scope out explicitly vs. guard). Do not resolve it while pattern-matching.

---

### `app/probe-tmp/page.tsx` (new, throwaway — server route)

**Analog:** `app/page.tsx`, verbatim and complete (13 lines) — the minimal App Router server page in this project:

```tsx
import styles from "./page.module.css";
import Profile from "./Profile";
import { loadProfileData } from "./lib/contentLoader";

export default async function Home() {
  const cv = await loadProfileData();

  return (
    <div className={styles.page}>
      <Profile cv={cv} />
    </div>
  );
}
```

Conventions that transfer: `export default function` named after the route (`Home`, `CaseStudyPage` in `app/[slug]/page.tsx:32`), relative imports, **no `"use client"`**, JSX returned directly. `async` is present only because these pages `await` data — the probe needs none, so a sync `export default function ProbePage()` is correct and still matches (`app/[slug]/page.tsx:7` shows a non-default sync export in the same file, so sync functions are not foreign here).

**The verified probe shape** (RESEARCH.md:1011-1022 — Experiment D; three other shapes produce false passes):

```tsx
// app/probe-tmp/page.tsx — TEMPORARY. Deleted before phase exit (D-14).
import Lightbox from '../Lightbox';

export default function ProbePage() {
  return <div>{typeof Lightbox}</div>;
}
```

Non-negotiable properties (each empirically established in RESEARCH.md):
1. Folder name must **not** start with `_` — `app/__probe/` is silently excluded from routing (false pass).
2. The binding must be **used** (`typeof Lightbox`) — an unused import is elided before boundary analysis (false pass).
3. It must **never render** `<Lightbox />` — `createPortal(…, document.body)` crashes the prerender regardless of the fix.

Note the existing repo precedent for a throwaway-ish route name: `app/[slug]/page.tsx:17` returns `{ slug: '__placeholder__' }`, which is why `/__placeholder__` shows in the build's Route table. The probe's route (`/probe-tmp`) appearing in that same table is the positive-proof marker.

---

### `CV-REGRESSION.md` (new — repo-root engineering doc)

**Analog:** `CLAUDE.md` at the repo root — the only other root-level `.md` (`ls -1 *.md` → `CLAUDE.md`). D-18 places the new file "alongside" it, so its structure is the house style.

**Heading structure and tone** (`CLAUDE.md:1-16`):

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start dev server (localhost:3000)
- `npm run build` — Build static export to `out/`
- `npm run lint` — Run ESLint
- `npm run migrate` — Run content structure migration (`tsx scripts/migrate-content.ts`)

No test framework is configured.

## Architecture

This is a **static portfolio/CV site** built with Next.js 15 (App Router) + React 19 + TypeScript.
```

Conventions to copy:
- H1 = the filename, followed by **one plain sentence** stating the file's purpose. No metadata block, no date, no status line.
- `##` for top-level sections, `###` for subsections (`CLAUDE.md:18`, `:24`, `:46`, `:53`, `:60`, `:67`).
- Dash bullets. Inline commands and identifiers in single backticks. **Em dash** (` — `) separating a bullet's subject from its description — used consistently at `:7-10`, `:20-22`, `:38-42`, `:62-65`.
- `**bold**` lead-ins for a labelled group (`:37` `**Key conventions:**`, `:44` `**Section mapping**`).
- Terse. No preamble paragraphs beyond one line per section.

**Fenced blocks — partial analog only.** `CLAUDE.md` has exactly **one** fence (`:28-35`), a language-less block holding a directory tree:

````markdown
```
public/content/
  001-general/          → general.json + media/
  002-workExperience/   → item subdirectories with item.json + media/
```
````

There is **no root-level precedent for paste-ready command fences**, which D-19 requires. Take the fence bodies from RESEARCH.md § Code Examples instead — `01-RESEARCH.md:1026-1043` (```bash, exit-code-safe build commands), `:1047-1058` (```js, the scroll-lock console assertion), `:1065-1070` (```js, the horizontal-overflow check). Those snippets are verified against this repo and are the intended content; tag the fences `bash` / `js` (RESEARCH.md does), even though `CLAUDE.md`'s single fence is untagged.

**Two commands that must NOT appear** (RESEARCH.md:787-790): `npm run lint` (no eslint installed — `package.json:9` is aspirational) and `npx serve out` (`serve` absent; use `cd out && python3 -m http.server 8080`). This is the one place `CLAUDE.md` must **not** be copied — `CLAUDE.md:9` lists `npm run lint` and is wrong.

**D-21 template discipline:** write value assertions relatively ("matches the `overflow-x` value declared in `globals.css`") rather than as literals, or Phase 3's `hidden` → `clip` change forces an edit to a file that is supposed to never mutate (RESEARCH.md:792-801).

---

## Shared Patterns

### Client boundary directive
**Source:** `app/Attachments.tsx:1-3`, `app/Profile.tsx:1-3`
**Apply to:** `app/Lightbox.tsx` (D-13) — and to nothing else this phase (`Scrollbar.tsx`, `RichText.tsx` are explicitly deferred).

```tsx
"use client"

import Image from "next/image";
```

Double quotes, no semicolon, blank line after. These are the only two files in the repo that declare it.

### Build-time env flag
**Source:** `next.config.ts:26-28` (producer) + `app/Profile.tsx:31` (consumer)
**Apply to:** `next.config.ts`, `app/lib/cdnImage.ts`

```ts
// producer
env: { NEXT_PUBLIC_GIT_BRANCH: getGitBranch() },
```

```tsx
// consumer — string literal comparison, never truthiness
process.env.NEXT_PUBLIC_GIT_BRANCH === "dev"
```

`NEXT_PUBLIC_` prefix, `String` values, `===` against a literal. Verified inlined and dead-code-eliminated by Turbopack.

### Component declaration shape
**Source:** `app/Attachments.tsx:22-27`, `app/Lightbox.tsx:8-17`, `app/Scrollbar.tsx:5-12`
**Apply to:** any component touched this phase (no new components are created; this exists so nothing gets "modernised" mid-edit).

```tsx
type AttachmentsProps = {
  attachments: Array<any>,
};
const Attachments: React.FC<AttachmentsProps> = ({
  attachments
}) => {
```

`type XProps = { ... }` with **comma** separators, then `const X: React.FC<XProps> = ({ destructured }) => {`, then `export default X;` on the last line. Loose `any` throughout. Do not convert to a plain function signature or tighten types opportunistically.

### DOM lifecycle effects
**Source:** `app/Lightbox.tsx:49-55`
**Apply to:** the D-08 scroll-lock rewrite

```tsx
  useEffect(() => {
    window.addEventListener('keydown', handleKey);

    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, []);
```

Setup in the body, teardown in the returned cleanup, `[]` deps. Every browser-global access in this file (except `createPortal`'s target and the `:198` initializer) already lives inside such an effect — that is exactly the invariant D-15 restores.

### Resize observation
**Source:** `app/Attachments.tsx:67-68`, mirrored in `app/Scrollbar.tsx`
**Apply to:** `app/Lightbox.tsx` D-16 (already present at `:236` — verify, do not rewrite)

```tsx
  useResizeObserver({ ref: containerRef as any, onResize });
```

The `as any` cast is consistent across all three call sites. Leave it.

### Error handling — the pattern is its absence
**Source:** `app/lib/contentLoader.ts:6-16`, `app/[slug]/page.tsx:11-18`, `:47-55`
**Apply to:** nothing this phase creates.

`try/catch` appears in exactly two places in `app/`: the server-side content loader (silent `catch { return null }`) and the case-study route (`catch { notFound() }`). **Zero** client components use `try/catch`, and there is no error-boundary, no `AppError` class, no logger. `app/lib/cdnImage.ts` must not introduce one.

### Validation — none exists
No schema library, no runtime validation, no decorators anywhere in the repo. Content shapes are `any`. Do not add validation to `cdnImage.ts`; the security rule that matters is different and structural: keep the CDN transform params **hardcoded**, never interpolated from content files (RESEARCH.md:1247).

### Testing — no analog, by project constraint
No test framework, no test files, no config. `CV-REGRESSION.md` is the substitute. Do not scaffold a test for any of these files.

---

## ⚠ Line-Shift Warning (read before sequencing tasks)

Three edits land in `app/Lightbox.tsx`, and **edit 1 (D-13) shifts every subsequent line citation by +2** (`"use client"` + blank line). Post-D-13 mapping:

| Pre-D-13 | Post-D-13 | Content |
|---|---|---|
| `:22` | `:24` | fifth `isMobile()`, inside the mount effect (keep) |
| `:27-32` | `:29-34` | scroll-lock body (D-08) |
| `:88, 99, 110` | `:90, 101, 112` | render `isMobile()` calls in `Lightbox` (D-15) |
| `:182` | `:184` | `createPortal(…, document.body)` (known exception) |
| `:197-198` | `:199-200` | `containerRef` + `window.innerWidth` initializer (D-16) |
| `:221-236` | `:223-238` | existing `setRatio` / `onResize` / `useResizeObserver` wiring |
| `:265` | `:267` | render `isMobile()` in `LightboxImage` (D-15) |

**Recommendation:** write task actions against **symbols and code snippets**, not line numbers (RESEARCH.md:175 reaches the same conclusion). Every excerpt in this document is quoted verbatim precisely so a planner can anchor on text.

**Corrected citation:** `app/Lightbox.module.css:39` (in CONTEXT.md § Known traps and PITFALLS Pitfall 14) is **stale**. Verified actual: **line 46** — `border: 1px solid var(--transparent-border);` inside `.imageWrap::after`. `app/globals.css:12` defines `--transparentBorder` (camelCase), so the reference is dead. Also verified: `app/globals.css:58` is the `overflow-x: hidden` line (inside the `html, body` rule at `:54-58`). Do not propagate line 39.

---

## Out of Scope (flagged, not mapped)

| Surface | Why flagged |
|---|---|
| `app/globals.css` | Explicitly **not** modified this phase (CONTEXT.md § Phase Boundary — Phase 3 owns it). Read-only here: `:58` `overflow-x: hidden` is the value the scroll-lock assertion reads back, and `:12` `--transparentBorder` explains the dead variable. No pattern assignment issued. |
| `app/Lightbox.module.css` | Read-only. The dead `var(--transparent-border)` at `:46` is a real defect and is **not** this phase's. Note it in the checklist so it is not "discovered" as a Phase 1 regression; do not add more. |
| `app/Scrollbar.tsx`, `app/RichText.tsx` | `"use client"` deferred (CONTEXT.md § Deferred). Used here only as read-only evidence for the component-shape and resize-observer conventions. |
| `package.json` | `npm run lint` at `:9` is broken (no eslint). BUILD-06 / Phase 2. Do not touch; just keep it out of `CV-REGRESSION.md`. |
| `out/` (112 tracked paths) | Not a source file, but the phase runs 4-6 builds and every one churns it. Needs an explicit commit-policy task per RESEARCH.md § `out/` Desync — a planning decision, not a pattern. |

## No Analog Found

| File / element | Role | Data Flow | Reason |
|---|---|---|---|
| `useIsMobile()` call site | hook consumption | event-driven | The hook exists (`app/isMobile.tsx:22-30`) but has **zero consumers** — `grep -rn "useIsMobile" app` returns only the declaration. No call-pattern example in the repo; the planner must state the shape, including the separate call needed inside `LightboxImage`. |
| `useLayoutEffect` (if D-16 Option A is chosen) | component lifecycle | DOM measurement | `grep -rn "useLayoutEffect" app` → nothing. New-to-repo hook; requires extending the `react` import on `Lightbox.tsx:1`. |
| Paste-ready command fences in a root-level doc | config / doc | batch | `CLAUDE.md` has one untagged fence holding a directory tree and no runnable commands. Source the fence bodies from `01-RESEARCH.md` § Code Examples instead. |
| A pure, dependency-free module in `app/lib/` | utility | transform | `contentLoader.ts` is async, `fs`-importing and server-only. `cdnImage.ts` shares its location and export style but nothing about its data flow. |

## Metadata

**Analog search scope:** `app/` (all 14 `.tsx`/`.ts` files), `app/lib/`, `app/[slug]/`, repo root (`next.config.ts`, `tsconfig.json`, `package.json`, `CLAUDE.md`, `*.md`)
**Files read in full:** `app/Lightbox.tsx`, `app/Attachments.tsx`, `app/isMobile.tsx`, `next.config.ts`, `app/page.tsx`, `app/[slug]/page.tsx`, `CLAUDE.md`
**Files read partially / grepped:** `app/lib/contentLoader.ts` (`:1-70`, `:230-250`, exports), `app/Profile.tsx` (`:1-45`), `app/Scrollbar.tsx` (`:1-12`), `app/globals.css`, `app/Lightbox.module.css`, `tsconfig.json`, `package.json`
**Project skills:** none — `.claude/` contains only `launch.json` and `settings.local.json`; no `.claude/skills/` or `.agents/skills/`
**Pattern extraction date:** 2026-08-08
