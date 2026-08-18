# WebUI i18n Entry + Single-Token Theme Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the three coexisting design systems (legacy dark, new `--wm-*` foundation, operations-only) in `apps/web/app/styles.css` into the single `--wm-*` token system, and make `apps/web/app/lib/i18n.tsx` the single i18n entry that exposes ten typed `Copy` subsets with `zh-CN` as the primary locale.

**Architecture:** Zero new dependencies. Continue the in-house `packages/ui` per ADR 0028. Add six typed `Copy` subsets to `LocaleContextValue`, migrate five pages (`/login`, `/install`, `/operations`, `/connect`, `/agents`) plus `/settings` to read copy from `useLocale()`, and delete the legacy dark theme block plus the operations-only theme block from `styles.css`. Add four reverse-assertion tests in `ui-layout-contract.test.ts` to lock the cleanup in, and one new Playwright spec `theme-unification.spec.ts` to assert the unified light theme across the six public/workspace routes.

**Tech Stack:** TypeScript strict, React 19, Next.js 15.5, `@workmesh/ui` (Button/Input/Select/AppShell/Dialog/Sheet/Popover/Tabs/Badge/Card/Toast/Skeleton/AsyncStateSurface/EmptyState/ErrorState/ConflictState/ForbiddenState), CSS variables, Phosphor icons. Vitest 3 for unit, Playwright 1.55 for e2e. **No new dependencies.**

**WorkMesh Project:** `f51c4778-d3de-437c-b065-12c6f6eb84fc` (Team: General). Each task maps to one Issue (N1–N7) under that Project.

## Global Constraints

- **Default locale is `zh-CN`.** `LocaleProvider` keeps `useState<Locale>('zh-CN')` as the initial value. English dictionaries in `i18n.tsx` may be left empty for keys that are not yet translated; those fall through to `packages/ui` English defaults.
- **No new third-party dependencies.** No `@base-ui/react`, no shadcn/ui, no Tailwind, no Framer Motion, no i18next.
- **No dark mode.** Light-only theme. `[data-theme="dark"]` overrides are explicitly out of scope.
- **No domain / API / DB changes.** No new migration, no `OPENAPI.yaml` change, no event schema change, no public package contract change.
- **`packages/ui` default copy is fallback-only.** `defaultWorkItemCopy` in `packages/ui/src/index.tsx` ships in English. App-layer i18n is the primary copy source. Add a 5-line doc comment above `defaultWorkItemCopy`.
- **Module boundary (ADR 0028):** `packages/ui` holds presentation primitives; `apps/web/features/<feature>` holds view-models/commands; `apps/web/app` is routing/composition. No boundary violation in this scope.
- **`--wm-*` tokens are the only theme system.** No new tokens. If a page needs a semantic color that does not map to existing tokens (e.g. a new status pill), it is a future spec, not this one.
- **z-index contract (locked in by `ui-layout-contract.test.ts`):** `mobile-navigation: 10`, `.app-shell .drawer: 20`, `.content > .conflict-notice: 30`, `.wm-overlay: 40`, `.wm-toast: 60`. Any new overlay must respect this order.
- **A11y baseline:** `aria-current="page"` for active nav, `aria-haspopup`, `aria-controls`, focus-visible ring (`--wm-focus-ring`), `prefers-reduced-motion` short-circuit. No regression.
- **i18n fall-through order (document in `apps/web/app/lib/i18n.tsx` header comment):**
  1. App-layer `Copy` subset in the current `LocaleProvider` value.
  2. `packages/ui` `defaultWorkItemCopy` English fallback.
  3. Page literal (logged once in dev as `console.warn('[workmesh/i18n] missing copy', { key, locale })`).
- **Commit cadence:** one commit per task. Commit messages use Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `style:`).
- **Validation gate before any task is "done":** `pnpm test` (vitest), `pnpm typecheck`, `pnpm lint`, and `pnpm test:e2e` (Playwright) all green. Existing e2e specs must pass without modification unless the spec is in this plan.

## File Structure

**Modify:**
- `apps/web/app/lib/i18n.tsx` — header doc comment; add `SettingsCopy` / `LoginCopy` / `InstallCopy` / `OperationsCopy` / `ConnectCopy` / `AgentsCopy` types and `Record<Locale, …>` dictionaries; extend `LocaleContextValue` with 6 new fields; add dev-only `console.warn` for last-layer fallthrough; add `fallbackWarn` helper.
- `apps/web/app/settings/page.tsx` — delete inline `text` object; read `useLocale().settingsCopy`.
- `apps/web/app/connect/page.tsx` — replace hard-coded English strings with `useLocale().connectCopy`.
- `apps/web/app/agents/page.tsx` — replace hard-coded English strings with `useLocale().agentsCopy`; verify every `t(...)` call has a `zh-CN` value.
- `apps/web/app/operations/page.tsx` — replace hard-coded English strings with `useLocale().operationsCopy`; replace `.operations-shell { background: #f7f8fb; }` (and any `.operations-*` selector that hard-codes a color) with `--wm-*` references.
- `apps/web/app/login/page.tsx` — wrap content in `AppShell` (empty navigation, header actions = `LocaleToggle`); render form in a centered `<Card>` using new `.auth-shell` / `.auth-card`; replace hard-coded English with `useLocale().loginCopy`.
- `apps/web/app/install/page.tsx` — same as `/login`, copy via `useLocale().installCopy`.
- `apps/web/app/styles.css` — delete legacy dark block (the contiguous block at file head before the `.foundation-center` comment, including `.shell`, `.auth, .center` (legacy), `.error` (legacy), `.empty` (legacy), `.work-tabs`, `.agent-center`, `.agent-center-grid`, `.session-page`, `.state-*`, `.team-access-list`, `.work-room`, `.inbox-panel`, `.room-card`, `.intent-*`, `.participant-strip`, `.room-message-form`, `.combined-timeline`, `.decision-list`, `.lease-list`, old media queries, legacy `.project-delivery` block); delete operations-only block (`.operations-shell { background: #f7f8fb; }` and any selector with literal `#f7f8fb` / `#e4e7ec` / `#667085` / `#475467` / `#eaecf0`); add `.auth-shell` and `.auth-card`.
- `apps/web/app/ui-layout-contract.test.ts` — add four reverse-assertion tests; expand the third test to require `AppShell` + `RealtimeStatus` for `settings` in addition to `home`, `agents`, `operations`.
- `apps/web/app/ui-foundation.test.ts` — add one assertion: `AppShell` with both `navigation` and `utilityNavigation` empty does **not** render an `<aside>` element.
- `packages/ui/src/index.tsx` — add 5-line doc comment above `defaultWorkItemCopy`; when both `navigation.length === 0` and `utilityNavigation.length === 0`, suppress the `<aside>` element (the brand and shell header stay visible).
- `packages/ui/MIGRATION.md` — add a "v32 i18n entry" subsection.
- `playwright.config.ts` — add `theme-unification.spec.ts` to the `bootstrap` project `testMatch` so it runs without authenticated state.

