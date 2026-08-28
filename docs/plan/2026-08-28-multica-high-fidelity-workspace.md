# Multica high-fidelity workspace implementation plan

Authority: `docs/adr/0064-multica-high-fidelity-workspace.md`

Reference: `X:/Projects/Code/multica/apps/docs/public/images/docs/workspace-overview.webp`

Project: `0691b1ff-2361-4b45-8d7c-1e3432a3b1ef`

## M7.0 — Shell and above-the-fold workspace

Rework the navigation rail, workspace frame, Project Work header, project switcher, view tabs, and toolbar so the work canvas starts above the fold at 1440×900. Move Overview-only summaries and delivery content out of the Board surface. Preserve routes, localization, session state, and authority boundaries.

Tests: shell/navigation unit tests, project route tests, 1440/1024/768/390 viewport checks, no global horizontal overflow.

DoD: the board begins within the initial viewport; primary navigation and project/view switching remain keyboard accessible; no backend contract changes.

## M7.1 — High-fidelity board lanes and cards

Independently implement the selected reference's compact toolbar, softly tinted lanes, compact column headers, inline add/menu actions, and dense white cards. Keep Human responsibility distinct from active Agent execution; show risk/dependency/evidence signals without crowding the title.

Tests: shared UI board/card tests, pointer/keyboard/selector moves, card wrapping, empty lanes, large collections, 320–1440px containment.

DoD: board composition and density visibly match the reference while all WorkMesh move and authority semantics remain intact.

## M7.2 — Detail, filters, and responsive interactions

Collapse advanced filters and saved views behind a compact toolbar disclosure, preserve search and layout controls, and align the quick/full Work Item detail with the new canvas. On narrow screens use card-first content and contained board scrolling without hiding primary actions.

Tests: filter/saved-view tests, drawer/detail focus restoration, responsive keyboard/touch checks, accessibility labels and 44px touch targets.

DoD: core controls work end to end and the board remains operable at desktop and mobile breakpoints.

## M7.3 — Integrated visual acceptance

Run focused and integrated Web checks, capture reference and implementation at the same 1440×900 state, complete Product Design QA, fix every P0/P1/P2 difference, and record any P3 polish. Verify the production-compatible Web build without changing API/Worker/MCP images.

Tests: `pnpm -C packages/ui test`, `pnpm -C apps/web typecheck`, focused Vitest, mocked E2E board journey, browser visual QA, console-error check, `git diff --check`.

DoD: `design-qa.md` says `final result: passed`; screenshots show the board above the fold and visually aligned with the selected reference; no known blocker remains.

## Dependency graph

M7.0 blocks M7.1; M7.1 blocks M7.2; M7.2 blocks M7.3.
