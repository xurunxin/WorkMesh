# SDD ledger — plan: docs/superpowers/plans/2026-08-22-web-ui-ux-improvements.md

Branch: `codex/web-ui-ux-continuation`
Handoff tip/base: `868478f` (local `main` Web UI handoff)
Worktree: `G:\Projects\MetronX\WorkMesh\.worktrees\web-ui-ux-continuation`
Current: Phase 0/1/2/3/4/5/6/7 complete. Task 7.3 and the single consolidated deterministic visual, regression, performance, scope, conflict, and product audit are PASS.

## Continuation v2 count

- Original plan: 51 tasks.
- Landed: 26 tasks — Phase 0 (10), Phase 1 (6), Phase 2 (6), Phase 3 Tasks 3.1-3.4 (4).
- Original feature tasks remaining: 25 — Tasks 3.5-3.7, Phase 4 (5), Phase 5 (6), Phase 6 (8), Phase 7 (3).
- Mandatory recovery gates added before 3.5: 4 — `3.4-R`, `B.1`, `B.2`, `B.3`.
- Initial continuation gates: 29. The four recovery gates are now accepted, leaving **25 feature tasks**. Phase 3 remains **4/7** until Tasks 3.5-3.7 pass; recovery gates do not inflate the original phase/task count.

## WorkMesh control-plane mirror

- Project: `WorkMesh Web UI UX Improvements — Linear-aligned Continuation` (`3eb20a28-60c9-4f98-818e-d44de404b0ef`).
- WorkItems: `3.4-R` = GEN-383, `B.1-B.3` = GEN-384..386, and `3.5-7.3` = GEN-387..411.
- Relations: 28 serial `blocks` edges mirror the execution order below, from GEN-383 through GEN-411.
- Recovery evidence activity: `7dc384a8-6755-45d5-ae3e-2bff3da10fbd`; the same actual results are appended to GEN-383..386 descriptions.
- `publish_artifact` was denied by the live capability intersection, so recovery evidence is retained in the immutable session activity and WorkItem bodies rather than represented as an Artifact. This is a control-plane capability limitation, not a verification waiver.
- GEN-383..411 are accepted. GEN-405's responsive/reduced-motion gate is root-accepted after the sparse-card visual recovery; GEN-406's six-case semantic/keyboard matrix and final focus-cue evidence are accepted; GEN-407 reduces 36 real bilingual diagnostics to zero; GEN-408 closed its initial 10 browser REDs through exact owners and finished 68/68 with a 177-file evidence manifest. GEN-409 closed three exact product-focus REDs and three fixture seams, then passed 8/8 fresh and evidence browser runs with a 27-entry verified manifest. GEN-410 preserves one 300-card DOM across List and Board, closes the duplicate parent render, and passes both exact Issues journeys plus the fresh four-case large-list suite inside every frozen budget. GEN-411 closes the final 56/136/50 three-topology gate, 46-case visual matrix, wide-PC numeric contract, stable evidence, and zero-intersection repair audit.

## Plan-level notes

- **Test infra gap (recorded once, applies to Phase 0):** The plan assumed `@testing-library/react` + `jsdom` were already configured. They were not. Task 0.1 added them as devDeps. Subsequent Phase 0 tasks inherit this without re-installing. If a Phase 0 task fails because a new test file needs a different env directive, that's a new finding, not this gap recurring.
- **`AuthenticatedActor` lives in `./actor`, not `./api`.** Plan code samples import from `./api`; real type lives in `./actor`. Implementer of Task 0.1 corrected inline. Future plan code samples that import `AuthenticatedActor` from `./api` will trip the same trap — review them in pre-flight.

## Tasks

- Task 0.1: complete (commits e5e74de..1afe159, review clean — 0 open, 3 minor: 401 test could assert loading+error; test infra deserves its own seed commit; brief `AuthenticatedActor` import path bug recurs in plan text)
- Task 0.2: complete (commits 1afe159..0fcce16, review clean — 0 open, 0 minor)
  - Cross-task risk: working tree has 3 uncommitted modified files + 1 untracked dir from earlier in session. Future implementers MUST use explicit `git add <files>` not `git add .` or `git add -A`. Will re-emphasize in each dispatch.