**Create:**
- `apps/web/app/lib/i18n.test.ts` — vitest spec for the new 10-field `LocaleContextValue` shape, the 3-layer fallback chain, the dev `console.warn` on the last layer.
- `apps/web/e2e/theme-unification.spec.ts` — Playwright spec loading `/login`, `/install`, `/operations`, `/connect`, `/agents`, `/`; asserts `getComputedStyle(document.body).backgroundColor` is not one of the two legacy darks; asserts at least one expected `zh-CN` label per route.

**Untouched (read-only references):**
- `packages/ui/src/tokens.css` — the 12 `--wm-*` tokens. No new tokens.
- `apps/web/app/page.tsx` — already on the foundation; only verifies no regression.
- `apps/web/app/features/*` — view-model and command layer; no changes.
- `apps/api/*`, `apps/worker/*`, `apps/mcp/*`, `packages/db/*`, `packages/contracts/*` — no changes.

---

### Task 1: i18n.tsx — add six new Copy types and zh-CN dictionaries

**Files:**
- Modify: `apps/web/app/lib/i18n.tsx` (top, middle, and the `LocaleContextValue` block)
- Create: `apps/web/app/lib/i18n.test.ts`

**Interfaces:**
- Consumes: existing `TranslationKey`, `messages`, `issueCopies`, `surfaceCopies`, `detailCopies`, `guidanceCopies`, `LocaleContextValue`, `LocaleProvider`.
- Produces:
  - `SettingsCopy`, `LoginCopy`, `InstallCopy`, `OperationsCopy`, `ConnectCopy`, `AgentsCopy` types.
  - `settingsCopies`, `loginCopies`, `installCopies`, `operationsCopies`, `connectCopies`, `agentsCopies` `Record<Locale, <Name>>` constants.
  - `LocaleContextValue` extended with `settingsCopy: SettingsCopy`, `loginCopy: LoginCopy`, `installCopy: InstallCopy`, `operationsCopy: OperationsCopy`, `connectCopy: ConnectCopy`, `agentsCopy: AgentsCopy`.
  - `useLocale()` consumers see all ten `Copy` fields.
  - Dev-only `console.warn` when the last-layer fall-through is hit (logged once per key per session via a `Set<string>` memo).

- [ ] **Step 1: Write the failing test for the new Copy subsets**

Add `apps/web/app/lib/i18n.test.ts` (new file):

```ts
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { LocaleProvider, useLocale } from './i18n'

function Probe() {
  const ctx = useLocale()
  return createElement('pre', null, JSON.stringify({
    keys: Object.keys(ctx).sort(),
    settingsLoadingZh: ctx.settingsCopy.loading,
    loginTitleZh: ctx.loginCopy.title,
    installTitleZh: ctx.installCopy.title,
    operationsTitleZh: ctx.operationsCopy.title,
    connectTitleZh: ctx.connectCopy.title,
    agentsLabelZh: ctx.agentsCopy.agents,
  }))
}

describe('web i18n entry', () => {
  beforeEach(() => {
    document.cookie = 'workmesh_locale=; Path=/; Max-Age=0'
    window.localStorage.removeItem('workmesh_locale')
  })

  it('exposes ten Copy subsets and the primary t helper', () => {
    const html = renderToStaticMarkup(createElement(LocaleProvider, null, createElement(Probe)))
    const payload = JSON.parse(html.replace(/<[^>]+>/g, ''))
    expect(payload.keys).toEqual([
      'detailCopy', 'detailCopy', /* and so on, sorted */ /* will be filled in Step 3 */
    ].sort())
    // The minimum new fields we are adding right now:
    expect(payload.settingsLoadingZh).toBe('正在加载设置…')
    expect(payload.loginTitleZh).toBe('登录')
    expect(payload.installTitleZh).toBe('安装 WorkMesh')
    expect(payload.operationsTitleZh).toBe('运营与规划')
    expect(payload.connectTitleZh).toBe('连接智能体到 WorkMesh')
    expect(payload.agentsLabelZh).toBe('智能体')
  })
})
```

