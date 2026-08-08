---
phase: 01-verifiable-baseline
plan: 01
subsystem: build
tags: [nextjs, turbopack, cloudflare-pages, image-resizing, env-gating]

# Dependency graph
requires: []
provides:
  - "Build-time CDN gate: NEXT_PUBLIC_CDN_IMAGES computed in next.config.ts, true only under CF_PAGES presence + PRODUCTION_BRANCH match"
  - "app/lib/cdnImage.ts — shared, import-free cvThumbnailUrl(originalUrl, maxHeight) helper"
  - "HEAD self-consistency: Next 16.3.0 + sharp 0.35.3 upgrade committed, out/ resynced to match"
  - "Phase base commit ref (d659bab) for plan 01-05's untouched-files proof"
affects: [01-02, 01-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "app/lib/*.ts flat modules, named exports, zero Node-builtin imports for client-consumed helpers"
    - "next.config.ts env block gates are string-typed and derived from PRODUCTION_BRANCH constant + Boolean(process.env.CF_PAGES) presence check"

key-files:
  created:
    - app/lib/cdnImage.ts
  modified:
    - next.config.ts
    - app/Attachments.tsx
    - package.json
    - package-lock.json
    - tsconfig.json
    - next-env.d.ts
    - out/ (two trailing resync commits)

key-decisions:
  - "PRODUCTION_BRANCH constant hardcoded to \"main\" pending Phase 2's Cloudflare dashboard confirmation (assumption A1, carried in ROADMAP)"
  - "next-env.d.ts's build/dev toggle diff folded into the Task 3 trailing resync commit rather than left dirty — mechanically identical to the out/ build-ID churn the plan already treats as expected residue"

patterns-established:
  - "Shared thumbnail URL builder lives in app/lib/cdnImage.ts, extended (not duplicated) by future gallery work in Phase 5"

requirements-completed: [BUILD-01]

# Metrics
duration: 7min
completed: 2026-08-08
---

# Phase 01 Plan 01: Build-Time CDN Gate Summary

**CDN image URLs now gate on `NEXT_PUBLIC_CDN_IMAGES` (Cloudflare-production-only), extracted into a shared `app/lib/cdnImage.ts` helper, with `HEAD` made self-consistent for an in-flight Next 15→16 upgrade.**

## Performance

- **Duration:** 7 min (commit timestamps 16:49:53 → 16:56:46)
- **Started:** 2026-08-08T16:49:53+01:00
- **Completed:** 2026-08-08T16:56:46+01:00
- **Tasks:** 3
- **Files modified:** 8 source files (package.json, package-lock.json, tsconfig.json, next-env.d.ts, next.config.ts, app/Attachments.tsx, app/lib/cdnImage.ts) plus `out/` (two resync commits)

## Accomplishments

- A developer running a plain `npm run build` now gets raw `/content/...` image `src` values — the CDN prefix is byte-identical-proven to survive only under simulated Cloudflare production signals
- `app/lib/cdnImage.ts` created as the single shared, import-free thumbnail URL builder (`cvThumbnailUrl`)
- `HEAD` made self-consistent: the in-flight Next 16.3.0 / sharp 0.35.3 upgrade is now committed, and the committed `out/` was resynced twice to match its actual Turbopack-built source
- All three signal states (Cloudflare production, `dev`-branch preview, local/dev) proven mechanically, plus D-05 byte-identity against the pre-change baseline

## Task Commits

Each task was committed atomically:

1. **Task 1: Capture the CDN URL baseline, then make HEAD self-consistent** — `d659bab` (chore(deps)) + `c5800d6` (chore(build))
2. **Task 2: Add the build-time gate, extract the helper, switch the call site** — `9304298` (feat)
3. **Task 3: Prove all three signal states and byte-identity, then resync out/** — `750db2d` (chore(build))

**Phase base commit (first commit of phase 01):** `d659bab3517904b11ee11b015520ccc5f81adb20`

## Files Created/Modified

- `app/lib/cdnImage.ts` — new shared helper; zero imports; exports `cvThumbnailUrl(originalUrl, maxHeight)`; returns `originalUrl` unchanged unless `NEXT_PUBLIC_CDN_IMAGES === "true"`
- `next.config.ts` — added module-scope `PRODUCTION_BRANCH = "main"` constant and `NEXT_PUBLIC_CDN_IMAGES: String(Boolean(process.env.CF_PAGES) && getGitBranch() === PRODUCTION_BRANCH)` in the existing `env` block
- `app/Attachments.tsx` — deleted the local `getThumbnailUrl` block (stale comments and dead code included); added `import { cvThumbnailUrl } from "./lib/cdnImage"`; switched the image call site from `getThumbnailUrl(media.url, height)` to `cvThumbnailUrl(media.url, height)`; video branch (`src={media.url}`) and `quality={50}` untouched
- `package.json` / `package-lock.json` — committed the already-installed Next 16.3.0 / sharp 0.35.3 upgrade (no `npm install` run)
- `tsconfig.json` — committed `jsx: react-jsx` and `.next/dev/types/**/*.ts` include, part of the same in-flight upgrade
- `next-env.d.ts` — committed twice: first the in-flight dev-form reference (Task 1), then the build-form reference after Task 3's builds (Next.js auto-regenerates this file's import paths depending on whether `next dev` or `next build` last ran)
- `out/` — two trailing resync commits (Task 1 and Task 3), keeping the committed static output in sync with the Turbopack builds actually run

## Decisions Made

- `PRODUCTION_BRANCH` hardcoded as `"main"` in `next.config.ts`, on the strength of `origin/HEAD → origin/main` and `Profile.tsx`'s existing `dev`-branch beta-badge precedent — the Cloudflare Pages dashboard's actual production-branch setting has not been read (Assumption A1, recorded below). ROADMAP already schedules confirming this in Phase 2; no task was added here to verify it.
- Folded the `next-env.d.ts` build/dev-toggle diff into Task 3's trailing resync commit rather than leaving it dirty at plan end — it is not manually edited application code, and its content mechanically tracks whichever of `next dev`/`next build` last ran, the same class of churn the plan already expects from `out/`'s build-ID directories.

## Build-State Verification (recorded per plan's `<output>` spec)

| Signal state | Command | `grep -c '/cdn-cgi/image/' out/index.html` |
|---|---|---|
| Local / no env vars | `npm run build` | **0** |
| Simulated Cloudflare production | `CF_PAGES=1 CF_PAGES_BRANCH=main npm run build` | **5** (all `/cdn-cgi/image/width=180,height=180,quality=50,format=auto...`) |
| Simulated `dev`-branch preview | `CF_PAGES=1 CF_PAGES_BRANCH=dev npm run build` | **0** (beta badge count in same build: **1**, confirming the two `NEXT_PUBLIC_*` flags did not entangle) |

**D-05 byte-identity:** `grep -o '/cdn-cgi/image/[^"]*' out/index.html | sort -u | diff - /tmp/cdn-baseline.txt` under the production-signal build produced **empty output, exit 0** — the 27 unique pre-change CDN URLs are reproduced byte-for-byte.

**Dev-server observations (State 3):**
- Raw image path `http://localhost:3000/content/002-workExperience/001-product-designer-at-instadeep/media/Product-designer-at-InstaDeep-1.png` → **HTTP 200**
- `curl -s http://localhost:3000/ | grep -c '/cdn-cgi/image/'` → **0**
- `pgrep -f 'next [d]ev'` after `pkill -f 'next [d]ev'` → no match (server cleanly stopped)

**Final committed state:** the last build recorded in `out/` was a plain `npm run build` with no `CF_PAGES*` variables — `grep -c '/cdn-cgi/image/' out/index.html` is `0`, confirmed after the trailing resync commit.

**Assumption A1 (per plan's `<output>` spec):** Cloudflare Pages' production branch is assumed to be `main`, on the strength of `origin/HEAD → origin/main` and `Profile.tsx:31`'s existing treatment of `dev` as the preview branch. The Pages dashboard's actual configured production branch has **not** been read. If it is not `main`, the gate never fires on the real production deploy and the live site silently loses image optimization. ROADMAP already schedules this dashboard confirmation in Phase 2 — no task was added in this plan to perform it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reverted an unplanned `next dev` side effect on `CLAUDE.md`**
- **Found during:** Task 3 (dev-server verification, State 3)
- **Issue:** Running `npm run dev` for the dev-server proof caused Next.js 16's built-in agent-rules generator (`node_modules/next/dist/server/lib/generate-agent-files.js`) to auto-append a `<!-- BEGIN:nextjs-agent-rules -->` block to `CLAUDE.md`. This directly conflicts with the plan's explicit constraint that `CLAUDE.md` stays untouched this phase (success criteria: "`CLAUDE.md`... untouched"; plan 01-05 verifies this across the whole phase against the phase base commit).
- **Fix:** `git checkout -- CLAUDE.md` immediately after the dev-server check completed, restoring it to its committed state. Confirmed via `git diff <phase-base> HEAD -- CLAUDE.md app/globals.css app/Lightbox.module.css` returning zero lines.
- **Files modified:** `CLAUDE.md` (reverted, not committed)
- **Verification:** `git status --short CLAUDE.md` empty after the revert; phase-wide zero-diff check passed
- **Committed in:** N/A — reverted before any commit; never entered the git history

---

**Total deviations:** 1 auto-fixed (1 blocking, Rule 3)
**Impact on plan:** The revert was necessary to satisfy an explicit, load-bearing plan and phase-wide invariant (`CLAUDE.md` untouched). No scope creep — no content of `CLAUDE.md` was otherwise read or altered.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `app/lib/cdnImage.ts` is ready to be extended by Phase 5's masonry-tile work (per D-05, the square `width = height` hardcode is deliberately preserved, not fixed, in this plan)
- `HEAD` at `750db2d` names `next@16.3.0` and carries a Turbopack `out/` that matches it; `git status --porcelain out/content/` is clean
- Plan 01-05 can resolve the phase base ref (`d659bab3517904b11ee11b015520ccc5f81adb20`) to prove `app/globals.css`, `app/Lightbox.module.css`, and `CLAUDE.md` went untouched across the whole phase
- Assumption A1 (production branch = `main`) remains open; carried forward to Phase 2's already-scheduled Cloudflare dashboard visit

---
*Phase: 01-verifiable-baseline*
*Completed: 2026-08-08*

## Self-Check: PASSED

All created/modified files confirmed present on disk (`app/lib/cdnImage.ts`, `next.config.ts`, `app/Attachments.tsx`, this SUMMARY). All commit hashes (`d659bab`, `c5800d6`, `9304298`, `750db2d`, `ad9c767`) confirmed present in `git log --oneline --all`.
