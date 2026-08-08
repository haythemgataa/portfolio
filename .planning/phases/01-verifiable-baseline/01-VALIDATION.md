---
phase: 1
slug: verifiable-baseline
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-08
updated: 2026-08-08
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> Source: `01-RESEARCH.md` § Validation Architecture. Every command below was executed
> against this repo or an exact copy of it during research.
>
> **Planning is complete.** All 22 rows below are mapped to a plan task (Plan / Wave / Task
> columns filled). The `Status` column tracks **execution**, not planning, and stays
> `⬜ pending` until `/gsd:execute-phase 1` runs.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | **None** — deliberate, locked project constraint (PROJECT.md, REQUIREMENTS.md "Out of Scope: Adding a test framework", STATE.md). Substitute is `CV-REGRESSION.md` (BUILD-09). |
| **Config file** | none — and none is to be created |
| **Quick run command** | `set -o pipefail; npm run build` |
| **Full suite command** | `npm run build` + the mechanical block (§ RESEARCH.md 1183-1223) + a `CV-REGRESSION.md` walk |
| **Estimated runtime** | ~5 s per build (cold, reproduced); full block ~60 s incl. dev-server smoke |

**Sampling substitute:** shell commands, build-log assertions, greps over `out/`, and
paste-ready browser-console snippets. This is not a degraded form of testing for this
project — it is the agreed verification mechanism.

---

## Sampling Rate

- **After every task commit:** `set -o pipefail; npm run build` must exit 0.
  - ⚠ **One exception:** the D-14 negative-control task's *expected* outcome is a **failing**
    build. That task must be marked inverted in the plan, or a naive "build must pass" gate
    flags a correct step as broken. *(Satisfied: plan `01-03` Task 1 is named
    "Task 1 (INVERTED — this build MUST FAIL)".)*
  - ⚠ **Exit-code masking:** never write `npm run build 2>&1 | tail` — that returns `tail`'s
    exit code and printed `EXIT=0` on a definitively failed build during research. Use
    `set -o pipefail`.
  - ⚠ **Pipeline short-circuit before a build:** a build whose status is read afterwards must
    run **unconditionally on its own line**, with the status captured on the next line
    (`EXIT=$?`), and any log it writes must be `rm -f`'d first. Never place the build at the
    tail of an `&&` chain whose earlier elements are pipelines (`head -1 <file> | grep -q …`)
    and then read `${PIPESTATUS[0]}`: `head` exits `0` regardless of what `grep` finds, so a
    failed precondition short-circuits past the build while `PIPESTATUS[0]` still reads `0`,
    and the log assertions then run against a **stale** log from an earlier attempt. Enforced
    in `01-03` Task 1 and Task 2. Preconditions belong in a braced group that hard-`exit 1`s.
- **After every plan wave:** the full mechanical block, plus a plain `npm run build` (no
  `CF_PAGES*` env vars) so the committed `out/` reflects a real local build.
- **Before `/gsd:verify-work`:** every row of the Per-Requirement Verification Map green,
  plus a complete `CV-REGRESSION.md` walk with zero failures (D-22).
- **Max feedback latency:** ~5 s (single build).

---

## Grep-Gate Hygiene (binding on every row below)

Several gates in this phase count occurrences in source files that also carry prose about
the very tokens being counted. Two rules follow, and both are enforced in the plans:

1. **Filter whole-line comments before counting** — `SRC=$(grep -vE '^\s*(//|\*|/\*)' <file>)`,
   then count over `$SRC`. Used for `app/Lightbox.tsx`, `app/lib/cdnImage.ts`, and
   `app/probe-tmp/page.tsx`. Without it the probe's own header (which contains both
   `<Lightbox/>` and `"use client"`) self-invalidates its gate.
2. **Trailing comments are not filtered** — any explanatory `//` note the plans require must
   sit on its own line, never at the end of a code line, or it inflates the count.