(The exact JSON-key sort assertion will be filled in once the final field list is locked. Replace the comment placeholder with the real sorted keys list when the implementation lands.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workmesh/web test -- i18n.test.ts`
Expected: FAIL with `Cannot find name 'settingsCopy'` / `loginCopy` etc. (the new fields are not yet in `LocaleContextValue`).

- [ ] **Step 3: Add the six new Copy types and `Record<Locale, …>` dictionaries to `i18n.tsx`**

In `apps/web/app/lib/i18n.tsx`, after the existing `detailCopies` block (around line 296–368) and before `type LocaleContextValue =` (line 370), add:

```ts
// (after the existing detailCopies const, around line 368)

export type SettingsCopy = {
  loading: string
  loadFailed: string
  retry: string
  back: string
  team: string
  currentTeam: string
  noTeam: string
  settings: string
  title: string
  workspace: string
  subtitle: string
  reviewOnly: string
  workspaceStructure: string
  teams: string
  teamName: string
  teamKey: string
  createTeam: string
  selectedTeam: string
  teamDetails: string
  saveChanges: string
  deleteTeam: string
  deleteHelp: string
  createFirst: string
  teamWorkflow: string
  workflowStates: string
  noStates: string
  statusName: string
  category: string
  color: string
  createStatus: string
  selectTeam: string
  loadingMore: string
  loadMoreTeams: string
  loadMoreStates: string
  mainNavigation: string
  workspaceNavigation: string
  administrationNavigation: string
  mobileNavigation: string
  menu: string
  skip: string
  confirmDelete: (name: string) => string
  requestFailed: string
  categories: { backlog: string; planned: string; started: string; completed: string; canceled: string }
}

const settingsCopies: Record<Locale, SettingsCopy> = {
  'zh-CN': {
    loading: '正在加载设置…', loadFailed: '无法加载设置。', retry: '重试', back: '返回 Issues', team: '团队', currentTeam: '当前团队', noTeam: '无团队', settings: '设置', title: '设置', workspace: '工作区', subtitle: '工作区管理与日常规划保持分离。', reviewOnly: '你可以查看团队设置；工作区管理员负责管理团队和工作流状态。', workspaceStructure: '工作区结构', teams: '团队', teamName: '团队名称', teamKey: '团队标识', createTeam: '新建团队', selectedTeam: '已选团队', teamDetails: '团队详情', saveChanges: '保存更改', deleteTeam: '删除团队', deleteHelp: '从当前工作区导航中移除此团队。', createFirst: '新建团队后即可配置工作流。', teamWorkflow: '团队工作流', workflowStates: '工作流状态', noStates: '暂无工作流状态。', statusName: '状态名称', category: '分类', color: '颜色', createStatus: '新建状态', selectTeam: '请选择团队以管理工作流。', loadingMore: '正在加载…', loadMoreTeams: '加载更多团队', loadMoreStates: '加载更多工作流状态', mainNavigation: '主导航', workspaceNavigation: '工作区导航', administrationNavigation: '管理导航', mobileNavigation: '移动端导航', menu: '菜单', skip: '跳到主要内容', confirmDelete: name => `确定删除团队 ${name}？删除后其工作将不可用。`, requestFailed: '操作失败。', categories: { backlog: '待办', planned: '已规划', started: '进行中', completed: '已完成', canceled: '已取消' },
  },
  en: {
    loading: 'Loading Settings…', loadFailed: 'Unable to load Settings.', retry: 'Retry', back: 'Back to Issues', team: 'Team', currentTeam: 'Current team', noTeam: 'No team', settings: 'Settings', title: 'Settings', workspace: 'Workspace', subtitle: 'Workspace administration stays separate from daily planning.', reviewOnly: 'You can review team settings. Workspace admins manage teams and workflow states.', workspaceStructure: 'Workspace structure', teams: 'Teams', teamName: 'Team name', teamKey: 'Team key', createTeam: 'Create team', selectedTeam: 'Selected team', teamDetails: 'Team details', saveChanges: 'Save changes', deleteTeam: 'Delete team', deleteHelp: 'Remove this team from active workspace navigation.', createFirst: 'Create a team to configure its workflow.', teamWorkflow: 'Team workflow', workflowStates: 'Workflow states', noStates: 'No workflow states yet.', statusName: 'Status name', category: 'Category', color: 'Color', createStatus: 'Create status', selectTeam: 'Select a team to manage its workflow.', loadingMore: 'Loading…', loadMoreTeams: 'Load more teams', loadMoreStates: 'Load more workflow states', mainNavigation: 'Main navigation', workspaceNavigation: 'Workspace navigation', administrationNavigation: 'Administration navigation', mobileNavigation: 'Mobile navigation', menu: 'Menu', skip: 'Skip to content', confirmDelete: name => `Delete team ${name}? Its work remains unavailable after this action.`, requestFailed: 'Something went wrong.', categories: { backlog: 'Backlog', planned: 'Planned', started: 'Started', completed: 'Completed', canceled: 'Canceled' },
  },
}

export type LoginCopy = {
  title: string
  subtitle: string
  email: string
  password: string
  emailPlaceholder: string
  passwordPlaceholder: string
  signIn: string
  signingIn: string
  signInFailed: string
  retry: string
  installPrompt: string
}

const loginCopies: Record<Locale, LoginCopy> = {
  'zh-CN': { title: '登录', subtitle: '使用工作区账号登录', email: '邮箱', password: '密码', emailPlaceholder: 'name@example.com', passwordPlaceholder: '至少 12 个字符', signIn: '登录', signingIn: '正在登录…', signInFailed: '登录失败。', retry: '重试', installPrompt: '工作区尚未安装。' },
  en: { title: 'Sign in', subtitle: 'Sign in with your workspace account', email: 'Email', password: 'Password', emailPlaceholder: 'name@example.com', passwordPlaceholder: 'At least 12 characters', signIn: 'Sign in', signingIn: 'Signing in…', signInFailed: 'Sign in failed.', retry: 'Retry', installPrompt: 'Workspace is not installed yet.' },
}

export type InstallCopy = {
  title: string
  subtitle: string
  workspace: string
  workspacePlaceholder: string
  slug: string
  slugPlaceholder: string
  yourName: string
  yourNamePlaceholder: string
  email: string
  password: string
  bootstrapToken: string
  bootstrapHelp: string
  install: string
  installing: string
  installFailed: string
  retry: string
}

const installCopies: Record<Locale, InstallCopy> = {
  'zh-CN': { title: '安装 WorkMesh', subtitle: '首次启动时初始化工作区与管理员账号', workspace: '工作区名称', workspacePlaceholder: 'My Workspace', slug: '工作区标识', slugPlaceholder: 'workspace-slug', yourName: '管理员姓名', yourNamePlaceholder: '管理员姓名', email: '邮箱', password: '密码', bootstrapToken: '启动令牌', bootstrapHelp: '除非 API 处于显式 loopback-only 开发启动模式，否则必填。令牌仅发送一次，本页不保存。', install: '安装', installing: '正在安装…', installFailed: '安装失败。', retry: '重试' },
  en: { title: 'Install WorkMesh', subtitle: 'Initialize the workspace and admin account on first launch', workspace: 'Workspace name', workspacePlaceholder: 'My Workspace', slug: 'Workspace slug', slugPlaceholder: 'workspace-slug', yourName: 'Your name', yourNamePlaceholder: 'Your name', email: 'Email', password: 'Password', bootstrapToken: 'Bootstrap token', bootstrapHelp: 'Required unless the API is in explicit loopback-only development bootstrap mode. The token is sent once and is not stored by this page.', install: 'Install', installing: 'Installing…', installFailed: 'Installation failed.', retry: 'Retry' },
}

export type OperationsCopy = {
  title: string
  subtitle: string
  loading: string
  loadingDescription: string
  error: string
  errorDescription: string
  disabledTitle: string
  disabledDescription: string
  metricsTitle: string
  cycles: string
  initiatives: string
  automation: string
  loops: string
  runs: string
  templates: string
  run: string
  kind: string
  status: string
  attempts: string
  session: string
  created: string
  cycleState: (state: string) => string
  initiativeHealth: (health: string) => string
}

const operationsCopies: Record<Locale, OperationsCopy> = {
  'zh-CN': {
    title: '运营与规划', subtitle: '查看长期规划、自动化、健康度与成本', loading: '正在加载运营数据…', loadingDescription: '正在获取规划、自动化、健康度与成本数据。', error: '无法加载运营数据。', errorDescription: '请稍后重试或联系工作区管理员。', disabledTitle: '运营页面未启用', disabledDescription: '本部署未启用 Operations UI 功能。', metricsTitle: '运营指标', cycles: '规划周期', initiatives: '主题', automation: '自动化规则', loops: 'Agent 循环', runs: '运行记录', templates: '模板', run: '运行', kind: '类型', status: '状态', attempts: '尝试次数', session: '会话', created: '创建时间', cycleState: state => state, initiativeHealth: health => health,
  },
  en: { /* fallback for now */ },
}
```

(The `cycleState` / `initiativeHealth` mappings are the source of truth for the `OperationsCopy` type defined above. Task 5 Step 2 extends the `en` dictionary with the full state-name mappings; the `zh-CN` side stays as identity for now because Chinese status names come from the server payload, not from the local dictionary.)

Continue with the remaining four subsets. For brevity, the full code block is in `apps/web/app/lib/i18n.tsx` (one PR per task, but this plan is the single PR; if reviewer asks to split, split by page).

The other four (`OperationsCopy`, `ConnectCopy`, `AgentsCopy`) follow the same `zh-CN` 100% / `en: {…}` shape with the values from the corresponding page's hard-coded English and natural Chinese.

- [ ] **Step 4: Extend `LocaleContextValue` with the six new fields**

In `apps/web/app/lib/i18n.tsx`, change `type LocaleContextValue = { … }` to:

```ts
type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey) => string
  issueCopy: Partial<WorkItemCopy>
  surfaceCopy: Partial<WorkSurfaceCopy>
  detailCopy: Partial<WorkItemDetailCopy>
  guidanceCopy: GuidanceCopy
  settingsCopy: SettingsCopy
  loginCopy: LoginCopy
  installCopy: InstallCopy
  operationsCopy: OperationsCopy
  connectCopy: ConnectCopy
  agentsCopy: AgentsCopy
}
```

- [ ] **Step 5: Wire the six new fields into `LocaleProvider` value**

In `apps/web/app/lib/i18n.tsx`, change the `useMemo<LocaleContextValue>(...)` body to:

```ts
const value = useMemo<LocaleContextValue>(() => ({
  locale,
  setLocale: setCurrentLocale,
  t: key => messages[locale][key],
  issueCopy: issueCopies[locale],
  surfaceCopy: surfaceCopies[locale],
  detailCopy: detailCopies[locale],
  guidanceCopy: guidanceCopies[locale],
  settingsCopy: settingsCopies[locale],
  loginCopy: loginCopies[locale],
  installCopy: installCopies[locale],
  operationsCopy: operationsCopies[locale],
  connectCopy: connectCopies[locale],
  agentsCopy: agentsCopies[locale],
}), [locale])
```

- [ ] **Step 6: Add a 3-layer fallback helper and dev-only `console.warn`**

In `apps/web/app/lib/i18n.tsx`, add immediately above `type LocaleContextValue =`:

```ts
// Last-layer fallback for the new Copy subsets. We keep the keys stable so
// downstream pages do not need to null-check; the warning is dev-only.
const warnedMissingKeys = new Set<string>()
function fallbackCopy<T extends Record<string, unknown>>(key: string, primary: T, fallback: T, locale: Locale): T {
  if (locale === 'zh-CN') return primary
  // en dictionary is the preferred source; packages/ui defaults are wired
  // through the page components, not through this helper.
  for (const k of Object.keys(primary) as Array<keyof T>) {
    if (primary[k] == null || primary[k] === '') {
      if (!warnedMissingKeys.has(`${key}.${String(k)}`)) {
        warnedMissingKeys.add(`${key}.${String(k)}`)
        if (typeof console !== 'undefined') console.warn(`[workmesh/i18n] missing copy: ${key}.${String(k)} for locale=${locale}`)
      }
    }
  }
  return primary
}
```

This helper is used by the new Copy dictionaries' runtime wiring in Step 5 (instead of `settingsCopies[locale]`, the value will be `fallbackCopy('settings', settingsCopies[locale], packagesUiDefault, locale)` once we wire `packages/ui` defaults). For this task, the helper is exported but the wiring stays `settingsCopies[locale]` — the wiring switch happens at the end of Task 7.

- [ ] **Step 7: Add a header doc comment at the top of `i18n.tsx`**

Replace the existing first 7 lines (the import block through the first `type Locale = ...`) with:

```ts
/**
 * apps/web/app/lib/i18n.tsx — single i18n entry for the WorkMesh web app.
 *
 * This module exports the `LocaleProvider` and the `useLocale` hook. It is
 * the ONLY place web code should read translated copy from.
 *
 * Ten typed `Copy` subsets are exposed via `useLocale()`:
 *   - `t(key)`             — flat dictionary for short labels (nav, buttons, status)
 *   - `issueCopy`          — Work Item list / board copy
 *   - `surfaceCopy`        — Work Surface (loading / empty / error) copy
 *   - `detailCopy`         — Work Item detail copy
 *   - `guidanceCopy`       — Guidance revision history copy
 *   - `settingsCopy`       — Settings page copy
 *   - `loginCopy`          — /login page copy
 *   - `installCopy`        — /install page copy
 *   - `operationsCopy`     — /operations page copy
 *   - `connectCopy`        — /connect onboarding page copy
 *   - `agentsCopy`         — /agents page copy
 *
 * The default locale is `zh-CN`. The English dictionaries may be left empty
 * for keys that are not yet translated; those fall through to the
 * `packages/ui` English defaults and finally to the page literal as a
 * last resort. The last layer logs a dev-only `console.warn` once per
 * missing key.
 */
