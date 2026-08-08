---
phase: 01-verifiable-baseline
plan: 04
subsystem: docs
tags: [regression-checklist, manual-verification, cv-view, template]

# Dependency graph
requires:
  - phase: 01-verifiable-baseline
    provides: "app/lib/cdnImage.ts (plan 01-01) — cited by the checklist's CDN steps"
provides:
  - "CV-REGRESSION.md at the repo root — the permanent CV-regression checklist walked at the exit of every phase touching globals.css, Lightbox.tsx, contentLoader.ts, or the CDN helper"
affects: ["01-05 (first full walk of the checklist)", "Phase 2", "Phase 3", "Phase 4", "Phase 5", "Phase 7"]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Relative rather than literal expected values in permanent doc templates, so later phases never have to edit a 'never-mutated' file"]

key-files:
  created: ["CV-REGRESSION.md"]
  modified: []

key-decisions:
  - "overflow-x expectation phrased relative to app/globals.css's declared value rather than hardcoded 'hidden', since Phase 3 changes it to 'clip'"
  - "Avoided the literal substring 'npx serve' anywhere in the file (including in a 'do not use' warning) since the audit gate greps for zero occurrences of that exact string — described the prohibition without repeating the forbidden invocation"
  - "quality={50} no-op note added under the console-errors step as a known non-regression, per Task 2's audit requirement"

patterns-established:
  - "Permanent root-level doc template: state expectations relative to the source of truth they check (e.g. globals.css) rather than as literals, so the template survives changes in later phases without an edit"

requirements-completed: [BUILD-09]

# Metrics
duration: 15min
completed: 2026-08-08
---

# Phase 1 Plan 04: Author CV-REGRESSION.md Summary

**Wrote the permanent, repo-root CV-view regression checklist (`CV-REGRESSION.md`) — a fast core pass plus phase-flagged extras, with every mechanical step paste-ready and the overflow-x expectation phrased relative to `globals.css` so Phase 3 never has to edit the template.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2 completed
- **Files modified:** 1 (`CV-REGRESSION.md`, created)

## Accomplishments
- Authored `CV-REGRESSION.md` (129 lines) at the repo root, matching `CLAUDE.md`'s house style: H1 title, one-sentence purpose statement, `##` sections, dash bullets, no frontmatter/date/status line.
- Covered every D-20 core item: all-sections visual scan, fragile year-column note, dev-side and production-side CDN greps (with the plain-build reset in the same step), desktop drag-scroll, mobile swipe with the index-3-or-higher lightbox sub-step, full lightbox cycle, the residue console snippet (both `''` and `null` treated as empty), the relative overflow-x assertion, the four-width no-horizontal-scrollbar snippet (320/480/768/1440), light/dark via `prefers-color-scheme`, and zero-console-errors.
- Flagged both extras inline with owning phases: real-iPhone pass → Phase 6, network-panel check → Phase 7.
- Pre-named three known non-regressions so the first walk cannot generate a false failure: the dead `var(--transparent-border)` at `Lightbox.module.css:46`, the fragile year-column ghost-text trick, and `quality={50}` being a no-op under `images.unoptimized: true`.
- Audited the file for forbidden commands and fixed one finding: an earlier draft used the literal phrase "npx serve" inside a "do not use" warning, which the audit gate's `grep -ciF 'npx serve'` treats as a hard failure regardless of intent (the gate checks for zero occurrences of the string, not zero occurrences of it *as an instruction to run*). Reworded to describe the prohibition ("do not reach for `npx` to spin up a static server") without repeating the forbidden invocation verbatim.
- Committed the file alone, verified the commit contains no `out/` paths, and confirmed `git status --porcelain -- CV-REGRESSION.md` shows exactly the one expected entry before staging.

## Task Commits

