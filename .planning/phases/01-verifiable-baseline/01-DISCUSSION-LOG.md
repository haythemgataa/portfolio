# Phase 1: Verifiable Baseline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-08
**Phase:** 1-Verifiable Baseline
**Areas discussed:** CDN dev bypass, Scroll-lock rewrite, Proving the boundary, The checklist

---

## CDN dev bypass (BUILD-01)

### Q1 — What decides whether the `/cdn-cgi/image/` prefix is applied at build time?

| Option | Description | Selected |
|--------|-------------|----------|
| Branch signal | Reuse `NEXT_PUBLIC_GIT_BRANCH` already computed in `next.config.ts`. One signal, no new config, also fixes broken `*.pages.dev` preview thumbnails. | ✓ |
| Explicit `NEXT_PUBLIC_CDN_IMAGES` | Dedicated flag in the `env` block, on for build, off for dev. More explicit and overridable; second signal to keep in sync, doesn't fix pages.dev. | |
| Both — flag with branch default | Flag defaulting from the branch, explicitly overridable. Covers every case; two things to document. | |

**User's choice:** Branch signal
**Notes:** Surfaced during the question that `output: 'export'` makes this a build-time-only decision — no runtime branch exists in this codebase.

### Q2 — How should the rule distinguish "production build" from "running locally on the main branch"?

| Option | Description | Selected |
|--------|-------------|----------|
| Branch AND not dev server | Gate on `CF_PAGES` presence in addition to the production branch. Local builds and `next dev` both bypass. | ✓ |
| Gate on `CF_PAGES` only | Simplest rule; drops the branch check, so dev-branch pages.dev previews keep showing broken thumbnails. | |
| Branch alone, accept the trap | Simplest to read; anyone working locally on `main` hits the bug this requirement exists to kill. | |

**User's choice:** Branch AND not dev server
**Notes:** `getGitBranch()` in `next.config.ts` already prefers `CF_PAGES_BRANCH`, so the Cloudflare signal is already in the file.

### Q3 — Where does the helper live after this phase, and does its output change?

| Option | Description | Selected |
|--------|-------------|----------|
| Extract, behavior identical | Move to `app/lib/cdnImage.ts` + bypass; emitted params byte-for-byte identical. Phase 5 extends for masonry. Zero blast radius on the shipped CV. | ✓ |
| Extract and fix the square params now | Also switch to width-only + `fit=scale-down` per Pitfall 6. Changes what live CV thumbnails request in the same phase the checklist is written. | |
| Leave it in `Attachments.tsx` | Bypass in place, extract in Phase 5. Smallest diff now; Phase 5 then refactors a CV-critical file with more code around it. | |

**User's choice:** Extract, behavior identical

### Q4 — How is "production build still emits `/cdn-cgi/` URLs" checked?

| Option | Description | Selected |
|--------|-------------|----------|
| Grep the built output | Grep `out/index.html` under production signals; grep a dev build to confirm absence. Both commands go in the checklist. | ✓ |
| Visual check on the live site | Proves the real thing end to end; slow, needs a deploy, can't fit a three-minute checklist. | |
| Both | Grep as the fast gate plus one live confirmation at phase exit. | |

**User's choice:** Grep the built output

---

## Scroll-lock rewrite (BUILD-02)

### Q1 — How much structure does the fix get, given Phase 7 adds a second Lightbox consumer?

