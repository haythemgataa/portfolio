# Phase 1: Verifiable Baseline - Context

**Gathered:** 2026-08-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the three load-bearing defects that make every later phase checkable, and author the regression net the rest of the milestone leans on. Covers BUILD-01 (thumbnails visible under `next dev`), BUILD-02 (Lightbox restores the previous overflow instead of writing `unset`), BUILD-03 (Lightbox declares its own client boundary and reads no browser global during render), and BUILD-09 (a written CV-regression checklist exists in the repo).

Files this phase edits: `app/Lightbox.tsx`, `app/Attachments.tsx` (call site only), a new `app/lib/cdnImage.ts`, and a new `CV-REGRESSION.md`. **`app/globals.css` is explicitly not touched in this phase** — Phase 3 owns it.

No feature work. No tab shell, no gallery, no content-model changes.

</domain>

<decisions>
## Implementation Decisions

### CDN dev bypass (BUILD-01)

- **D-01:** The `/cdn-cgi/image/...` prefix is decided at **build time**, not runtime. `output: 'export'` bakes the URL string into the emitted HTML — there is no runtime branch available. Any design that defers the decision to the browser is wrong for this codebase.
- **D-02:** The switch reuses the **existing `NEXT_PUBLIC_GIT_BRANCH` signal** that `next.config.ts` already computes (from `CF_PAGES_BRANCH`, falling back to `git rev-parse`). No new independent user-facing flag is introduced.
- **D-03:** The prefix is applied only when the branch is the production branch **AND** the process is a Cloudflare Pages build — gate on `CF_PAGES` being present. This is what distinguishes "production build" from "working locally on `main`", which would otherwise reproduce the exact bug being fixed. Consequence: a local `npm run build && npx serve out` also bypasses the CDN and shows real images, and `dev`-branch `*.pages.dev` previews bypass it too (Cloudflare Image Resizing does not work on `pages.dev` subdomains at all — see PITFALLS.md Pitfall 6).
- **D-04:** `getThumbnailUrl` is **extracted** from `app/Attachments.tsx:16` into `app/lib/cdnImage.ts`, shared going forward. Phase 5 extends it for masonry tiles.
- **D-05:** The extracted helper emits **byte-for-byte identical URLs** for CV attachments — the existing square `width = height = maxHeight * 2`, `quality=50`, `format=auto`. The known-wrong square hardcode is **not** fixed in this phase; that is Phase 5's change, made when the masonry tiles that need `width`-only + `fit=scale-down` actually exist. Rationale: this phase's job is a trustworthy baseline, and changing what live CV thumbnails request would make the checklist's first outing a real regression risk.
- **D-06:** Videos continue to bypass the helper entirely (Cloudflare Image Resizing does not transform video). The current call site already does this correctly — preserve it.
- **D-07:** Criterion 1's "production build still emits `/cdn-cgi/image/...`" is proven by **grepping the built output**: a build under production signals must contain `/cdn-cgi/image/` in `out/index.html`; a dev-mode build must not. Both commands go in `CV-REGRESSION.md`. Not proven by a live-site visual check.

### Scroll-lock rewrite (BUILD-02)

- **D-08:** Fix is a **capture-and-restore inline** in the existing effect in `app/Lightbox.tsx:27-32`. No ref-counted `useScrollLock()` hook is built in this phase — shared infrastructure written against one real caller and one guessed one is deferred to Phase 7, where the second consumer actually exists.
- **D-09:** The lock touches **`overflowY` only** — never the `overflow` shorthand, and never `overflow-x`. Touching the shorthand is what let the Lightbox stomp the `globals.css` overflow-x guard; narrowing the axis removes the coupling structurally rather than by careful restore.
- **D-10:** Cleanup restores the **captured prior inline value**, which for both elements is the empty string today. It must not write `'unset'`, `'visible'`, `'auto'`, or any other literal — criterion 3 requires `document.body.getAttribute('style')` to be *empty*, which only an empty-string restore produces.
- **D-11:** **Both `html` and `body`** are restored and asserted clean after a full open/close cycle, even though criterion 3 names only `body`. Both are locked by the same effect and would carry the same residue; Phase 3's sticky work reads exactly these two elements.
- **D-12:** `scrollbar-gutter: stable` is **not** added in this phase. It is recorded as a decision for Phase 3, which already opens `globals.css` for the `overflow-x: clip` change.