**Positional git refs are forbidden in wave 1.** Plans `01-01` and `01-04` commit
concurrently in the same working tree, so `git log --oneline -1`, `HEAD~1`, and `HEAD~2` are
not stable there. Wave-1 gates resolve commits by message
(`git log --format='%H %s' -n 8 | grep -m1 '<msg>' | cut -d' ' -f1`). Waves 2–4 run one plan
at a time and may use positional refs.

**`pkill -f` / `pgrep -f` must use a bracketed pattern.** `-f` matches full command lines, so a
bare `pkill -f "next dev"` also matches the shell running the command and kills the task
mid-flight, and a bare `pgrep -f "next dev"` matches itself and can never report empty. Use
`pkill -f 'next [d]ev'` / `pgrep -f 'next [d]ev'`: the regex still matches the server's argv but
not the literal text of the command issuing it. Applies to `01-01` Task 3 and `01-05` Task 3.

**No gate may assert a globally clean `git status`.** `.planning/STATE.md` is modified for
the whole phase by instruction, `.claude/` is untracked, and each plan's `*-SUMMARY.md` is
untracked when its own final gate runs. Working-tree gates are path-scoped:
`git status --porcelain -- app/ next.config.ts CV-REGRESSION.md out/`.

---

## Per-Task Verification Map

Task IDs are assigned by the planner; rows below are the **binding requirement-level
contract** each task must inherit. Plan / Wave / Task columns are **filled** — every row is
owned by exactly one plan task.