| Option | Description | Selected |
|--------|-------------|----------|
| Capture-and-restore inline | Fix in place. Smallest diff to a CV-critical file in the phase establishing the baseline. Phase 7 extracts the hook when it has two consumers. | ✓ |
| Extract `useScrollLock()` now | Build the ref-counted hook so Phase 7 just consumes it (Pitfall 2's recommendation). Writes shared infrastructure against one real caller and one guessed one. | |
| Inline now, hook stub noted | Same code as option 1, with the Phase 7 follow-up recorded. | |

**User's choice:** Capture-and-restore inline
**Notes:** The ref-counting requirement was still recorded as a deferred idea for Phase 7 so it isn't rediscovered.

### Q2 — Which axis does the lock touch?

| Option | Description | Selected |
|--------|-------------|----------|
| `overflowY` only | Leaves `overflow-x` untouched entirely; removes the coupling to the `globals.css` guard structurally. | ✓ |
| Keep the shorthand, restore properly | Correct if the restore is right, but keeps the Lightbox overriding `overflow-x`. | |

**User's choice:** `overflowY` only

### Q3 — Add `scrollbar-gutter: stable` to `globals.css` in this phase?

| Option | Description | Selected |
|--------|-------------|----------|
| No — leave `globals.css` alone | Phase 3 owns that file for the sticky fix. Keeps Phase 1's edits to two surfaces. | |
| Yes — add it now | Fixes an existing papercut; makes Phase 1 edit three shared surfaces including the most load-bearing one. | |
| Note it for Phase 3 | Don't add it; record it as a decision Phase 3 should make when it opens `globals.css`. | ✓ |

**User's choice:** Note it for Phase 3

### Q4 — Does `html` get held to the same clean-style bar as `body`?

| Option | Description | Selected |
|--------|-------------|----------|
| Both `html` and `body` | Both are locked by the same effect and would carry the same residue; Phase 3's sticky work reads both. | ✓ |
| Body only, per the criterion | Meets the written criterion exactly; leaves the `html` residue unverified. | |

**User's choice:** Both `html` and `body`

---

## Proving the boundary (BUILD-03)

### Q1 — What form does the build proof take?

| Option | Description | Selected |
|--------|-------------|----------|
| Throwaway probe, deleted after | Temporary server component imports Lightbox, build must succeed, probe deleted, rebuild. Real proof, nothing extra ships. | ✓ |
| Permanent server-component import | Standing guarantee on every future build; dead code in a repo whose Phase 2 goal is shipping less, and tree-shaking could silently void it. | |
| Prove it via the real Phase 7 shape | Zero artifacts; defers the check six phases past the fix — the ordering the criterion exists to prevent. | |

**User's choice:** Throwaway probe, deleted after

### Q2 — How far does the "no browser global during render" clean-up go?

| Option | Description | Selected |
|--------|-------------|----------|
| Both — `window` and `isMobile` | Fix the `window.innerWidth` initializer AND swap the four inline `isMobile()` calls for the existing `useIsMobile()` hook. | ✓ |
| `window.innerWidth` only | Fixes the one that crashes a prerender; leaves a hydration-mismatch source in a component Phase 7 mounts from a new parent. | |
| `window.innerWidth`, `isMobile` noted for Phase 7 | Defers churn on a file this phase already edits twice. | |

**User's choice:** Both — `window` and `isMobile`
**Notes:** `useIsMobile()` already exists at `app/isMobile.tsx:22-30`, so the swap needs no new code.

### Q3 — What replaces the `window.innerWidth` initializer for the container aspect ratio?

| Option | Description | Selected |
|--------|-------------|----------|
| Measure the container | Use the already-imported `use-resize-observer` and existing `containerRef`; drops the hardcoded 48/96 padding guess. Strictly more correct than what's there. | ✓ |
| Neutral initial value + `useEffect` | Smallest behavioural change; keeps the padding assumption and shows one frame at the default ratio. | |
| Drop the JS math, use CSS | Least code; a visual rewrite of the CV lightbox in the phase whose job is not regressing it. | |

**User's choice:** Measure the container

---

## The checklist (BUILD-09)

### Q1 — Where does the checklist live?

| Option | Description | Selected |
|--------|-------------|----------|
| Repo root | `CV-REGRESSION.md` beside `CLAUDE.md`. A permanent engineering artifact that outlives the milestone; visible to anyone opening the project. | ✓ |
| `docs/` | Tidier root; creates a directory convention as a side effect of a bug-fix phase. | |
| `.planning/` | Lives with the artifacts referencing it; couples a permanent asset to a directory future cleanup treats as disposable. | |

**User's choice:** Repo root

### Q2 — What form does each step take?

| Option | Description | Selected |
|--------|-------------|----------|
| Copy-pasteable commands where possible | Paste-ready console snippets and shell greps for mechanical steps; prose for visual ones. Keeps the few-minute budget honest. | ✓ |
| Prose checkboxes only | Fastest to write, reads cleanly; mechanical steps get performed inconsistently. | |
| Prose plus an optional appendix of snippets | Readable walk-through at the cost of a lookup per mechanical step. | |

**User's choice:** Copy-pasteable commands where possible

### Q3 — What's in scope for every walk vs. reserved for specific phases?

| Option | Description | Selected |
|--------|-------------|----------|
| Fast core + flagged extras | Core desktop/dark-mode/four-widths/lightbox-cycle/clean-console pass, plus extras flagged for the phases that trigger them (real iPhone → Phase 6, network panel → Phase 7). | ✓ |
| One list, everything every time | Maximum coverage, no judgement calls; won't fit a few minutes, and the expensive steps get quietly skipped. | |
| Minimal core only | Leanest; scatters verification knowledge across seven roadmap entries instead of one file. | |

**User's choice:** Fast core + flagged extras

### Q4 — How is a completed walk recorded?

| Option | Description | Selected |
|--------|-------------|----------|
| Result noted in the phase's own artifacts | Checklist stays a clean unmutated template; each phase records date/result/failures in its own verification output. | ✓ |
| A results log inside the checklist file | Single file tells the whole story; mixes a stable template with mutable history and grows every phase. | |
| Checked-off copy per phase | Most literal record; seven near-duplicates, and template edits don't propagate. | |

**User's choice:** Result noted in the phase's own artifacts

---

## Claude's Discretion

The user selected the recommended option on every question — nothing was explicitly delegated. Latitude retained by planner/executor is enumerated in CONTEXT.md under "Claude's Discretion" (helper naming, plan/commit decomposition, checklist wording within the fixed content, probe placement).

## Deferred Ideas

- `scrollbar-gutter: stable` on `html` — Phase 3, alongside `overflow-x: clip`
- Ref-counted `useScrollLock()` hook — Phase 7, when a second consumer exists
- Width-only + `fit=scale-down` CDN params — Phase 5, when masonry tiles need them
- `"use client"` on `Scrollbar.tsx` / `RichText.tsx` — not load-bearing; `CLAUDE.md` corrected in Phase 2
- Documenting the CDN flag in `CLAUDE.md` — Phase 2 (BUILD-08)
- Lightbox keydown scoping, stable keys, divide-by-zero guard, focus trap, ARIA labels — Phase 7 (Pitfall 10)
- Playwright screenshot tests — out of scope for v1.1; v1.2 candidate per Pitfall 14