### Client boundary (BUILD-03)

- **D-13:** Add `"use client"` to the top of `app/Lightbox.tsx`.
- **D-14:** Criterion 2's build proof is a **throwaway server-component probe**: add a temporary server module that imports `Lightbox`, run `npm run build`, confirm it succeeds, then delete the probe and rebuild. No permanent proof artifact ships — the repo gains nothing dead, and the standing guarantee is the checklist rather than a decoy module. The plan must include the deletion and the second build as explicit steps, not as cleanup.
- **D-15:** "Reads no browser global during render" is taken as an absolute and covers **both** offenders:
  - the `useState((window.innerWidth - 48) / (window.innerHeight - 96))` initializer at `app/Lightbox.tsx:198`, and
  - the four inline `isMobile()` render calls at `app/Lightbox.tsx:88, 99, 110, 265`, replaced with the **existing** `useIsMobile()` hook exported from `app/isMobile.tsx:22-30`.

  `window.innerWidth` is the one that would crash a prerender; `isMobile()` is the one that silently produces server markup disagreeing with the client. Both qualify under the criterion, and the hook already exists — nothing new to design.
- **D-16:** The container aspect ratio is obtained by **measuring the real container** with the `use-resize-observer` already imported in `Lightbox.tsx` and the `containerRef` already declared at line 197 — not by moving the viewport math into a `useEffect`, and not by rewriting the fit logic in CSS. This drops the hardcoded 48/96 viewport-padding guess and is strictly more correct than what is there now; the `window` read disappears as a consequence rather than as a workaround.
- **D-17:** Not in scope: scoping the `window`-level keydown listener, the duplicate-key risk, the divide-by-zero in the mobile scroll handler, focus trapping, and ARIA labels on the Lightbox buttons. All are real (PITFALLS.md Pitfall 10) and all belong to Phase 7.

### CV-regression checklist (BUILD-09)

- **D-18:** Lives at **`CV-REGRESSION.md` in the repo root**, alongside `CLAUDE.md`. It is a permanent engineering artifact of the repo, not a planning document — it outlives this milestone and applies to any future change touching the CV. Phase 2's doc pass points `CLAUDE.md` at it.
- **D-19:** Every step that **can** be mechanical **is**: paste-ready console snippets (`document.body.getAttribute('style')`, `document.documentElement.getAttribute('style')`) and shell greps for the CDN check. Purely visual steps stay prose. The "few minutes" bar in criterion 4 only holds if the walker is not reconstructing how to test each item each time — and a snippet yields the same answer for a human as for an agent.
- **D-20:** Structure is a **fast core pass plus phase-flagged extras**:
  - *Core (every walk):* desktop, light **and** dark (`prefers-color-scheme`), the four widths 320 / 480 / 768 / 1440 with no horizontal scrollbar at any, all CV sections render with the year column aligned, attachment strips scroll on desktop and swipe on mobile, thumbnails load, one full lightbox cycle (open from a CV attachment, arrows, Esc, backdrop click), `html` and `body` inline style empty afterward, zero console errors or warnings on load and after that cycle.
  - *Flagged extras (only the phases that trigger them):* real-iPhone pass (Phase 6), network-panel bounded-request check (Phase 7).

  A checklist that always demands a physical device stops being walked, and an unwalked checklist is worse than none.
- **D-21:** `CV-REGRESSION.md` stays a **clean, never-mutated template**. Each phase records its walk — date, result, anything that failed and how it was resolved — in that phase's own verification artifacts. No results log inside the checklist file, no ticked-off copies per phase.
- **D-22:** Phase 1 walks the checklist at its own exit with zero failures. This is its first real test, and this phase edits `Lightbox.tsx` and the CDN helper — two of the surfaces it exists to protect.