- Task 0.3: complete (commits 0fcce16..bdb936a, review clean — 0 open, 3 minor: empty-string `message` fallback, viewport nesting under RealtimeProvider not LocaleProvider, no test for tone mapping)
- Task 0.4: complete (commits bdb936a..72ca58c, review clean — 0 open, 3 minor: vitest `setupFiles` path won't resolve for other packages but works for apps/web; per-file jsdom pragma vs global; root package.json reformat). Controller ran final `git commit` due to 2 implementer platform crashes at the commit step. Mechanical action only, no code changes.
- Task 0.5: complete (commits 72ca58c..86a8629, review clean — 0 open, 0 minor)
- Task 0.6: complete (commits 86a8629..46e562e, review clean — 0 open, 1 minor: `const initialError = actorError || error` dead local). 2 implementer attempts hit platform error; 3rd succeeded.
- Task 0.7: complete (commits 46e562e..62b60de, review clean — 0 open, 0 minor). Skipped `agent-sessions/[id]/page.tsx` per brief's conditional (verified no `auth/me` call).
- Task 0.8: complete (commits 62b60de..71e68b1, review clean — 0 open, 2 minor: hardcoded English fallback in error.tsx, console.error instead of telemetry)
- Task 0.9: complete (commits 71e68b1..cb596cb, review clean — 0 open, 4 minor all repo-level/pre-existing, not this task). Mount centralized; Cmd/Ctrl+K and `/` shortcuts. 1 prior attempt hit platform error mid-refactor.
- Task 0.10: complete (commits cb596cb..dbf95be, review clean — 0 open, 1 minor: report wording slightly stronger than test contract). Empty verification gate. **PHASE 0 COMPLETE.**

---

# Phase 0 Status: ✅ COMPLETE (10/10 tasks)

**Tests:** 139/139 passing across 32 files (~22s)
**Typecheck / lint:** clean
**Commits added in Phase 0:** 9 (Tasks 0.1-0.9, plus 0.10 empty verification commit)
**Files added:** 12 new + 1 modified (work-surfaces.tsx, packages/ui/index.tsx, etc. pre-existing uncommitted — left for their owners)
**New shared infrastructure:**
- Hooks: `useAuthenticatedActor`, `useCurrentTeam`, `useToast`
- Components: `<PageHeader>`, `<SkeletonList>`, `<ToastViewport>`, `<CommandCenterMount>`
- Global: `error.tsx`, `not-found.tsx`, `loading.tsx`
- All 4 main pages migrated to the new auth/team hooks
- Global command center mounted once in root layout with Cmd/Ctrl+K and `/` shortcuts
- 5 i18n keys added (pageLoadError, retry, notFoundTitle, notFoundDescription, backToHome)
- vitest configured for `.tsx` tests with `@testing-library/jest-dom` matchers

**Known minor findings (parked for final review):** 11 minor across the 10 tasks, all repo-level/pre-existing or non-blocking. None prevent Phase 0 from being considered complete.

- Task 1.1: complete (commits dbf95be..ed3669e, review clean — 0 open, 2 minor: i18n test doesn't assert new keys directly; pre-existing vitest config setup-file path bug surfaced again). Pre-existing `packages/ui` test breakage (missing `packages/ui/vitest-setup.ts` referenced in root config) is confirmed pre-existing, not this task's ledger.
- Task 1.2: complete (commits ed3669e..69e90ae, review clean — 0 open, 1 minor: hook stricter than spec about NaN/negative/zero filtering — strict improvement).
- Task 1.3: complete (commits 69e90ae..fe774f0, review PASS — 3 open findings all about incomplete recovery, controller fixed: index collapsed via `git add`, working tree has 2 pre-existing modified files + 1 untracked dir). Implementer crashed at stash pop with 502 Bad Gateway; controller did the mechanical string-replace conflict resolution. Working tree is now ready for next task to commit the load-more-sentinel work as a separate commit (or ignore).
- Task 1.4: complete (commits fe774f0..1c52a21, review PASS — 0 open, 2 minor: CSS class reuse interpretation; source-level test in `packages/ui` is dead due to pre-existing config bug). Stash/pop clean (different functions, no conflict).
- Task 1.5: complete (commits 1c52a21..527dc04, review PASS — 0 open, 2 follow-up recommendations: add `prefers-reduced-motion` override, fix pre-existing `lint` script bug). 2-line CSS-only change. Implementer dropped the pre-existing stash by mistake; controller recovered via `git stash apply 1aa8067` (reflog hash).
- Task 1.6: Phase 1 verification gate. Implementer caught a real spec gap: task 1.1's `readCompactPreference` defaulted to `false` (expanded) on empty `localStorage`, contradicting the spec ("collapse-by-default for advanced fields"). Reviewer also marked the gate FAIL. Fix dispatched: Task 1.1 follow-up commit `4b87aff` (in fact a fix to task 1.1) — `readCompactPreference` now defaults to `true` (compact) on empty localStorage; +5 tests in new `work-surfaces-filters.test.tsx`; 172/172 pass. **PHASE 1 COMPLETE.**
- Task 2.1: complete (commits 4b87aff..1286d6a, review clean — 0 open, 3 minor: pre-existing stash vs work-tree drift, no CSS yet for new compact classes, two test fixes not itemized). New `useMediaQuery` hook + `<Tabs compact>` prop wrapping the 3 detail supplementary sections.
- Task 2.2: complete (commits 1286d6a..8358bf2, review clean — 0 open, 3 minor: padding-left scope add, reply mode no live consumer, pre-existing stash fragility). RichTextEditor `mode` prop + 3 CSS rules.
- Task 2.3: complete (commits 8358bf2..fc7d8c7, review clean — 0 open, 4 minor all non-blocking: new preview prop is API surface add, uncontrolled seed, a11y label swap, stash hygiene unverifiable). Markdown preview toggle.
- Task 2.4: complete (commits fc7d8c7..0fe2fa0, review clean — 0 open, 4 minor: test only covers initial branch, lastDraftSavedAt unused, ticker always runs, type naming imprecision). Draft-saved timestamp indicator.
- Task 2.5: complete (commits 0fe2fa0..ff45617, review clean — 0 open, 4 minor: stash hygiene claim inaccurate, pre-existing typecheck debt (work-surfaces onLoadMore), no sheet-mode test, auto-merge sub-claim). Conflict focus management + Button ref widening.
- Task 2.6: Phase 2 verification gate. Empty commit `83c45fb`. **PHASE 2 COMPLETE.**

- Task 3.1: complete (commits 83c45fb..5f2bb9c, review clean — 0 open, 2 minor: no new agents page test, working-state wording imprecision). Tabs(Agents/Sessions/Approvals) replacing long 2-column layout.
- Task 3.2: complete (commits 5f2bb9c..c4d029d, review clean — 0 open, 5 minor: status select duplicates header buttons, team filter matches revoked, capability dropdown unbounded, name placeholder copy, report wording). Pure `filterAgents` helper + filter row in Agents tab.
- Task 3.3: complete (commits c4d029d..11c65f3, review clean — 0 open, 3 minor: em-dash locale, exhaustive copy factory, clickable card visual). Team access Sheet drawer.
- Task 3.4: feature commit landed (`868478f`, bulk approval table + Approve/Reject selected). Handoff reported 207/207 Web tests passing at the commit, but post-task audit found that the commit removed three session-detail approval CSS rules. Acceptance is reopened as `3.4-R`; do not roll back the bulk-approval feature.
- Task 3.5: complete in the continuation worktree (no commit). URL-restored outer/inner tabs and Agent filters; Pending remains server-filtered plus defensive; History uses one terminal-status query with independent pagination and no Undo. Review round 1 found false loading empty-state and compact Tabs naming defects; round 2 fixed both. Independent PASS: focused 21/21, shared UI 7/7, Web 227/227, UI/Web typecheck and Next production build PASS.
- Task 3.6: complete in the continuation worktree (no commit). Registry cards use native detail links plus independent Space Peek and Team Access actions; the detail route never fabricates omitted access. Review round 1 found Next raw dynamic-segment double encoding; round 2 added once-decode/once-encode, literal-percent and malformed-input coverage. Independent PASS: affected 27/27, Web 243/243, lint/typecheck/build/diff-check PASS.
- Task 3.7: complete in the continuation worktree (no commit). Fresh UI 7/7, Phase 3 focused 63/63, Web 243/243, typecheck/lint/build/diff-check and production `/agents` smoke PASS. User-authorized local Chromium 149 passed the 390×844, 1440×900, and 1920×1080 mocked production-browser matrices; six screenshots and exact request/focus/9-state overflow evidence are recorded in `task-3.7-report.md`. Independent review resolved its one evidence-reproducibility P2 and left P0/P1/P2=0. Stateful Stage 1 remains deferred to Phase 7. **PHASE 3 COMPLETE.**
- Task 4.1: complete in the continuation worktree (no commit). Feature-aware Operations anchors, hash/current/focus synchronization, Operations-only empty state, false Agents-active repair, canonical 11-feature mock fixtures, and root/mock Playwright collection isolation landed. Round 1 review reproduced three browser P1s (100vh placeholder, off-screen direct hash, stale embedded current); Round 2 fixed all three and added viewport/visibility/observer-lifecycle coverage. Independent PASS: focused 18/18, mocked Chromium 6/6, Web 260/260, typecheck/lint/build/diff-check PASS; P0/P1/P2=0.
- Task 4.2: complete in the continuation worktree (no commit). Added hydration-safe `opsQuery`, same-tab history restoration, rendered/localized loaded-row matching, real enum display maps, loading/server-empty/no-match separation, and pagination under active search without API leakage. Independent review found one fixture-only P2 (`cron` vs real `schedule` trigger); it was corrected and re-reviewed. Final PASS: focused 21/21, mocked Chromium 9/9, Web 271/271, typecheck/lint/build/diff-check PASS; refreshed 390/1920 PNG and request/geometry JSON; P0/P1/P2=0.
- Task 4.3: complete in the continuation worktree (no commit). Recent runs now use one semantic six-column table with stable error ownership, locale-aware time, valid Session deep links, null-Session handling, and a keyboard-focusable bounded two-axis scroll region with sticky headers. Fresh verification: focused 25/25, mocked Chromium 10/10, Web 275/275, typecheck/lint/build/diff-check PASS. Browser geometry proves document containment and real x/y scroll at 390, no meaningless x-scroll at 1920, readable wide-PC density, and a two-pixel focus ring. Independent review found only a report-order P2; the wording was made order-independent, leaving product P0/P1/P2=0.
- Task 4.4: complete in the continuation worktree (no commit). Usage aggregates now validate unknown root/bucket shapes and canonical decimal strings before BigInt conversion, preserve precision and currency boundaries, format supported minor units without Number coercion, fail closed for malformed data, and never invent charts or time-series claims. Round 1 found one root null/undefined fail-closed P2; the owner added explicit `pending | ready` request state and unknown-root validation. Round 2 PASS: focused 42/42, mocked Chromium 12/12, Web 301/301, typecheck/lint/build/diff-check PASS. Geometry is exact at 390 and 1920; wide PC renders 8 cards in 2 rows at about 288px each rather than sparse slabs. P0/P1/P2=0.
- Task 4.5: RED after independent review (no product-code finding). Fresh gate evidence passed focused 59/59, Web 301/301, mocked Chromium 12/12, typecheck/lint/build/diff-check; nine stable PNG/JSON copies were SHA-256-identical at capture and credential-prefix clean. Reviewer verdict BLOCK, P0=0/P1=2/P2=0: reopen Task 4.1 for the complete 8-feature × 2-surface matrix with target/search/hidden-panel/API-absence assertions, then Task 4.2 for browser server-empty and complete localized-visible/raw-enum-negative coverage. Stable 390/1920 geometry remains valid; final GREEN must refresh the copies after recovery.
- Task 4.1-R: complete browser-evidence recovery (no product change). The new 16-cell matrix uses an independent Page/request log per feature/surface cell and strongly asserts ordered anchors/targets, search rules, hidden panels, and the exact seven-endpoint Operations request set while excluding Settings fallback traffic. Independent PASS: mocked 13/13, matrix 16/16 cells, nine downstream artifacts retained, P0/P1/P2=0.
- Task 4.2-R: complete browser-evidence recovery (no product change). New isolated cases prove six genuine successful exhausted server-empty collections and derive positive search queries from every collection's rendered localized projection while meaningful hidden raw enum/ID/undisplayed values do not match. Both request logs exclude `opsQuery`. Independent PASS: targeted 2/2, mocked 15/15, downstream artifacts regenerated, P0/P1/P2=0.
- Task 4.5 final rerun: PASS. Fresh focused 59/59, Web 301/301, mocked Chromium 15/15, typecheck/lint/production-build/diff-check PASS. Nine final stable artifacts are source/copy SHA-256 identical and credential-prefix clean. Independent review accepted 390px containment/local scrolling and 1920px use of the 1672px main region, 512px search cap, bounded 1120px Runs table and dense 288px Metrics cards. P0/P1/P2=0. **PHASE 4 COMPLETE.**
- Task 5.1: complete in the continuation worktree (no commit). Settings now uses route-owned shared Tabs with hydration-safe URL restoration, push-only user changes, passive Back/Forward, desktop Arrow/Home/End, and one named compact selector. Embedded Operations updates current state without passive focus or scroll while standalone direct hash and explicit anchors retain focus/scroll. Independent review initially left one browser-observation P2; a no-product-change recovery added non-zero-scroll mount/hash/popstate geometry and fresh readback closed it. Final PASS: focused 25/25, shared UI 9/9, Web 308/308, mocked Chromium 16/16, Web/UI typecheck+lint, production build, and diff-check PASS. Geometry: 390/390 contained; 1920 main 1672, content 1480, panel/root 1400. P0/P1/P2=0.
- Task 5.2: complete in the continuation worktree (no commit). Settings now treats the URL `team` value as the sole selection authority, resolves pending/resolved/unavailable/blocked/empty states across serial pagination, keeps Team scope latent on Operations, and issues workflow-state requests only after exact Team authorization resolution. A real-browser initial-empty race was fixed; independent review then found and closed a concurrent-render ref mutation by moving request observation into commit-phase state with StrictMode coverage. Final PASS: focused 23/23, Web 322/322, mocked Chromium 17/17, Web typecheck/lint, production build, targeted post-review browser rerun, and diff-check PASS. Clean evidence proves 390/390 containment and 1920 main/content/panel widths of 1672/1480/1400 with ordered first-page → second-page → exact-states requests. P0/P1/P2=0.
- Task 5.3: complete in the continuation worktree (no commit). Settings now offers five stable persisted color presets plus one UI-only Custom mode, sends the exact existing `{name, category, color}` contract without client position, keeps server-provided colors byte-for-byte, and provides localized success/reset and failure-preserve behavior. Visual inspection found and fixed a global radio-width collision that left accessible names but hid visible labels; browser evidence now asserts all six label rectangles. Final PASS: focused 22/22, Web 329/329, mocked Chromium 20/20, Web typecheck/lint, production build, and diff-check PASS. Geometry: 390 uses two 142.6×44px columns with exact containment; 1440/1920 use a 900px form and six dense ~139×44px options; 1920 content/workflow card are 1480/1400px. Stage 0 increment is present but accurately UNAVAILABLE pending the isolated UX test topology. P0/P1/P2=0.
- Task 5.3-R: complete test-owner recovery (no product or fixture change). The real topology exposed the accepted compact-by-default Label control behind `More filters`; Stage 0 now verifies the initial collapsed state, activates the control, waits for Label visibility, and fills it without reusing the relabelled trigger. Root collection 18 tests/4 files, Web typecheck, and diff-check PASS. Review round 1 found the lazy-locator and stale-report issues; round 2 PASS has P0/P1/P2=0. GEN-397 is Done revision 8 and Task 5.6 is resumed.
- Task 5.3-R2: complete test-owner recovery (no product or fixture change). The second real run showed both drawers correctly defaulted to Responsibility and no comment POST before timeout. Stage 0 now selects exact Discussion in each context, then keeps the original post and cross-context SSE assertions. Root collection 18 tests/4 files, Web typecheck, and diff-check PASS; independent review P0/P1/P2=0. Task 5.6 is resumed.
- Task 5.3-R3: complete test-owner ordering recovery (no product, fixture, or timeout change). The third real run proved the primary comment POST, then exposed the secondary detail's legitimate status-revision remount to Responsibility. The Discussion activation now occurs after the status SSE assertion on the new DOM. Root collection 18 tests/4 files, Web typecheck, and diff-check PASS; independent review P0/P1/P2=0. Task 5.6 is resumed.
- Task 5.4: complete in the continuation worktree (no commit). Native Team deletion confirmation is replaced by a shared guarded Dialog with an immutable revision snapshot, synchronous duplicate-submit guard, encoded revision-specific idempotent DELETE, modal-local safe errors, nondismissible busy focus containment, commit-before-refresh separation, and Task-5.2-owned route reconciliation. Final PASS: shared UI 10/10, focused 33/33, Web 342/342, mocked Chromium 19/19, Web typecheck/lint, production build, and diff-check PASS. Stable sanitized evidence proves 390 document 390/390 with 702→1277 local scrolling and 1920 Dialog 560px with 680/680 whitespace and centered delta 0; success focuses the actually visible desktop selector or the 390 Teams heading. Stage 0 uses the real Dialog and remains scheduled for the isolated Task 5.6 topology. Independent PASS: P0/P1/P2=0.
- Task 5.5: complete in the continuation worktree (no commit). Connect now exposes only the normalized advertised MCP client subset, selects the first valid client atomically, shares one non-secret client facts table with administrator onboarding, provides native-radio keyboard cards and named local-scroll configuration regions, keeps Config/Link clipboard state independent, and suppresses raw public and administrator discovery details. The first review found one P1 raw administrator detail and one P2 Generic label; both were corrected and independently re-reviewed. Final PASS: focused 16/16, Web 350/350, mocked Chromium 7/7, Web typecheck/lint, production build, and diff-check PASS; recovery-focused 11/11 and root spec listing PASS. Stable sanitized evidence proves 390 document containment with real preview scrolling, a deliberate centered 1120px shell at 1440/1920, two dense columns, symmetric 160/400px wide-PC whitespace, and zero credential-shaped artifact findings. Root stateful execution remains the Task 5.6 gate. P0/P1/P2=0.
- Task 5.6 attempt: RED after the first valid dedicated real-topology run. All UI/focused/full/type/lint/build/mocked/list/diff gates passed, and the unique test-named PostgreSQL/Redis project cleaned to zero containers/volumes. Stage 0 passed installation and reached Issue filters, then timed out because its older direct Label lookup did not activate the accepted compact-by-default `More filters` control; screenshot/source evidence confirms the product control was visible. Eleven authenticated MCP/diagnostics cases did not run. Task 5.3's incremental Stage 0 body is the single reopened owner; no product or fixture change is attributed to the verification gate. Credential/Bearer scans are zero.
- Task 5.6 second valid real-topology attempt: RED after 6 bootstrap cases passed, Stage 0 progressed beyond compact filters through the board status move, and 11 authenticated cases remained gated. No comment POST occurred before the 180-second timeout; both final drawer snapshots stayed on the accepted default `Responsibility` tab, while the comment editor belongs to `Discussion`. The exact test owner is reopened to select Discussion in both contexts before the SSE comment assertion. Run directory `D:\Cache\Temp\workmesh-web-ui-evidence-2026-08-23\task-5.6-run-20260823-083701`; root list and diff-check PASS, secret/credential scan zero, cleanup containers=0/volumes=0.
- Task 5.6 third valid real-topology attempt: RED after the primary comment POST succeeded. The secondary comment assertion received a correctly remounted Responsibility panel after the earlier status SSE revision update; the pre-status Discussion selection did not survive that remount. The exact test owner is reopened to move the secondary Discussion activation after the status assertion, without changing product, fixture, or timeout. Run directory `D:\Cache\Temp\workmesh-web-ui-evidence-2026-08-23\task-5.6-run-20260823-085225`; 6 bootstrap cases PASS, 11 authenticated cases gated, root list/diff-check PASS, secret scan zero, cleanup 0/0.
- Task 5.6 final real-topology rerun: PASS. Final directory `D:\Cache\Temp\workmesh-web-ui-evidence-2026-08-23\task-5.6-run-20260823-090205` used a unique healthy PostgreSQL/Redis topology and passed root collection 18 tests/4 files, root Chromium 18/18 in 2.8m, and diff-check; cleanup 0 containers/0 volumes and credential/Bearer scans are zero. Combined with the prior full run: UI 10/10, focused Web 56/56, Web 350/350, typecheck/lint/build, mocked Chromium 29/29. Nine stable source/copy artifacts have equal SHA-256. Final geometry: 1440 document 1440/1440, 1120px shell with 160/160px whitespace; 1920 document 1920/1920, 1120px shell with 400/400px whitespace; both use dense 358.39/665.61px columns. The final wide-PC screenshots were visually inspected and show no clipping or accidental narrow content island. Independent review recomputed hashes and returned P0/P1/P2=0. **PHASE 5 COMPLETE.**
- Task 6.1: complete in the continuation worktree (no commit). One fail-closed authenticated runtime owns `g i/a/s` and `f`, while public/unknown routes mount neither realtime nor Command Center and make zero authenticated requests. Agents use deterministic roving primary links with independent Peek, approval, and Team Access state; native Enter is preserved. Independent review found and closed one P1 Agent Space guard plus visibility, shifted-slash, timer-cleanup, and browser-evidence gaps. Final PASS: focused Web 82/82, shared UI 10/10, full Web 389/389, typecheck/lint, production build, mocked Chromium 6/6, and diff-check. Stable evidence covers 390×844 and 1920×1080 public boundaries, all named interactive contexts, unknown/expired/modal chords, exact destinations, focus geometry, and no overflow; secret scan is zero. GateReport P0/P1/P2=0.
- Task 6.2: complete in the continuation worktree (no commit). Dialog/Sheet now share one coordinated modal stack while Popover/label menus use a separate dismissal stack; dynamic inertness, reference-counted scroll lock, nested ownership, exact-once dismissal, real-trigger focus return, busy delete safety, and explicit Command Center initial focus are covered through public behavior. Final PASS: overlay 21/21, affected Web 44/44, shared UI 9/9, full Web 411/411, UI/Web typecheck, Web lint, production build 13/13, mocked Chromium 4/4, and diff-check. Sanitized 390×844 and 1920×1080 evidence proves Sheet 620px, delete Dialog 560px with center delta 0, main shift 0/0, document containment, background lock/internal scroll, and deterministic final focus. Manifest validates 18 artifacts; secret scan is zero; independent GateReport P0/P1/P2=0.
- Task 6.3: complete in the continuation worktree (no commit). A deterministic immutable toast store now retains pre-subscription outcomes, composes pointer/focus pause state, preserves safe origins, and expires only success/info outcomes; one viewport owns unique close names, single atomic announcements, local scrolling, modal-relative layering, and deterministic manual-close focus. Home, Agents, Operations, and Settings use a strict transient-success/failure allowlist while contextual errors stay on their actionable surface. Final PASS: focused Web 71/71, shared UI 11/11, full Web 438/438, overlay regression 21/21, UI/Web typecheck and lint, production build 13/13, mocked Chromium 2/2, and diff-check. Sanitized evidence proves a 358px stack at 390 and a bounded 420px stack at 1920, document containment, local overflow, modal inertness/z-order, exact push/expiry focus identity, and zero credential-shaped matches; manifest validates 12/12 artifacts. Independent GateReport P0/P1/P2=0.
- Task 6.4: complete in the continuation worktree (no commit). Scope-aware initialized collections, actor authority keys, keyed page scopes, request generations, and post-await lifetime guards now prevent old actor/Team/query data and side effects from crossing authority changes while preserving same-scope rows and focus. Home, Agents, Settings, Operations, Agent Connections, and WorkSurfaces own independent pending/error/empty/stale states and geometry-matched decorative Skeletons. Final PASS: focused Web 166/166, full Web 534/534, shared UI 11/11, UI/Web typecheck and lint, production build 13 routes, loading-state Chromium 12/12, overlay/toast regression 6/6, and diff-check. Forty-five PNG/JSON artifacts cover 390x844, 1440x900, and 1920x1080; manifest size/SHA-256 readback is 45/45 with no mismatch, missing, or unlisted file. Wide-PC pending/resolved widths match within 2px, header/control movement stays below 2px, document overflow is zero, and independent review returned P0/P1/P2=0.
- Task 6.5: complete in the continuation worktree (no commit). The existing AppShell now preserves its 760/761 boundary while the project strip owns named, focusable, keyboard-local scrolling; 320-760 discrete controls meet the 40px floor; Operations' measured mobile header overflow is removed; real Skeleton and stale-WorkSurface animations stop under reduced motion; and wide layouts use the accepted 1480/1120/1180/85%-Usage geometry. Same-input baseline/fresh visual comparison caught a machine-gate miss: a single 1920 Issue card stretched to 715.4375px. The added <=320px assertion and `align-content:start` repair reduce it to 224.171875px at both 1440 and 1920. Final PASS: portable human reflow 9/9, responsive surfaces 9/9 plus real reduced motion, focused Web 10/10, Web 537/537, shared UI 11/11, UI/Web typecheck+lint, both builds, and diff-check. The 74-row evidence manifest has zero missing, size, or SHA-256 mismatches. Root acceptance leaves the complete owner-regression rerun to Task 6.8 and the single consolidated product/UX/visual audit to Task 7.3.
- Task 6.6: complete in the continuation worktree (no commit). AppShell now retains one visible page `h1`; shared and Team Access tabs expose connected panels with the accepted desktop keyboard model and compact selector; Command Center, Login, Install, Connect, Agent/Session deep links, skip targets, and standalone Operations pass the strict semantic fixture. Same-input visual comparison caught the browser's black four-sided main focus outline; the final product-color 3px top inset cue preserves visible focus without framing the full 1920 workspace. Final PASS: complete matrix 6/6, post-cue main journeys 2/2 plus deep/public 4/4, shared UI 11/11, focused Web 40/40, layout 9/9, and UI/Web typecheck. The stable 1920/390 evidence contains two PNGs plus six request/semantic JSON files; its 8-entry manifest validates with zero mismatch. This gate makes no broad WCAG/axe claim; the single consolidated product/UX/visual audit remains Task 7.3.
- Task 6.7: complete in the continuation worktree (no commit). The TypeScript-powered checker recognizes 19 locale tables and 97 production sources, resolves imported aliases/member/destructured/injected translators, checks recursive Copy/function leaves and exact Partial omissions, and scans visible JSX plus UI-facing attributes. The initial 78 findings were split into 42 exact stable-token/frozen-preview occurrences and 36 real product defects; all 36 now use strict typed bilingual copy, including attachment phase/error/recovery states, leaving zero diagnostics and no stale allowlist entry. Final PASS from both repository-root and `apps/web` working directories: checker tests 10/10 each, direct CLI and both `pnpm check:i18n` forms, i18n focused 2/2, callsite 37/37, business-surface 30/30, Web typecheck, and diff-check. The two Task 7.2 IntersectionObserver pagination RED contracts remain intact and outside this task.
- Task 6.8: complete in the continuation worktree (no commit). The exact full-Web gate first executed the two prewritten Task 7.2 observer REDs, then the initial 68-case browser matrix isolated 10 failures: four real standalone Operations regressions and six stale fixture assertions. Exact owners removed automatic WorkSurface pagination, restored 1440 four-column and 1920 85.083% Usage geometry, reanchored an asynchronously displaced standalone direct-hash target only while it remains focused, and updated fixtures to current connected-tabpanel/status/localized-region semantics. Targeted recovery passed 32/32; the final single-worker browser matrix passed 68/68 across 8 files. Fresh final gates: shared UI 11/11; Web 78 files/556 tests; i18n 19 tables/97 sources; UI/Web typecheck and lint; 13/13 production pages; diff-check. The stable manifest validates 177 artifacts (96 JSON, 81 PNG) with zero missing/size/hash mismatch and SHA-256 `5616bcc2ef2172b065a04091cf5993ca487bbf0bc0c4ddb277ccbca8a83fe3ec`; Phase 5 real-topology 18/18 remains a satisfied prerequisite. **PHASE 6 COMPLETE.**
- Task 7.1: complete in the continuation worktree (no commit). The first strict deterministic browser run passed 3/8 and retained six exact REDs: three fixture/query seams and three product Back/reconciliation-focus gaps. Exact prior owners repaired Agent detail return focus, Command Center result return focus, and Settings delete retry/reconciliation focus without weakening assertions. Targeted recovery passed 3/3; fresh full and evidence reruns each passed 8/8. Web typecheck, i18n over 19 locale tables/98 production sources, owner diff-check, credential-prefix absence, and zero listeners on 3200/3201 all passed. The combined evidence manifest verifies 27/27 entries by bytes and SHA-256. GEN-409 is Done and Task 7.2 browser/performance acceptance is unblocked.
- Task 7.2: complete in the continuation worktree (no commit). WorkSurfaces and the shared adaptive collection retain exactly one 300-card DOM across List and Board, preserve card identity/focus, and use stable latest-ref delegates so same-value parent callback/status-array updates do not rerender the cards. Removing HomePage's duplicate layout state restored the parent render probe from `3→4` to `3→3`. Exact Issues rerun passed 2/2 and the fresh four-case suite passed 4/4: CLS is `0`; Issues pagination is at most `289.4ms`, layout switching at most `244.9ms`, and per-window long-task total at most `240ms`; Agents pagination is at most `350.7ms`, Peek at most `228.0ms`, and keyboard filtering at most `108.9ms`. Focus, ledger, cursor, terminal-state, and explicit-load assertions all pass. The verified final manifest contains 9/9 artifacts, 930 bytes, SHA-256 `ea523a7da287af7941628d2aea1c965ca562a25d8066b4078e7319cbd20607b4`; ports 3200/3201 are released.
- Task 7.3: complete in the continuation worktree. The final schema-v2 runner passed all seven steps without retry: root mixed 56/56, mocked-dev 136/136, production Web plus mocked API 50/50 and production build PASS. Fresh repository gates pass at lint/typecheck 17/17, tests 28/28 tasks with Web 592/592, i18n 19 locale tables/98 production sources, and verification scripts 39/39. The deterministic tour passes 46/46 across 390/768/1440/1920 plus the extra Connect/standalone Operations cases; its 93-file stable manifest hashes to `f1419dfe5ab95e976c946011a2dc4bdaeef5496682cc5ad4695e07df924f6848`. The requested PC gate passes the 248/1672/1480/1120/1180 frozen geometry, contains every document, and removes narrow loading islands. After retaining the three durable runner ledgers, the exact 5,446-file/460,653,874-byte generated worktree cache was removed. The rerun scope/conflict audit passes with zero outside paths, zero committed/dirty/untracked/hunk/content intersections and a clean read-only merge-tree. One consolidated independent product audit reports no P0/P1/P2 findings and accepts the frontend program. Details are in `task-7.3-report.md` and `final-report.md`. **PHASE 7 COMPLETE.**

---

# Continuation v2 audit and evidence — 2026-08-22

## Current-code screenshots (mocked local runtime, inspected)

Evidence directory: `C:\Users\xurx\.codex\visualizations\2026\08\22\01a0289b-47dc-7b21-a78f-a3b0bc36cde3\workmesh-ux-audit\`

- `01-agents-registry-current.png` — desktop Agent registry baseline; retained for card/link/Peek comparison.
- `02-agents-sessions-current.png` — desktop Sessions tab baseline.
- `03-approvals-current.png` — desktop Pending empty-state baseline.
- `04-approvals-mixed-status-current.png` — desktop fixture proves approved/rejected rows can be rendered in the Pending surface when a response ignores the status query; Task 3.5 adds a defensive pending projection.
- `05-issues-current.png` — desktop Issues baseline.
- `06-settings-current.png` — desktop Settings baseline; current custom tablist and always-visible team selector are visible.
- `07-operations-current.png` — desktop, Operations feature enabled with empty collections; retained for anchor/search/empty-state comparison.
- `08-issues-mobile-current.png` — 390×844; dense filters/cards and horizontal clipping are visible.
- `09-approvals-mobile-current.png` — 390×844; the approval table expands the document to roughly 640px and causes page-level horizontal overflow.

The temporary audit mock, audit worktree, and dedicated database were removed after capture; only these non-secret screenshot artifacts remain.

## Reproduced baseline blockers

1. **Task 3.4 CSS regression (`3.4-R`).** Commit `868478f` lacks `.agent-session-detail .approval-inbox article` and `.approval-actions` rules. The recovered working-tree test currently passes:

   ```text
   pnpm --filter @workmesh/web exec vitest run app/agent-session-detail.test.tsx
   Test Files  1 passed (1)
   Tests       3 passed (3)
   ```

   The fix is still uncommitted and must be reviewed with the Agents approval-table test to prove selector isolation.

2. **WorkItem board continuation contract (`B.1`).** Clean-tip Web typecheck fails:

   ```text
   features/work-items/work-surfaces.tsx(330,340): error TS2322
   Property 'onLoadMore' does not exist on type 'WorkItemBoardProps'.
   ```

   The caller already passes the callback. A global stash contains an earlier `packages/ui/src/index.tsx` experiment, but continuation must implement/review the contract explicitly and must not pop that stash.

3. **Shared UI Client Component boundary (`B.2`).** `pnpm --filter @workmesh/web build` fails while importing `packages/ui/src/index.tsx` through `app/loading.tsx`: Next reports `useEffect`, `useRef`, and `useState` without a `"use client"` directive.

4. **UI Vitest setup resolution (`B.3`).** `pnpm --filter @workmesh/ui test` aborts before collecting tests because root `vitest.config.ts` resolves `./vitest-setup.ts` against `packages/ui`. `pnpm --filter @workmesh/ui exec tsc --noEmit` itself passes. The setup path and the production build are now one mandatory baseline gate.

## Recovery `task-3.4b` — ✅ PASS

Implementation/report owner grouped `3.4-R` and `B.1-B.3` as `task-3.4b` without commit or stash operations. Report: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/task-3.4b-report.md`.

- `WorkSurfaces` is the single automatic-pagination owner; the invalid Board `onLoadMore` prop and orphan per-column sentinel CSS were removed. The explicit pagination button remains.
- `packages/ui/src/index.tsx` now declares `'use client'` and has a first-line source contract.
- `localVitestSetup(cwd)` loads only a package-owned `vitest-setup.ts`; UI/Contracts do not invent empty setup files.
- Task 3.4 session-detail approval selectors/tests were preserved.

GREEN evidence recorded by the implementer and rerun/accepted by the independent reviewer:

```text
WorkSurfaces pagination contract: 4/4
Vitest setup resolver contract: 2/2
@workmesh/ui: 6/6; typecheck PASS
@workmesh/contracts: 129/129
@workmesh/web: 214/214 across 43 files; typecheck PASS
Next production build: PASS, including /agents
git diff --check: PASS
```

Reviewer finding count: P0=0, P1=0, P2=0. Non-blocking build warnings: Next inferred the parent checkout as workspace root due to multiple lockfiles; the existing ESLint configuration did not register the Next plugin. Neither warning blocked compilation/static generation.

## Plan audit corrections incorporated in continuation v2

- Task 3.6 no longer replaces the Task 3.3 drawer with navigation. The new model is a read-only Peek Sheet plus a real stable Agent link and a separate Team Access Sheet.
- Focus, selection, and opened-layer IDs are independent. Required keys: J/K or arrows move focus, X toggles applicable selection, Space opens Peek, Enter follows the stable link, Escape closes the top layer before clearing selection.
- Outer/inner tabs and view-defining filters are URL-shareable; Back/Forward are tested.
- Pending and History are separate projections. Pending remains `status=pending` with a defensive status check. History requires exactly one URL-selected terminal status (`approved`, `rejected`, `expired`, `consumed`, or `canceled`; default `approved`) and queries `/api/v1/approvals?status=<selected>` so server filtering and cursor pagination remain aligned. It has no pseudo “all terminal” view and uses only existing Web `Approval` fields.
- Approval decisions provide no Undo because no inverse backend operation exists.
- Phase 4/5 placeholders were replaced with executable tasks. The Usage task no longer invents a time series; Settings export/import was removed.
- React is recorded as version 19. Remaining tasks reuse shared `Tabs`, `Dialog`, `Sheet`, and `AppShell`; no second focus-trap or navigation shell is planned.
- `/` and Cmd/Ctrl+K remain command-center shortcuts. New page hotkeys cannot intercept them.
- Existing responsive debt includes the stable `human-reflow.spec.ts:74` failure and missing reduced-motion override for the realtime pulse; both are required in Task 6.5, not waived.
- Task 3.6 preflight found that `GET /api/v1/agents/{id}` returns the raw Agent row while the declared OpenAPI response requires aggregated `team_access`. Because this continuation remains frontend-only, the detail page must not convert the omitted field to an empty grant set. Peek uses list-loaded access; detail management returns to `/agents?tab=agents&teamAccessAgent=<id>`, where the aggregated list opens the authoritative Team Access Sheet. API/OpenAPI conformance remains a backend follow-up.
- Phase 4 preflight confirmed that Usage decimal strings include values beyond `Number.MAX_SAFE_INTEGER` and that `known_cost_minor` is a minor-unit amount. Task 4.4 now requires `BigInt` end to end, ISO-aware USD/JPY conversion, and an explicit minor-unit fallback for unknown currencies. Tasks 4.1-4.4 progressively own `operations-ux.spec.ts`; Task 4.5 runs the standalone/embedded feature matrix and 390×844 gate without patching product code.
- Phase 5 preflight added pagination-safe Team reconciliation, Workspace-only workflow-state requests, an exact existing-token workflow palette, stable idempotent delete confirmation with modal-local errors and busy dismissal guards, advertised-only MCP client cards backed by exported onboarding metadata, and immediate updates to the existing Settings/Connect E2E specs. A not-yet-loaded second-page Team must never be rewritten as unauthorized.
- Phase 6 preflight corrected real component signatures, collection topology, responsive/reduced-motion thresholds, deterministic keyboard/semantic fixtures, and a typed strict i18n inventory. Task 6.7 now resolves imported Partial copy contracts with the TypeScript checker and recursively covers every locale table rather than only the flat dictionary.
- Phase 7 preflight separated mock-only specs from root mixed-topology E2E, scoped `limit=100` to the large-list scenario so Command Center retains `limit=50`, required explicit Issues/Agents 100→200→300 loading, and assigned removal of the WorkSurface external observer. Final verification now owns a reproducible four-viewport tour, isolated run-directory cleanup, verified PostgreSQL/Redis/bootstrap prerequisites, and a repair HEAD/patch/untracked conflict audit.
- 2026-08-23 audit-boundary update: the user consolidated review into one final frontend audit after implementation and explicitly excluded safety/security auditing. Task 7.3 therefore owns one product/UX/visual/regression/performance/scope/conflict gate, uses deterministic run-directory cleanup only as test hygiene, and makes no safety/security claim.
- 2026-08-23 final-tour contract correction: read-only route inspection confirmed the shipped canonical project-work contract is `tab=board` plus `workItem`, not an implicit board or `workItemId`. Task 7.3 now exercises `/?view=projects&project=project-1&tab=board` and `/?view=my-work&workItem=work-101`. The 1920 gate also preserves Phase 6.5's accepted centered `1421–1482px` Home/Issues content geometry; only the intentionally `content--full` Operations surface is measured against the `>=95%` main-width threshold, through one added standalone `/operations#operations-metrics` 1920 evidence case. This corrects contradictory verification prose without changing product behavior or weakening the dominant-collection `>=98%` assertion.
- 2026-08-23 delivery update: the user authorized local git commits at coherent, accepted module/phase checkpoints. Commits remain root-owned, use explicit reviewed file lists, and wait until all parallel owners are quiescent; stash/pop, merge, rebase, push, and deployment remain out of scope.
- 2026-08-23 integration-order recovery: Task 6.8's exact full-Web command passed 546 existing tests but correctly executed the two prewritten Task 7.2 observer-removal RED cases. Rather than exclude them, the exact Task 7.2 unit/static owner slice was advanced: WorkSurfaces now has no observer/sentinel auto-load path and the pagination contract is 7/7 plus hook 14/14 GREEN. Task 6.8 is rerunning from that state; Task 7.1 still precedes Task 7.2's browser/performance acceptance.

---

# Continuation v2 execution order

The continuation remains serial because the same Agent/Settings/i18n/CSS files recur across tasks. Use one fresh implementer and one independent review gate per task; do not run overlapping implementers against shared files.

```text
3.4-R CSS regression
  -> B.1 WorkItemBoard onLoadMore contract
  -> B.2 packages/ui Client Component boundary
  -> B.3 UI Vitest + typecheck/test/build baseline
  -> 3.5 Pending/History + URL state
  -> 3.6 Agent Peek + stable link + separate Team Access Sheet
  -> 3.7 Phase 3 gate
  -> 4.1 -> 4.2 -> 4.3 -> 4.4 -> 4.5
  -> 5.1 -> 5.2 -> 5.3 -> 5.4 -> 5.5 -> 5.6
  -> 6.1 -> 6.2 -> 6.3 -> 6.4 -> 6.5 -> 6.6 -> 6.7 -> 6.8
  -> 7.1 -> 7.2 -> 7.3
```

## Active implementation lanes

- None. Product implementation, verification, and the consolidated audit are complete; only the root-owned local checkpoint and control-plane handoff remain mechanical delivery steps.

## Serially blocked after the Ready task

- None. The shared-file serial chain through Task 7.3 is complete, and the final independent audit was consolidated at the end of the overall frontend program as directed.

## Current completion claim

- Phase 0: 10/10 complete.
- Phase 1: 6/6 complete.
- Phase 2: 6/6 complete.
- Phase 3: 7/7 complete; recovery and three-viewport browser gates PASS.
- Phase 4: 5/5 complete; final 390/1920 gate PASS.
- Phase 5: 6/6 complete; full/mocked/real-topology and independent review PASS.
- Phase 6: 8/8 complete; full fresh gate PASS.
- Phase 7: 3/3 complete; Task 7.3 and the final consolidated audit PASS.
- Local delivery uses one root-owned explicit-file checkpoint commit after final staging review. Push, merge, rebase, deployment, and stash operations remain out of scope.