```

- [ ] **Step 8: Run the new test to verify it passes**

Run: `pnpm --filter @workmesh/web test -- i18n.test.ts`
Expected: PASS. The new `useLocale()` consumers see all ten `Copy` fields and the `zh-CN` strings match.

- [ ] **Step 9: Run the existing tests to make sure nothing else broke**

Run: `pnpm --filter @workmesh/web test`
Expected: PASS. The `LocaleContextValue` change is additive; existing consumers (page.tsx, etc.) only read the four original fields.

- [ ] **Step 10: Commit**

```bash
git add apps/web/app/lib/i18n.tsx apps/web/app/lib/i18n.test.ts
git commit -m "feat(i18n): add six new Copy subsets to web i18n entry

Add SettingsCopy, LoginCopy, InstallCopy, OperationsCopy, ConnectCopy,
AgentsCopy types and zh-CN dictionaries. Extend LocaleContextValue and
wire them into LocaleProvider. Add i18n.test.ts covering the new shape
and a 3-layer fallback helper for the dev console.warn.

Refs: ADR 0045"
```

---

### Task 2: settings/page.tsx — migrate to `useLocale().settingsCopy`

**Files:**
- Modify: `apps/web/app/settings/page.tsx`

**Interfaces:**
- Consumes: `SettingsCopy` from `apps/web/app/lib/i18n.tsx` (added in Task 1).
- Produces: the page reads `const { locale, settingsCopy: text } = useLocale()`. Every `text.xxx` reference is unchanged; the literal `text` object is gone.

- [ ] **Step 1: Replace the inline `text` object with `useLocale()`**

In `apps/web/app/settings/page.tsx`, replace the lines:

```ts
const { locale } = useLocale()
const text = locale === 'zh-CN' ? {
  loading: '正在加载设置…', loadFailed: '无法加载设置。', …
} : {
  loading: 'Loading Settings…', loadFailed: 'Unable to load Settings.', …
}
```

with:

```ts
const { locale, settingsCopy: text } = useLocale()
```

The rest of the file is unchanged (every `text.xxx` reference still resolves).

- [ ] **Step 2: Run the existing settings page tests**

Run: `pnpm --filter @workmesh/web test -- settings`
Expected: PASS. (There is no `settings.test.ts`; the only coverage is the existing e2e specs. If any e2e spec references a settings text, leave it — the strings are unchanged.)

- [ ] **Step 3: Run the full test suite**

Run: `pnpm --filter @workmesh/web test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/settings/page.tsx
git commit -m "refactor(settings): read copy from useLocale().settingsCopy

Removes the inline 'text' object and the per-locale branch. The page
now has one translation source: the new SettingsCopy exposed by
apps/web/app/lib/i18n.tsx.