| # | Plan | Wave | Task | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---|------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1 | `01-01` | 1 | Task 1 (phase's first task) | BUILD-01 / D-05 | — | N/A | baseline | `git show HEAD:out/index.html \| grep -o '/cdn-cgi/image/[^"]*' \| sort -u > /tmp/cdn-baseline.txt; wc -l < /tmp/cdn-baseline.txt` → `27` | ✅ | ⬜ pending |
| 2 | `01-01` | 1 | Task 2 | BUILD-01 / D-03 | T-01-01 | N/A | build+grep | `npm run build && test "$(grep -c '/cdn-cgi/image/' out/index.html)" -eq 0` | ✅ | ⬜ pending |
| 3 | `01-01` | 1 | Task 3 | BUILD-01 / D-07 | — | N/A | build+grep | `CF_PAGES=1 CF_PAGES_BRANCH=main npm run build && test "$(grep -c '/cdn-cgi/image/' out/index.html)" -gt 0` | ✅ | ⬜ pending |
| 4 | `01-01` | 1 | Task 3 | BUILD-01 / D-03 | — | N/A | build+grep | `CF_PAGES=1 CF_PAGES_BRANCH=dev npm run build && test "$(grep -c '/cdn-cgi/image/' out/index.html)" -eq 0` | ✅ | ⬜ pending |
| 5 | `01-01` | 1 | Task 3 | BUILD-01 / D-05 | T-01-04 | N/A | diff | prod-build grep `\| sort -u \| diff - /tmp/cdn-baseline.txt` → empty | ✅ | ⬜ pending |
| 6 | `01-01` | 1 | Task 3 | BUILD-01 | — | N/A | smoke | dev server: `curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000$IMG"` → `200` | ✅ | ⬜ pending |
| 7 | `01-01` | 1 | Task 3 | BUILD-01 | — | N/A | smoke | `curl -s http://localhost:3000/ \| grep -c '/cdn-cgi/image/'` → `0` | ✅ | ⬜ pending |
| 8 | `01-01` | 1 | Task 2 | BUILD-01 / D-06 | T-01-02 | N/A | grep | `grep -n 'cdnImage\|ThumbnailUrl' app/Attachments.tsx` → hits only in the image branch; `grep -c 'src={media.url}' app/Attachments.tsx` → `1` | ✅ | ⬜ pending |
| 9 | `01-02` | 2 | Task 1 | BUILD-02 / D-09 | T-01-05 | N/A | grep | comment-filtered `grep -c 'style\.overflow[^Y]'` → **0** (zero bare `.overflow`) | ✅ | ⬜ pending |
| 10 | `01-02` | 2 | Task 1 | BUILD-02 / D-10 | T-01-05 | N/A | grep | comment-filtered `grep -c "'unset'"` → **0**; `grep -c 'style\.overflowY'` → **6** (2 captures, 2 `'hidden'`, 2 restores) | ✅ | ⬜ pending |
| 11 | `01-05` | 4 | Task 2 (checkpoint) | BUILD-02 / D-10, D-11 | T-01-05 | N/A | console (manual) | post-cycle snippet: `html` **and** `body` `getAttribute('style')` both empty → `PASS` | ✅ | ⬜ pending |
| 12 | `01-05` | 4 | Task 2 (checkpoint) | BUILD-02 | T-01-05 | N/A | console (manual) | `getComputedStyle(document.body).overflowX` matches `globals.css` (`hidden` in Phase 1) | ✅ | ⬜ pending |
| 13 | `01-03` | 3 | Task 1 | BUILD-03 / D-14 | T-01-10, T-01-11 | N/A | build (**inverted — MUST FAIL**) | probe present, no directive → build fails with ``You're importing a module that depends on `useState``` + import trace naming `probe-tmp` | ✅ | ⬜ pending |
| 14 | `01-03` | 3 | Task 2 | BUILD-03 / D-13 | T-01-11 | N/A | build (**must pass**) | probe present + directive → build succeeds **and** `/probe-tmp` appears in the Route table | ✅ | ⬜ pending |
| 15 | `01-03` | 3 | Task 2 | BUILD-03 / D-14 | T-01-11 | N/A | log grep | `grep '/probe-tmp' /tmp/probe-after.log` → present (catches the tree-shaken false-pass) | ✅ | ⬜ pending |
| 16 | `01-03` | 3 | Task 2 | BUILD-03 / D-13 | — | N/A | static | `head -1 app/Lightbox.tsx \| grep -q '"use client"'` | ✅ | ⬜ pending |
| 17 | `01-03` | 3 | Task 3 | BUILD-03 / D-14 | T-01-09 | N/A | build + fs | `rm -rf app/probe-tmp && npm run build && test ! -e out/probe-tmp.html` | ✅ | ⬜ pending |
| 18 | `01-02` | 2 | Task 3 | BUILD-03 / D-15 | T-01-08 | N/A | grep + review | comment-filtered `grep -c 'window.innerWidth'` → 0; `grep -n 'window\.\|document\.\|navigator\.\|isMobile()' app/Lightbox.tsx` → every hit inside an effect **except the documented `createPortal` exception** | ✅ | ⬜ pending |
| 19 | `01-04` | 1 | Task 1 | BUILD-09 / D-18 | — | N/A | fs | `test -f CV-REGRESSION.md` | ✅ | ⬜ pending |
| 20 | `01-04` | 1 | Task 1 | BUILD-09 / D-19 | — | N/A | grep | `grep -c '```' CV-REGRESSION.md` → `≥ 6` | ✅ | ⬜ pending |
| 21 | `01-04` | 1 | Task 1 | BUILD-09 / D-20 | T-01-13, T-01-14 | N/A | grep | file contains each of: `320`, `480`, `768`, `1440`, `prefers-color-scheme`, `getAttribute('style')`, `cdn-cgi`, `console`, `overflowX`, `globals.css`, `python3` | ✅ | ⬜ pending |
| 22 | `01-05` | 4 | Task 3 | BUILD-01 / Pitfall F | T-01-17 | N/A | build+grep | **final** task of the phase: plain `npm run build` (no `CF_PAGES*`), `grep -c '/cdn-cgi/image/' out/index.html` → `0` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — this column tracks execution, not planning.*

**Coverage check:** every row has an owning plan task, and every plan task that produces a
verifiable outcome maps back to at least one row. Plan `01-05` Task 1 re-runs rows 2–7, 9,
10, 16, and 18 as an end-of-phase consolidation; that is deliberate redundancy, not a
duplicate owner.

---

## Wave 0 Requirements