### Claude's Discretion

The user chose the recommended option on every question; nothing was explicitly delegated. Planner and executor retain normal latitude on:
- Naming of the exported helper(s) in `app/lib/cdnImage.ts` and the shape of its options argument.
- How the phase is decomposed into plans and commits across the four requirements.
- The exact wording and ordering of `CV-REGRESSION.md`'s core steps, within the content fixed by D-20.
- The location and shape of the throwaway probe in D-14, provided it genuinely imports `Lightbox` from a module graph that does not already establish a client boundary, and provided it is deleted before the phase ends.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and criteria
- `.planning/ROADMAP.md` § "Phase 1: Verifiable Baseline" — the four success criteria this phase exits on; also § "How This Roadmap Is Ordered" constraints 1–3 and the BUILD-09 paragraph, which explain *why* each fix is in this phase and not a later one.
- `.planning/REQUIREMENTS.md` § "Build Hygiene" — BUILD-01, BUILD-02, BUILD-03, BUILD-09 as written.
- `.planning/PROJECT.md` § Constraints — static export, `images.unoptimized: true`, no test framework, CSS Modules + custom properties.

### Defect detail (read before touching any of the three surfaces)
- `.planning/research/PITFALLS.md` **Pitfall 2** — the scroll-lock `'unset'` defect, with the exact `Lightbox.tsx:27-32` citation and the capture-and-restore replacement.
- `.planning/research/PITFALLS.md` **Pitfall 3** — the missing `"use client"` and the render-time `window` / `isMobile()` reads, with line citations.
- `.planning/research/PITFALLS.md` **Pitfall 6** — the `/cdn-cgi/image/` dev and `*.pages.dev` breakage, including the note that Image Resizing does not transform video and that `next/image`'s `quality` prop is a no-op under `images.unoptimized`.
- `.planning/research/PITFALLS.md` **Pitfall 14** — the regression-checklist minimum contents, including the fragile `Profile.module.css:97-113` year-column `::before` trick and the dead `--transparent-border` variable in `Lightbox.module.css:39`.
- `.planning/research/PITFALLS.md` **Pitfall 10** — read for *boundary awareness only*: it lists the Lightbox defects that are explicitly **out of scope** here (D-17) and belong to Phase 7.