Refs: ADR 0045"
```

---

### Task 3: connect/page.tsx — migrate to `useLocale().connectCopy`

**Files:**
- Modify: `apps/web/app/connect/page.tsx`

**Interfaces:**
- Consumes: `ConnectCopy` from `apps/web/app/lib/i18n.tsx`.
- Produces: the page reads `const { connectCopy } = useLocale()`. No `className` change. No `AppShell` change (the page already wraps in `AppShell` with `connect-page { background: var(--wm-canvas); }`).

- [ ] **Step 1: Add `useLocale()` to imports and replace hard-coded strings**

In `apps/web/app/connect/page.tsx`:

- Add `import { LocaleToggle, useLocale } from '../lib/i18n'` (or whatever the current import path is) at the top of the file.
- Inside the component, after the existing state hooks, add `const { connectCopy } = useLocale()`.
- Replace the hard-coded English strings in JSX with `connectCopy.xxx` references. The exhaustive list comes from reading the file; the most prominent are: `<h1 id="connect-title">Connect an Agent to WorkMesh</h1>` → `connectCopy.title`, `<p className="eyebrow">Secure Agent setup</p>` → `connectCopy.eyebrow`, `<span className="health-pill health-neutral">Pair once �� verify live</span>` → `connectCopy.healthPill`, the three `eyebrow` rows (`'1 �� Client'`, `'2 �� Configuration'`, `'3 �� Verify'`) → `connectCopy.step1` / `step2` / `step3`, the `'Pairing fragment missing'` heading and its description → `connectCopy.fragmentMissing.title` / `.body`, the `'Secret boundary:'` strong and its full sentence → `connectCopy.secretBoundary`, the `'MCP client'` label → `connectCopy.mcpClient`, the `'Discovery'` / `'SHA-256'` `<dt>` rows → `connectCopy.discovery` / `connectCopy.sha256`, the `'Choose a supported client'` / `'Bounded bootstrap checklist'` headings → `connectCopy.chooseClient` / `connectCopy.bootstrapChecklist`, the `'Copy config'` / `'Copied'` button text → `connectCopy.copyConfig` / `connectCopy.copied`, the `'Generic MCP'`, `'OpenCode'`, `'Codex'`, `'Pi'` option labels → `connectCopy.clientGenericMcp` / `.opencode` / `.codex` / `.pi`.

- [ ] **Step 2: Extend `ConnectCopy` in `i18n.tsx` to cover every key used**

In `apps/web/app/lib/i18n.tsx`, add the missing fields to `ConnectCopy` so the page's TypeScript compiles. The full list of keys (with zh-CN values) is:

```ts
export type ConnectCopy = {
  eyebrow: string
  title: string
  healthPill: string
  fragmentMissingTitle: string
  fragmentMissingBody: string
  step1: string
  step2: string
  step3: string
  mcpClient: string
  discovery: string
  sha256: string
  chooseClient: string
  bootstrapChecklist: string
  copyConfig: string
  copied: string
  clientGenericMcp: string
  clientOpencode: string
  clientCodex: string
  clientPi: string
  secretBoundary: string
  copySuccess: string
}
```

Add `zh-CN` and `en` dictionaries.

- [ ] **Step 3: Run typecheck and existing tests**

Run: `pnpm --filter @workmesh/web typecheck && pnpm --filter @workmesh/web test`
Expected: PASS. The `connect-page.spec.ts` (if any) and `mcp-onboarding.spec.ts` continue to pass; the existing `frontend-unification.spec.ts` does not assert any connect text and is unaffected.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/connect/page.tsx apps/web/app/lib/i18n.tsx
git commit -m "feat(connect): localize page via useLocale().connectCopy

Replaces hard-coded English strings with the new ConnectCopy
exposed by apps/web/app/lib/i18n.tsx. No className change.

Refs: ADR 0045"
```

---

### Task 4: agents/page.tsx — verify and migrate to `useLocale().agentsCopy`

**Files:**
- Modify: `apps/web/app/agents/page.tsx`
- Modify: `apps/web/app/lib/i18n.tsx` (extend `AgentsCopy`)

**Interfaces:**
- Consumes: `AgentsCopy` from `i18n.tsx`.
- Produces: every visible string in `agents/page.tsx` is sourced from `agentsCopy`.

- [ ] **Step 1: Read `agents/page.tsx` and inventory every visible string**

Grep every literal in JSX that contains English text (use `Select-String` in PowerShell or read the file in full). Group them into the `AgentsCopy` shape.

- [ ] **Step 2: Extend `AgentsCopy` in `i18n.tsx` and migrate the page**

The exact key list depends on Step 1's inventory. The most common keys for the agents page based on existing usage in the worktree: `title`, `agents`, `noAgents`, `connect`, `connectHelp`, `connectionStatusTitle`, `pairing`, `pairingHelp`, `install`, `installHelp`, `lastSeen`, `addConnection`, `removeConnection`, `confirmRemove`, `registryName`, `registryEmpty`, `addRegistry`, `removeRegistry`, `defaultRegistry`, `setDefault`, `makeDefault`, `permissionsHelp`, `agentStatusActive`, `agentStatusInactive`, `connectionStatusActive`, `connectionStatusPending`, `connectionStatusError`, `connectionStatusRevoked`, `connectionStatusExpired`, `never`, `noLastSeen`.

Add the same `zh-CN` 100% / `en: {…}` shape as Task 1.

- [ ] **Step 3: Run typecheck and existing tests**

Run: `pnpm --filter @workmesh/web typecheck && pnpm --filter @workmesh/web test`
Expected: PASS. The `frontend-unification.spec.ts` assertion "agentsNavigation contains '智能体'" is unchanged because `agentsCopy.agents` is still `'智能体'`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/agents/page.tsx apps/web/app/lib/i18n.tsx
git commit -m "refactor(agents): localize page via useLocale().agentsCopy

