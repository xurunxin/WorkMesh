# WebUI i18n entry consolidation and single-token theme unification

Status: Proposed

## Context

The current WorkMesh web app (`apps/web`) carries design debt that makes the
Human-facing UI feel uneven and creates translation drift. Three concrete
problems have accumulated under ADR 0028's M1 "tokens + presentation
primitives" pass:

1. **Three coexisting design systems in one CSS file** —
   `apps/web/app/styles.css` ships, in one file:
   - a legacy dark theme (`#0f172a`, `#1e293b`, `#334155`, `#475569`, `#111827`,
     `#0f3fc7`, etc.) used by `/login`, `/install`, `/agents`, the agent
     session pages, and the work tabs;
   - a "Human UI foundation" (light, Kaneo-inspired) driven by
     `--wm-canvas / --wm-surface / --wm-text / --wm-muted / --wm-border / --wm-focus
     / --wm-info / --wm-success / --wm-warning / --wm-danger` tokens in
     `packages/ui/src/tokens.css`, used by `AppShell`, the work-item
     surfaces, the project workspace, and the connect/onboarding shell;
   - an "operations" theme (`#f7f8fb`, `#e4e7ec`, `#667085`,
     `#475467`, `#eaecf0`) that lives next to `--wm-*` selectors but is
     hard-coded, used only by `/operations`.
   The three palettes overlap visually and contradict each other on status
   surfaces (e.g. blue `#1d4ed8` for "started" legacy vs the same
   `--wm-info` `#2563eb` for the new foundation), which makes the product
   read as multiple unrelated apps.

2. **i18n entry is split and inconsistent** — `apps/web/app/lib/i18n.tsx`
   already defines `t`, `issueCopy`, `surfaceCopy`, `detailCopy`, and
   `guidanceCopy` and a default `zh-CN` locale, but:
   - `apps/web/app/settings/page.tsx` carries its own inline
     `const text = locale === 'zh-CN' ? {…} : {…}` object instead of
     going through the same `LocaleProvider`/`useLocale` channel used by
     `page.tsx`.
   - `/login`, `/install`, `/operations`, and `/connect` ship hard-coded
     English strings even though the default locale is `zh-CN`. Toggling to
     `en` exposes the `packages/ui` English fallback, but the default
     Chinese reader sees English labels on those routes.
   - `packages/ui/src/index.tsx` keeps `defaultWorkItemCopy` in English as
     the fallback. There is no doc comment marking that copy as
     "fallback-only"; future readers do not know that the app layer is
     the primary copy source.

3. **Partial migration tests already pin some expectations** —
   `apps/web/app/ui-layout-contract.test.ts` already asserts that
   `home`, `agents`, and `operations` import `AppShell` and `RealtimeStatus`
   and use `ErrorState` / `EmptyState`. The same test asserts
   z-index ordering for `mobile-navigation`, `.app-shell .drawer`, and
   `.content > .conflict-notice`. It does not yet pin the absence of legacy
   dark-theme colors or `operations`-theme colors, so a future regression
   that re-introduces them would not be caught at the contract layer.

ADR 0028 already settled the architecture direction (Kaneo-inspired
foundation, no shadcn/ui as an application architecture, CSS variables and
authored CSS as the M1 baseline, M2/M3/M4 staged dependency candidates).
The M1 work is partly done; this ADR finishes the M1 closeout so M2 can
build on a single token system and a single i18n entry.

## Decision

1. **Keep the in-house design system.** Follow ADR 0028: continue
   `packages/ui` (Button, Input, Select, AppShell, Dialog, Sheet, Popover,
   Tabs, Badge, Card, Toast, Skeleton, AsyncStateSurface, EmptyState,
   ErrorState, ConflictState, ForbiddenState, WorkItemList, WorkItemBoard,
   WorkItemCard, WorkItemFilters) plus the 12 `--wm-*` tokens. Do **not**
   introduce shadcn/ui, MUI, Chakra, Tailwind, Framer Motion, or
   `@base-ui/react` in this scope; defer `@base-ui/react` per ADR 0028's
   "no dependency is installed by GEN-4" until a real primitive is
   needed.