### Repo docs
- `CLAUDE.md` — currently inaccurate (claims Next.js 15, Inter via `next/font/google`, and misstates which components declare `"use client"`). Do not treat it as authoritative this phase; Phase 2 corrects it. This phase's CDN flag is documented there in Phase 2's doc pass, not now.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/isMobile.tsx:22-30` exports **`useIsMobile()`** — already written, already correct (returns `false` on server, syncs in an effect). D-15's replacement needs no new code.
- `use-resize-observer` is already a dependency and is **already imported in `app/Lightbox.tsx:3`**. `containerRef` is already declared at `Lightbox.tsx:197`. D-16 wires two things that already exist.
- `next.config.ts` `env` block (lines 26-28) already injects `NEXT_PUBLIC_GIT_BRANCH`, computed by `getGitBranch()` which prefers `CF_PAGES_BRANCH` because Cloudflare Pages builds in detached HEAD. This is the established pattern for build-time flags — D-02/D-03 extend it rather than inventing one.
- `Profile.tsx:31-33` already reads `NEXT_PUBLIC_GIT_BRANCH === "dev"` to render the beta badge — precedent for branch-derived behaviour.

### Established Patterns
- **Static export.** `output: 'export'` with `images.unoptimized: true`. Every URL is a build-time constant. No runtime environment branching is available anywhere in this codebase.
- **Client boundary by inheritance.** Only `app/Attachments.tsx:1` and `app/Profile.tsx:1` declare `"use client"`. `Lightbox.tsx`, `Scrollbar.tsx`, and `RichText.tsx` are client modules only because of who imports them — an implicit, undocumented invariant. This phase makes it explicit for `Lightbox.tsx` only; `Scrollbar.tsx` and `RichText.tsx` are left as-is (Phase 2's doc pass corrects `CLAUDE.md`'s claim about them).
- **Lightbox is mounted only after a click** (`Attachments.tsx:70-80`, conditional creation inside `<AnimatePresence>`), which is why the render-time `window` read has never fired. Preserve that mounting pattern.
- **No test framework, by deliberate choice.** Verification is manual and visual. `CV-REGRESSION.md` is the substitute, not a stepping stone to one.

### Integration Points
- `app/Attachments.tsx:16-20` — `getThumbnailUrl` definition; moves out to `app/lib/cdnImage.ts`.
- `app/Attachments.tsx:148` — the single image call site; switches to the imported helper. Note `quality={50}` at line 155 is a no-op under `images.unoptimized` — do not assume it is doing work, and do not "fix" it here.
- `app/Attachments.tsx:157-165` — the video branch, which correctly does **not** call the helper. Leave it.
- `app/Lightbox.tsx:27-32` — the scroll-lock effect (BUILD-02).
- `app/Lightbox.tsx:197-198` — `containerRef` and the `window.innerWidth` initializer (BUILD-03).
- `app/Lightbox.tsx:88, 99, 110, 265` — inline `isMobile()` render calls (BUILD-03).
- New file `app/lib/cdnImage.ts` — sits beside the existing `app/lib/contentLoader.ts`.
- New file `CV-REGRESSION.md` at repo root.

### Known traps in this phase's blast radius
- `out/` is tracked and currently **desynced** from source (Webpack chunks deleted, Turbopack chunks untracked). Any `npm run build` in this phase rewrites ~99MB of tracked output. The plan must decide how build artifacts are handled in this phase's commits — Phase 2 resolves the policy, but Phase 1 builds at least three times (CDN grep, probe build, post-probe rebuild) and cannot ignore the consequence.
- `Lightbox.module.css:39` references `var(--transparent-border)` while `globals.css:12` defines `--transparentBorder` — a real dead variable. Not this phase's to fix; do not add more.

</code_context>

<specifics>
## Specific Ideas

- The bar for BUILD-03 is explicitly *demonstration, not inspection*. The plan must produce a build log showing a successful `npm run build` with the probe present. "Added the directive, looks right" does not satisfy criterion 2.
- The bar for BUILD-02 is `document.body.getAttribute('style')` returning **empty** — not `overflow: unset`, not `overflow-y: visible`, not any value. Same for `document.documentElement`.
- `CV-REGRESSION.md` is written for a reader who has just finished a phase and wants to be done — it has to be genuinely walkable in a few minutes or it will be skipped. Terse steps, commands where commands are possible.

</specifics>

<deferred>
## Deferred Ideas

- **`scrollbar-gutter: stable` on `html`** — decide in Phase 3, alongside the `overflow-x: clip` change, since that phase already opens `globals.css`. (D-12)
- **Ref-counted `useScrollLock()` hook** — Phase 7, when the gallery gives the Lightbox a genuine second consumer and nested/rapid open sequences become possible. (D-08)
- **Fixing the square `width = height` CDN params** (`width`-only + `fit=scale-down`) — Phase 5, when masonry tiles need it. (D-05)
- **`"use client"` on `Scrollbar.tsx` and `RichText.tsx`** — not load-bearing; `CLAUDE.md`'s claim about the client-component list is corrected in Phase 2's doc pass.
- **Documenting the CDN flag in `CLAUDE.md`** — Phase 2 (BUILD-08), which is the doc-accuracy phase.
- **Lightbox keydown scoping, stable keys, divide-by-zero guard, focus trap, ARIA labels** — Phase 7 (PITFALLS.md Pitfall 10). (D-17)
- **Playwright screenshot tests** — out of scope for v1.1 by explicit requirement; PITFALLS.md Pitfall 14 suggests it as a v1.2 candidate.

</deferred>

---

*Phase: 1-Verifiable Baseline*
*Context gathered: 2026-08-08*