No test infrastructure is required or permitted. Two **ordering prerequisites**, both real
tasks — **both are now explicit plan tasks**, which is what closes wave 0:

- [x] **Capture `/tmp/cdn-baseline.txt`** from `git show HEAD:out/index.html` **before any file
      is edited** (expect 27 unique URLs, param string
      `width=180,height=180,quality=50,format=auto`). Without it, D-05's byte-identity claim
      degrades from a diff to an eyeball. Must be the phase's first task.
      → **Owned by `01-01` Task 1**, which is the phase's first task and edits nothing.
      Re-verified against the working tree during planning: 27 unique URLs, 1 unique param
      string.
- [x] **`out/` commit policy is written into the plan as explicit tasks** — resolved by the
      user: *resync commit first, then source-only commits, then one
      `chore(build): resync out/` per plan.* Not left to executor judgement.
      → **Owned by `01-01` Task 1** (`chore(deps)` then `chore(build): resync out/`), with a
      trailing `chore(build): resync out/` task in `01-01` Task 3, `01-02` Task 3,
      `01-03` Task 3, and `01-05` Task 3.

*No framework install. No test files. This is intentional and locked.*

---

## Manual-Only Verifications

All of these are owned by **`01-05` Task 2**, the phase's single blocking
`checkpoint:human-verify`, walked against `CV-REGRESSION.md` (authored by `01-04` Task 1).

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Thumbnails visibly render, not broken-image icons | BUILD-01 | Image decode success is not observable from HTML or HTTP status | `npm run dev`, load `localhost:3000`, scan every attachment strip |
| Lightbox full cycle: open / arrows / Esc / backdrop click | BUILD-02 | Interaction sequence | Open from a CV attachment, arrow through, Esc, reopen, click backdrop |
| Mobile lightbox opens on the **correct** item | BUILD-03 / D-15 | Touch + timing dependent | Touch-emulated or real device: open an attachment at **index ≥ 3**, confirm the item shown. `useIsMobile()` returns `false` on first render, so `.carouselScroll` may lack `overflow-x: scroll` when the mount effect assigns `scrollLeft` — a silent clamp to index 0. See RESEARCH.md § D-15 Mobile Hazard |
| Fit logic correct at multiple sizes | BUILD-03 / D-16 | Visual containment | Open a portrait and a landscape attachment; resize the window; both stay contained, no overflow or letterbox drift |
| Year column aligned | BUILD-09 / D-20 | Visual | Visual scan. Fragile — `Profile.module.css:97-113` uses a hidden `content: "0000 — 0000"` ghost-text trick that breaks on any font/type-size change |
| Light **and** dark themes | BUILD-09 / D-20 | Visual | DevTools → Rendering → Emulate `prefers-color-scheme`. **Known non-regression:** `Lightbox.module.css:46` references dead `var(--transparent-border)` (`globals.css:12` defines `--transparentBorder`) — the image border is invisible in *both* themes today. Do not log as a Phase 1 regression |
| Zero console errors/warnings | BUILD-09 / D-20 | Console inspection | "All levels" filter; empty on load and after one full lightbox cycle. This is the step that would surface an unexpected `useLayoutEffect` server-render warning (assumption A5) |
| Checklist walked at phase exit, zero failures | BUILD-09 / D-22 | The checklist is the artifact | Walk `CV-REGRESSION.md` end to end. Record date/result in this phase's **verification artifacts** (`01-05-SUMMARY.md`), never in the file itself (D-21) |

---

## Known Exceptions (do not flag as failures)

1. **`document.body` at `createPortal`** (`Lightbox.tsx:182`, `:184` post-directive) remains a
   render-time browser-global read. **User decision: scoped out explicitly.** Structural to the
   portal design, harmless under the mount-on-click invariant (`Attachments.tsx:70-80`), out of
   scope for BUILD-03, handed to Phase 7. Criterion 2's *stated proof mechanism* (import-only
   build) is satisfied; its *literal wording* is not, and that is recorded rather than hidden.
   **No acceptance criterion in any plan may claim the literal wording is met.**