2. **Converge on one i18n entry, with `zh-CN` as the primary copy.**
   - `apps/web/app/lib/i18n.tsx` becomes the **single** copy source for the
     web app. Its `LocaleContextValue` exports a fixed catalog of
     `TranslationKey` plus 10 typed `Copy` subsets:
     `issueCopy`, `surfaceCopy`, `detailCopy`, `guidanceCopy`,
     `settingsCopy`, `loginCopy`, `installCopy`, `operationsCopy`,
     `connectCopy`, `agentsCopy`.
   - `apps/web/app/settings/page.tsx` deletes its inline `text` object
     and reads `useLocale().settingsCopy` instead.
   - `/login`, `/install`, `/operations`, `/connect`, `/agents` switch
     from hard-coded English to `useLocale().<page>Copy` calls.
   - Default `LocaleProvider` locale remains `zh-CN`. The English
     dictionaries in i18n.tsx may be left empty for keys that are not
     yet translated; those fall through to `packages/ui` English defaults
     and then to the page's hard-coded English string as a last-resort
     fallback. Console-warn-once when the last layer is hit (logged in
     development only).

3. **Document the fallback chain in code.** Add a header doc comment in
   `apps/web/app/lib/i18n.tsx` that lists the 10 Copy subsets and the
   three-layer fallback order
   (`app-layer copy` → `packages/ui defaultWorkItemCopy` →
   `page literal`). Add a five-line doc comment above
   `defaultWorkItemCopy` in `packages/ui/src/index.tsx` marking it as
   "fallback only; app-layer LocaleProvider is the primary copy source".

4. **Delete the legacy dark theme and the operations-only theme.**
   In `apps/web/app/styles.css`:
   - delete the legacy selectors using `#0f172a`, `#1e293b`, `#334155`,
     `#475569`, `#111827`, `#0f3fc7`, `#1d4ed8`, `#fca5a5`, `#94a3b8`,
     `#cbd5e1`, `#e2e8f0`, `#7f1d1d` (`.shell`, `.shell aside`,
     `.shell nav`, `.auth`, `.center` (legacy), `.error` (legacy),
     `.empty` (legacy), `.work-tabs`, `.agent-center`, `.agent-center-grid`,
     `.session-page`, `.state-*`, `.team-access-list`, `.work-room`,
     `.inbox-panel`, `.room-card`, `.intent-*`, `.participant-strip`,
     `.room-message-form`, `.combined-timeline`, `.decision-list`,
     `.lease-list`, old media queries, and the entire
     `.project-delivery` legacy block);
   - delete the operations-only selectors that hard-code
     `#f7f8fb`, `#e4e7ec`, `#667085`, `#475467`, `#eaecf0` and the
     `.operations-shell` self-themed background (`.operations-shell {…
     background: #f7f8fb;}`, `.operations-shortcut`, `.operations-metrics`,
     `.operations-panel`, `.operations-table`, `.operations-grid`).
   - keep all `.app-shell`, `.project-workspace`, `.project-plan-*`,
     `.work-item-*`, `.wm-work-item-*`, `.collaboration-feedback`,
     `.connect-page`, `.onboarding-*`, and any selector that is already
     namespaced under `.app-shell` or uses `--wm-*` tokens.
   - add two minimal new selectors: `.auth-shell` (centered grid) and
     `.auth-card` (`width: min(420px, 100%)`) for the `/login` and
     `/install` pages.

5. **Migrate the four unmigrated routes to the foundation.**
   - `AppShell` already supports an empty `navigation` array; add one
     small behavior: when both `navigation` and `utilityNavigation` are
     empty, suppress the `<aside>` element so the public pages do not
     render an empty sidebar. This is a single edit in
     `packages/ui/src/index.tsx`, exercised by the N6 routes and locked
     in by an assertion in `ui-foundation.test.ts`.
   - `/login` and `/install` are net-new to `AppShell`: wrap the
     existing form in
     `<AppShell productName="WorkMesh" headerActions={<LocaleToggle />}>`
     and render the form inside a `<Card>` centered by `.auth-shell` /
     `.auth-card`.
   - `/operations` is **already** wrapped in `AppShell`; this scope
     only changes its inner `.operations-*` classNames to `--wm-*`
     references and removes the legacy color values. No new
     `AppShell` wrap is added.
   - `/connect` is **already** on the new foundation; only its copy
     moves to `useLocale().connectCopy`. No className change.
   - `/agents` keeps its existing translations; verify each `t(...)` call
     has a `zh-CN` value in `agentsCopy`.

