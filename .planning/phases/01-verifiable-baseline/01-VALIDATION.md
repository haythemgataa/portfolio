---
phase: 1
slug: verifiable-baseline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-08
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> Source: `01-RESEARCH.md` § Validation Architecture. Every command below was executed
> against this repo or an exact copy of it during research.

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
    flags a correct step as broken.
  - ⚠ **Exit-code masking:** never write `npm run build 2>&1 | tail` — that returns `tail`'s
    exit code and printed `EXIT=0` on a definitively failed build during research. Use
    `set -o pipefail`.
- **After every plan wave:** the full mechanical block, plus a plain `npm run build` (no
  `CF_PAGES*` env vars) so the committed `out/` reflects a real local build.
- **Before `/gsd:verify-work`:** every row of the Per-Requirement Verification Map green,
  plus a complete `CV-REGRESSION.md` walk with zero failures (D-22).
- **Max feedback latency:** ~5 s (single build).

---

## Per-Task Verification Map

Task IDs are assigned by the planner; rows below are the **binding requirement-level
contract** each task must inherit. Plan/Wave/Task columns are filled during planning.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | BUILD-01 / D-05 | — | N/A | baseline | `git show HEAD:out/index.html \| grep -o '/cdn-cgi/image/[^"]*' \| sort -u > /tmp/cdn-baseline.txt; wc -l < /tmp/cdn-baseline.txt` → `27` | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-01 / D-03 | — | N/A | build+grep | `npm run build && test "$(grep -c '/cdn-cgi/image/' out/index.html)" -eq 0` | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-01 / D-07 | — | N/A | build+grep | `CF_PAGES=1 CF_PAGES_BRANCH=main npm run build && test "$(grep -c '/cdn-cgi/image/' out/index.html)" -gt 0` | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-01 / D-03 | — | N/A | build+grep | `CF_PAGES=1 CF_PAGES_BRANCH=dev npm run build && test "$(grep -c '/cdn-cgi/image/' out/index.html)" -eq 0` | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-01 / D-05 | — | N/A | diff | prod-build grep `\| sort -u \| diff - /tmp/cdn-baseline.txt` → empty | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-01 | — | N/A | smoke | dev server: `curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000$IMG"` → `200` | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-01 | — | N/A | smoke | `curl -s http://localhost:3000/ \| grep -c '/cdn-cgi/image/'` → `0` | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-01 / D-06 | — | N/A | grep | `grep -n 'cdnImage\|ThumbnailUrl' app/Attachments.tsx` → hits only in the image branch | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-02 / D-09 | — | N/A | grep | `grep -q 'style.overflow[^Y]' app/Lightbox.tsx` → **no match** (zero bare `.overflow`) | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-02 / D-10 | — | N/A | grep | `grep -q "'unset'" app/Lightbox.tsx` → **no match** | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-02 / D-10, D-11 | — | N/A | console | post-cycle snippet: `html` **and** `body` `getAttribute('style')` both empty → `PASS` | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-02 | — | N/A | console | `getComputedStyle(document.body).overflowX` matches `globals.css` (`hidden` in Phase 1) | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-03 / D-14 | — | N/A | build (**inverted — MUST FAIL**) | probe present, no directive → build fails with ``You're importing a module that depends on `useState``` + import trace naming `probe-tmp` | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-03 / D-13 | — | N/A | build (**must pass**) | probe present + directive → build succeeds **and** `/probe-tmp` appears in the Route table | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-03 / D-14 | — | N/A | log grep | `grep '/probe-tmp' build.log` → present (catches the tree-shaken false-pass) | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-03 / D-13 | — | N/A | static | `head -1 app/Lightbox.tsx \| grep -q '"use client"'` | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-03 / D-14 | — | N/A | build + fs | `rm -rf app/probe-tmp && npm run build && test ! -e out/probe-tmp.html` | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-03 / D-15 | — | N/A | grep + review | `grep -q 'window.innerWidth' app/Lightbox.tsx` → no match; `grep -n 'window\.\|document\.\|navigator\.\|isMobile()' app/Lightbox.tsx` → every hit inside an effect **except the documented `createPortal` exception** | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-09 / D-18 | — | N/A | fs | `test -f CV-REGRESSION.md` | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-09 / D-19 | — | N/A | grep | `grep -c '```' CV-REGRESSION.md` → non-zero | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-09 / D-20 | — | N/A | grep | file contains each of: `320`, `480`, `768`, `1440`, `prefers-color-scheme`, `getAttribute('style')`, `cdn-cgi`, `console` | ✅ | ⬜ pending |
| TBD | TBD | TBD | BUILD-01 / Pitfall F | — | N/A | build+grep | **final** task: plain `npm run build` (no `CF_PAGES*`), `grep -c '/cdn-cgi/image/' out/index.html` → `0` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No test infrastructure is required or permitted. Two **ordering prerequisites**, both real tasks:

- [ ] **Capture `/tmp/cdn-baseline.txt`** from `git show HEAD:out/index.html` **before any file
      is edited** (expect 27 unique URLs, param string
      `width=180,height=180,quality=50,format=auto`). Without it, D-05's byte-identity claim
      degrades from a diff to an eyeball. Must be the phase's first task.
- [ ] **`out/` commit policy is written into the plan as explicit tasks** — resolved by the
      user: *resync commit first, then source-only commits, then one
      `chore(build): resync out/` per plan.* Not left to executor judgement.

*No framework install. No test files. This is intentional and locked.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Thumbnails visibly render, not broken-image icons | BUILD-01 | Image decode success is not observable from HTML or HTTP status | `npm run dev`, load `localhost:3000`, scan every attachment strip |
| Lightbox full cycle: open / arrows / Esc / backdrop click | BUILD-02 | Interaction sequence | Open from a CV attachment, arrow through, Esc, reopen, click backdrop |
| Mobile lightbox opens on the **correct** item | BUILD-03 / D-15 | Touch + timing dependent | Touch-emulated or real device: open an attachment at **index ≥ 3**, confirm the item shown. `useIsMobile()` returns `false` on first render, so `.carouselScroll` may lack `overflow-x: scroll` when the mount effect assigns `scrollLeft` — a silent clamp to index 0. See RESEARCH.md § D-15 Mobile Hazard |
| Fit logic correct at multiple sizes | BUILD-03 / D-16 | Visual containment | Open a portrait and a landscape attachment; resize the window; both stay contained, no overflow or letterbox drift |
| Year column aligned | BUILD-09 / D-20 | Visual | Visual scan. Fragile — `Profile.module.css:97-113` uses a hidden `content: "0000 — 0000"` ghost-text trick that breaks on any font/type-size change |
| Light **and** dark themes | BUILD-09 / D-20 | Visual | DevTools → Rendering → Emulate `prefers-color-scheme`. **Known non-regression:** `Lightbox.module.css:46` references dead `var(--transparent-border)` (`globals.css:12` defines `--transparentBorder`) — the image border is invisible in *both* themes today. Do not log as a Phase 1 regression |
| Zero console errors/warnings | BUILD-09 / D-20 | Console inspection | "All levels" filter; empty on load and after one full lightbox cycle |
| Checklist walked at phase exit, zero failures | BUILD-09 / D-22 | The checklist is the artifact | Walk `CV-REGRESSION.md` end to end. Record date/result in this phase's **verification artifacts**, never in the file itself (D-21) |

---

## Known Exceptions (do not flag as failures)

1. **`document.body` at `createPortal`** (`Lightbox.tsx:182`, `:184` post-directive) remains a
   render-time browser-global read. **User decision: scoped out explicitly.** Structural to the
   portal design, harmless under the mount-on-click invariant (`Attachments.tsx:70-80`), out of
   scope for BUILD-03, handed to Phase 7. Criterion 2's *stated proof mechanism* (import-only
   build) is satisfied; its *literal wording* is not, and that is recorded rather than hidden.
2. **Turbopack is not build-deterministic** — the build-ID directory always differs and ~1 chunk
   name may differ between identical-source builds. Zero-diff rebuilds are unreachable; a small
   boring `out/` diff is the expected state, not a failure.
3. **All `Lightbox.tsx` line citations shift +2** once `"use client"` lands. Three edits land in
   that one file — later tasks must not be written against pre-directive line numbers.
4. **`Lightbox.module.css:39` is a stale citation** — the real line is **46**.

---

## Commands That Must NOT Appear

- `npm run lint` — no eslint installed; it will fail. That is BUILD-06 / Phase 2.
- `npx serve out` — `serve` is not installed; `npx` would auto-download an unverified package.
  Use `cd out && python3 -m http.server 8080` (Python 3.14.1 verified present). Caveat: a plain
  static server does not replicate Cloudflare's `trailingSlash: false` routing.
- `npm run build 2>&1 | tail` — masks the exit code. Use `set -o pipefail`.

---

## Validation Sign-Off

- [ ] All tasks have an automated verify command or an explicit Manual-Only row
- [ ] Sampling continuity: no 3 consecutive tasks without an automated verify
- [ ] Wave 0 baseline capture task is first, before any edit
- [ ] The D-14 negative-control task is marked **inverted** (expected to fail)
- [ ] `out/` commit policy tasks are explicit in the plan
- [ ] Final task leaves `out/` in a plain local-build state (no `CF_PAGES*`)
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