2. **Turbopack is not build-deterministic** — the build-ID directory always differs and ~1 chunk
   name may differ between identical-source builds. Zero-diff rebuilds are unreachable; a small
   boring `out/` diff is the expected state, not a failure. `next.config.ts` sets no
   `generateBuildId`, and `out/_next/static/<buildId>/_buildManifest.js` and `_ssgManifest.js`
   are **tracked**.
   **Binding consequence:** no gate, acceptance criterion, or verification step in this phase may
   run a build (or any command that triggers one) and then assert `git status`/`git diff`
   cleanliness on `out/` in the same sequence. The assertion is unsatisfiable by construction, and
   the only chain-satisfying escape is untracking or gitignoring `out/` — forbidden by Decision B
   and recorded in `T-01-21` as something that could take the live site down. Builds happen in the
   **action**, which stages and commits the build it just ran; the `<verify>` gate then inspects
   that committed product on disk. Where a gate genuinely must build (`01-01` Task 3's three
   signal states), it asserts the resync commit's existence plus `git status --porcelain
   out/content/` — the 87 content paths rebuild byte-identically and are therefore rebuild-stable.
3. **All `Lightbox.tsx` line citations shift +2** once `"use client"` lands. Three edits land in
   that one file — later tasks must not be written against pre-directive line numbers. This is
   why plan `01-03` (which adds the directive) runs **after** plan `01-02` (which makes all three
   snippet-anchored source edits).
4. **`Lightbox.module.css:39` is a stale citation** — the real line is **46**.
5. **`.planning/STATE.md`, `.claude/`, and the five `*-SUMMARY.md` files are dirty throughout.**
   `01-01` Task 1 is instructed to leave the first two alone. No gate may assert a globally
   clean `git status`; see § Grep-Gate Hygiene.

---

## Commands That Must NOT Appear

- `npm run lint` — no eslint installed; it will fail. That is BUILD-06 / Phase 2.
- `npx serve out` — `serve` is not installed; `npx` would auto-download an unverified package.
  Use `cd out && python3 -m http.server 8080` (Python 3.14.1 verified present). Caveat: a plain
  static server does not replicate Cloudflare's `trailingSlash: false` routing.
- `npm run build 2>&1 | tail` — masks the exit code. Use `set -o pipefail`.
- **`npm install` / `npx` of any kind** — this phase installs zero packages, which is why
  RESEARCH.md's Package Legitimacy Audit is "not applicable". If an executor reaches for one,
  the plan has drifted: refuse and report.

---

## Validation Sign-Off

- [x] All tasks have an automated verify command or an explicit Manual-Only row —
      every task across `01-01`…`01-05` carries `<verify><automated>`; the single
      `checkpoint:human-verify` (`01-05` Task 2) carries both a `<human-check>` and an
      automated precondition gate
- [x] Sampling continuity: no 3 consecutive tasks without an automated verify — every task
      has one, so the gap is 0
- [x] Wave 0 baseline capture task is first, before any edit — `01-01` Task 1, which edits
      nothing and captures the baseline before either of its commits
- [x] The D-14 negative-control task is marked **inverted** (expected to fail) — `01-03`
      Task 1, named "(INVERTED — this build MUST FAIL)", with the build run unconditionally
      on its own line so a skipped precondition cannot masquerade as the expected failure
- [x] `out/` commit policy tasks are explicit in the plan — resync-first in `01-01` Task 1,
      trailing resync in `01-01` T3, `01-02` T3, `01-03` T3, `01-05` T3
- [x] Final task leaves `out/` in a plain local-build state (no `CF_PAGES*`) — `01-05` Task 3
- [x] No watch-mode flags
- [x] Feedback latency < 10s — ~5 s per build
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved for execution. All 22 Per-Task Verification Map rows are mapped to an
owning plan task. The `Status` column and the row-level `⬜ pending` markers track
**execution** and are expected to flip during `/gsd:execute-phase 1`, not during planning.