6. **Strengthen `ui-layout-contract.test.ts` with four reverse
   assertions.** Add tests that read `styles.css` as a string and assert
   it does **not** contain:
   - the legacy dark hex colors listed above;
   - the operations-only hex colors listed above;
   - the legacy class names `.shell `, `.auth,` / `.auth {`, `.agent-center`,
     `.session-page`, `.work-tabs`, `.state-executing`, `.state-completed`,
     `.operations-shell {`;
   And add a test that reads `settings/page.tsx` and asserts it does
   **not** contain the inline `const text = locale === 'zh-CN' ?`
   literal. Keep the existing four positive assertions unchanged.

7. **Add one Playwright spec `theme-unification.spec.ts`.**
   The spec loads `/login`, `/install`, `/operations`, `/connect`,
   `/agents`, and the home page, then asserts
   `getComputedStyle(document.body).backgroundColor` is **not**
   `rgb(15, 23, 42)` or `rgb(17, 24, 39)` (the two legacy darks) and that
   at least one expected `zh-CN` label is present per route (a
   `toContainText` smoke check on the new `Copy` keys).

8. **Preserve the light-only theme.** No dark mode is added in this
   scope. A future ADR may add `[data-theme="dark"]` overrides and a
   `ThemeToggle` next to `LocaleToggle`; that is out of scope here.

9. **Document the change in `packages/ui/MIGRATION.md`.** Add a
   "v32 i18n entry" subsection that states: app-layer i18n is the
   primary copy source; `packages/ui` defaults are fallback only; the
   10 Copy subsets are listed by name; default locale is `zh-CN`.

10. **Track execution as 7 TaskGraph nodes, serially gated on N1.**
    - N1: add the 6 new `Copy` types (`SettingsCopy`, `LoginCopy`,
      `InstallCopy`, `OperationsCopy`, `ConnectCopy`, `AgentsCopy`) and
      their `zh-CN` dictionaries; export them from `LocaleContextValue`;
      en dictionaries may be empty.
    - N2: migrate `apps/web/app/settings/page.tsx` to
      `useLocale().settingsCopy`; remove the inline `text` object.
    - N3: add `connectCopy` and migrate `apps/web/app/connect/page.tsx`
      to `useLocale().connectCopy` (no className change).
    - N4: add `agentsCopy` and verify `apps/web/app/agents/page.tsx`
      uses `useLocale().agentsCopy` for every visible string.
    - N5: migrate `apps/web/app/operations/page.tsx` —
      `useLocale().operationsCopy` + change `.operations-*` classNames
      to `--wm-*` references.
    - N6: migrate `apps/web/app/login/page.tsx` and
      `apps/web/app/install/page.tsx` — wrap in `AppShell`, render the
      form in a centered `<Card>` using `.auth-shell` / `.auth-card`,
      and route their strings through `useLocale().loginCopy` /
      `useLocale().installCopy`.
    - N7: in `apps/web/app/styles.css`, delete the legacy dark block
      and the operations-only block; add the four reverse assertions in
      `ui-layout-contract.test.ts`; add `theme-unification.spec.ts`;
      add the `AppShell` empty-navigation suppression; add the doc
      comments in `i18n.tsx` and `packages/ui/src/index.tsx`; add the
      `v32 i18n entry` section in `packages/ui/MIGRATION.md`.
    N2–N6 may run in parallel after N1; N7 must run last.

## Alternatives

- **Adopt shadcn/ui wholesale** (rejected by ADR 0028 and re-confirmed
  here). Wholesale adoption imports a second routing/state/authority
  model, bloats the bundle, and does not address the "three coexisting
  themes" problem without the same per-page migration.
- **Adopt MUI / Chakra** (rejected). Same cost as shadcn/ui wholesale,
  worse WorkMesh-authority expression, and a forced delete of every
  existing `--wm-*` consumer.
- **Add a dark theme in the same scope** (rejected). Dark mode is a
  separate design + token work; mixing it with the M1 closeout doubles
  the risk and the test surface without addressing the i18n problem.
- **Move i18n to a new `packages/i18n` runtime** (rejected for this
  scope). The 10 typed `Copy` subsets already give type safety; a new
  package would add a layer without solving a concrete problem in M1.
  Re-evaluate after M3.