Refs: ADR 0045"
```

---

### Task 5: operations/page.tsx — migrate copy and clean up `.operations-*` className

**Files:**
- Modify: `apps/web/app/operations/page.tsx`
- Modify: `apps/web/app/lib/i18n.tsx` (extend `OperationsCopy`)

**Interfaces:**
- Consumes: `OperationsCopy` from `i18n.tsx`. Existing `AppShell` wrap stays.
- Produces: every visible string is sourced from `operationsCopy`. The inner `.operations-shell { background: #f7f8fb; }` (and any selector that hard-codes `#f7f8fb` / `#e4e7ec` / `#667085` / `#475467` / `#eaecf0`) is removed; the page no longer carries a self-themed background.

- [ ] **Step 1: Inventory the existing `.operations-*` selectors in `styles.css`**

Run: `Select-String -Path apps\web\app\styles.css -Pattern '\.operations-' -AllMatches`
List every selector that hard-codes a color. Confirm none of them are used by the new foundation blocks.

- [ ] **Step 2: Extend `OperationsCopy` in `i18n.tsx`**

The full key list (from earlier read of `operations/page.tsx`): `title`, `subtitle`, `loading`, `loadingDescription`, `error`, `errorDescription`, `retry`, `disabledTitle`, `disabledDescription`, `metricsTitle`, `cycles`, `initiatives`, `automation`, `loops`, `runs`, `templates`, `run`, `kind`, `status`, `attempts`, `session`, `created`, `cycleState`, `initiativeHealth`, `cycleStateActive`, `cycleStatePlanned`, `cycleStateCompleted`, `initiativeHealthOnTrack`, `initiativeHealthAtRisk`, `initiativeHealthOffTrack`, `ruleStateActive`, `ruleStatePaused`, `loopStateActive`, `loopStatePaused`, `runStateSucceeded`, `runStateFailed`, `runStateRunning`, `runStatePending`.

Add `zh-CN` 100% / `en: {…}` dictionaries.

- [ ] **Step 3: Replace hard-coded strings in `operations/page.tsx`**

Every English literal in JSX becomes `operationsCopy.xxx`. The `cycle.state`, `initiative.health`, `rule.state`, `loop.state`, `run.status` class names are kept (they drive CSS class selection) but the displayed text inside them becomes `operationsCopy.cycleState(state)` / `.initiativeHealth(health)` / etc.

- [ ] **Step 4: Remove the `className="operations-shell"` self-themed background**

In `operations/page.tsx`, change `<div className="operations-shell">` to `<div>` (or, if a hook is needed for spacing, change to `<div className="operations-region">`). The corresponding CSS class is deleted in Task 7.

- [ ] **Step 5: Run typecheck and existing tests**

Run: `pnpm --filter @workmesh/web typecheck && pnpm --filter @workmesh/web test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/operations/page.tsx apps/web/app/lib/i18n.tsx
git commit -m "refactor(operations): localize + drop self-themed className

operations/page.tsx now reads copy from useLocale().operationsCopy
and renders inside the AppShell with no operations-shell background
override. The corresponding .operations-* CSS selectors are removed
in Task 7.

Refs: ADR 0045"
```

---

### Task 6: login + install — wrap in `AppShell` + `.auth-shell` + `zh-CN`

**Files:**
- Modify: `apps/web/app/login/page.tsx`
- Modify: `apps/web/app/install/page.tsx`
- Modify: `packages/ui/src/index.tsx` (suppress `<aside>` when both navigation arrays are empty; add doc comment above `defaultWorkItemCopy`)
- Modify: `apps/web/app/ui-foundation.test.ts` (add the empty-navigation assertion)
- Modify: `apps/web/app/styles.css` (add `.auth-shell` and `.auth-card`; both are pure new selectors, no other CSS change in this task)
- Modify: `apps/web/app/lib/i18n.tsx` (extend `LoginCopy` / `InstallCopy` if any new keys are needed)

**Interfaces:**
- Consumes: `LoginCopy` and `InstallCopy` from `i18n.tsx` (added in Task 1).
- Produces: `login` and `install` pages render in `AppShell` (no aside, brand visible, `LocaleToggle` in `headerActions`) wrapping a centered `<Card>` with `.auth-shell` / `.auth-card` styling. `packages/ui` `AppShell` accepts empty navigation without rendering an `<aside>`.

- [ ] **Step 1: Add the `.auth-shell` and `.auth-card` selectors to `styles.css`**

Append at the end of `styles.css` (after the existing v31 onboarding block):

```css
/* v32 i18n entry: public /install and /login centers */
.auth-shell { display: grid; place-items: center; min-height: 70vh; padding: clamp(1.25rem, 4vw, 2.5rem); }
.auth-card { width: min(420px, 100%); }
```

- [ ] **Step 2: Suppress `<aside>` in `AppShell` when both navigation arrays are empty**

In `packages/ui/src/index.tsx`, change the `AppShell` body from:

```tsx
<aside className="app-sidebar" aria-label={mainNavigationLabel}>
  …
</aside>
```

to:

```tsx
{(navigation.length > 0 || utilityNavigation.length > 0) && (
  <aside className="app-sidebar" aria-label={mainNavigationLabel}>
    …
  </aside>
)}
```

Also, in the `wm-shell-header`, wrap the mobile-navigation `<details>` element with the same guard so public pages do not render the mobile-only menu placeholder. Concretely, change:

```tsx
<details className="mobile-navigation" …>
  …
  <nav aria-label={mobileNavigationLabel}><NavigationLinks items={allNavigation} … /></nav>
  …
</details>
```

to:

```tsx
{(navigation.length > 0 || utilityNavigation.length > 0) && (
  <details className="mobile-navigation" …>
    …
    <nav aria-label={mobileNavigationLabel}><NavigationLinks items={allNavigation} … /></nav>
    …
  </details>
)}
```

- [ ] **Step 3: Add the 5-line doc comment above `defaultWorkItemCopy` in `packages/ui/src/index.tsx`**

Immediately above the line that starts `const defaultWorkItemCopy: WorkItemCopy = {`, insert:

```ts
// Default copy is English. It is the FALLBACK layer for consumers that do
// not provide their own copy. App-layer LocaleProvider
// (apps/web/app/lib/i18n.tsx) supplies zh-CN-first bundles and is the
// primary copy source.
```

- [ ] **Step 4: Add the empty-navigation assertion to `ui-foundation.test.ts`**

In `apps/web/app/ui-foundation.test.ts`, add a new test inside `describe('human UI foundation', () => { … })`:

```ts
it('omits the sidebar when both navigation and utilityNavigation are empty', () => {
  const html = renderToStaticMarkup(createElement(AppShell, {
    productName: 'WorkMesh',
    navigation: [],
    utilityNavigation: [],
    children: createElement('h1', null, 'Public page'),
  }))
  expect(html).not.toContain('<aside')
  expect(html).toContain('class="wm-shell-header"')
  expect(html).toContain('Public page')
})
```

- [ ] **Step 5: Run typecheck and unit tests**

Run: `pnpm --filter @workmesh/web typecheck && pnpm --filter @workmesh/web test`
Expected: PASS. The new assertion in `ui-foundation.test.ts` passes (the `AppShell` change in Step 2 removes `<aside>` for the empty case).

- [ ] **Step 6: Migrate `login/page.tsx`**

In `apps/web/app/login/page.tsx`, replace the top-level `<main className="auth">` body with:

```tsx
return <AppShell productName="WorkMesh" headerActions={<LocaleToggle />}>
  <div className="auth-shell">
    <Card title={loginCopy.title} subtitle={loginCopy.subtitle} className="auth-card">
      <form onSubmit={submit} data-testid="login-form">
        <label>{loginCopy.email}<input name="email" type="email" placeholder={loginCopy.emailPlaceholder} required /></label>
        <label>{loginCopy.password}<input name="password" type="password" placeholder={loginCopy.passwordPlaceholder} required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <Button disabled={submitting} data-testid="login-submit" type="submit" variant="primary">{submitting ? loginCopy.signingIn : loginCopy.signIn}</Button>
      </form>
    </Card>
  </div>
</AppShell>
```

Add the imports `AppShell, Button, Card` from `@workmesh/ui`, `LocaleToggle, useLocale` from `../lib/i18n`. The `useLocale().loginCopy` is read inside the component.

Add the missing keys to `LoginCopy` (already covers most of them from Task 1; add `emailPlaceholder` / `passwordPlaceholder` if they are not yet in the type). The zh-CN dictionary already has these values.

- [ ] **Step 7: Migrate `install/page.tsx`**

In `apps/web/app/install/page.tsx`, apply the same `AppShell` + `auth-shell` + `Card` pattern. Replace each English literal with `installCopy.xxx`. The `useInstallStatus` redirect-to-login logic stays unchanged.

- [ ] **Step 8: Run typecheck, unit tests, and the e2e suite**

Run: `pnpm --filter @workmesh/web typecheck && pnpm --filter @workmesh/web test && pnpm --filter @workmesh/web test:e2e`
Expected: PASS. The `stage0..stage4.spec.ts` and `frontend-unification.spec.ts` continue to pass; the new `ui-foundation.test.ts` empty-navigation assertion passes.

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/login/page.tsx apps/web/app/install/page.tsx packages/ui/src/index.tsx apps/web/app/ui-foundation.test.ts apps/web/app/styles.css apps/web/app/lib/i18n.tsx
git commit -m "feat(login+install): migrate to AppShell with auth-shell layout

login and install now render inside AppShell (no aside, brand
visible, LocaleToggle in header actions) and a centered <Card>
using the new .auth-shell / .auth-card CSS. AppShell suppresses the
<aside> and the mobile-navigation <details> when both navigation
arrays are empty. packages/ui defaultWorkItemCopy gets a doc
comment marking it as fallback-only.

Refs: ADR 0045"
```

---

### Task 7: styles.css cleanup + 4 reverse assertions + theme-unification e2e + docs

**Files:**
- Modify: `apps/web/app/styles.css` (delete legacy dark block, delete operations-only block, add `.auth-shell` / `.auth-card` if not added in Task 6)
- Modify: `apps/web/app/ui-layout-contract.test.ts` (add four reverse assertions; expand the third test to include `settings`)
- Create: `apps/web/e2e/theme-unification.spec.ts`
- Modify: `playwright.config.ts` (add `theme-unification.spec.ts` to the `bootstrap` project `testMatch`)
- Modify: `packages/ui/MIGRATION.md` (add the "v32 i18n entry" subsection)

**Interfaces:**
- Consumes: every page is now on the `--wm-*` foundation.
- Produces: `styles.css` is a single-theme file; the four reverse assertions pass; the e2e spec passes; the migration doc is current.

- [ ] **Step 1: Delete the legacy dark block from `styles.css`**

Delete in this order (so any failure can be reverted one block at a time):

1. `:root { … color: #e5e7eb; background: #111827; }` (keep the `font-family` declaration, move it into the existing `:root, .wm-theme` block if not already there).
2. `button, input, textarea, select { font: inherit; }` is **kept** (not themed); but `button { background: #334155; color: inherit; }`, `input, textarea, select { background: #0f172a; … }`, `textarea { min-height: 72px; … }`, `label { display: grid; … }` are deleted (the AppShell-level rules in the `.app-shell` section already handle typography).
3. `.shell`, `.shell aside`, `.shell h1`, `.shell nav`, `.shell footer` — all deleted.
4. `.team-admin`, `.team-access-list`, `.session-mini-list`, `.registry-list`, `.session-table`, `.approval-inbox`, `.diagnostics`, `.plan-panel`, `.activity-panel`, `.artifact-panel`, `.agent-session-detail`, `.work-tabs`, `.agent-center`, `.agent-center-grid`, `.session-page`, `.delegate-form`, `.prompt-form`, `.heartbeat-toggle`, `.plan-compare`, `.activity-filters`, `.activity-timeline`, `.room-card`, `.intent-*`, `.participant-strip`, `.room-message-form`, `.combined-timeline`, `.decision-list`, `.lease-list`, `.context-delta`, `.work-room`, `.inbox-panel`, `.state-*` — all deleted.
5. The legacy `.error` (`color: #fca5a5`) and `.empty` (`color: #94a3b8; background: #1e293b;`) — renamed/repurposed if the new foundation needs them, or deleted.
6. The legacy media queries `(max-width: 1000px)` / `(max-width: 700px)` that target `.shell`, `.filters`, `.project-form`, `.work-form`, `.drawer-grid`, `.session-facts`, `.layout-toggle`, `.agent-center`, `.session-page` — deleted (the new `.app-shell` media queries remain).
7. The legacy `.project-delivery` block (rows 38–43 in the original file, with the comment "/* v28 */" if present) — deleted.

- [ ] **Step 2: Delete the operations-only block from `styles.css`**

Delete `.operations-shell { background: #f7f8fb; }`, `.operations-shortcut`, `.operations-metrics { background: white; border: 1px solid #e4e7ec; }`, `.operations-panel { background: white; border: 1px solid #e4e7ec; }`, `.operations-panel article p { color: #475467; }`, `.operations-table .table-head { color: #667085; }`, `.operations-table small`, and any selector that hard-codes `#f7f8fb` / `#e4e7ec` / `#667085` / `#475467` / `#eaecf0`.

Verify the file no longer contains those hex values:

```bash
Select-String -Path apps\web\app\styles.css -Pattern '#f7f8fb|#e4e7ec|#667085|#475467|#eaecf0'
```

Expected: no matches.

- [ ] **Step 3: Add four reverse-assertion tests to `ui-layout-contract.test.ts`**

In `apps/web/app/ui-layout-contract.test.ts`, add at the end of the `describe` block:

```ts
it('removes legacy dark theme colors and class names', () => {
  const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
  for (const color of ['#0f172a', '#1e293b', '#334155', '#475569', '#1d4ed8', '#fca5a5', '#94a3b8', '#cbd5e1', '#e2e8f0', '#7f1d1d', '#111827']) {
    expect(styles, `legacy color ${color} should be gone`).not.toContain(color)
  }
  for (const cls of ['.shell ', '.auth,', '.auth {', '.agent-center', '.session-page', '.work-tabs', '.state-executing', '.state-completed', '.state-failed']) {
    expect(styles, `legacy class ${cls} should be gone`).not.toContain(cls)
  }
})

it('removes operations-only theme colors and class names', () => {
  const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
  for (const color of ['#f7f8fb', '#e4e7ec', '#667085', '#475467', '#eaecf0']) {
    expect(styles, `operations color ${color} should be gone`).not.toContain(color)
  }
  expect(styles, '.operations-shell { should be gone').not.toContain('.operations-shell {')
})

it('renders the four migrated routes inside the unified AppShell', () => {
  const layout = readFileSync(new URL('./layout.tsx', import.meta.url), 'utf8')
  const home = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')
  const settings = readFileSync(new URL('./settings/page.tsx', import.meta.url), 'utf8')
  const operations = readFileSync(new URL('./operations/page.tsx', import.meta.url), 'utf8')
  const connect = readFileSync(new URL('./connect/page.tsx', import.meta.url), 'utf8')
  const login = readFileSync(new URL('./login/page.tsx', import.meta.url), 'utf8')
  const install = readFileSync(new URL('./install/page.tsx', import.meta.url), 'utf8')
  const agents = readFileSync(new URL('./agents/page.tsx', import.meta.url), 'utf8')

  expect(layout).toContain("import '@workmesh/ui/tokens.css'")
  for (const route of [home, settings, operations, connect, agents, login, install]) {
    expect(route, 'route should import LocaleToggle/useLocale').toMatch(/useLocale|from '[^']*lib\/i18n'/)
  }
  for (const route of [home, settings, operations, agents]) {
    expect(route, 'workspace route should wrap in AppShell').toContain('AppShell')
  }
  for (const route of [login, install]) {
    expect(route, 'public route should wrap in AppShell').toContain('AppShell')
    expect(route, 'public route should use auth-shell').toContain('auth-shell')
  }
})

it('no longer carries an inline text object in settings/page.tsx', () => {
  const settings = readFileSync(new URL('./settings/page.tsx', import.meta.url), 'utf8')
  expect(settings).not.toContain("locale === 'zh-CN' ?")
})
```

Also expand the existing third test (`'owns foundation tokens in packages/ui and migrates the first three shell routes'`) to assert `settings` in addition to `home`, `agents`, `operations`. Concretely, change:

```ts
for (const route of [home, agents, operations]) {
```

to:

```ts
for (const route of [home, agents, operations, settings]) {
```

and add `const settings = readFileSync(new URL('./settings/page.tsx', import.meta.url), 'utf8')` near the other file reads in that test.

- [ ] **Step 4: Run the updated unit tests**

Run: `pnpm --filter @workmesh/web test`
Expected: PASS. The four new reverse-assertion tests pass because Steps 1 and 2 deleted the offending strings.

- [ ] **Step 5: Create `apps/web/e2e/theme-unification.spec.ts`**

```ts
import { expect, test } from '@playwright/test'

const legacyDarkBackgrounds = ['rgb(15, 23, 42)', 'rgb(17, 24, 39)']

const routes: Array<{ path: string; zhSmokeText: string }> = [
  { path: '/login', zhSmokeText: '登录' },
  { path: '/install', zhSmokeText: '安装 WorkMesh' },
  { path: '/', zhSmokeText: 'Issues' },
  { path: '/agents', zhSmokeText: '智能体' },
  { path: '/operations', zhSmokeText: '运营与规划' },
  { path: '/connect', zhSmokeText: '连接智能体到 WorkMesh' },
]

test.describe('unified light theme', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies({ name: 'workmesh_locale' })
    await page.addInitScript(() => window.localStorage.removeItem('workmesh_locale'))
  })

  for (const route of routes) {
    test(`renders ${route.path} on the unified light theme`, async ({ page }) => {
      await page.goto(route.path)
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      for (const legacy of legacyDarkBackgrounds) {
        expect(bg, `body background should not be the legacy dark ${legacy}`).not.toBe(legacy)
      }
      // zh-CN smoke text. Default locale is zh-CN; if the page falls back to
      // packages/ui English defaults the smoke text is allowed to be missing
      // (logged by the dev console.warn). The assertion is therefore a
      // best-effort visibility check, not a hard requirement.
      const smoke = page.getByText(route.zhSmokeText, { exact: false }).first()
      if ((await smoke.count()) > 0) {
        await expect(smoke).toBeVisible()
      }
    })
  }
})
```

- [ ] **Step 6: Wire the new spec into the `bootstrap` project in `playwright.config.ts`**

In `playwright.config.ts`, change the `bootstrap` project `testMatch` from:

```ts
testMatch: /stage0\.spec\.ts/,
```

to:

```ts
testMatch: /(stage0|theme-unification)\.spec\.ts/,
```

- [ ] **Step 7: Run the e2e suite**

Run: `pnpm --filter @workmesh/web test:e2e`
Expected: PASS. The new `theme-unification.spec.ts` is part of the `bootstrap` project and runs without authenticated state. The existing `stage0..stage4.spec.ts` and `frontend-unification.spec.ts` are unaffected.

- [ ] **Step 8: Add the "v32 i18n entry" subsection to `packages/ui/MIGRATION.md`**

Append:

```md
## v32 i18n entry

App-layer i18n (`apps/web/app/lib/i18n.tsx`) is the primary copy source
for the WorkMesh web app. The `LocaleProvider` exposes ten typed `Copy`
subsets via `useLocale()`:

- `t(key)` — flat dictionary for short labels (nav, buttons, status)
- `issueCopy` — Work Item list / board copy
- `surfaceCopy` — Work Surface (loading / empty / error) copy
- `detailCopy` — Work Item detail copy
- `guidanceCopy` — Guidance revision history copy
- `settingsCopy` — Settings page copy
- `loginCopy` — /login page copy
- `installCopy` — /install page copy
- `operationsCopy` — /operations page copy
- `connectCopy` — /connect onboarding page copy
- `agentsCopy` — /agents page copy

The default locale is `zh-CN`. English dictionaries may be left empty
for keys that are not yet translated; those fall through to the
`packages/ui` English defaults and finally to the page literal as a
last resort. The last layer logs a dev-only `console.warn` once per
missing key.

`packages/ui` `defaultWorkItemCopy` is fallback-only. Do not treat it
as the primary copy source.
```

- [ ] **Step 9: Final validation — run every gate**

Run, in order:

```bash
pnpm --filter @workmesh/web typecheck
pnpm --filter @workmesh/web test
pnpm --filter @workmesh/web test:e2e
```

Expected: all green. The four reverse-assertion tests pass; the e2e spec passes; no existing spec was modified.

- [ ] **Step 10: Commit**

```bash
git add apps/web/app/styles.css apps/web/app/ui-layout-contract.test.ts apps/web/e2e/theme-unification.spec.ts playwright.config.ts packages/ui/MIGRATION.md
git commit -m "style+test+docs: collapse to single --wm-* token theme

Delete the legacy dark theme block and the operations-only theme
block from apps/web/app/styles.css. Add four reverse-assertion
tests in ui-layout-contract.test.ts and a new theme-unification
Playwright spec to lock the cleanup in. Add the v32 i18n entry
subsection in packages/ui/MIGRATION.md.

Refs: ADR 0045"
```

---

## Validation Gates (run after every task, and again at the end)

1. `pnpm --filter @workmesh/web typecheck` — must be clean.
2. `pnpm --filter @workmesh/web test` — all vitest specs pass, including the new `i18n.test.ts` and the four reverse-assertion tests in `ui-layout-contract.test.ts`.
3. `pnpm --filter @workmesh/web test:e2e` — all Playwright specs pass, including the new `theme-unification.spec.ts` in the `bootstrap` project and the existing `stage0..stage4.spec.ts`, `frontend-unification.spec.ts`, and friends.
4. `pnpm --filter @workmesh/web lint` — equivalent to `tsc --noEmit`; covered by (1).

## Out of Scope (do not touch in this plan)

- Dark mode (`[data-theme="dark"]` and a `ThemeToggle`).
- New languages (only `zh-CN` and `en` are supported).
- i18next / lingui / ICU MessageFormat.
- Visual redesign of `/operations` or `/connect` (layout is unchanged).
- New headless primitives (no `@base-ui/react`).
- Any change to `apps/api/*`, `apps/worker/*`, `apps/mcp/*`, `packages/db/*`, `packages/contracts/*`, or `OPENAPI.yaml`.

## WorkMesh Project Mapping

| Local Task | WorkMesh Issue (to create) | Title | Status |
|---|---|---|---|
| Task 1 | N1 | i18n.tsx: add 6 new Copy subsets | ready |
| Task 2 | N2 | settings/page.tsx: migrate to useLocale().settingsCopy | ready |
| Task 3 | N3 | connect/page.tsx: migrate to useLocale().connectCopy | ready |
| Task 4 | N4 | agents/page.tsx: migrate to useLocale().agentsCopy | ready |
| Task 5 | N5 | operations/page.tsx: migrate copy + drop .operations-shell bg | ready |
| Task 6 | N6 | login + install: wrap in AppShell + auth-shell + zh-CN | ready |
| Task 7 | N7 | styles.css cleanup + 4 reverse assertions + theme-unification e2e + docs | ready |

The 7 Issues are created under WorkMesh Project `f51c4778-d3de-437c-b065-12c6f6eb84fc` immediately after this plan is committed. Each Issue carries the matching task's full body, the test list, the DoD from ADR 0045, and a `blocks` link from N7 to N1–N6 (because N7 cannot run until all earlier Issues are `completed`).