1. **Task 1: Author CV-REGRESSION.md** — folded into the single commit below (no intermediate commit; Task 1 produced the file, Task 2 audited and committed it per the plan's action text)
2. **Task 2: Audit the checklist for forbidden commands and false-regression traps, then commit** — `52d3149` (docs)

_Plan text places the commit at the end of Task 2 only; Task 1's output is staged and committed together with Task 2's audit fixes, per the plan's own action ("Then commit" appears only in Task 2)._

## Files Created/Modified
- `CV-REGRESSION.md` — new permanent repo-root checklist; 129 lines, 6 fenced snippets (3 `js`, 3 `bash`), covers every D-20 core item plus both flagged extras.

## Decisions Made
- The `overflow-x` expectation is written as "confirm it matches the `overflow-x` value declared for `html, body` in `app/globals.css`" rather than the literal `hidden` — verified via `grep -cioE "overflowX[^\n]*(should be|===|must be) *['\"]?hidden"` returning `0`. This is deliberate: Phase 3 changes that declaration to `clip`, and a literal here would force an edit to a file meant to stay a never-mutated template (D-21).
- Chose not to state the literal string "npx serve" anywhere, even in a prohibition sentence, once the audit gate's exact-match grep was understood to be string-presence-based rather than intent-based. This keeps Task 2's forbidden-command audit passing without weakening the actual guidance (the http.server alternative and the reasoning for avoiding `npx` are both still fully documented).

## Deviations from Plan

None — plan executed as written. The one iteration (rewording the `npx serve` mention) happened during the plan's own Task 2 audit step, which explicitly instructs auditing for exactly this class of issue before committing; it is not a deviation from the plan but the plan's built-in self-check catching a first-draft mistake before the commit landed.

## Issues Encountered

**Walkability audit (recorded per Task 2's action):** Read the file top to bottom as a walker with no memory of this plan. Every mechanical step (the two `curl`/`grep` CDN checks, the production-build-and-reset pair, the two `js` console snippets, the four-width overflow check, and the `python3 -m http.server` fallback) is copy-pasteable exactly as written, with no placeholder text and an unambiguous expected result (`0`, non-zero, `PASS`/`FAIL`, or a specific string match). **Estimated walk time: approximately 4-5 minutes** for a developer already running `npm run dev` — the two build-and-grep steps (production CDN check + reset) account for most of that, since each is a full `next build`.

**Forbidden-command audit results:**
- `npm run lint`: 0 occurrences
- `npx serve` (as an exact string): 0 occurrences (fixed during audit — see Decisions Made)
- `npx ` generally as a way to obtain a static server: 0 occurrences; the file documents `cd out && python3 -m http.server 8080` as the sanctioned alternative
- `npm run build ... | tail` / `| head`: 0 occurrences
- `playwright`, `Playwright`, `vitest`, `Vitest`, `jest`: 0 occurrences each

**Known non-regressions pre-named in the file:**
1. Dead `var(--transparent-border)` at `Lightbox.module.css:46` (correct line, not the stale `:39` citation) — lightbox image border invisible in both themes.
2. Year-column ghost-text alignment (`Profile.module.css`'s `.year::before`) — fragile to font/type-size changes, noted so it isn't chased as a bug when it shifts.
3. `quality={50}` on the `next/image` call in `Attachments.tsx` — a no-op under `images.unoptimized: true`.

**Overflow-x relative-not-literal confirmation:** Verified via `grep -cioE "overflowX[^\n]*(should be|===|must be) *['\"]?hidden" CV-REGRESSION.md` → `0`. The file instead reads `app/globals.css`'s declared value at walk time. This matters because Phase 3 changes `html, body { overflow-x: hidden }` to `overflow-x: clip` (to support a sticky tab bar) — with a literal `hidden` baked into this template, Phase 3 would have had to edit a file explicitly designed to never be edited (D-21). No sticky-tab-bar presence is asserted anywhere in the file, since that would also become a false expectation before Phase 3.

**Exact commit message used:** `docs(01-04): add CV-REGRESSION.md`

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

`CV-REGRESSION.md` exists, is sound by every automated gate in this plan, and is ready for its first real outing. Plan `01-05` walks it end to end and records the first pass/fail result in its own verification artifacts — this file itself carries no results, per D-21 template discipline.

---
*Phase: 01-verifiable-baseline*
*Completed: 2026-08-08*

## Self-Check: PASSED

- `CV-REGRESSION.md` — FOUND
- Commit `52d3149` — FOUND in `git log --oneline --all`