- **i18next / lingui** (rejected). ADR 0028 defers these until the
  WorkMesh glossary and a typed catalog contract are ready; we are not
  there yet and the work to migrate is not justified by the four pages
  in scope.

## Consequences

- The Human-facing UI reads as a single product. Status colors, surface
  colors, and typography are consistent across `/login`, `/install`,
  `/operations`, `/connect`, `/agents`, `/settings`, the home page, and
  the work-item surfaces.
- `apps/web/app/styles.css` shrinks by roughly 250 lines
  (legacy dark ≈ 200 lines + operations-only ≈ 50 lines). The remaining
  file is one theme, one token system, namespaced under `.app-shell`
  where it lives next to components.
- `apps/web/app/lib/i18n.tsx` becomes the only place to add or change
  copy. Future page-local copy must declare a `Copy` type and join the
  catalog or be flagged in code review.
- `packages/ui` is demoted to a fallback layer; the doc comments make
  the new contract explicit so future contributors do not treat
  `defaultWorkItemCopy` as the primary source.
- Existing `ui-foundation.test.ts`, `ui-layout-contract.test.ts`
  positive assertions, and all `stage0..stage4.spec.ts` /
  `frontend-unification.spec.ts` / `work-item-detail.spec.ts` /
  `human-reflow.spec.ts` / `mcp-onboarding.spec.ts` / `pagination.spec.ts`
  / `rich-content.spec.ts` / `collaboration-hub.spec.ts` /
  `command-center.spec.ts` / `connection-diagnostics.spec.ts` /
  `features-disabled.spec.ts` / `guidance.spec.ts` / `work-surfaces.spec.ts`
  e2e tests must continue to pass without modification. Any test that
  breaks is a regression in this scope and must be fixed as part of N7.
- The default-locale reader (`zh-CN`) now sees Chinese labels on
  `/login`, `/install`, `/operations`, `/connect`, `/agents`, and
  `/settings`, closing the visible translation gap.
- The English reader sees a mix of intentional English copy, the
  `packages/ui` English fallback, and (in the very worst case) a
  hard-coded English literal. This is acceptable for M1 closeout and is
  tracked by the dev-only console-warn.
- The `AppShell` empty-navigation suppression is a small behavior
  change. The existing `ui-foundation.test.ts` already pins
  `aria-label="Main navigation"`; a new assertion pins "no `<aside>`
  when both `navigation` and `utilityNavigation` are empty" so the
  suppression is locked in.

## Migration

1. N1 adds the 6 new `Copy` types + `zh-CN` dictionaries. No visual or
   behavioral change.
2. N2–N6 each touch one page (or, for N2, one page that already has
   i18n keys via the `text` object). Each is small enough to review
   individually and reverts independently if needed.
3. N7 deletes the legacy CSS only after every page it covered has been
   migrated. If N7 fails any reverse assertion, the deletions are
   reverted one block at a time.
4. `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm test:e2e` must
   pass at the end of N7. The completion report lists the
   `ui-layout-contract` and `theme-unification` results.
5. No database migration, no API change, no event change, no public
   package contract change. ADR 0028 remains the source of truth for
   architecture; this ADR is its M1 closeout.

## Spec changes

- `packages/ui/MIGRATION.md`: add a "v32 i18n entry" subsection.
- `packages/ui/src/index.tsx`: add a 5-line doc comment above
  `defaultWorkItemCopy` marking it as fallback-only.
- `apps/web/app/lib/i18n.tsx`: add a header doc comment listing the 10
  `Copy` subsets and the 3-layer fallback order; add a dev-only
  `console.warn` when the last layer is hit.
- `apps/web/app/styles.css`: delete the legacy dark block and the
  operations-only block; add `.auth-shell` and `.auth-card`.
- `apps/web/app/ui-layout-contract.test.ts`: add the four reverse
  assertions (no legacy hex, no operations-only hex, no legacy class
  names, no inline `text` object in `settings/page.tsx`).
- `apps/web/e2e/theme-unification.spec.ts`: new spec asserting the
  unified light theme across the 6 routes plus a `zh-CN` smoke label
  per route.
- `WORKMESH_PRD.md`, `AGENT_PROTOCOL.md`, `OPENAPI.yaml`, `SCHEMA.sql`:
  no change.
- No new ADR; this entry is an M1 closeout of ADR 0028, not a new
  architectural decision.
