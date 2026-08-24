# WorkMesh Web UI UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing WorkMesh Web UI into a reliable, keyboard-efficient collaboration surface: preserve the completed Foundation/Home/Detail work, recover the current build/test baseline, then finish Agents, Operations, Settings, Connect, responsive behavior, accessibility, and end-to-end verification with Linear-style interaction semantics rather than a visual imitation.

**Architecture:**
- **Foundation first.** Add `useAuthenticatedActor()`, `useCurrentTeam()`, `useToast()`, `<PageHeader>`, `<ErrorBoundary>`, `<SkeletonList>` to `apps/web/app/lib/` and the shared `packages/ui`. Migrate the 11 existing pages onto these primitives before changing per-page UX, so every later task can rely on consistent state plumbing.
- **Top-down page rework.** After Foundation is in, tackle the pages in order of impact: Home/Issues → WorkItem Detail → Agents → Operations → Settings/Connect. Each page change lands as a self-contained set of tasks with its own test cycle.
- **Cross-cutting polish last.** Global keyboard shortcuts, responsive breakpoints, shared-overlay focus behavior, i18n completeness, and e2e coverage are gated on per-page cleanup so they have a stable surface to operate on.
- **Continuation v2 state model.** A list keeps `focusedId`, `selectedIds`, and `openedId` separate. `J`/`K` and arrow keys move focus, `X` toggles selection only where selection exists, `Space` opens Peek, `Enter` follows a stable resource link, and `Escape` closes the top layer before clearing selection. Tabs and filters that define the current view are URL-shareable.

**Tech Stack:**
- Next.js 15 App Router, React 19, TypeScript strict mode (existing)
- `@workmesh/ui` for shared primitives (Button, Sheet, AsyncStateSurface, etc.)
- `@workmesh/contracts` for typed copy and zod schemas
- vitest + @testing-library/react for unit/component tests
- Playwright for e2e
- Phosphor Icons (existing dependency)
- `localStorage` for user preferences (no server round-trip)
- `IntersectionObserver` (already used in `work-surfaces.tsx`) for auto-load

## Global Constraints

- TypeScript strict mode; no `any`; use `unknown` + zod at boundaries.
- All new shared hooks/components must have tests in the same file or co-located `.test.ts` (mirror the `app/lib/*.test.ts` pattern).
- All new shared copy goes into `apps/web/app/lib/i18n.tsx` with both `zh-CN` and `en` values; no hard-coded strings in components.
- Do NOT modify `apps/api`, `packages/db`, `packages/contracts`, `OPENAPI.yaml`, or `SCHEMA.sql` in this plan. History/detail views must consume only fields already available to the Web client.
- Do NOT touch the `preview-*` pages (`preview-issues`, `preview-round2`); they are internal design sandboxes.
- The completed Phase 0-2 and Task 3.1-3.4 sections below are historical records. Their old per-task commit steps are not instructions for the continuation. On 2026-08-23 the user authorized local commits at coherent, accepted phase/module checkpoints. Never commit while parallel owners are still writing; stage only explicit reviewed file lists. Stash/pop, merge, rebase, and push remain out of scope.
- No dep upgrades without an explicit ADR.
- Reuse `AppShell`, `Tabs`, `Dialog`, `Sheet`, `AsyncStateSurface`, and the existing command center. Do not add page-local substitutes for shared navigation, tabs, or overlays.
- Do not add a time-series chart: `/api/v1/usage-summary` exposes aggregates, not a time series. Improve aggregate metric legibility without inventing temporal data.
- Do not implement a generic Settings export/import surface. No trustworthy portable settings contract exists in the current Web/API boundary.
- `/` and `Cmd/Ctrl+K` remain owned by the global command center. New page hotkeys must not intercept them and must ignore editable targets.
- Approval decisions are durable actions. Do not offer an undo affordance unless the backend exposes a real inverse operation; this plan adds none.

## File Structure

### Historical new files (Phase 0)
- `apps/web/app/lib/use-authenticated-actor.ts` — auth/me loader hook
- `apps/web/app/lib/use-authenticated-actor.test.ts`
- `apps/web/app/lib/use-current-team.ts` — team selector hook
- `apps/web/app/lib/use-current-team.test.ts`
- `apps/web/app/lib/use-toast.ts` — toast dispatcher
- `apps/web/app/lib/use-toast.test.ts`
- `apps/web/app/lib/page-header.tsx` — `<PageHeader>` shared component
- `apps/web/app/lib/page-header.test.tsx`
- `apps/web/app/lib/skeleton-list.tsx` — `<SkeletonList>` shared component
- `apps/web/app/lib/skeleton-list.test.tsx`
- `apps/web/app/error.tsx` — global error boundary
- `apps/web/app/not-found.tsx` — 404 page
- `apps/web/app/loading.tsx` — root loading

### Modified files
- All 11 page files in `apps/web/app/*/page.tsx` (Foundation migration)
- `apps/web/app/styles.css` (Phase 1 polish + responsive breakpoints)
- `packages/ui/src/index.tsx` (export new primitives if needed)
- `apps/web/app/lib/i18n.tsx` (new copy entries)
- `apps/web/app/layout.tsx` (mount command center, error boundary, toast portal)
- `apps/web/e2e/*.spec.ts` (new specs in Phase 7)

### Continuation v2 file map

- `packages/ui/src/index.tsx` — shared Client Component boundary and existing Tabs/Dialog/Sheet behavior; it remains presentation-only and does not own pagination.
- `vitest.config.ts` — repository-root setup path that resolves from every package cwd.
- `apps/web/app/agents/approval-route-state.ts` — URL parser/serializer for Agents tab and approval sub-view.
- `apps/web/app/agents/approval-history-table.tsx` — immutable, read-only history projection using the existing `Approval` fields only.
- `apps/web/app/agents/agent-detail-panel.tsx` — one read-only Agent facts surface shared by Peek and the deep-link page.
- `apps/web/app/agents/agent-peek.tsx` — shared `Sheet` used for quick inspection; never used for team-access editing.
- `apps/web/app/agents/[id]/page.tsx` — stable Agent detail route.
- `apps/web/app/operations/sections.ts` — feature-aware Operations section registry and anchor IDs.
- `apps/web/app/operations/filter.ts` — pure filter over the currently loaded Operations rows.
- `apps/web/app/operations/usage-metrics.tsx` — aggregate usage metric presentation; no line chart.
- `apps/web/app/settings/route-state.ts` — URL/popstate state for Settings tab and selected team.
- `apps/web/app/settings/workflow-color-presets.ts` — fixed accessible workflow color choices.
- `apps/web/app/lib/use-hotkeys.ts` and `.test.ts` — non-editable-target navigation chords that preserve command-center ownership.
- `apps/web/app/lib/list-interactions.ts` and `.test.ts` — pure keyboard intent/state helpers shared by dense lists.
- `apps/web/scripts/check-i18n.mjs` — local parity check for literal translation keys and both locales.
- `apps/web/e2e/*.spec.ts` — mocked navigation, keyboard, responsive, accessibility, and large-list gates.

---

# Phase 0 — Foundation (Days 1-2)

The 11 existing pages all reinvent the same wiring (auth/me, team selection, error state, page header). Phase 0 extracts that wiring into tested primitives so every later page change is small.

### Task 0.1: `useAuthenticatedActor()` hook

**Files:**
- Create: `apps/web/app/lib/use-authenticated-actor.ts`
- Create: `apps/web/app/lib/use-authenticated-actor.test.ts`

**Interfaces:**
- Consumes: `apiRequest` from `apps/web/app/lib/api.ts`, `saveCsrfToken`/`clearCsrfToken` from same.
- Produces: `{ actor: AuthenticatedActor | null, loading: boolean, error: string }` plus a `refresh()` method. The hook redirects to `/login` on 401.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/lib/use-authenticated-actor.test.ts
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import { useAuthenticatedActor } from './use-authenticated-actor'

vi.mock('./api', () => ({
  ApiError: class ApiError extends Error { constructor(public status: number, m: string) { super(m) } },
  apiRequest: vi.fn(),
  saveCsrfToken: vi.fn(),
  clearCsrfToken: vi.fn(),
}))

import { apiRequest, clearCsrfToken } from './api'

const mockLocation = (): void => {
  ;(globalThis as { location: { assign: ReturnType<typeof vi.fn> } }).location = { assign: vi.fn() }
}

describe('useAuthenticatedActor', () => {
  it('returns actor on success', async () => {
    mockLocation()
    ;(apiRequest as ReturnType<typeof vi.fn>).mockResolvedValue({ actor: { id: 'a1', display_name: 'A', workspace_id: 'w1' }, csrfToken: 't1' })
    const { result } = renderHook(() => useAuthenticatedActor())
    await act(() => Promise.resolve())
    expect(result.current.actor?.id).toBe('a1')
    expect(result.current.loading).toBe(false)
  })
  it('redirects to /login on 401', async () => {
    mockLocation()
    ;(apiRequest as ReturnType<typeof vi.fn>).mockRejectedValue(new ApiError(401, 'unauth'))
    renderHook(() => useAuthenticatedActor())
    await act(() => Promise.resolve())
    expect(clearCsrfToken).toHaveBeenCalled()
    expect((globalThis as { location: { assign: ReturnType<typeof vi.fn> } }).location.assign).toHaveBeenCalledWith('/login')
  })
})
```

- [ ] **Step 2: Run the test, expect FAIL**

Run: `pnpm --filter @workmesh/web test -- use-authenticated-actor`
Expected: FAIL "Cannot find module './use-authenticated-actor'".

- [ ] **Step 3: Implement the hook**

```ts
// apps/web/app/lib/use-authenticated-actor.ts
'use client'
import { useCallback, useEffect, useState } from 'react'
import { ApiError, apiRequest, clearCsrfToken, saveCsrfToken, type AuthenticatedActor } from './api'

type AuthMe = { actor: AuthenticatedActor; csrfToken: string }

export function useAuthenticatedActor(): { actor: AuthenticatedActor | null; loading: boolean; error: string; refresh: () => Promise<void> } {
  const [actor, setActor] = useState<AuthenticatedActor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (): Promise<void> => {
    try {
      setLoading(true); setError('')
      const auth = await apiRequest<AuthMe>('/api/v1/auth/me')
      saveCsrfToken(auth.csrfToken)
      setActor(auth.actor)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        clearCsrfToken()
        window.location.assign('/login')
        return
      }
      setError(reason instanceof Error ? reason.message : 'Unable to load session.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  return { actor, loading, error, refresh: load }
}
```

- [ ] **Step 4: Run the test, expect PASS**

Run: `pnpm --filter @workmesh/web test -- use-authenticated-actor`
Expected: 2 tests pass.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @workmesh/web typecheck
git add apps/web/app/lib/use-authenticated-actor.ts apps/web/app/lib/use-authenticated-actor.test.ts
git commit -m "feat(web): add useAuthenticatedActor hook"
```

### Task 0.2: `useCurrentTeam()` hook

**Files:**
- Create: `apps/web/app/lib/use-current-team.ts`
- Create: `apps/web/app/lib/use-current-team.test.ts`

**Interfaces:**
- Consumes: `actor` from `useAuthenticatedActor`, `usePagedApiList<Team>` from `apps/web/app/lib/pagination.tsx`.
- Produces: `{ teamId: string | null, teams: Team[], setTeamId: (id: string) => void, loading: boolean }`. Auto-picks the first team if the current `teamId` is missing.

- [ ] **Step 1: Write the failing test**

```ts
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCurrentTeam } from './use-current-team'

vi.mock('./pagination', () => ({
  usePagedApiList: vi.fn(),
}))
vi.mock('./api', () => ({ apiRequest: vi.fn(), saveCsrfToken: vi.fn() }))

import { usePagedApiList } from './pagination'

const makeActor = (id = 'a1') => ({ id, display_name: 'A', workspace_id: 'w1' } as never)
const makeTeam = (id: string) => ({ id, name: `Team ${id}`, key: id.toUpperCase() })

describe('useCurrentTeam', () => {
  it('picks first team when actor present and teamId is unset', async () => {
    ;(usePagedApiList as ReturnType<typeof vi.fn>).mockReturnValue({ items: [makeTeam('t1'), makeTeam('t2')], loading: false, error: null, refresh: vi.fn(), loadMore: vi.fn(), nextCursor: null, loadingMore: false })
    const { result } = renderHook(() => useCurrentTeam(makeActor()))
    await act(() => Promise.resolve())
    expect(result.current.teamId).toBe('t1')
    expect(result.current.teams).toHaveLength(2)
  })
  it('returns null when actor is null', () => {
    ;(usePagedApiList as ReturnType<typeof vi.fn>).mockReturnValue({ items: [], loading: false, error: null, refresh: vi.fn(), loadMore: vi.fn(), nextCursor: null, loadingMore: false })
    const { result } = renderHook(() => useCurrentTeam(null))
    expect(result.current.teamId).toBeNull()
  })
})
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @workmesh/web test -- use-current-team`
Expected: FAIL "Cannot find module './use-current-team'".

- [ ] **Step 3: Implement**

```ts
// apps/web/app/lib/use-current-team.ts
'use client'
import { useEffect, useState } from 'react'
import { usePagedApiList } from './pagination'
import type { AuthenticatedActor } from './api'

export type Team = { id: string; name: string; key: string }

export function useCurrentTeam(actor: AuthenticatedActor | null): { teamId: string | null; teams: Team[]; setTeamId: (id: string) => void; loading: boolean } {
  const teamsPage = usePagedApiList<Team>(actor ? '/api/v1/teams' : null)
  const teams = teamsPage.items
  const [teamId, setTeamId] = useState<string | null>(null)
  useEffect(() => {
    if (teamsPage.loading) return
    setTeamId(current => teams.some(team => team.id === current) ? current : teams[0]?.id ?? null)
  }, [teams, teamsPage.loading])
  return { teamId, setTeamId, teams, loading: teamsPage.loading }
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm --filter @workmesh/web test -- use-current-team`
Expected: 2 tests pass.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @workmesh/web typecheck
git add apps/web/app/lib/use-current-team.ts apps/web/app/lib/use-current-team.test.ts
git commit -m "feat(web): add useCurrentTeam hook"
```

### Task 0.3: `useToast()` dispatcher

**Files:**
- Create: `apps/web/app/lib/use-toast.ts`
- Create: `apps/web/app/lib/use-toast.test.ts`
- Modify: `apps/web/app/layout.tsx` — mount `<ToastViewport>` so dispatched toasts render.

**Interfaces:**
- Produces: `{ toasts: Toast[], push: (t: { title: string; tone?: 'info' | 'success' | 'error'; description?: string }) => void, dismiss: (id: string) => void }`. The hook is a global pub/sub backed by a module-level emitter so any component (including the future `usePagedApiList` errors) can call `push()` from outside React.

- [ ] **Step 1: Write the failing test**

```ts
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useToast } from './use-toast'

describe('useToast', () => {
  it('adds and dismisses a toast', () => {
    const { result } = renderHook(() => useToast())
    act(() => result.current.push({ title: 'Saved', tone: 'success' }))
    expect(result.current.toasts).toHaveLength(1)
    const id = result.current.toasts[0]!.id
    act(() => result.current.dismiss(id))
    expect(result.current.toasts).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @workmesh/web test -- use-toast`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/web/app/lib/use-toast.ts
'use client'
import { useEffect, useState } from 'react'

export type ToastTone = 'info' | 'success' | 'error'
export type Toast = { id: string; title: string; description?: string; tone: ToastTone }

type Listener = (toasts: Toast[]) => void
let toasts: Toast[] = []
const listeners = new Set<Listener>()
const emit = (): void => { for (const l of listeners) l(toasts) }

export function useToast(): { toasts: Toast[]; push: (t: Omit<Toast, 'id'>) => void; dismiss: (id: string) => void } {
  const [state, setState] = useState<Toast[]>(toasts)
  useEffect(() => { const l: Listener = (next) => setState(next); listeners.add(l); return () => { listeners.delete(l) } }, [])
  return {
    toasts: state,
    push: (t) => { const id = crypto.randomUUID(); toasts = [...toasts, { id, ...t }]; emit() },
    dismiss: (id) => { toasts = toasts.filter(t => t.id !== id); emit() },
  }
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm --filter @workmesh/web test -- use-toast`
Expected: 1 test passes.

- [ ] **Step 5: Mount `<ToastViewport>` in layout**

Edit `apps/web/app/layout.tsx`: render `<ToastViewport toasts={toasts} onDismiss={dismiss} />` inside the `<LocaleProvider>`. Reuse the existing `Toast` component from `@workmesh/ui` (`packages/ui/src/index.tsx` already exports `Toast`).

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm --filter @workmesh/web typecheck
git add apps/web/app/lib/use-toast.ts apps/web/app/lib/use-toast.test.ts apps/web/app/layout.tsx
git commit -m "feat(web): add useToast hook and ToastViewport in root layout"
```

### Task 0.4: `<PageHeader>` shared component

**Files:**
- Create: `apps/web/app/lib/page-header.tsx`
- Create: `apps/web/app/lib/page-header.test.tsx`

**Interfaces:**
- Props: `{ title: string; description?: string; actions?: ReactNode; backHref?: string }`. Renders a sticky header with optional back button, title, description, and a right-aligned actions slot. Use existing classes from `.content > header` so we don't introduce new visual styles in this task.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageHeader } from './page-header'

describe('PageHeader', () => {
  it('renders title, description, and actions', () => {
    render(<PageHeader title="Issues" description="All work" actions={<button>New</button>} />)
    expect(screen.getByRole('heading', { name: 'Issues' })).toBeInTheDocument()
    expect(screen.getByText('All work')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument()
  })
  it('renders a back link when backHref is provided', () => {
    render(<PageHeader title="Agent" backHref="/agents" />)
    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '/agents')
  })
})
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @workmesh/web test -- page-header`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// apps/web/app/lib/page-header.tsx
import type { ReactNode } from 'react'
import { ArrowLeft } from '@phosphor-icons/react/dist/csr/ArrowLeft'

export function PageHeader({ title, description, actions, backHref }: { title: string; description?: string; actions?: ReactNode; backHref?: string }) {
  return <header className="page-header">
    <div className="page-header-text">
      {backHref && <a aria-label="Back" className="page-header-back" href={backHref}><ArrowLeft size={18} weight="bold" /></a>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="page-header-actions">{actions}</div>}
  </header>
}
```

- [ ] **Step 4: Add CSS**

Append to `apps/web/app/styles.css` (find the `.content > header` block at ~line 88 and replace with):

```css
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding-bottom: 1.25rem; border-bottom: 1px solid var(--wm-border); }
.page-header-text { display: grid; gap: .25rem; min-width: 0; }
.page-header-back { color: var(--wm-muted); }
.page-header-text h1 { margin: 0; font-size: 1.45rem; letter-spacing: -.025em; }
.page-header-text p { margin: 0; color: var(--wm-muted); }
.page-header-actions { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
```

Keep `.content > header` rules but make them no-op (left for legacy page headers) — or migrate pages in Task 0.6.

- [ ] **Step 5: Run, expect PASS**

Run: `pnpm --filter @workmesh/web test -- page-header`
Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
pnpm --filter @workmesh/web typecheck
git add apps/web/app/lib/page-header.tsx apps/web/app/lib/page-header.test.tsx apps/web/app/styles.css
git commit -m "feat(web): add shared PageHeader component"
```

### Task 0.5: `<SkeletonList>` shared component

**Files:**
- Create: `apps/web/app/lib/skeleton-list.tsx`
- Create: `apps/web/app/lib/skeleton-list.test.tsx`

**Interfaces:**
- Props: `{ rows?: number; columns?: number }` (default 6 rows × 1 column). Renders a column of N skeleton bars with the existing `Skeleton` component from `@workmesh/ui`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SkeletonList } from './skeleton-list'

describe('SkeletonList', () => {
  it('renders the default 6 rows', () => {
    const { container } = render(<SkeletonList />)
    expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(6)
  })
  it('respects row and column counts', () => {
    const { container } = render(<SkeletonList rows={3} columns={2} />)
    expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(6)
  })
})
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @workmesh/web test -- skeleton-list`

- [ ] **Step 3: Implement**

```tsx
// apps/web/app/lib/skeleton-list.tsx
import { Skeleton } from '@workmesh/ui'

export function SkeletonList({ rows = 6, columns = 1 }: { rows?: number; columns?: number }) {
  return <div aria-busy="true" className="skeleton-list" role="status" aria-label="Loading">
    {Array.from({ length: rows }, (_, row) => (
      <div key={row} className="skeleton-list-row" style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '.5rem' }}>
        {Array.from({ length: columns }, (_, col) => <Skeleton key={col} className="skeleton-list-cell" />)}
      </div>
    ))}
  </div>
}
```

- [ ] **Step 4: CSS**

Append to `apps/web/app/styles.css`:

```css
.skeleton-list { display: grid; gap: .55rem; padding: 1rem 0; }
.skeleton-list-cell { height: 1.6rem; }
```

- [ ] **Step 5: Run, expect PASS**

Run: `pnpm --filter @workmesh/web test -- skeleton-list`
Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/lib/skeleton-list.tsx apps/web/app/lib/skeleton-list.test.tsx apps/web/app/styles.css
git commit -m "feat(web): add shared SkeletonList component"
```

### Task 0.6: Migrate Home page to Foundation hooks

**Files:**
- Modify: `apps/web/app/page.tsx:40-110` — replace the inline `load()` + `actor` + `teamsPage` plumbing with the new hooks.

- [ ] **Step 1: Read existing code**

Re-read `apps/web/app/page.tsx` lines 40-110 to confirm the exact selectors to swap. The existing pattern is:
- `const [actor, setActor] = useState<Actor | null>(null)`
- `const load = useCallback(async () => { ... apiRequest<AuthMe>('/api/v1/auth/me') ... }, [])`
- `useEffect(() => { void load() }, [load])`
- `const teamsPage = usePagedApiList<Team>(actor ? '/api/v1/teams' : null)`
- `useEffect(() => { if (teamsPage.loading) return; setTeamId(...) }, [teams, teamsPage.loading])`

- [ ] **Step 2: Replace with hooks**

```tsx
// inside HomePage
import { useAuthenticatedActor } from './lib/use-authenticated-actor'
import { useCurrentTeam } from './lib/use-current-team'

// ... inside the component, remove the local actor state, load(), and teamId/teamsPage plumbing
const { actor, loading: actorLoading, error: actorError } = useAuthenticatedActor()
const { teamId, teams, loading: teamsLoading } = useCurrentTeam(actor)
const loading = actorLoading || teamsLoading
const error = actorError
// Remove the `useEffect(() => { if (teamsPage.loading) return; setTeamId(...) }, [...])` block.
```

- [ ] **Step 3: Adjust downstream consumers**

Search the rest of `page.tsx` for usages of the deleted locals (`teamsPage.error`, `teamsPage.refresh`, etc.). Replace with the corresponding values from `useCurrentTeam()` and `usePagedApiList('/api/v1/teams')` if still needed for refresh — keep a local `usePagedApiList<Team>` only if you still need to call `.refresh()` from realtime subscriptions.

- [ ] **Step 4: Run typecheck + e2e contract test**

```bash
pnpm --filter @workmesh/web typecheck
pnpm --filter @workmesh/web test
```
Expected: all 130 existing tests still pass; no new failures.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/page.tsx
git commit -m "refactor(web): migrate home page to useAuthenticatedActor + useCurrentTeam"
```

### Task 0.7: Migrate Agents / Settings / Operations / Project pages to Foundation hooks

**Files:**
- Modify: `apps/web/app/agents/page.tsx:35-60`
- Modify: `apps/web/app/settings/page.tsx:30-60`
- Modify: `apps/web/app/operations/page.tsx` (only needs `useAuthenticatedActor` if the existing wrapper is refactored; otherwise skip)
- Modify: `apps/web/app/connect/page.tsx` (uses `publicRequest`, not `useAuthenticatedActor` — confirm and skip if so)
- Modify: `apps/web/app/agent-sessions/[id]/page.tsx` — add `useAuthenticatedActor` if it currently calls `apiRequest('/api/v1/auth/me')`

- [ ] **Step 1: For each page, search for the auth/me load pattern**

Run: `pnpm exec rg "apiRequest<AuthMe>\('/api/v1/auth/me'\)" apps/web/app`
Expected hits: 4 (page.tsx, agents/page.tsx, settings/page.tsx, agent-sessions/[id]/page.tsx).

- [ ] **Step 2: Replace each occurrence with `useAuthenticatedActor`**

Follow the same replacement pattern as Task 0.6. For each page, also remove the now-unused imports (`apiRequest`, `saveCsrfToken`, `clearCsrfToken` from `../lib/api`).

- [ ] **Step 3: Typecheck + run all web tests**

```bash
pnpm --filter @workmesh/web typecheck
pnpm --filter @workmesh/web test
```
Expected: all 130+ tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/agents/page.tsx apps/web/app/settings/page.tsx apps/web/app/agent-sessions/\[id\]/page.tsx
git commit -m "refactor(web): migrate agents/settings/agent-sessions to Foundation hooks"
```

### Task 0.8: Global error boundary + 404 + loading page

**Files:**
- Create: `apps/web/app/error.tsx`
- Create: `apps/web/app/not-found.tsx`
- Create: `apps/web/app/loading.tsx`

**Interfaces:**
- `error.tsx`: standard Next.js error boundary. Shows the error message and a "Retry" button.
- `not-found.tsx`: 404 page with link to home.
- `loading.tsx`: a centered `<SkeletonList rows={4} />`.

- [ ] **Step 1: Create `app/error.tsx`**

```tsx
'use client'
import { useEffect } from 'react'
import { useLocale } from './lib/i18n'
import { AsyncStateSurface } from '@workmesh/ui'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLocale()
  useEffect(() => { console.error('WorkMesh page error', error) }, [error])
  return <main className="center">
    <AsyncStateSurface
      actionLabel={t('retry')}
      description={error.message || 'Something went wrong.'}
      onAction={reset}
      state="error"
      title={t('pageLoadError')}
    />
  </main>
}
```

- [ ] **Step 2: Create `app/not-found.tsx`**

```tsx
import Link from 'next/link'
import { useLocale } from './lib/i18n'

export default function NotFound() {
  const { t } = useLocale()
  return <main className="center">
    <div>
      <h1>{t('notFoundTitle')}</h1>
      <p>{t('notFoundDescription')}</p>
      <Link href="/">{t('backToHome')}</Link>
    </div>
  </main>
}
```

- [ ] **Step 3: Create `app/loading.tsx`**

```tsx
import { SkeletonList } from './lib/skeleton-list'
export default function Loading() {
  return <main className="center"><SkeletonList rows={4} /></main>
}
```

- [ ] **Step 4: Add i18n entries**

Edit `apps/web/app/lib/i18n.tsx`:
- `pageLoadError`, `retry`, `notFoundTitle`, `notFoundDescription`, `backToHome` in both `zh-CN` and `en`.

- [ ] **Step 5: Manual smoke test**

```bash
pnpm --filter @workmesh/web dev
```
Navigate to `/this-does-not-exist` — should show the 404 page. Throw an error in a test page to see the error boundary.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/error.tsx apps/web/app/not-found.tsx apps/web/app/loading.tsx apps/web/app/lib/i18n.tsx
git commit -m "feat(web): add error boundary, 404 page, and root loading"
```

### Task 0.9: Mount global command center in root layout

**Files:**
- Modify: `apps/web/app/layout.tsx` — ensure `GlobalCommandCenter` is rendered at the root and that pressing `Cmd/Ctrl+K` opens it. Currently the component is mounted per-page (home, agents, settings) — centralize it.

- [ ] **Step 1: Read current layout**

Re-read `apps/web/app/layout.tsx` to confirm where `LocaleProvider`, `RealtimeProvider` live.

- [ ] **Step 2: Mount `GlobalCommandCenter` once**

Add a single `<GlobalCommandCenter locale={locale} triggerLabel={t('search')} />` near the top of the layout tree, after the providers. Remove the per-page `<GlobalCommandCenter>` instances in `page.tsx`, `agents/page.tsx`, `settings/page.tsx`, `operations/page.tsx` (and any other pages that mount it).

- [ ] **Step 3: Wire keyboard shortcut**

Add a `useEffect` in the root layout that listens for `keydown` and opens the command center on `Cmd/Ctrl+K` and `/` (when not in an input/textarea). Use the existing `GlobalCommandCenter` API: it likely accepts an `open`/`onOpenChange` controlled prop — pass them through.

- [ ] **Step 4: Typecheck + tests**

```bash
pnpm --filter @workmesh/web typecheck
pnpm --filter @workmesh/web test
```

- [ ] **Step 5: Manual smoke**

```bash
pnpm --filter @workmesh/web dev
```
Press `Cmd+K` (or `Ctrl+K`) on the home page — command center should open. `/` should also open it (when not in an input).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/layout.tsx apps/web/app/page.tsx apps/web/app/agents/page.tsx apps/web/app/settings/page.tsx apps/web/app/operations/page.tsx
git commit -m "feat(web): mount global command center once with Cmd+K shortcut"
```

### Task 0.10: Foundation done — full test sweep

- [ ] **Step 1: Run all web checks**

```bash
pnpm --filter @workmesh/web typecheck
pnpm --filter @workmesh/web test
pnpm --filter @workmesh/web lint
```
Expected: 130+ tests pass, no lint errors.

- [ ] **Step 2: Manual review of Foundation**

Skim every page to confirm:
- Auth flow still works
- Team selector still works
- Toast appears on a forced error
- Error boundary catches a thrown error
- Cmd+K opens command center
- 404 page renders

- [ ] **Step 3: Commit any straggling fixes**

```bash
git commit -m "chore(web): Foundation phase cleanup"
```

---

# Phase 1 — Home / Issues (Days 3-5)

The home page (`apps/web/app/page.tsx`) is the busiest surface. After Foundation, tighten its filter row, add board column width persistence, and a density toggle.

### Task 1.1: Filter row collapse (collapse-by-default for advanced fields)

**Files:**
- Modify: `apps/web/features/work-items/work-surfaces.tsx:64` — the `WorkItemFilters` component. Add a `compact` mode where Milestone/Label/Priority are hidden behind a "More filters" toggle.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/features/work-items/work-items.test.ts (extend)
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WorkItemFilters } from './work-surfaces'
import { defaultWorkSurfaceCopy } from './contracts' // adjust import to actual export

describe('WorkItemFilters compact mode', () => {
  it('hides Milestone and Label when compact is true', () => {
    render(<WorkItemFilters compact value={{}} onChange={() => {}} />)
    expect(screen.queryByLabelText(/milestone/i)).toBeNull()
    expect(screen.queryByLabelText(/label/i)).toBeNull()
  })
})
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @workmesh/web test -- work-items`

- [ ] **Step 3: Add `compact` prop to `WorkItemFilters`**

In `packages/ui/src/index.tsx`, extend `WorkItemFiltersProps`:

```ts
export type WorkItemFiltersProps = {
  ...
  compact?: boolean
}
```

In the `WorkItemFilters` component, wrap the Milestone and Label labels in `{!compact && (...)}`. Add a "More filters" `<Button variant="ghost">` that toggles a local `expanded` state, defaulting to `!compact`. When `compact` is true, only Search/Status/Responsible/Project are shown by default.

- [ ] **Step 4: Add i18n strings**

`filterMore`, `filterLess` in `apps/web/app/lib/i18n.tsx`.

- [ ] **Step 5: Run, expect PASS**

Run: `pnpm --filter @workmesh/web test -- work-items`
Expected: 14+ tests pass (was 13).

- [ ] **Step 6: Wire from `WorkSurfaces`**

In `apps/web/features/work-items/work-surfaces.tsx`, pass `compact` to `<WorkItemFilters>`. The compact state should be persisted to `localStorage` (key: `wm:filters:compact`) so it survives page reloads.

- [ ] **Step 7: Commit**

```bash
git add apps/web/features/work-items packages/ui/src/index.tsx apps/web/app/lib/i18n.tsx
git commit -m "feat(web): collapsible filter row on work surfaces"
```

### Task 1.2: Board column width persistence

**Files:**
- Modify: `apps/web/app/page.tsx` — add state for `boardColumnWidths` keyed by `teamId`.
- Modify: `apps/web/features/work-items/work-surfaces.tsx` — accept `columnWidths` and `onColumnWidthChange` props; pass them to `WorkItemBoard`.

- [ ] **Step 1: Test the localStorage round-trip**

In `apps/web/app/page.tsx` (or a new `useBoardColumnWidths` hook), write a helper:

```ts
const loadWidths = (teamId: string): Record<string, number> => {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(window.localStorage.getItem(`wm:board:widths:${teamId}`) ?? '{}') } catch { return {} }
}
const saveWidths = (teamId: string, widths: Record<string, number>): void => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(`wm:board:widths:${teamId}`, JSON.stringify(widths))
}
```

Add a unit test in a new `use-board-column-widths.test.ts` that exercises these helpers with a mocked `localStorage`.

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @workmesh/web test -- use-board-column-widths`

- [ ] **Step 3: Implement the hook**

```ts
// apps/web/app/lib/use-board-column-widths.ts
'use client'
import { useCallback, useEffect, useState } from 'react'

export function useBoardColumnWidths(teamId: string | null): { widths: Record<string, number>; setWidth: (columnId: string, width: number) => void } {
  const [widths, setWidths] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!teamId || typeof window === 'undefined') { setWidths({}); return }
    try { setWidths(JSON.parse(window.localStorage.getItem(`wm:board:widths:${teamId}`) ?? '{}')) } catch { setWidths({}) }
  }, [teamId])
  const setWidth = useCallback((columnId: string, width: number) => {
    setWidths(current => {
      const next = { ...current, [columnId]: width }
      if (teamId) window.localStorage.setItem(`wm:board:widths:${teamId}`, JSON.stringify(next))
      return next
    })
  }, [teamId])
  return { widths, setWidth }
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm --filter @workmesh/web test -- use-board-column-widths`

- [ ] **Step 5: Pass `columnWidths` and `onColumnWidthChange` to `WorkItemBoard` in `WorkSurfaces`**

- [ ] **Step 6: Manual smoke**

`pnpm dev` → board view → drag a column wider → reload page → width persists.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/lib/use-board-column-widths.ts apps/web/app/features/work-items/work-surfaces.tsx
git commit -m "feat(web): persist board column widths per team in localStorage"
```

### Task 1.3: Density toggle (compact/comfortable)

**Files:**
- Modify: `apps/web/features/work-items/contracts.ts` — add `density` to `WorkSurfaceLayout` adjacent type.
- Modify: `apps/web/features/work-items/work-surfaces.tsx` — pass `density` through.
- Modify: `apps/web/app/styles.css` — add `.wm-work-item-card--compact` modifier.
- Modify: `packages/ui/src/index.tsx` — `WorkItemCard` accepts `density?: 'compact' | 'comfortable'` (default `comfortable`).

- [ ] **Step 1: Test density CSS class**

In `apps/web/features/work-items/work-items.test.ts`, assert `<WorkItemCard item={...} layout="list" density="compact" />` renders an element with class `wm-work-item-card--compact`.

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Add `density` prop, CSS modifier**

```tsx
<article className={workItemClassNames('wm-work-item-card', `wm-work-item-card-${layout}`, `wm-work-item-card-${density}`, ...)} ...>
```

CSS:
```css
.wm-work-item-card--compact { padding: .5rem .65rem .5rem .85rem; gap: .35rem; }
.wm-work-item-card--compact .wm-work-item-card-heading { font-size: .82rem; }
```

- [ ] **Step 4: Add a density toggle button next to the list/board switcher in `WorkSurfaces`**

```tsx
<Button aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}>Compact</Button>
```

Persist `density` to `localStorage` (key: `wm:board:density`).

- [ ] **Step 5: Run tests, expect PASS**

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/work-items/contracts.ts apps/web/features/work-items/work-surfaces.tsx packages/ui/src/index.tsx apps/web/app/styles.css
git commit -m "feat(web): density toggle (compact/comfortable) for work surfaces"
```

### Task 1.4: Status badge on cards (in addition to the existing left stripe)

**Files:**
- Modify: `packages/ui/src/index.tsx` `WorkItemCard` (line ~714): add a small status pill that displays `item.statusName` next to the identifier. Reuse existing badge styles from `.wm-work-item-priority`.

- [ ] **Step 1: Test the badge renders**

In `packages/ui/src/index.test.ts`, assert the card renders the `statusName` text.

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Add the badge**

```tsx
<span className={workItemClassNames('wm-work-item-status-pill', `status-${statusCategory}`)}>{item.statusName}</span>
```

CSS (append to `apps/web/app/styles.css`):
```css
.wm-work-item-status-pill { padding: .15rem .45rem; border-radius: 999px; font-size: .7rem; font-weight: 650; background: var(--wm-surface-subtle); color: var(--wm-muted); border: 1px solid var(--wm-border); }
.wm-work-item-status-pill.status-started, .wm-work-item-status-pill.status-in_progress { background: #fef3c7; color: #92400e; border-color: #fde68a; }
.wm-work-item-status-pill.status-review, .wm-work-item-status-pill.status-in_review { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }
.wm-work-item-status-pill.status-done { background: #dcfce7; color: #14532d; border-color: #bbf7d0; }
```

- [ ] **Step 4: Run tests, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/index.tsx packages/ui/src/index.test.ts apps/web/app/styles.css
git commit -m "feat(ui): add status name pill to WorkItemCard"
```

### Task 1.5: Realtime pulse animation

**Files:**
- Modify: `apps/web/app/styles.css` — add a keyframe + apply to `.work-surface-stale` while invalidation is in-flight.

- [ ] **Step 1: Add CSS**

```css
@keyframes work-surface-pulse { 0% { opacity: .65; } 50% { opacity: 1; } 100% { opacity: .65; } }
.work-surface-stale { animation: work-surface-pulse 1.6s ease-in-out infinite; }
```

- [ ] **Step 2: Visual smoke**

`pnpm dev` → trigger a realtime invalidation (move an issue from another tab) → observe pulse.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/styles.css
git commit -m "feat(web): realtime refresh pulse animation"
```

### Task 1.6: Phase 1 verification

- [ ] **Step 1: Full test + typecheck + lint**

```bash
pnpm --filter @workmesh/web typecheck
pnpm --filter @workmesh/web test
pnpm --filter @workmesh/web lint
```

- [ ] **Step 2: Manual checklist**

- [ ] Filter row collapses Milestone/Label by default; toggle works
- [ ] Board column widths persist after reload
- [ ] Density toggle visible and working
- [ ] Status pill visible on cards
- [ ] Realtime invalidation triggers pulse

- [ ] **Step 3: Commit any straggling fixes**

```bash
git commit -m "chore(web): Phase 1 cleanup"
```

---

# Phase 2 — WorkItem Detail (Days 6-7)

### Task 2.1: Tab dropdown collapse

**Files:**
- Modify: `apps/web/features/work-items/detail/work-item-detail.tsx` (find the tabs renderer; it's likely a `<Tabs>` from `@workmesh/ui`).

- [ ] **Step 1: Test tab overflow**

In `work-item-detail.test.tsx`, assert that with viewport < 1180px the tab list is collapsed into a `<select>` (or similar) via the existing `Tabs` overflow behavior, OR add a new test that asserts a `compact` prop renders a `<select>`.

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Add `compact` prop to `Tabs`**

In `packages/ui/src/index.tsx`, extend `Tabs` to accept `compact?: boolean`. When true, render a `<select>` instead of a button row, with `onChange` calling `onValueChange`.

- [ ] **Step 4: Use it in WorkItemDetail**

In the detail component, compute `compact = useMediaQuery('(max-width: 1180px)')` (add `use-media-query.ts` if not present). Pass `compact` to `<Tabs>`.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/index.tsx apps/web/features/work-items/detail/work-item-detail.tsx
git commit -m "feat(ui): Tabs compact mode (select dropdown on narrow viewports)"
```

### Task 2.2: Comment mode visual distinction

**Files:**
- Modify: `apps/web/features/rich-content/editor.tsx` — accept a `mode?: 'comment' | 'reply' | 'description'` prop; render a colored border per mode.

- [ ] **Step 1: Test mode CSS class**

In `rich-content.test.ts`, assert that the editor's wrapper has class `rich-editor--comment` when `mode="comment"`.

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Add `mode` prop + CSS**

```css
.rich-editor--comment { border-left: 3px solid #2563eb; }
.rich-editor--reply { border-left: 3px solid #16a34a; }
.rich-editor--description { border-left: 3px solid #d97706; }
```

- [ ] **Step 4: Wire from `WorkRoom` and `WorkItemDetail`**

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/rich-content/editor.tsx apps/web/app/styles.css
git commit -m "feat(ui): distinguish comment/reply/description editor modes visually"
```

### Task 2.3: Markdown preview toggle

**Files:**
- Modify: `apps/web/features/rich-content/editor.tsx` — add a "Preview" button that toggles a rendered preview using the existing `Markdown` component.

- [ ] **Step 1: Test preview toggle**

```tsx
it('renders Markdown when preview is on', () => { ... })
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement toggle**

```tsx
const [preview, setPreview] = useState(false)
// toolbar: <Button onClick={() => setPreview(p => !p)}>{preview ? 'Edit' : 'Preview'}</Button>
// body: preview ? <Markdown source={value} /> : <textarea ... />
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/features/rich-content/editor.tsx
git commit -m "feat(ui): Markdown preview toggle in rich text editor"
```

### Task 2.4: Draft-saved indicator

**Files:**
- Modify: `apps/web/features/rich-content/editor.tsx` — accept `onSavedAt?: (date: Date) => void` and show "Saved 3s ago" text.

- [ ] **Step 1: Test indicator**

- [ ] **Step 2: Implement**

- [ ] **Step 3: Wire from `WorkItemDetail`**

The detail page already saves drafts to localStorage; pass the last-saved timestamp to the editor.

- [ ] **Step 4: Commit**

```bash
git add apps/web/features/rich-content/editor.tsx
git commit -m "feat(ui): draft-saved timestamp indicator in rich text editor"
```

### Task 2.5: Conflict focus management

**Files:**
- Modify: `apps/web/features/work-items/detail/work-item-detail.tsx` — on conflict, move focus to the "Save" button via a ref.

- [ ] **Step 1: Test focus jump**

Mock `useRef` (or just render the component with a conflict state) and assert `document.activeElement` is the Save button.

- [ ] **Step 2: Implement**

```tsx
const saveRef = useRef<HTMLButtonElement>(null)
useEffect(() => { if (hasConflict) saveRef.current?.focus() }, [hasConflict])
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/features/work-items/detail/work-item-detail.tsx
git commit -m "fix(ui): move focus to Save button on revision conflict"
```

### Task 2.6: Phase 2 verification

Historical result: the Phase 2 gate ran Web typecheck/tests and a manual Detail checklist, then landed `83c45fb`; see the SDD ledger for the actual result. Do not rerun this historical task as part of continuation v2.

---

# Phase 3 — Agents Page (Days 8-9)

### Task 3.1: Tab structure (Agents / Sessions / Approvals)

**Files:**
- Modify: `apps/web/app/agents/page.tsx` — add a `<Tabs>` switcher (default to "Agents"); render one section at a time.

- [ ] **Step 1: Test tab switching**

- [ ] **Step 2: Implement**

Reuse `<Tabs>` from `@workmesh/ui` (extended in Task 2.1). Three tabs: Agents, Sessions, Approvals. Each section wraps its current list in the existing section markup.

- [ ] **Step 3: Commit**

### Task 3.2: Add filters (team, capability, status)

**Files:**
- Modify: `apps/web/app/agents/page.tsx` — add filter `<select>`s above the agent list. Filter in-memory by `name`, `teamAccess`, `state`, `requestedCapabilities`.

- [ ] **Step 1: Test filtering**

```tsx
it('filters agents by team', () => { ... })
```

- [ ] **Step 2: Implement**

- [ ] **Step 3: Commit**

### Task 3.3: Team access drawer

**Files:**
- Create: `apps/web/app/agents/team-access-drawer.tsx` (Sheet containing the team access list for one agent).
- Modify: `apps/web/app/agents/page.tsx` — clicking an agent opens the drawer.

- [ ] **Step 1: Test drawer open/close**

- [ ] **Step 2: Implement**

- [ ] **Step 3: Commit**

### Task 3.4: Bulk approval

**Files:**
- Modify: `apps/web/app/agents/page.tsx` — add a checkbox column to the Approvals table; add a "Approve selected" / "Reject selected" action bar.

- [ ] **Step 1: Test bulk action**

- [ ] **Step 2: Implement**

- [ ] **Step 3: Commit**

## Continuation v2 preflight — mandatory before Task 3.5

The original 51-task plan has 26 landed tasks: Phase 0 (10), Phase 1 (6), Phase 2 (6), and Phase 3 Tasks 3.1-3.4 (4). Phase 3 therefore remains **4/7**. Task 3.4's feature commit is retained, but its acceptance is reopened by a CSS regression. Four recovery gates must pass before feature work resumes. The original feature backlog still has 25 tasks (3.5-7.3); including recovery, there are 29 executable gates remaining.

### Recovery 3.4-R: Restore the session-detail approval-card CSS contract

**Files:**
- Modify: `apps/web/app/styles.css`
- Create: `apps/web/app/agent-session-detail.test.tsx`

**Interfaces:**
- Consumes: the existing `.agent-session-detail > .approval-inbox > article` and `.approval-actions` markup in `apps/web/app/agent-session-detail.tsx`.
- Produces: selectors scoped through `.agent-session-detail`; no rule may style the Agents-page approval table.

- [ ] **Step 1: Preserve RED evidence without resetting the worktree**

Run:

```powershell
git show 868478f:apps/web/app/styles.css | Select-String -SimpleMatch '.agent-session-detail .approval-inbox article'
```

Expected: no match. The committed Task 3.4 stylesheet dropped the session-detail card selector.

- [ ] **Step 2: Keep the focused regression test**

The test must assert all three contracts:

```ts
expect(article).toHaveStyle({ display: 'grid', padding: '.8rem .9rem' })
expect(actions).toHaveStyle({ display: 'inline-flex', flexWrap: 'wrap' })
expect(screen.getByTestId('agents-approval-table')).not.toHaveStyle({ display: 'grid' })
```

- [ ] **Step 3: Apply only scoped CSS**

```css
.app-shell .agent-session-detail .approval-inbox article {
  display: grid;
  gap: .45rem;
  padding: .8rem .9rem;
}

.app-shell .agent-session-detail .approval-inbox .approval-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: .45rem;
  margin-top: .35rem;
}
```

Add the same scoped article selector to the shared surface/border rule. Do not restore an unscoped `.approval-inbox article` selector.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @workmesh/web exec vitest run app/agent-session-detail.test.tsx app/agents/approvals-table.test.tsx
```

Expected: both files pass; the session detail uses cards and the Agents approval table remains tabular.

**DoD:** The regression test passes, the CSS diff contains only scoped selectors, and no existing Agents-page rule changes.

### Baseline B.1: Reconcile load-more ownership and remove the invalid board prop

**Files:**
- Modify: `apps/web/features/work-items/work-surfaces.tsx`
- Create: `apps/web/features/work-items/work-surfaces-pagination.test.tsx`
- Modify: `apps/web/app/styles.css`
- Verify only: `packages/ui/src/index.tsx`

**Interfaces:**
- Consumes: `WorkSurfaces` already owns `collection.nextCursor`, `loading`, `loadingMore`, `collection.loadMore`, one outer sentinel, and the explicit `WorkSurfacePagination` button.
- Produces: one automatic-pagination owner in `WorkSurfaces`. `WorkItemBoard` remains presentation-only and does not accept `onLoadMore`; the outer sentinel works for both list and board layouts.

- [ ] **Step 1: Capture the clean-tip RED**

Run:

```bash
pnpm --filter @workmesh/web exec tsc --noEmit
```

Expected: TS2322 at `work-surfaces.tsx` because `onLoadMore` is not part of `WorkItemBoardProps`.

- [ ] **Step 2: Add source and observer contract tests**

```tsx
it('keeps automatic pagination in WorkSurfaces and never delegates it to WorkItemBoard', () => {
  const source = readFileSync(resolve(process.cwd(), 'features/work-items/work-surfaces.tsx'), 'utf8')
  const boardCall = source.slice(source.indexOf('<WorkItemBoard'), source.indexOf('/>', source.indexOf('<WorkItemBoard')) + 2)
  expect(boardCall).not.toContain('onLoadMore')
  expect(source.match(/new IntersectionObserver/g)).toHaveLength(1)
})

it('loads exactly one page for one sentinel intersection', () => {
  render(<WorkSurfaces initialLayout="board" scope="my-work" />)
  act(() => TestIntersectionObserver.instances[0]?.intersect())
  expect(queryState.collection.loadMore).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 3: Remove the invalid delegation**

Remove only the invalid `onLoadMore` prop from the `WorkItemBoard` call. Keep the existing outer observer, its initial/loading-more guard, and the explicit pagination button. Remove the orphan `.wm-work-item-column-sentinel` rule; do not add per-column observers or replay the historical stash experiment.

- [ ] **Step 4: Verify type ownership**

Run:

```bash
pnpm --filter @workmesh/web exec tsc --noEmit
pnpm --filter @workmesh/ui exec tsc --noEmit
pnpm --filter @workmesh/web exec vitest run features/work-items/work-surfaces-pagination.test.tsx
```

Expected: both typechecks and all focused pagination tests pass.

**DoD:** No `any`, exactly one observer owner, no Board pagination prop/sentinel CSS, explicit Load More remains, loading guards prevent concurrent loads, and the clean-tip TS2322 is gone.

### Baseline B.2: Declare the shared UI Client Component boundary

**Files:**
- Modify: `packages/ui/src/index.tsx`
- Modify: `packages/ui/src/index.test.ts`

**Interfaces:**
- Consumes: React 19 hooks already used by `AppShell`, `Dialog`, `Sheet`, `Popover`, `Tabs`, and Work Surface primitives.
- Produces: a Next.js-compatible client entrypoint; consumers keep importing from `@workmesh/ui`.

- [ ] **Step 1: Capture the RED build error**

Run:

```bash
pnpm --filter @workmesh/web build
```

Expected: Next reports that `packages/ui/src/index.tsx` imports `useEffect`, `useRef`, and `useState` without a `"use client"` boundary.

- [ ] **Step 2: Add the boundary test**

```ts
it('declares the shared interactive entrypoint as a Client Component', () => {
  const source = readFileSync(fileURLToPath(new URL('./index.tsx', import.meta.url)), 'utf8')
  expect(source.startsWith("'use client'\n")).toBe(true)
})
```

- [ ] **Step 3: Add exactly one directive**

Make the first statement of `packages/ui/src/index.tsx`:

```ts
'use client'
```

Do not add page-local wrappers or duplicate exports.

- [ ] **Step 4: Verify**

Run `pnpm --filter @workmesh/web build` after B.1. Expected: the Client Component compilation error is absent and the build completes.

**DoD:** The package entrypoint owns the boundary, server callers do not need per-import workarounds, and the production build compiles.

### Baseline B.3: Make UI Vitest setup cwd-independent and close the build gate

**Files:**
- Modify: `vitest.config.ts`
- Create: `vitest.config.test.ts`
- Verify only: `packages/ui/src/index.test.ts`

**Interfaces:**
- Consumes: `apps/web/vitest-setup.ts` only when the current package owns that file.
- Produces: `localVitestSetup(cwd = process.cwd()): string[]`; it returns the package-local setup path when it exists and `[]` for packages such as UI/Contracts that do not own one.

- [ ] **Step 1: Capture the RED package test**

Run `pnpm --filter @workmesh/ui test`.

Expected: Vitest cannot find `packages/ui/vitest-setup.ts` because `./vitest-setup.ts` is resolved from the package cwd.

- [ ] **Step 2: Resolve only a package-owned setup file**

```ts
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export function localVitestSetup(cwd = process.cwd()): string[] {
  const setupFile = resolve(cwd, 'vitest-setup.ts')
  return existsSync(setupFile) ? [setupFile] : []
}

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/integration/**'],
    setupFiles: localVitestSetup(),
    passWithNoTests: true,
  },
})
```

- [ ] **Step 3: Run the baseline matrix**

```bash
pnpm --filter @workmesh/ui test
pnpm --filter @workmesh/ui typecheck
pnpm --filter @workmesh/web typecheck
pnpm --filter @workmesh/web test
pnpm --filter @workmesh/web build
```

Expected: all five commands pass. Record actual test counts and the Next build result in the SDD ledger.

Add `vitest.config.test.ts` to prove Web resolves its local setup and UI/Contracts return an empty list. **DoD:** No package is forced to load a setup file it does not own; UI/Contracts tests execute rather than abort during setup; typecheck, Web tests, and production build are green before Task 3.5 starts.

---

### Task 3.5: URL-addressable Pending and immutable Approval History

**Files:**
- Create: `apps/web/app/agents/approval-route-state.ts`
- Create: `apps/web/app/agents/approval-route-state.test.ts`
- Create: `apps/web/app/agents/approval-history-table.tsx`
- Create: `apps/web/app/agents/approval-history-table.test.tsx`
- Modify: `apps/web/app/agents/page.tsx`
- Modify: `apps/web/app/agents/approvals-table.tsx`
- Modify: `apps/web/app/lib/i18n.tsx`
- Modify: `apps/web/app/styles.css`

**Interfaces:**
- Produces: `type ApprovalView = 'pending' | 'history'`, `type ApprovalTerminalStatus = 'approved' | 'rejected' | 'expired' | 'consumed' | 'canceled'`, and `readAgentsRoute(search: string): AgentsRouteState` / `writeAgentsRoute(current: URL, next: Partial<AgentsRouteState>): URL`.
- `AgentsRouteState` contains `tab`, `approvalView`, `approvalStatus`, `name`, `teamId`, `capability`, and `status`. `approvalStatus` defaults to `approved`; when History is active its selected value is serialized as `approvalStatus=<terminal-status>`.
- Pending uses `/api/v1/approvals?status=pending` and defensively renders only `status === 'pending'`. History always selects exactly one terminal status and uses `/api/v1/approvals?status=<selected>` so server filtering and cursor pagination stay aligned. There is no client-composed “all terminal” view.
- History displays only existing `Approval` fields: `status`, `action_name`, `approval_type`, `risk_level`, `rationale_summary`, `session_id`, `created_at`, and `expires_at`. It must not invent decision actor, requester, or decision timestamp.

- [ ] **Step 1: Write RED route-state tests**

```ts
expect(readAgentsRoute('?tab=approvals&approvalView=history&approvalStatus=rejected&team=team-1')).toEqual({
  tab: 'approvals', approvalView: 'history', approvalStatus: 'rejected', name: '', teamId: 'team-1', capability: '', status: 'all',
})
expect(readAgentsRoute('?tab=approvals&approvalView=history').approvalStatus).toBe('approved')
expect(writeAgentsRoute(new URL('https://wm.test/agents?tab=approvals'), { approvalView: 'history', approvalStatus: 'approved' }).search).toBe('?tab=approvals&approvalView=history&approvalStatus=approved')
```

- [ ] **Step 2: Write RED history presentation tests**

```tsx
render(<ApprovalHistoryTable approvals={[approved, rejected]} copy={copy} />)
expect(screen.getByRole('link', { name: copy.reviewSession })).toHaveAttribute('href', '/agent-sessions/session-1')
expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
expect(screen.queryByRole('button', { name: copy.bulkApprove })).not.toBeInTheDocument()
```

Render History with `approvalStatus="approved"` and assert a mismatched rejected row is absent. Render a mixed response in the Pending table and assert approved/rejected rows are absent. This locks the audit finding shown in screenshot `04-approvals-mixed-status-current.png` without replacing server-side status pagination.

- [ ] **Step 3: Verify RED**

Run:

```bash
pnpm --filter @workmesh/web exec vitest run app/agents/approval-route-state.test.ts app/agents/approval-history-table.test.tsx app/agents/approvals-table.test.tsx
```

Expected: the new modules are missing and mixed-status filtering fails.

- [ ] **Step 4: Implement URL state and nested shared Tabs**

Use the existing `Tabs` component for Pending/History. Within History, render one accessible terminal-status selector containing exactly Approved, Rejected, Expired, Consumed, and Canceled; no “All” option. Initialize from `window.location.search`, update via `history.replaceState`, and subscribe to `popstate`. Preserve unrelated search parameters. The outer Agents/Sessions/Approvals tab, terminal status, and Task 3.2 filters must read/write the same `AgentsRouteState`.

- [ ] **Step 5: Implement the two projections**

Keep selection and decision controls only in Pending. After a decision, clear successful IDs and refresh Pending; switching to History issues the selected terminal-status query and paginates that server-filtered result. Changing terminal status creates a fresh paged collection for the new URL. Do not merge independently paginated statuses in memory, add a client-only undo, or provide a pseudo-complete “all terminal” option. Add bilingual labels for all five terminal statuses.

- [ ] **Step 6: Verify**

Run the three focused tests, `pnpm --filter @workmesh/web typecheck`, and `pnpm --filter @workmesh/web build`.

**DoD:** A shared URL restores outer tab, inner approval view, selected terminal status, and Agent filters after refresh/back/forward; Pending never shows decided rows; each History page is read-only and backed by one exact server status/cursor sequence; no “all terminal” view exists; all added copy exists in `zh-CN` and `en`.

### Task 3.6: Linear-style Agent Peek plus stable detail link

**Files:**
- Create: `apps/web/app/agents/agent-registry-card.tsx`
- Create: `apps/web/app/agents/agent-registry-card.test.tsx`
- Create: `apps/web/app/agents/agent-detail-panel.tsx`
- Create: `apps/web/app/agents/agent-detail-panel.test.tsx`
- Create: `apps/web/app/agents/agent-peek.tsx`
- Create: `apps/web/app/agents/agent-peek.test.tsx`
- Create: `apps/web/app/agents/[id]/page.tsx`
- Create: `apps/web/app/agents/[id]/page.test.tsx`
- Modify: `apps/web/app/agents/page.tsx`
- Modify: `apps/web/app/agents/approval-route-state.ts`
- Modify: `apps/web/app/agents/approval-route-state.test.ts`
- Modify: `apps/web/features/command-center/registry.ts`
- Modify: `apps/web/features/command-center/registry.test.ts`
- Modify: `apps/web/app/lib/i18n.tsx`
- Modify: `apps/web/app/styles.css`

**Interfaces:**
- `AgentDetailPanel({ agent, loadedTeamAccess, copy })` is read-only and shared by Peek and the stable page. `loadedTeamAccess` is optional: omission means “not loaded”, never “no grants”.
- `AgentPeek({ agent, open, onClose })` wraps `AgentDetailPanel` in the shared `Sheet`; the list response supplies its already-loaded `team_access` projection.
- The card's primary title/body is a real `<a href="/agents/{id}">`; Enter uses native navigation. Space on that link opens Peek. A separate “Manage team access” button opens `TeamAccessDrawer`.
- `focusedAgentId`, `peekAgentId`, and URL-owned `teamAccessAgentId` are three independent states. Approval `selectedIds` remains separate. `teamAccessAgentId` allows `/agents?tab=agents&teamAccessAgent=<id>` to restore the management Sheet after the aggregated list has loaded.
- `GET /api/v1/agents/{id}` currently omits the `team_access` field that its OpenAPI schema declares. This frontend-only task must not turn that omission into an empty grant set or modify the API; the stable detail page links back to the registry's URL-addressable Team Access Sheet.
- Next 15 supplies the Client page's dynamic `params.id` as the raw encoded segment. The route boundary decodes that segment exactly once, then encodes the resulting Agent ID exactly once for the API path. A literal `%2F` ID therefore uses a `%252F` route segment; malformed percent encoding renders a safe not-found/error state rather than throwing during render.

- [ ] **Step 1: Write RED interaction tests**

```tsx
expect(screen.getByRole('link', { name: /Codex/ })).toHaveAttribute('href', '/agents/agent-1')
fireEvent.keyDown(screen.getByRole('link', { name: /Codex/ }), { key: ' ' })
expect(screen.getByRole('dialog', { name: copy.peekTitle('Codex') })).toBeVisible()
fireEvent.click(screen.getByRole('button', { name: copy.manageTeamAccess }))
expect(screen.getByRole('dialog', { name: copy.teamAccessTitle('Codex') })).toBeVisible()
```

Assert that opening/closing team access does not mutate `peekAgentId`, that the card no longer uses `role="button"`, and that the management URL restores the Sheet only after the matching aggregated Agent has loaded.

- [ ] **Step 2: Write RED route and command-center tests**

```ts
expect(agentCommand({ id: 'agent/1', name: 'Codex', slug: 'codex' }).href).toBe('/agents/agent%2F1')
```

Render the detail route with `/api/v1/agents/agent-1` and no `team_access`. Assert Agent facts, a back link to `/agents?tab=agents`, no false “zero grants” claim, and a management link to `/agents?tab=agents&teamAccessAgent=agent-1`. Add raw route-segment cases: `agent%2F1` requests `/api/v1/agents/agent%2F1`; `agent%252F1` requests the literal-percent ID `/api/v1/agents/agent%252F1`; malformed `%` does not crash. The registry-route test owns the separately opened Team Access Sheet assertion.

- [ ] **Step 3: Verify RED**

Run the new component/route tests and `features/command-center/registry.test.ts`; expect missing modules and the old hash route assertion to fail.

- [ ] **Step 4: Implement shared detail and Peek**

Use existing fields only: name/slug, description, provider/version, active status, approved/requested capabilities, supported protocols, concurrency, heartbeat, and team access only when that projection was actually loaded. Do not duplicate team-access forms inside the detail body and do not coerce an absent `team_access` field to `[]`.

- [ ] **Step 5: Implement the stable page and command route**

The Client Component page safely normalizes the one raw `params.id` segment, loads `GET /api/v1/agents/{encoded-normalized-id}` with `apiRequest`, uses `useAuthenticatedActor`, and renders loading/error/not-found states through existing shared state primitives inside `AppShell`. Its Team Access action navigates to the registry management URL, where the list response supplies authoritative `team_access`. Update `agentCommand` from `/agents#agent-{id}` to `/agents/{encodedId}`.

- [ ] **Step 6: Verify**

Run all focused tests, `pnpm --filter @workmesh/web typecheck`, and `pnpm --filter @workmesh/web build`.

**DoD:** Peek preserves list context; Enter/title follows a stable deep link; reserved and literal-percent IDs round-trip without double encoding; team-access editing uses its own URL-restorable Sheet backed by the aggregated list; the detail route never represents omitted access data as an empty grant set; the command center resolves Agents to the stable route; no nested interactive controls or fake card button remain. The existing single-Agent API/OpenAPI mismatch is recorded as a backend follow-up rather than silently patched in this frontend-only continuation.

### Task 3.7: Phase 3 verification gate

**Files:**
- Create: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/task-3.7-report.md`
- Modify: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/progress.md`

**Interfaces:**
- Consumes: recovery B.1-B.3 and Tasks 3.1-3.6.
- Produces: evidence-backed Phase 3 PASS or a concrete reopen list; it produces no product code.

- [ ] **Step 1: Run focused tests**

```bash
pnpm --filter @workmesh/ui test
pnpm --filter @workmesh/web exec vitest run app/agent-session-detail.test.tsx app/agents features/command-center/registry.test.ts
pnpm --filter @workmesh/web typecheck
pnpm --filter @workmesh/web build
```

- [ ] **Step 2: Run the mocked Agents journey**

Verify 390×844, 1440×900, and 1920×1080: URL-restored tabs/filters/terminal status; mixed-status Pending defense; read-only single-status History with Load More; no “all terminal” option; bulk decision with no undo; Space Peek; Enter/deep link; separate Team Access Sheet; Escape focus return. At 1920×1080 also record the main-content width, usable card/table width, whitespace distribution, and document overflow so a technically responsive but wastefully narrow or over-stretched desktop is not accepted.

- [ ] **Step 3: Record evidence**

Write actual commands, counts, browser viewport, screenshot paths, and remaining limitations to `task-3.7-report.md` and the ledger.

**DoD:** No open Phase 3 regression; all focused tests/typecheck/build and the three-viewport mocked browser matrix pass; Phase 3 moves from 6/7 to 7/7 only after the report is reviewed. Stateful Stage 1 remains a Phase 7 topology gate.

---

# Phase 4 — Operations Page (Days 10-11)

### Task 4.1: Feature-aware Operations anchor navigation

**Files:**
- Create: `apps/web/app/operations/sections.ts`
- Create: `apps/web/app/operations/sections.test.ts`
- Create: `apps/web/app/operations-content.test.tsx`
- Create: `apps/web/app/operations/page.test.tsx`
- Create: `apps/web/e2e/mocked/operations-ux.mocked.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `apps/web/playwright.mocked.config.ts`
- Modify: `apps/web/app/operations-content.tsx`
- Modify: `apps/web/app/lib/i18n.tsx`
- Modify: `apps/web/app/lib/i18n.test.ts`
- Modify: `apps/web/app/lib/workspace-navigation.tsx`
- Modify: `apps/web/app/styles.css`

**Interfaces:**
- Produces: `type OperationsSectionId = 'metrics' | 'cycles' | 'initiatives' | 'automation' | 'loops' | 'runs' | 'templates'` and `visibleOperationsSections(features: ReadonlySet<string>): OperationsSectionId[]`.
- Each visible panel owns `id="operations-{section}"` and `tabIndex={-1}`. Hidden feature panels never appear in navigation.
- Without `WORKMESH_BETA_OPERATIONS_UI`, the registry is empty. An Operations-only feature set renders a localized empty state, not a blank nav/grid.
- The compact controls are sticky within the Operations surface. The hash-selected section has `aria-current="location"`; `hashchange` and link activation keep that state synchronized without inventing a second page router.
- The standalone Operations page no longer marks Agents as the active sidebar destination. Extend the navigation key with an Operations sentinel so existing visible navigation remains unchanged while no unrelated item is selected.
- Mock fixtures use the canonical 11-record `{ key, tier, enabled }` feature response. Task 4.1 intercepts its own Operations endpoints inside the new mock-only spec; it does not silently expand the shared preview server's ownership.

- [ ] **Step 1: Write RED section-registry tests**

```ts
expect(visibleOperationsSections(new Set(['WORKMESH_BETA_OPERATIONS_UI', 'WORKMESH_BETA_PLANNING']))).toEqual(['cycles', 'initiatives'])
expect(visibleOperationsSections(new Set(['WORKMESH_BETA_OPERATIONS_UI', 'WORKMESH_BETA_COSTS']))).toEqual(['metrics'])
expect(visibleOperationsSections(new Set(['WORKMESH_BETA_PLANNING']))).toEqual([])
```

Add DOM RED assertions for localized Operations-only empty state, ordinary anchor links, unique target IDs/`tabIndex`, one current location, same-hash click focus, unknown/hidden hashes, and the standalone page's absence of a false active Agents destination.

- [ ] **Step 2: Run RED**

Run `pnpm --filter @workmesh/web exec vitest run app/operations/sections.test.ts`; expect the module to be missing.

- [ ] **Step 3: Implement registry and nav**

Render a shared, compact `<nav aria-label={operationsCopy.sectionNavigation}>` before the data panels only when at least one section is visible. Links are ordinary anchors such as `href="#operations-runs"`; labels come from `operationsCopy`. Nav and targets must enter the same data-ready branch so Costs cannot briefly expose a missing target. Mount with no hash-derived state, then synchronize after hydration; same-hash activation updates current/focus because it produces no `hashchange`, while unknown/hidden hashes remain untouched. If a feature refresh hides the current target, clear stale current state. Use the same markup in standalone and embedded Settings modes. Test ops-disabled, ops-only, each individual gated feature, all-enabled, and unknown features. Seed `e2e/mocked/operations-ux.mocked.spec.ts` with standalone/embedded anchor membership and focus assertions, using a full canonical 11-record feature fixture and spec-local `page.route` handlers. Root Playwright excludes `e2e/mocked/**/*.mocked.spec.ts` both globally and in project overrides; mocked config matches only that cross-platform path, so `pnpm test:e2e` never runs mock-only specs against the real 3100/3101 topology. Verify both configs with `--list`.

On 1920×1080, verify all-enabled navigation order, a single-line layout where space permits, no document overflow, sticky placement below the existing 48px shell header, and unique hash/current/focus ownership in standalone and embedded modes. The nav may scroll locally at narrow widths and each panel uses `scroll-margin-top` so sticky controls do not cover its focus target.

- [ ] **Step 4: Verify**

Run sections/component/page/i18n focused tests, both Playwright `--list` collection checks, the mocked spec, and `pnpm --filter @workmesh/web typecheck`.

**DoD:** Navigation order is deterministic, feature-gated sections are absent rather than disabled, every link targets one unique focusable heading/panel, hash state exposes the current location, and empty feature sets do not render blank navigation.

### Task 4.2: URL-shareable search over loaded Operations rows

**Files:**
- Create: `apps/web/app/operations/filter.ts`
- Create: `apps/web/app/operations/filter.test.ts`
- Modify: `apps/web/app/operations-content.tsx`
- Modify: `apps/web/app/operations-content.test.tsx`
- Modify: `apps/web/app/lib/i18n.tsx`
- Modify: `apps/web/app/lib/i18n.test.ts`
- Modify: `apps/web/app/styles.css`
- Modify: `apps/web/e2e/mocked/operations-ux.mocked.spec.ts`

**Interfaces:**
- Produces: `matchesOperationsQuery(query: string, values: readonly unknown[]): boolean` and `readOperationsQuery(search: string): string`.
- URL key: `opsQuery`; an empty query removes the parameter. Filtering applies only to rows already loaded by each `usePagedApiList`.
- Rendered text and filter values share the same localized display strings. Complete the real API enum coverage for cycle (`current/upcoming/history`), run (`pending/claimed/running/succeeded/failed/dead/canceled/dry_run`), disabled rule/loop states, initiative status/health/priority, and template kind/status; do not match hidden raw enum values that the row does not display.
- Each collection distinguishes initial loading, server-empty, and loaded-but-no-match. A first page with zero matches and a non-null cursor retains the original Load More control.

- [ ] **Step 1: Write RED pure tests**

```ts
expect(matchesOperationsQuery('nightly', ['Nightly sync', 'cron'])).toBe(true)
expect(matchesOperationsQuery('FAILED', ['run-1', 'failed'])).toBe(true)
expect(readOperationsQuery('?tab=operations&opsQuery=retry%20queue')).toBe('retry queue')
```

Also cover trimmed/empty input, Unicode, `+` and percent decoding, repeated/missing parameters, and `null`/numeric visible values. Add component RED tests for hydration-safe URL restore, same-tab `popstate`, Costs-only/no-search, loading vs server-empty vs no-match, and Load More remaining available under an active query.

- [ ] **Step 2: Run RED**

Run `pnpm --filter @workmesh/web exec vitest run app/operations/filter.test.ts`; expect a missing module.

- [ ] **Step 3: Implement one current-view search**

Add a labeled `type="search"` above the anchor nav when at least one searchable collection is visible (`metrics`/Costs-only and Operations-only have none). Match only actual visible cycle/initiative/rule/loop/run/template text case-insensitively, including localized status and the exact displayed date/error text. Exclude hidden full UUIDs, raw enum values, CSS/heading text, and undisplayed fields. Use a hydration-safe empty default and read the URL after mount. Input updates clone `location.href`, preserve `history.state`, unrelated parameters and hash, delete `opsQuery` for trimmed-empty input, and use `history.replaceState`; `popstate` only rereads the query. Do not take ownership of Settings cross-tab restoration, which remains Task 5.1; browser Back/Forward assertions use two same-Operations-tab history entries. The empty states must distinguish `loading && items.length === 0`, an exhausted empty server result, and loaded rows with zero matches.

Keep each `LoadMoreButton` bound to its unfiltered page state, never the filtered rows, and never add `opsQuery` to any API URL. Format dates with the selected WorkMesh locale and feed the exact same formatted string into matching. At 1920×1080 constrain the search control to `min(32rem, 100%)`; keep it non-sticky above the Task 4.1 nav so the existing nav offset remains correct.

- [ ] **Step 4: Add honest bilingual copy**

Copy must say that search filters loaded Operations records. Do not claim server-wide results or correct filtering across pages not yet loaded.

- [ ] **Step 5: Verify**

Run the focused test, `apps/web/app/lib/i18n.test.ts`, Web typecheck, and Web build.

Extend `operations-ux.mocked.spec.ts` with first-page no-match plus `nextCursor`, Load More under an active query, a second-page match, refresh and same-tab Back/Forward restoration, hash/unrelated-parameter retention, Settings-embedded query preservation, and an API request log proving no collection URL contains `opsQuery`. Exercise loaded visible strings across every searchable collection and a collection-level delayed response. At 390×844 and 1920×1080 assert no document overflow; on wide PC also record Operations/search/nav/panel widths, require search width at most 512px, and reject a full-viewport stretched search field. Write a named successful screenshot plus request/geometry JSON through `testInfo` output/attachments for the Phase 4 gate. **DoD:** Refresh/back/forward restores `opsQuery`; every visible collection filters consistently using the rendered localized strings; initial loading never masquerades as empty; Load More remains available while a query is active; filtering never mutates an API URL; no API query contract changes.

### Task 4.3: Semantic Runs table with sticky headers and narrow-screen containment

**Files:**
- Create: `apps/web/app/operations/runs-table.tsx`
- Create: `apps/web/app/operations/runs-table.test.tsx`
- Modify: `apps/web/app/operations-content.tsx`
- Modify: `apps/web/app/styles.css`
- Modify: `apps/web/e2e/mocked/operations-ux.mocked.spec.ts`

**Interfaces:**
- `RunsTable({ runs, locale, copy })` renders a semantic `<table>` inside `.operations-table-scroll` and formats dates with the selected UI locale.
- Column order remains Run, Kind, Status, Attempts, Session, Created; `last_error` renders in a full-width detail row associated with its run.
- `runDisplayValues(run, locale, copy)` is shared by the table and Task 4.2 filtering so active `opsQuery` continues to search exactly the rendered kind/status/session/date/error text after extraction.
- Session links encode a real UUID as `/agent-sessions/{id}`. A missing Session renders an em dash with no link; mocked route evidence uses valid deterministic UUIDs rather than route-shaped placeholders.

- [ ] **Step 1: Write RED semantic tests**

```tsx
render(<RunsTable runs={[failedRun]} copy={copy} locale="en" />)
expect(screen.getByRole('table')).toHaveAccessibleName(copy.runs)
expect(screen.getAllByRole('columnheader')).toHaveLength(6)
const detail = screen.getByText(failedRun.last_error!)
expect(detail.id).toContain(failedRun.id)
expect(screen.getByTestId(`run-row-${failedRun.id}`)).toHaveAttribute('aria-describedby', detail.id)
```

- [ ] **Step 2: Run RED**

Run the focused component test; expect the module to be missing.

- [ ] **Step 3: Implement semantic markup and CSS**

Use a visually hidden `<caption>`, `<thead>`/`<tbody>`, and `scope="col"`. Session links target `/agent-sessions/${encodeURIComponent(session_id)}` and expose an accessible name tied to the full ID while the visible cell may use its unique short prefix. Associate `last_error` through stable IDs and `aria-describedby`; historical errors are ordinary descriptive content, not assertive `role="alert"` regions. Feed Task 4.2's `filteredRuns` to the component and refactor its matcher to consume `runDisplayValues` instead of duplicating display logic. Render dates in `<time dateTime>` using the selected locale.

Make `.operations-table-scroll` a labeled, keyboard-focusable local region with a visible focus ring, `min-width:0`, a bounded scroll model, and real horizontal scrolling on narrow screens. Give the table a controlled minimum width and explicit column behavior; error content wraps anywhere. Remove obsolete div-grid table selectors. Sticky headers require a geometry test against the actual scrolling element, not merely a computed `position: sticky` assertion, and must not hide beneath the mobile/global shell header.

- [ ] **Step 4: Verify**

Run the component test, Task 4.2 filter/component/i18n regressions, Web typecheck, and `operations-ux.mocked.spec.ts`. Fixtures include a failed run with a long `last_error`, a run with no Session, and a valid UUID-backed Session detail route with spec-local supporting responses. At 390×844 assert `document.documentElement.scrollWidth === window.innerWidth`, `.operations-table-scroll.scrollWidth > clientWidth`, actual `scrollLeft` movement, wrapper focus visibility, error association/no alert, keyboard reachability of the Session link, and sticky-header geometry inside the real scrolling model. At 1920×1080 assert no meaningless horizontal scrollbar or document overflow, record panel/wrapper/table/column widths and row density, and reject sparse over-stretched columns. Write named successful narrow/wide screenshots and table-geometry JSON through `testInfo` output/attachments for Task 4.5.

**DoD:** Correct table semantics, sticky headings, no page-level horizontal overflow, and failed-run details remain associated and visible.

### Task 4.4: Aggregate usage metrics without invented time-series data

**Files:**
- Create: `apps/web/app/operations/usage-metrics.tsx`
- Create: `apps/web/app/operations/usage-metrics.test.tsx`
- Modify: `apps/web/app/operations-content.tsx`
- Modify: `apps/web/app/lib/i18n.tsx`
- Modify: `apps/web/app/lib/i18n.test.ts`
- Modify: `apps/web/app/styles.css`
- Modify: `apps/web/e2e/mocked/operations-ux.mocked.spec.ts`

**Interfaces:**
- `UsageMetrics({ usage, locale, copy })` consumes the existing aggregate `Usage` object and renders cost buckets, unknown cost count, token total, runtime, and tool calls.
- Produces no SVG sparkline and no temporal claim.
- Canonical decimal-string fields match `^(0|[1-9][0-9]*)$` before conversion and remain `BigInt` through formatting. API numeric unknown counts must be non-negative safe integers and are immediately converted to `BigInt`; invalid values fail closed as localized unavailable data instead of throwing or becoming zero.
- `known_cost_minor` is a currency minor-unit amount, never a major-unit `number`. Only runtime-confirmed supported ISO currencies use major-unit formatting; an unrecognized three-character code renders its exact BigInt plus a localized “CODE minor units” label.
- `OperationsContent` retains the outer `#operations-metrics` section, label, `tabIndex`, and Task 4.1 focus/anchor ownership. Metrics never enter Task 4.2 search values.

- [ ] **Step 1: Write RED formatting tests**

```tsx
render(<UsageMetrics usage={{ input_tokens: '1200', output_tokens: '300', runtime_ms: '90500', tool_calls: '42', unknown_cost_records: 2, currency_buckets: [] }} locale="en" copy={copy} />)
expect(screen.getByText('1,500')).toBeVisible()
expect(screen.getByText('1m 31s')).toBeVisible()
expect(screen.getByText(copy.metricsUnknownCost)).toBeVisible()
expect(container.querySelector('svg')).toBeNull()
expect(formatUsageCount('9007199254740993', 'en')).toBe('9,007,199,254,740,993')
```

Cover zero and huge values, duration rounding at 0/499/500/90500ms and beyond hours, USD/JPY plus a three-decimal supported currency, unknown currency, multiple currencies without cross-currency summation, global and per-bucket unknown counts, synthetic empty-bucket unknown-only, real-shaped unknown-only bucket, and malformed `''`, negative, leading-zero, decimal, exponent, and whitespace values. Invalid data renders unavailable and never throws or displays zero. Assert bilingual copy and no `Number`, `parseInt`, or `parseFloat` coercion in the component.

- [ ] **Step 2: Run RED**

Run the focused test; expect the component to be missing.

- [ ] **Step 3: Implement aggregate cards**

Use canonical validation, `BigInt`, and `Intl.NumberFormat(locale)` for token totals, runtime, tool calls, unknown counts, and every cost bucket. Detect supported currency codes with `Intl.supportedValuesOf('currency')` when available plus a fail-closed fallback; do not assume `Intl.NumberFormat` throws for an unknown code. Read supported fraction digits from resolved currency options and format major/remainder without converting the amount to Number. Keep raw buckets distinct—including case-distinct server buckets—and never sum across USD/JPY or other currencies. Show known and unknown portions of the same bucket together, and never present known zero as total cost when unknown records exist. Runtime half-up seconds use BigInt arithmetic.

Render internal metrics as semantic lists/description groups with currency/value labels; global unknown data remains textually explicit rather than color-only. Large values use tabular numerals, `min-width:0`, and `overflow-wrap:anywhere`. The component contains no chart, SVG, trend, or time-series wording.

- [ ] **Step 4: Verify**

Run the component/i18n tests, Web typecheck, and Web build.

Extend `operations-ux.mocked.spec.ts` with an injectable large aggregate containing values beyond `MAX_SAFE_INTEGER`, USD, JPY, an unsupported code, and both global/per-bucket unknown records; preserve existing delay fixtures. Prove active `opsQuery` never hides or searches Metrics. At 390×844 and 1920×1080 record section/grid/card widths and row count, assert no document overflow, huge-value containment, no SVG, and an auto-fit card grid that neither overflows mobile nor stretches into sparse wide-PC slabs. Write named successful narrow/wide screenshots and metrics-geometry JSON through `testInfo` output/attachments for Task 4.5. **DoD:** Metrics are readable at all viewports without precision loss; malformed aggregates fail closed; minor-unit costs are never mislabeled as major units; currencies are never summed across units; unknown cost is never presented as zero; and no chart/time-series language or component is introduced.

### Task 4.5: Phase 4 verification

**Files:**
- Verify only: `apps/web/e2e/mocked/operations-ux.mocked.spec.ts`
- Create: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/task-4.5-report.md`
- Modify: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/progress.md`

**Interfaces:**
- Consumes: the concrete commands and browser assertions from Tasks 4.1-4.4.
- Produces: a reviewed `PASS` or explicit task reopen list; no product-code authority belongs to the gate owner.

- [ ] **Step 1: Establish the RED gate**

Create the report with `Status: RED (unverified)` and one unchecked entry for every command and feature matrix below. The phase is RED until every entry has fresh evidence.

- [ ] **Step 2: Run focused tests**

```bash
pnpm --filter @workmesh/web exec vitest run app/operations app/lib/i18n.test.ts
pnpm --filter @workmesh/web test
pnpm --filter @workmesh/web typecheck
pnpm --filter @workmesh/web lint
pnpm --filter @workmesh/web build
git diff --check
```

- [ ] **Step 3: Exercise feature matrices**

First run `playwright test --config playwright.mocked.config.ts --list e2e/mocked/operations-ux.mocked.spec.ts` and record the exact titles/count, then run that exact file. Exercise eight feature sets on both standalone `/operations` and embedded `/settings?tab=operations`: master-off, Operations-only, Planning-only, Costs-only, Automation-only, Loops-only, Templates-only, and all-enabled. For each of the 16 scenarios compare exact ordered anchor/target membership, search presence, hidden-panel absence, and corresponding API request absence; Costs-only has no search and Automation owns both Automation and Runs.

The all-enabled browser matrix proves: initial collection loading vs server-empty vs loaded-no-match; same-tab URL/history-state restoration; first-page non-match with a real row and cursor, original Load More request without `opsQuery`, and a second-page rendered match; every searchable collection matching its localized rendered status/date/error while hidden raw enums do not match; Metrics remaining visible under an active query; semantic Runs/error/Session behavior and actual local horizontal/vertical scrolling plus sticky geometry; exact BigInt/currency/unknown-cost projection without SVG/time-series claims. At 390×844 assert document containment and locally keyboard-scrollable dense regions. At 1920×1080 consume owner-defined numeric thresholds and record Operations root/main, search (maximum 512px), nav, panel, Runs wrapper/table/columns/row, metrics grid/card widths and row count; screenshots supplement but never replace geometry assertions.

Tasks 4.2–4.4 must have written named successful screenshots and request/geometry JSON through Playwright `testInfo` output/attachments. Immediately after the final gate, copy those transient artifacts to a stable non-repository evidence directory and record absolute paths before another run can clear `test-results`. If an expected attachment is absent, the gate remains RED. The report states that this is a mocked Next-dev browser topology plus a separate production build, not a production-browser or standalone-runtime result.

- [ ] **Step 4: Implement the gate result**

Write base SHA/dirty boundary, commands/counts/durations, scenario-to-test mapping, request matrix, 390/1920 geometry JSON, stable screenshot paths, mocked-dev/production-build boundary, and limitations to the report and ledger. If any assertion or required evidence artifact fails, keep `Status: RED` and reopen the exact owner task (4.1 anchors/layout, 4.2 search/loading/pagination, 4.3 table/Session/sticky, or 4.4 metrics/precision); the gate owner must not patch product code.

- [ ] **Step 5: Verify GREEN**

Rerun every failed command after the owner fix and change the report to `Status: PASS` only when all entries are checked with fresh output.

**DoD:** Phase 4 has a reviewed PASS with P0/P1/P2 counts; all 16 feature/surface scenarios and the all-enabled 390/1920 matrices have fresh strong assertions plus stable artifacts; mock browser and production-build claims remain distinct; and no claim relies on unavailable time-series or unloaded-page data.

---

# Phase 5 — Settings + Connect (Day 12)

### Task 5.1: Settings Tabs with popstate-correct URL routing

**Files:**
- Create: `apps/web/app/settings/route-state.ts`
- Create: `apps/web/app/settings/route-state.test.ts`
- Create: `apps/web/app/settings/page.test.tsx`
- Modify: `apps/web/app/settings/page.tsx`
- Modify: `apps/web/app/operations-content.tsx`
- Modify: `apps/web/app/operations-content.test.tsx`
- Modify: `apps/web/app/lib/i18n.tsx`
- Modify: `apps/web/app/lib/i18n.test.ts`
- Modify: `apps/web/app/styles.css`
- Modify: `apps/web/e2e/mocked/operations-ux.mocked.spec.ts`
- Modify: `packages/ui/src/index.test.ts`

**Interfaces:**
- Produces: `type SettingsTab = 'workspace' | 'operations'`, `readSettingsRoute(search: string): { tab: SettingsTab; teamId: string | null }`, and `writeSettingsRoute(url: URL, next: Readonly<Partial<{ tab: SettingsTab; teamId: string | null }>>): URL`. An omitted field is preserved, `teamId:null` deletes Team, Workspace deletes the default `tab`, and Operations writes it; the input URL is never mutated.
- Reuses shared `Tabs`; no page-local tablist remains.
- Uses the same hydration-safe rule as Agents: server and first browser render use the default state, then a mount effect restores the URL. Passive `popstate` never steals focus.
- User selection of a different tab uses `pushState(window.history.state, ...)`; selecting the already parsed tab produces no history entry. Operations anchors, `opsQuery`, Team, unrelated parameters, hash, and history state survive route writes.
- Embedded `OperationsContent` synchronizes current anchor state without automatic focus/scroll on mount, visibility changes, or passive history. Explicit Operations anchor activation still focuses, and standalone direct-hash navigation retains Task 4.1 scrolling behavior.

- [ ] **Step 1: Write RED route tests**

```ts
expect(readSettingsRoute('?tab=operations&team=team-1')).toEqual({ tab: 'operations', teamId: 'team-1' })
expect(writeSettingsRoute(new URL('https://wm.test/settings?team=team-1&opsQuery=retry&x=1#operations-runs'), { tab: 'operations' }).href)
  .toBe('https://wm.test/settings?team=team-1&opsQuery=retry&x=1&tab=operations#operations-runs')
```

Cover omitted-vs-null Team semantics, clone/no-mutation, invalid/default tabs, canonical parameter removal, unrelated/hash preservation, and stable query ordering without making order the semantic contract.

- [ ] **Step 2: Add a component RED test**

Dispatch `popstate` after changing `window.history` from `?tab=workspace` to `?tab=operations`; assert the Operations panel becomes active while a still-connected focused control remains focused. If a previously focused panel node is unmounted, assert only that the listener does not proactively focus another element. Separately prove desktop ArrowLeft/Right/Home/End wrapping/focus through rendered shared `Tabs`; compact mode uses one named native select, no tab/tablist, one labelled tabpanel, preserves route state when the media query changes, and returns focus to the select after user selection.

- [ ] **Step 3: Implement**

Replace the custom tab markup with `Tabs`, hydrate safely from URL, update with `pushState` only when the user selects a different tab, and listen to `popstate`. Preserve `history.state`, Team, unrelated query/hash state including Phase 4 `opsQuery` and Operations anchors; use `useMediaQuery` for compact Tabs. Remove the page-local tab descriptions rather than reintroducing custom tab markup. Delete only obsolete `.settings-tabs/.settings-tab-panels/.settings-tab-panel` CSS; retain Operations heading/action rules and add narrow `min-width:0` containment where shared Tabs needs it.

Update `OperationsContent` with an explicit embedded/standalone location policy: embedded restores `aria-current` but does not scroll/focus merely because the panel mounted, became visible, or received passive history; standalone direct hash and explicit anchor activation continue to scroll/focus. Add regression coverage so Settings user/keyboard selection leaves focus on the selected tab/select, while an explicit Operations anchor retains its own focus behavior.

Extend the mock-only browser spec with `/settings?tab=operations&team=team-1&opsQuery=Archived&x=keep#operations-templates` hydration/refresh; desktop click and Arrow/Home/End with one push per different tab and none for same tab; real Back/Forward preserving state and not being overridden by Operations; 390 compact semantics/no overflow; and 1920 Settings/main >=0.85 ratio, content <=1480px, selected panel width >=98% of inner content plus a named PASS screenshot/geometry JSON.

- [ ] **Step 4: Verify**

Run route/component/i18n tests, Web typecheck, and Web build.

**DoD:** Direct URL, refresh, Back, and Forward render the same tab; shared Tabs owns arrow/Home/End behavior; no duplicate tab semantics.

### Task 5.2: Scope the team selector to Workspace settings

**Files:**
- Modify: `apps/web/app/settings/page.tsx`
- Modify: `apps/web/app/settings/route-state.ts`
- Modify: `apps/web/app/settings/route-state.test.ts`
- Modify: `apps/web/app/settings/page.test.tsx`
- Modify: `apps/web/app/lib/i18n.tsx`
- Modify: `apps/web/app/lib/i18n.test.ts`
- Modify: `apps/web/e2e/mocked/operations-ux.mocked.spec.ts`
- Create: `apps/web/app/settings/team-resolution.ts`
- Create: `apps/web/app/settings/team-resolution.test.ts`

**Interfaces:**
- The `team` URL parameter is a latent Workspace selection while `tab=operations`; it becomes active only for `tab=workspace`.
- Operations is workspace-global in the current contract; it must not imply a team scope it does not send to the API.
- Route state is the only Team-selection authority; Settings must not keep an independent fallback `teamId` state.
- A requested Team is not classified as unavailable until Team pagination has completed successfully and serial auto-drain has exhausted `nextCursor`. `nextCursor === null` after a failed request is not proof of absence. Operations must neither auto-drain Team pages nor request `/teams/{id}/states`.
- Team resolution has five explicit states: `pending`, `resolved`, `unavailable`, `blocked` (request error), and `empty`. Only `resolved` supplies a selected Team and workflow-state path.

- [ ] **Step 1: Write RED behavior tests**

```tsx
expect(screen.getByRole('combobox', { name: copy.currentTeam })).toBeVisible()
await user.click(screen.getByRole('tab', { name: copy.tabOperations }))
expect(screen.queryByRole('combobox', { name: copy.currentTeam })).not.toBeInTheDocument()
```

Also assert that a valid second-page Team is found by serial pagination while Workspace is active, and that an unknown requested Team is corrected only after a successful exhausted response. A request error enters `blocked`, performs no URL correction, and does not start a retry loop. Pending, unavailable, blocked, and empty states expose neither a selected Team nor a workflow-state request path. No requested Team chooses the first authorized Team only after the first page succeeds. System correction uses `replaceState`; user Team selection uses `pushState`; both preserve `history.state`, unrelated parameters, and the hash. Cover an empty Team list, a Team removed after selection, and an Operations URL carrying a second-page latent Team.

- [ ] **Step 2: Run RED**

Run the Settings route/component tests; expect the AppShell selector to remain visible on Operations.

- [ ] **Step 3: Implement scoped context**

Pass `teamSwitcher` to `AppShell` only for Workspace. On user Team change, update `team` in the current URL without mutating the caller's history state. Remove the independent Team-selection state and derive selection through a pure resolution helper. While Workspace is active, load Team pages serially until the requested Team resolves or a successful response exhausts the cursor; never issue overlapping page requests. Keep the URL Team latent while switching through Operations, but do not expose it as Operations scope, auto-drain pages, or request workflow states. For a successful no-request first page, replace the URL with the first authorized Team; for a successful exhausted unknown request, replace with the first authorized Team or delete the parameter when empty. For blocked requests, retain the URL and show a generic localized “unavailable or no longer accessible” recovery message—the API cannot distinguish deletion, absence, and lost access, so the UI must not claim a precise cause.

- [ ] **Step 4: Verify**

Run the route/resolution/component/i18n tests, Web typecheck, Web build, and the mocked Operations browser spec. In Chromium, prove the exact Team request sequence: Workspace resolves a second-page deep link serially, Operations makes no extra Team page or workflow-state request while preserving the latent URL, and switching back to Workspace begins resolution. At 390×844 exercise the compact Settings control without page overflow. At 1920×1080 capture the full Settings surface and reject a narrow centered island, stretched selector, or sparse panel; record main/content/selector widths in named PASS screenshot and geometry JSON.

**DoD:** UI scope matches request scope; no misleading team selector appears on Operations; URL team selection is restorable and authorization-bounded.

### Task 5.3: Tested workflow color preset palette

**Files:**
- Create: `apps/web/app/settings/workflow-color-presets.ts`
- Create: `apps/web/app/settings/workflow-color-presets.test.ts`
- Modify: `apps/web/app/settings/page.test.tsx`
- Modify: `apps/web/app/settings/page.tsx`
- Modify: `apps/web/app/lib/i18n.tsx`
- Modify: `apps/web/app/lib/i18n.test.ts`
- Modify: `apps/web/app/styles.css`
- Create: `apps/web/e2e/mocked/settings-workflow-colors.mocked.spec.ts`
- Modify: `apps/web/e2e/stage0.spec.ts`
- Create: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/task-5.3-report.md`
- Modify: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/progress.md` only after independent review.

**Interfaces:**
- Produces: `WORKFLOW_COLOR_PRESETS` with stable IDs and exact hex values; `workflowColorValue(id)` returns a hex value or `null`.
- The existing create-state request still sends one `color` string; no API shape changes.
- The five presets remain exactly `neutral`, `blue`, `green`, `amber`, and `red`. A sixth UI-only `custom` radio controls the native color input but is not part of `WORKFLOW_COLOR_PRESETS` and never enters the request body. Its deterministic initial/reset value is `#8b5cf6`.
- Existing server-provided workflow colors remain unchanged even when they do not match a preset; the UI never normalizes or rewrites them.

- [ ] **Step 1: Write RED palette tests**

```ts
expect(WORKFLOW_COLOR_PRESETS.map(item => item.id)).toEqual(['neutral', 'blue', 'green', 'amber', 'red'])
expect(Object.fromEntries(WORKFLOW_COLOR_PRESETS.map(item => [item.id, item.value]))).toEqual({ neutral: '#73736f', blue: '#2563eb', green: '#15803d', amber: '#a16207', red: '#b42318' })
expect(workflowColorValue('unknown')).toBeNull()
```

- [ ] **Step 2: Write RED interaction tests**

Select the Blue radio option, submit the create-state form, and assert the exact JSON body is `{ name, category, color: '#2563eb' }` with no `position`, `presetId`, `colorMode`, or radio UI field. Select Custom, enter `#8b5cf6`, and assert that exact color body. Success resets the controlled choice to Neutral and custom value to `#8b5cf6`; failure preserves both. The POST response contains only `{ id, revision }`, and the refresh mock need not append a row, so a localized `role="status"` confirms creation even when the new state is outside the refreshed first page. Pending, blocked, unavailable, and empty Team resolutions render no create-state form; a large-list test must not require immediate appearance.

- [ ] **Step 3: Implement**

Render the five frozen presets plus a UI-only Custom option as one named native radio group (`fieldset`/`legend` or equivalent); every radio shares one `name`, each has a visible bilingual label, checked state is not conveyed by color alone, and every bordered swatch is `aria-hidden`. Neutral maps to `#73736f` and must not be labeled “Default.” Selecting Custom is the only action that renders/enables/focuses the native color input and its visible named `#rrggbb` preview. Compute the request color from controlled state rather than multiple `FormData` controls so exactly one value can win.

Omit `position` so the server computes `max(position)+1`; loaded-page length is not a valid global position. Reuse `teamResolution.workflowStatesPath`. On submit or Team-scope change clear stale status. After success, set localized creation status, reset the controlled preset/custom state, then refresh; `form.reset()` alone is insufficient. On failure, keep the chosen preset/custom value. Do not change the pagination hook or fabricate a complete State object from the ID/revision-only response. Use `.workflow-state-create-form` rather than stretching the generic inline form.

- [ ] **Step 4: Verify**

Run palette/Settings/i18n tests, full Web tests, typecheck, lint, build, mocked Chromium, Stage 0 with its dedicated integration topology, and diff-check. Stage 0 creates one preset and one custom state and inspects the real POST body; lack of its database is reported as unavailable rather than PASS.

The mocked browser spec proves real native radio keyboard behavior (Tab, ArrowLeft/Right or ArrowUp/Down, Space), Custom-only focusability, visible hexadecimal preview, exact body, success reset/status, failure preservation, and no form for unresolved Team state. At 390×844 require exact document containment, one/two-column palette wrapping, and approximately 44px minimum clickable labels. At 1440×900 and 1920×1080 keep the workflow card full-width but the create form within a readable roughly 720–960px measure; five presets remain one row with roughly 112–168px cards rather than giant slabs. Record Settings/content/card/form/palette/card rectangles, row count, document widths, and named screenshots/geometry JSON for Task 5.6.

**DoD:** Five stable presets plus one UI-only custom mode are keyboard-operable and readable without color alone; exactly one controlled color reaches the existing payload with no client position; server colors remain lossless; success/failure feedback works beyond the first page; 390/1440/1920 layouts remain contained and dense; and no color library is introduced.

### Task 5.4: Replace browser confirm with the shared destructive-action Dialog

**Files:**
- Create: `apps/web/app/settings/delete-team-dialog.tsx`
- Create: `apps/web/app/settings/delete-team-dialog.test.tsx`
- Modify: `apps/web/app/settings/page.test.tsx`
- Modify: `apps/web/app/settings/page.tsx`
- Modify: `apps/web/app/lib/i18n.tsx`
- Modify: `apps/web/app/lib/i18n.test.ts`
- Modify: `apps/web/app/styles.css`
- Modify: `packages/ui/src/index.tsx`
- Modify: `packages/ui/src/index.test.ts`
- Modify: `apps/web/e2e/mocked/operations-ux.mocked.spec.ts`
- Modify: `apps/web/e2e/stage0.spec.ts`
- Create: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/task-5.4-report.md`
- Modify: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/progress.md` only after independent review.

**Interfaces:**
- `DeleteTeamDialog({ team, busy, error, open, onCancel, onConfirm, copy })` wraps shared `Dialog`, owns an immutable `{ id, name, key, revision }` snapshot, and keeps the one mutation error inside the active modal as `role="alert"`.
- It does not export/import settings and does not add a new endpoint; it calls the existing DELETE handler once after explicit confirmation using snapshot-specific operation `delete-team:${team.id}:revision-${team.revision}` plus a synchronous in-flight guard. `apiMutation` key sharing is not request coalescing.
- Shared `Dialog` gains backward-compatible `dismissible?: boolean = true` and `className?: string`. The root has `tabIndex={-1}`; opening with no enabled control, or transitioning idle→busy until all actions are disabled, focuses the root. `dismissible=false` hides/disables header close, ignores backdrop, prevents and stops Escape, and keeps Tab/Shift+Tab on the root when no enabled controls remain. Do not add `dismissible` to the focus-return effect dependencies, which would restore focus prematurely during a busy transition.
- DELETE success is terminal for the modal. A following Team refresh/reconciliation failure belongs to Task 5.2's blocked recovery surface and must never reopen or relabel the committed deletion as failed.

- [ ] **Step 1: Write RED safety tests**

```tsx
render(<DeleteTeamDialog team={team} open busy={false} onCancel={onCancel} onConfirm={onConfirm} copy={copy} />)
await user.click(screen.getByRole('button', { name: copy.cancel }))
expect(onConfirm).not.toHaveBeenCalled()
await user.click(screen.getByRole('button', { name: copy.deleteTeam }))
expect(onConfirm).toHaveBeenCalledTimes(1)
```

Assert opening, Cancel, idle Escape, header close, and backdrop issue zero DELETE requests. Busy blocks header close, Escape, backdrop, repeated click/Enter/Space, and real Tab/Shift+Tab escape; when actions disable, focus remains on the dialog root or busy status. A deferred rapid double-confirm emits exactly one fetch. Assert the exact encoded snapshot path, `If-Match: "revision-N"`, one present idempotency key, and no body. Same-snapshot response-loss retry reuses the key; a new revision receives a different key. Failure performs no Team refresh, keeps the immutable snapshot and one modal-local alert, and returns to dismissible idle. Opening another snapshot clears the old alert.

Assert cancel returns focus to the trigger. Success closes the modal and commits its UI state before invoking exactly one refresh entrance outside the DELETE `try/catch`; a swallowed refresh failure belongs to Task 5.2 and cannot reopen or relabel the deletion. Reconciliation does not request workflow states for the deleted Team and never overwrites a newer route selection made while the request was in flight. Focus a connected, actually visible selector using `isConnected` plus real layout visibility; at 390px the desktop selector is hidden and the mobile selector lives in closed details, so focus the visible Teams/create-Team heading with `tabIndex={-1}`.

- [ ] **Step 2: Run RED**

Run the dialog test; expect the component to be missing.

- [ ] **Step 3: Implement**

Remove `window.confirm`, keep the selected Team snapshot stable from open through completion even if URL/team state changes, display Team name/key and the actual soft-delete/last-active-Team constraint, and reuse shared `Dialog`/`Button`. Copy must say the Team leaves active navigation while associated work is retained but unavailable, and that one active Team must remain; do not claim permanent erasure or present Undo. The Confirm accessible name identifies the snapshot Team even if its visible label remains generic.

Keep `deleteError` separate from page-global errors. Map `REVISION_CONFLICT`, `LAST_ACTIVE_TEAM_CONFLICT`, and network/unknown failures to bilingual copy rather than raw server text. Busy uses native-disabled actions, visible localized “Deleting…” status, `aria-busy`, and no stale alert. A synchronous `useRef` guard is set before the request and released after failure; disabled React state alone does not coalesce same-batch confirms. Only an unsuccessful DELETE remains in the modal; after success, close/commit first and hand any refresh failure to Task 5.2 without writing the Team URL. Update `stage0.spec.ts` from native-dialog handling to the real success/child-write-rejection flow; deterministic busy, response-loss, failure, focus, and viewport cases live in the mocked browser spec.

Extend shared `Dialog` so `dismissible={false}` prevents and stops Escape without calling `onClose`, ignores backdrop `mousedown`, and traps Tab/Shift+Tab on the programmatically focusable root when no enabled controls remain. Rendered dialog tests—not the existing source-contract test alone—must prove this behavior.

- [ ] **Step 4: Verify**

Run dialog/Settings/shared-UI/i18n tests, Web and UI typecheck, Web build, mocked browser coverage, and the real-API Stage 0 success/child-write gate when its topology is available. Never persist or log complete CSRF/idempotency values; browser artifacts record only presence/equality.

At 390×844, assert exact document containment; a full-screen/local-scroll dialog with long Team name/key, constraint, alert and reachable actions; real keyboard containment; idle focus return; busy dismissal/repeat blocking; and success focus on the visible Teams heading when the mobile selector remains inside closed navigation. At 1920×1080, assert centered left/right whitespace within 2px, a readable bounded dialog (prefer a small-dialog class no wider than 560px), non-sparse facts/actions, no document overflow, and success focus on the visible desktop selector. Write named narrow/wide screenshots plus sanitized geometry/request JSON for Task 5.6.

**DoD:** Cancel/Escape never mutate; one immutable Team snapshot maps to one revision-specific idempotent DELETE; busy state cannot dismiss, escape focus, or double-submit; failures remain localized inside the modal; committed deletion is never retried because reconciliation failed; success preserves newer route state and lands focus on a visible surviving context at 390 and 1920; and there is no generic settings serialization feature.

### Task 5.5: Explain MCP client choices with accessible client cards

**Files:**
- Create: `apps/web/app/connect/client-picker.tsx`
- Create: `apps/web/app/connect/client-picker.test.tsx`
- Modify: `apps/web/app/connect/page.tsx`
- Create: `apps/web/app/connect/page.test.tsx`
- Modify: `apps/web/app/agent-connections-panel.tsx`
- Modify: `apps/web/app/lib/mcp-onboarding.ts`
- Modify: `apps/web/app/lib/mcp-onboarding.test.ts`
- Modify: `apps/web/app/lib/i18n.tsx`
- Modify: `apps/web/app/lib/i18n.test.ts`
- Modify: `apps/web/app/styles.css`
- Modify: `apps/web/e2e/mcp-onboarding.spec.ts`
- Modify: `apps/web/e2e/connection-diagnostics.spec.ts`
- Create: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/task-5.5-report.md`
- Modify: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/progress.md` only after independent review.

**Interfaces:**
- `ClientPicker({ supportedClients, value, onChange, copy })` accepts the normalized `readonly McpClientType[]` and exposes only that validated discovery subset in its original order.
- Uses existing Phosphor pictograms and text descriptions; no remote brand images, trackers, or new asset license surface.
- `supportedMcpClientTypes(values: readonly unknown[])` preserves discovery order, removes duplicates/unknown runtime values, and never fills missing entries from the global union. An empty normalized set fails closed to the existing unsupported state.
- `mcpClientFacts(type)` is the sole non-secret source for product label, descriptive config label, transport, config-generation rule, and optional stdio command consumed by guide generation, picker, and administrator client options. Config labels are descriptive product labels, not invented OS paths; Pi's generic mathematics pictogram is `aria-hidden` and never presented as an official logo.
- `buildMcpClientGuide(..., copy)` receives locale generators for environment checks, bootstrap checklist, and fallback prose. Both Connect and `AgentConnectionsPanel` consume the same facts/copy; `mcp-onboarding.ts` no longer hardcodes Chinese operational prose.

- [ ] **Step 1: Write RED picker tests**

```tsx
render(<ClientPicker supportedClients={['codex', 'opencode']} value="codex" onChange={onChange} copy={copy} />)
expect(screen.getByRole('radiogroup', { name: copy.mcpClient })).toBeVisible()
fireEvent.click(screen.getByRole('radio', { name: /OpenCode/ }))
expect(onChange).toHaveBeenCalledWith('opencode')
expect(screen.queryByRole('radio', { name: /Pi/ })).not.toBeInTheDocument()
```

Unit-test discovery normalization with reordered duplicates, unknown runtime strings, and an empty result. Connect commits normalized discovery and its first selected client atomically; when Codex is absent, no intermediate/default Codex guide may render. MutationObserver browser evidence must prove the wrong guide never appeared, not merely that the final DOM is correct. An empty normalized set immediately reuses `unsupported_client` with no picker/guide/config and never falls back to Generic. Switching clients clears Config-copied state but retains Link-copied state because the URL is unchanged. Assert bilingual client descriptions, config/fallback/checklist copy, and distinct localized live-region messages for copied config versus copied link.

- [ ] **Step 2: Run RED**

Run the focused test; expect the component to be missing.

- [ ] **Step 3: Implement and integrate**

Replace the select with a named fieldset/native-radio card group describing the real config label and streamable-HTTP/fallback expectations from exported facts. Every radio shares one name, the full label is clickable and at least about 44px high, selected/focus state is not color-only, and existing `TerminalWindowIcon`, `BracketsCurlyIcon`, `PiIcon`, and `PlugsConnectedIcon` are `aria-hidden`; text supplies the accessible name. Render only the normalized discovery subset and compute the first selection from that subset before building a guide. Do not add a dependency for `user-event`; component tests use `fireEvent`, while native Arrow/Space behavior is proven in Chromium.

Keep guide configuration secret-store-backed and generated from one helper. Move checklist/environment/fallback prose to shared bilingual locale copy and update `AgentConnectionsPanel` as the second guide consumer. Make both Connect and administrator `.config-preview` a localized named `role="region"`, `tabIndex={0}` local scroll surface. Preserve the URL fragment byte-for-byte, secret-safety copy, and clipboard behavior; config-client switches trigger no network request and clear only stale Config-copied state. Localized live-region text never exposes internal `config`/`link` enum values.

The secret boundary distinguishes surfaces. On public `/connect`, the one-time pairing fragment exists only in `location.hash` and the user-triggered Copy-link clipboard result; it never enters guide/config/DOM text/requests. The existing authorized administrator create/rotate handoff may continue to render and explicitly copy its one-time pairing URL, but that value never enters ordinary MCP guide/config, request logs, screenshots, traces, or durable evidence. `wmi_` Installation Tokens never enter DOM/config/logs/evidence on either surface. MCP readiness keeps `credentials: 'omit'` and sends neither Cookie nor installation-token header. Tests use only short `#test`; sanitized scanning matches credential-shaped `w(?:mp|mi)_[A-Za-z0-9_-]{16,}` without printing matches.

- [ ] **Step 4: Verify**

Run client-picker, Connect page state, MCP onboarding, i18n and affected Agents tests, full Web tests, typecheck, lint, production build, root `mcp-onboarding` plus `connection-diagnostics` Playwright, and diff-check. The browser topology is a real Next page under the integration/bootstrap project with discovery/info/MCP responses route-mocked; it is not a production browser or live discovery/MCP result. If the dedicated test database/bootstrap environment is absent, Task 5.5 may record that subgate as deferred for Task 5.6, not PASS.

Browser fixtures advertise `['opencode', 'generic_mcp']`; duplicates/unknowns stay unit-only. Codex/Pi are absent throughout mount, OpenCode is atomically selected, real Arrow/Space retains focus, switching guide content makes no extra discovery/info/MCP request, and Config/Link copied states follow their distinct rules. A second empty-normalization fixture shows only unsupported state. The MCP probe returns credential-free 401; request evidence stores only method/count/header-presence/hash-presence booleans. Clipboard assertions return booleans/presence/equality inside the page; traces and fixtures use short `#test`, never a realistic credential canary.

At 390×844 assert both locales in separate cases, exact document containment, shell width no more than about 358px, one-column onboarding/client cards, controls at least 44px, and repeated ArrowRight producing `scrollLeft > 0` inside the focused config preview while the page stays fixed. At 1440×900 and 1920×1080 retain the existing centered shell at `1120±2px` with left/right whitespace difference at most 2px, a two-column onboarding grid, roughly 330–390px client column and 630–700px config column, no card wider than about 360px, and readable wrapped descriptions. The intentional 1120px documentation measure is not treated as a narrow-island bug. Attach `390-zh`, `1440-en`, and `1920-en` screenshots plus both 390-locale and wide sanitized shell/grid/card/preview geometry/request JSON for Task 5.6.

**DoD:** Only normalized server-supported clients render in declared order with an atomic first selection or fail-closed unsupported state; keyboard/radio and both focusable local-scroll consumers work; client changes regenerate one source-of-truth bilingual guide without extra requests; 390/1440/1920 layouts retain deliberate readable density. Public pairing fragments and administrator one-time handoff values stay inside their explicitly authorized ephemeral surfaces; no credential-shaped `wmp_`/`wmi_` value reaches guide/config/requests/logs/screenshots/traces or durable evidence.

### Task 5.6: Phase 5 verification

**Files:**
- Verify only: `apps/web/app/settings/page.test.tsx`
- Verify only: `apps/web/e2e/mocked/settings-workflow-colors.mocked.spec.ts`
- Verify only: `apps/web/e2e/mocked/operations-ux.mocked.spec.ts`
- Verify only: `apps/web/e2e/stage0.spec.ts`
- Verify only: `apps/web/e2e/mcp-onboarding.spec.ts`
- Verify only: `apps/web/e2e/connection-diagnostics.spec.ts`
- Create: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/task-5.6-report.md`
- Modify: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/progress.md`

**Interfaces:**
- Consumes: Tasks 5.1-5.5 tests and browser acceptance criteria.
- Produces: a reviewed Phase 5 PASS or an exact owner-task reopen list.

- [ ] **Step 1: Establish the RED gate**

Create the report with `Status: RED (unverified)` and unchecked entries for every command and browser flow below.

- [ ] **Step 2: Run focused and build checks**

```bash
pnpm --filter @workmesh/ui test
pnpm --filter @workmesh/web exec vitest run app/settings app/connect app/lib/mcp-onboarding.test.ts app/lib/i18n.test.ts
pnpm --filter @workmesh/web test
pnpm --filter @workmesh/web typecheck
pnpm --filter @workmesh/web lint
pnpm --filter @workmesh/web build
pnpm --filter @workmesh/web exec playwright test --config playwright.mocked.config.ts e2e/mocked/settings-workflow-colors.mocked.spec.ts e2e/mocked/operations-ux.mocked.spec.ts
pnpm --filter @workmesh/web exec playwright test --config ../../playwright.config.ts e2e/stage0.spec.ts e2e/mcp-onboarding.spec.ts e2e/connection-diagnostics.spec.ts
git diff --check
```

- [ ] **Step 3: Verify browser flows**

Check Settings deep links/back/forward, second-page/missing/revoked Team handling, Workspace-only team scope and absence of hidden workflow-state requests, preset/custom payloads, delete cancel/failure/repeated-confirm/success focus, and Connect advertised-client radio behavior at 390×844 (zh-CN and en), 1440×900, and 1920×1080. Wide-PC thresholds include Settings main >=85%, content <=1480px, selected panel >=98%, workflow form 720–960px, Dialog <=560px; Connect keeps its 1120±2px source-grounded measure. Run `stage0.spec.ts`, `mcp-onboarding.spec.ts`, and `connection-diagnostics.spec.ts` against a dedicated test database.

- [ ] **Step 4: Implement the gate result**

Write actual output and screenshots to the report/ledger; before any later Playwright run copy stable success evidence to a non-repository directory, record source/copy SHA-256, collected titles, request counts, and geometry, and secret-scan copied config/logs without saving clipboard/header/fragment values. On failure, keep RED and reopen exactly one of Tasks 5.1-5.5; the gate owner changes no product, fixture, or test code.

- [ ] **Step 5: Verify GREEN**

Rerun failed evidence after the owner fix and mark PASS only after every report entry is checked and independent review has P0/P1=0. If `RUN_INTEGRATION=1`, test-named PostgreSQL/Redis, and the dedicated bootstrap token are still unavailable, keep `Status: RED (deferred prerequisites)` and Phase 5 at 5/6; do not label an environment defer as a product failure or a PASS.

**DoD:** Fresh focused/full/UI/type/lint/build checks, mocked Settings/Operations, selected real-topology Stage0/MCP/diagnostics, the four locale/viewport contexts, stable artifact hash/geometry/request evidence, and secret scan all PASS; independent review has P0/P1=0. Only then is Phase 5 complete. No fake scope, fake undo, generic export/import, or unauthorized secret disclosure remains; missing prerequisites keep the gate RED/deferred.

---

# Phase 6 — Cross-cutting polish (Days 13-14)

### Task 6.1: Keyboard interaction state machine and non-conflicting navigation hotkeys

**Files:**
- Create: `apps/web/app/lib/list-interactions.ts`
- Create: `apps/web/app/lib/list-interactions.test.ts`
- Create: `apps/web/app/lib/use-hotkeys.ts`
- Create: `apps/web/app/lib/use-hotkeys.test.ts`
- Create: `apps/web/app/lib/page-hotkeys-mount.tsx`
- Create: `apps/web/app/page-hotkeys.test.tsx`
- Create conditionally: `apps/web/app/lib/shortcut-scope.ts`
- Create conditionally: `apps/web/app/lib/shortcut-scope.test.ts`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/agents/page.tsx`
- Modify: `apps/web/app/agents/agent-registry-card.tsx`
- Modify: `apps/web/app/agents/agent-registry-card.test.tsx`
- Modify: `apps/web/app/operations-content.tsx`
- Modify: `apps/web/app/operations-content.test.tsx`
- Modify: `packages/ui/src/index.tsx`
- Modify: `packages/ui/src/index.test.ts`
- Modify: `apps/web/features/command-center/command-center.tsx`
- Modify: `apps/web/features/command-center/command-center-mount.tsx`
- Modify: `apps/web/features/command-center/integration.test.ts`
- Create: `apps/web/e2e/mocked/page-hotkeys.mocked.spec.ts`
- Create: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/task-6.1-report.md`
- Modify: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/progress.md` only after independent review.

**Interfaces:**
- `nextFocusedId(ids, currentId, direction: -1 | 1): string | null` wraps at list edges.
- `listIntent(event): 'previous' | 'next' | 'peek' | 'escape' | null` maps K/ArrowUp, J/ArrowDown, Space, and Escape. Agent registry has no bulk-selection model, so X is deliberately not invented. Enter remains the native focused-anchor action and is never re-fired by JavaScript.
- `HOTKEY_CHORD_TIMEOUT_MS = 1000`. `useHotkeys({ navigate, getFilterTarget, getLayerOpen })` owns only `g i`, `g a`, `g s`, and unmodified `f`; it resets timed-out/incomplete chords and checks the live modal state at both chord keys. `/` and `Cmd/Ctrl+K` remain the single `GlobalCommandCenter` authority.
- One root `PageHotkeysMount` serves a fail-closed allowlist of authenticated workspace routes. Canonical destinations come from the existing workspace navigation registry: `/?view=my-work`, `/agents`, and `/settings`. Login, Install, Connect, not-found, and any future route not explicitly classified as authenticated workspace disable both page hotkeys and Command Center; those public/static routes must make zero authenticated API requests. Navigating to the current canonical URL is a no-op and ordinary browser history remains authoritative. A small shared `shortcut-scope` classifier may be introduced only if it prevents `PageHotkeysMount` and `CommandCenterMount` from drifting.
- Home/Issues shared `WorkItemFilters`, Agents registry, and Operations expose the same stable `data-hotkey-filter` contract on their one currently visible Search control. Hidden tab/panel searches are never returned or focused; Inbox, Guidance, Sessions, Approvals, Settings, and other no-filter surfaces explicitly no-op. No page reaches through generated DOM structure.
- Task 6.1 owns the shortcut scope, filter hook, Agent list interaction state, Command Center mount guard, its focused tests, task report, and reviewed progress update. It does not change overlay focus containment, which remains Task 6.2.

- [ ] **Step 1: Write RED pure-state tests**

```ts
expect(nextFocusedId(['a', 'b', 'c'], 'c', 1)).toBe('a')
expect(listIntent(key(' '))).toBe('peek')
expect(listIntent(key('Enter'))).toBeNull()
expect(listIntent(key('/', { target: input }))).toBeNull()
expect(listIntent(key('k', { target: textarea }))).toBeNull()
expect(listIntent(key(' ', { target: manageButton }))).toBeNull()
```

The common event predicate rejects `defaultPrevented`, repeat/composition, any modifier for page/list intents, inputs/selects/textareas, `isContentEditable` and every contenteditable variant/ancestor, buttons, links and other interactive descendants. The one declared primary roving Agent anchor is the only list-intent exception. Test timeout at 999/1000ms, unknown second keys, unmount cleanup, modal changes between chord keys, disabled/hidden/disconnected or hidden-panel filter targets, and public/current-route no-ops. The first `g` and an unknown second key are not prevented or swallowed. Route-scope tests enumerate authenticated workspace routes and Login/Install/Connect/not-found plus an unknown future public path; the latter set mounts no page hotkeys or Command Center and records zero authenticated API requests.

- [ ] **Step 2: Write RED page tests**

On Agents, assert J/K and arrows move a roving primary Agent link, Space sets `peekAgentId`, and native Enter follows the exact once-encoded real link without a synthetic click or `preventDefault`. Escape is layered: the Sheet handles/closes Peek and restores focus first; only a later unhandled Escape clears approval selection. Assert focus, approval selection, and opened state can hold different IDs without overwriting each other. Filtering a missing current ID resolves to the first visible Agent; an empty result leaves no roving target. Space on Manage Team Access retains native button behavior and never opens Peek.

- [ ] **Step 3: Run RED**

Run both new unit tests plus Agents tests; expect missing helpers/handlers.

- [ ] **Step 4: Implement**

Give each registry card's primary Agent anchor a stable data marker/ref and roving `tabIndex`; do not misuse `aria-current` merely for keyboard focus. Scope the list listener to `.registry-list` and use `requestAnimationFrame` to focus the next connected visible link. A missing/hidden current ID resolves deterministically to the first visible ID; an empty list returns `null`.

Mount one root hotkey handler and reuse canonical route entries rather than page-local strings. Fail closed until the current pathname is classified as an authenticated workspace route, and give `CommandCenterMount` the same scope decision. Detect an open layer at event time through injectable semantic lookup of `[aria-modal="true"]`; both chord keys and `f` clear/no-op while a layer exists. Unknown/timed chords clear pending state without swallowing the second key. `f` prevents default only when its getter returns the connected, visible, enabled `data-hotkey-filter` inside the active Home/Agents/Operations surface. Do not add a new shortcut-help surface or misuse `aria-keyshortcuts` for sequential chords in this task.

- [ ] **Step 5: Verify command-center ownership**

Make command-center opening obey the same editable/modal guard so `/` or Cmd/Ctrl+K cannot stack a second dialog over an existing modal. Run its integration/registry tests, then cover `/`, Ctrl/Meta+K, editable/interactive targets, repeated/composing events, and live modal guards in unit and mocked browser tests. The existing dedicated integration E2E is additional evidence only when its database/bootstrap topology is available.

At 390×844 and 1920×1080, prove body-level `g i/a/s` exact URLs; `f` focuses only the visible Home/Agents/Operations declared Search; hidden panels and Inbox/Guidance/no-filter pages no-op; input/select/contenteditable/button/link contexts, unknown/timed chords and modal layers preserve URL/focus. Agents J/K/arrows wrap visible Agent links, Space opens Peek, first Escape closes/refocuses and a second can clear Pending selection, Manage-button Space stays native, and Enter reaches exact slash/percent IDs. `/` and Ctrl/Meta+K each open at most one command center on the authenticated allowlist and no-op with zero auth requests on each public/unknown route. Assert no hidden target focus or document overflow at 390, and record the real focus-ring/target geometry plus matching behavior at 1920; wide-page density remains Task 6.5. Save named screenshots and sanitized key/focus/URL JSON.

**DoD:** Authenticated workspace page chords and the one visible Home/Agents/Operations filter are truly root-global; public, not-found, and unknown routes fail closed with no shortcut mount and zero authenticated requests. Agent roving focus, approval selection and opened layers stay independent without invented Agent selection; native Enter/interactive/editable behavior is preserved; timeout/modal/public-route boundaries are deterministic; command-center shortcuts never stack or conflict at 390/1920; and the independently reviewed task report/progress record the fresh evidence.

### Task 6.2: Harden the existing shared Dialog/Sheet focus contract

**Files:**
- Create: `apps/web/app/ui-overlay-contract.test.tsx`
- Modify: `packages/ui/src/index.tsx`
- Modify: `packages/ui/src/index.test.ts`
- Modify: `packages/ui/src/tokens.css`
- Modify: `apps/web/app/styles.css`
- Modify: `apps/web/features/command-center/command-center.tsx`
- Modify: `apps/web/features/command-center/integration.test.ts`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/agent-connections-panel.tsx`
- Modify: `apps/web/app/agents/team-access-drawer.tsx`
- Modify: `apps/web/app/agents/team-access-drawer.test.tsx`
- Modify: `apps/web/app/lib/i18n.tsx`
- Modify: `apps/web/app/lib/i18n.test.ts`
- Create: `apps/web/e2e/mocked/overlay-contract.mocked.spec.ts`
- Create: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/task-6.2-report.md`
- Modify: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/progress.md` only after independent review.

**Interfaces:**
- Reuses and hardens one coordinated overlay protocol around `useOverlayFocus`/`containOverlayKeyboard`; no page-local trap or second overlay framework is created.
- The modal stack contains only Dialog/Sheet layers: only its top layer handles Escape/backdrop/focus containment, background sibling chains are inert while open, escaped focus is returned to the top modal, and nested body/html scroll locks use reference counting and restore prior inline styles/scroll exactly.
- The dismissal stack contains Popover/menu layers: its top layer handles Escape/outside dismissal and focus return, but never applies document inertness, a focus trap, or a body/html scroll lock. A dismissal layer nested in a modal closes before the parent modal; a modal may contain another modal. Command Center opening remains suppressed while any modal is live and is not a supported child-over-Sheet scenario.
- `Dialog`/`Sheet` retain close-button-first default focus and gain an optional tested `initialFocusRef`; Command Center is the explicit search-first consumer. Task 5.4 `dismissible={false}` and zero-enabled-control root fallback remain mandatory prerequisites.
- No `useFocusTrap` hook or page-local overlay is created.

- [ ] **Step 1: Write RED behavioral tests through public components**

```tsx
render(<><button ref={trigger}>Open</button><Dialog open title="Confirm" onClose={onClose}><button>First</button><button>Last</button></Dialog></>)
const close = screen.getByRole('button', { name: /close/i })
expect(close).toHaveFocus()
close.focus()
fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true })
expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
expect(onClose).toHaveBeenCalledTimes(1)
```

Repeat for `Sheet`; test backdrop/inside click, Tab/Shift+Tab wrap, Escape/defaultPrevented, initial-focus override, visible root fallback with zero enabled controls, and focus restoration using `focus()` plus `fireEvent` (the repository does not install `user-event`). Eligible controls exclude hidden, `aria-hidden`, inert, disabled and disconnected nodes and include contenteditable/summary where appropriate. Return focus only to a connected visible enabled trigger; otherwise return to the still-open parent layer, then `#workmesh-main`.

Add nested/StrictMode cases: Dialog in Sheet, and Popover/label menu in Sheet. First Escape/outside dismissal affects only the top dismissal layer and restores focus inside the Sheet; the next Escape closes the Sheet. A child Dialog in Sheet owns focus/inert/lock until it closes; the parent remains locked. Opening Command Center while the Sheet is live is a no-op and never creates a contradictory modal child. Closing one of multiple modal layers must not unlock background scroll or erase pre-existing inert/inline styles. A busy non-dismissible Task 5.4 Dialog traps Tab on root, blocks Escape/backdrop/header close, then restores idle dismissal after failure.

- [ ] **Step 2: Run RED**

Run `app/ui-overlay-contract.test.tsx`; record which public contract assertion fails.

- [ ] **Step 3: Implement the minimal shared-primitive fix**

Patch the coordinated modal/dismissal managers and Dialog/Sheet/Popover/label-menu internals in `packages/ui/src/index.tsx`; consumers only provide initial-focus and localized copy. Maintain stack identity/depth so React bubbling, document listeners, portals and sibling overlays agree on the top modal and top dismissal layer. Respect `event.defaultPrevented`, stop a handled Escape before a parent/document handler, ignore lower backdrops, and redirect `focusin` escape only for the modal stack. Preserve/restore each modal background sibling's prior inert state. Reference-count modal scroll locks and restore the previous body/html inline styles and scroll position exactly; Popover/menu never enters those inert/lock counts.

Add `initialFocusRef` while retaining close-first default; make shared inputs ref-capable if required. Command Center replaces its global-ID/RAF focus with the explicit ref. Preserve `aria-modal`, labelled/described IDs, Task 5.4 busy `dismissible` behavior and a keyboard-visible root focus ring. Use `100dvh`, safe-area insets, contained overscroll and deterministic layer depth; do not let scroll locking shift the 1920px main layout.

Pass localized close labels at the currently English-default Home, Agent Connection and Team Access consumers, and localize Team Access's accessible name. Shared UI accepts copy props and does not import Web i18n. Do not weaken or overwrite Task 5.4's narrow destructive-dialog width/behavior.

- [ ] **Step 4: Verify**

Run public overlay/CommandCenter/consumer/i18n tests, all UI/Web tests and typechecks, lint, build, mocked Chromium, and diff-check. Existing source-string assertions in `packages/ui` are replaced by public behavior rather than implementation spelling. This task begins only after Task 5.4 is accepted.

At 390×844, exercise Agent Peek, Team Access and the busy delete Dialog with real Tab/Shift+Tab, top-layer Escape/backdrop/inside click, programmatic background focus rejection, locked background wheel/scrollY, internally scrollable overlay content, exact document containment and final scroll/focus restoration. At 1920×1080 assert Dialog no wider than 760px (delete no wider than 560px), Sheet no wider than 620px, centered Dialog whitespace within 2px, no main-content horizontal shift when locking, and no document overflow. Save named narrow/wide screenshots plus layer/focus/scroll/geometry JSON; later Phase 6 gates may consume but not replace this evidence.

**DoD:** Dialog/Sheet obey one modal stack while Popover/menu obey a separate dismissal stack with no inertness, focus trap, or scroll lock; nested Escape/outside ordering and focus return are deterministic. Task 5.4 busy safety and Command Center initial focus remain intact, Command Center cannot open above a live Sheet, background focus/scroll cannot escape a modal, localized consumers expose no default English labels, and the independently reviewed report/progress carry fresh 390/1920 containment/restoration evidence.

### Task 6.3: Route page-level failures through the shared toast viewport

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/agents/page.tsx`
- Modify: `apps/web/app/operations-content.tsx`
- Modify: `apps/web/app/settings/page.tsx`
- Create: `apps/web/app/page-outcomes.test.tsx`
- Create: `apps/web/app/agents/page-outcomes.test.tsx`
- Modify: `apps/web/app/operations-content.test.tsx`
- Modify: `apps/web/app/settings/page.test.tsx`
- Modify: `apps/web/app/lib/use-toast.ts`
- Modify: `apps/web/app/lib/use-toast.test.ts`
- Modify: `apps/web/app/lib/toast-viewport.tsx`
- Create: `apps/web/app/lib/toast-viewport.test.tsx`
- Modify: `apps/web/app/lib/i18n.tsx`
- Modify: `apps/web/app/lib/i18n.test.ts`
- Modify: `packages/ui/src/index.tsx`
- Modify: `packages/ui/src/index.test.ts`
- Modify: `packages/ui/src/tokens.css`
- Create: `apps/web/e2e/mocked/toast-outcomes.mocked.spec.ts`
- Create: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/task-6.3-report.md`
- Modify: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/progress.md` only after independent review.

**Interfaces:**
- `useToast().push({ tone: 'error' | 'success' | 'info', title, description, dedupeKey })` receives an explicit transient mutation outcome; dedupe is keyed by the producer rather than inferred from localized text.
- Auth/load/collection failures remain durable `ErrorState`; field validation and recoverable structured conflicts (including 409/revision conflicts) remain in their actionable surface. Only transient mutation success/failure becomes a toast.
- The module store uses `useSyncExternalStore` with one stable frozen empty `getServerSnapshot` so SSR/hydration cannot create referential churn or lose a push before the first effect. `push` captures the current valid `activeElement` internally as `returnFocus`; a same-`dedupeKey` replacement updates content/timer and adopts the latest valid trigger without accepting a caller-supplied node. It owns deterministic reset/dismiss/dedupe/timer cleanup; success/info default to about five seconds, error persists until dismissed, and pointer hover plus focus-within are independent pause reasons.
- `ToastViewport` and shared `Toast` receive localized viewport/dismiss labels. Empty queues render no viewport; the outer region is not live, while each item owns exactly one atomic `status` or `alert`. Module-global state/timers reset between tests.

- [ ] **Step 1: Write RED outcome tests**

Reject or complete an Agent bulk decision, Operations dry run, Settings create/delete success, and a Home page mutation. Assert each allowlisted operation emits exactly one localized toast and its actionable surface stays rendered. Assert load/collection errors, field validation, revision/conflict errors, Team-resolution failures, and modal-local delete failures remain contextual and are never duplicated. A partial bulk result produces one aggregate error, removes successful selection, and retains failed selection.

Test the store directly for push-before-subscribe, two subscribers, stable/frozen server snapshot identity, SSR render plus hydration without warning or lost/duplicate toast, same-key replacement/timer reset/latest-valid-trigger capture, different-key stacking, fake-timer expiry, independent hover and focus-within pause/resume, dismiss, reset, and timer cleanup. Pushing or expiring never moves focus. When a focused toast is manually dismissed, focus moves to the next connected toast close control, then the captured connected/visible/enabled trigger, then `#workmesh-main` as the final fallback; an invalidated origin is skipped rather than focused.

- [ ] **Step 2: Run RED**

Run the affected page tests and `use-toast.test.ts`; expect legacy inline/global error behavior.

- [ ] **Step 3: Implement**

Implement a concurrent-safe external toast store first. Dedupe only by an explicit producer key; every push captures a valid current focus origin, and merging a visible key updates content, restarts its timer, and retains the latest valid origin. Return one frozen empty server snapshot for every SSR read. Success/info auto-dismiss after the frozen duration; errors persist. Track pointer hover and focus-within as separate pause flags and resume the exact remaining duration only after both clear. Reset clears state, captured origins, and every timer while notifying subscribers.

Make the viewport the fixed grid stack and each shared Toast statically positioned: viewport `pointer-events:none`, items `pointer-events:auto`, bounded width/height, safe-area inset, and local vertical overflow. Shared UI receives all visible/a11y copy from Web and never imports application i18n. Close buttons have unique accessible names derived from the toast title. Do not nest live regions.

Then split collection/load errors from mutations in each producer and migrate an explicit allowlist only. Home bootstrap/open GET and WorkSurface/detail conflicts remain durable/contextual; page-level create/update success may toast, and any post-commit refresh failure remains separate. Agents collection, Team Access, Connection mutation/revision, approval 409 and partial-failure detail stay in their current actionable surfaces; a successful bulk outcome may toast without Undo. Operations feature/usage/collection errors and If-Match conflicts remain inline; dry-run/non-conflict mutation outcomes may toast. Settings Team resolution/collection, form 400, update 409 and Task 5.4 delete failure stay contextual; delete success may toast, and Task 5.3's old success status must be removed if replaced so it is not announced twice. Never display raw backend `Error.message` as a supposedly bilingual toast.

- [ ] **Step 4: Verify**

Run store/viewport/producer/shared-UI/i18n tests, full UI/Web tests, UI/Web typecheck, lint, build, mocked Chromium, and diff-check.

The browser spec uses broad `**/api/v1/**` route fixtures and proves three simultaneous long bilingual toasts stack without overlap, local-scroll when bounded, retain reachable unique close controls, pause/resume correctly, and never steal focus on push/expiry. At 390×844 keep at least 16px side inset, width no greater than viewport minus 32px, bounded height, and exact document containment. At 1920×1080 keep the stack around a 420px maximum rather than a full-width banner. Record non-intersecting item rects, viewport/document geometry, focus transitions, named screenshots, and sanitized request data.

**DoD:** A concurrent-safe, deterministic toast store cannot lose pre-subscription pushes or hydrate from an unstable server snapshot; dedupe adopts the latest valid captured trigger, hover/focus pauses compose independently, and dismissal follows next-toast → origin → main focus fallback. Each allowlisted mutation outcome is announced exactly once in bilingual copy; load/validation/conflict surfaces remain contextual; stacked 390/1920 layouts are usable without document overflow; destructive/durable outcomes offer no fake inverse action; and the independently reviewed task report/progress match the evidence.

### Task 6.4: Shared skeletons for authenticated collection loading

**Files:**
- Modify: `apps/web/app/lib/pagination.tsx`
- Create: `apps/web/app/lib/pagination.test.tsx`
- Modify: `apps/web/app/loading.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/features/work-items/work-surfaces.tsx`
- Create: `apps/web/features/work-items/work-surfaces-loading.test.tsx`
- Modify: `apps/web/app/agents/page.tsx`
- Modify: `apps/web/app/agent-connections-panel.tsx`
- Modify: `apps/web/app/operations-content.tsx`
- Modify: `apps/web/app/settings/page.tsx`
- Modify: `apps/web/app/lib/skeleton-list.tsx`
- Modify: `apps/web/app/lib/skeleton-list.test.tsx`
- Modify: `apps/web/app/page-outcomes.test.tsx`
- Modify: `apps/web/app/agents/page-outcomes.test.tsx`
- Modify: `apps/web/app/operations-content.test.tsx`
- Modify: `apps/web/app/settings/page.test.tsx`
- Modify: `apps/web/app/lib/i18n.tsx`
- Modify: `apps/web/app/lib/i18n.test.ts`
- Modify: `apps/web/app/styles.css`
- Create: `apps/web/e2e/mocked/loading-states.mocked.spec.ts`
- Create: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/task-6.4-report.md`
- Modify: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/progress.md` only after independent review.

**Interfaces:**
- `usePagedApiList` exposes scope-aware `initialized`: false on a new non-null path/limit scope, true only after a successful response including an explicitly optional 404/empty, unchanged during same-scope refresh/load-more, and never inferred from `nextCursor === null`, `error`, or `path === null`. A null path means no authorized/requestable collection, not a successful empty collection.
- Clarifies the Web-local component as `SkeletonList({ items, columns, label })`: `items` is the total decorative cell count and `columns` the maximum grid columns. Its container is the only `role="status"`/`aria-busy="true"` owner with a localized label; cells are `aria-hidden` and never create N+1 live regions. `AsyncStateSurface` is not treated as a child-bearing layout component.
- Initial loading uses explicit request/resolution state, never `loading && items.length === 0` alone. Same-scope refresh retains authorized rows/focus and marks the stable section busy; a path/Team/query authority change still clears stale data.

- [ ] **Step 1: Write RED loading tests**

For each page and active collection, exercise the complete state matrix. New-scope pending (`initialized=false`, request pending) renders a stable non-empty skeleton geometry with exactly one named busy/status owner and no fake zero/empty copy. New-scope failure renders only the durable error, not a skeleton plus error or a false empty state. Success, an explicitly optional 404, and a real empty response set `initialized=true`. Same-scope refresh preserves the existing DOM and focus while busy; a refresh failure preserves authorized content, adds the contextual error, and clears busy. A path/Team/query scope change immediately revokes stale rows, aborts or ignores the old request, and prevents its late result from repopulating the new scope. `path=null` is asserted separately and never passes through resolved-empty UI.

- [ ] **Step 2: Run RED**

Run the four page loading tests; record which pages still render plain text/empty space.

- [ ] **Step 3: Implement**

Add the shared initialized state and explicit pending/error/refresh/scope tokens before page rendering changes. Home must gate the real `WorkSurfaces` collection rather than hard-code `loading:false` into its view model, preserve retained actor/team content during background refresh, and wait for both Team authorities before deciding “no Team.” Agents gate summary/active Registry/Sessions/Pending/History and Connection surfaces independently so pending data cannot render fake 0/no-results; retained actor refresh does not unmount AppShell. Settings waits for Task 5.2's resolution state: only `pending` uses a Team skeleton, resolved Team owns its separate States initialization, and unavailable/blocked/empty remain explicit outcomes. Operations preserves feature authorization and Task 4.1 anchor/focus ownership; Usage `pending|ready` and the six paged panels use their real state models, while a refresh keeps ready metrics/rows and exposes aggregated polite busy feedback. Every owner aborts or invalidates an old-scope request before clearing authority; late responses are ignored.

Make route `loading.tsx` use the same localized skeleton contract, while recognizing it covers Next navigation/Suspense rather than client API requests. Remove SkeletonList's inline grid so CSS can use `repeat(var(--columns), minmax(0, 1fr))`; cells fill their panel (`width:100%; min-width:0; max-width:none`). Match each skeleton to the resolved layout instead of forcing a generic 4×2 shape: single-column Agent lists stay single-column until Task 6.5 changes real layout, Settings uses its real two-half/one-full card geometry, and every 390px region collapses without overflow. Do not add arbitrary anti-flicker timers, fake data, `inert`, or loading authority to `packages/ui`.

- [ ] **Step 4: Verify**

Run pagination/skeleton/WorkSurfaces/page/i18n focused tests, full Web tests, typecheck, lint, build, mocked Chromium, and diff-check. Update existing PagedCollection mocks for `initialized` explicitly; this task starts only after Task 6.3 and Task 5.2 are accepted.

The mocked spec defers real client requests and proves every matrix row—new pending, new failure, successful/optional-404 empty, initialized same-scope refresh success/failure, authority change with late old response, and `path=null`—for Home, each active Agents surface, Settings resolution/States, and Operations Usage/paged panels. During refresh, focus a real row/link/control and assert the same node remains connected and active; a refresh failure retains it, exposes the error, and clears busy. Scope change immediately clears old data and a late response cannot restore it. Operations uses one aggregate polite refresh status rather than six live announcements. At 390×844 assert computed one-column containment and no focusable skeleton. At 1920×1080 record viewport/main/panel/cell rects and require skeleton column count/width to match each resolved surface; cells may not remain capped at the old 224px narrow island. Named narrow/wide screenshots and geometry JSON supplement these state assertions.

**DoD:** Every owned collection passes the explicit pending/failure/success-or-optional-404/refresh/scope-change/null-path matrix; skeletons have one localized busy owner and resolved-layout geometry. No fake zero/empty flash, stale-authority leak, late-response repopulation, or focus loss occurs; initialized refresh failure preserves authorized content plus contextual error and clears busy; 390/1920 evidence proves containment/density; and the independently reviewed task report/progress match the fresh results.

### Task 6.5: Responsive reflow and reduced-motion recovery

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/page.test.tsx`
- Modify: `apps/web/app/styles.css`
- Modify: `packages/ui/src/tokens.css`
- Modify: `packages/ui/src/index.test.ts`
- Modify: `apps/web/app/ui-layout-contract.test.ts`
- Modify: `apps/web/e2e/human-reflow.spec.ts`
- Modify: `apps/web/playwright.mocked.config.ts`
- Modify: `apps/web/e2e/mocked/loading-states.mocked.spec.ts` only to update the accepted 1920 Usage geometry from the Task 6.4 five-column loading baseline to Task 6.5's four-column/two-row responsive contract.
- Create: `apps/web/e2e/mocked/agents-responsive.mocked.spec.ts`
- Create: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/task-6.5-report.md`
- Modify: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/progress.md` only after independent review.

**Interfaces:**
- Reuses AppShell's existing mobile navigation; no second sidebar/off-canvas implementation.
- Preserves the documented 320px minimum and existing 760/761 shell boundary; tested viewports are 320×800, 375×812, 390×844, 768×1024, 1440×1000, and 1920×1080, plus focused 760/761 boundary assertions.
- The document itself has no horizontal overflow. Dense tables and the project strip may scroll only inside a labeled, focusable local wrapper whose real keyboard scroll movement is asserted.
- At 1920×1080 the geometry denominator is `.app-workspace`, not the viewport or an already-full `.app-content`: the standard content rectangle consumes 85-90% of `.app-workspace` with left/right margins within 2px, and the current Settings panel consumes at least 98% of its content inner width. Accepted readable exceptions remain explicit: Runs is `1120±2px` with all six columns visible, WorkItem detail is `1180±2px` centered, and Usage covers at least 85% of its root with 200-289px cards in 2-3 rows. No sparse slab or accidental half-screen island is accepted.
- Mocked specs intercept `**/api/v1/**` rather than hard-coding 3100/3101 or a fixed CORS origin. Deterministic Agents fixtures include non-empty Pending data and Operations uses canonical feature records so Runs is mounted.
- `playwright.mocked.config.ts` must explicitly collect both `mocked/**/*.mocked.spec.ts` and portable `human-reflow.spec.ts`; root Playwright must continue to exclude mocked specs. Stage 1 is run only with its dedicated test database/Redis/bootstrap topology, otherwise recorded as deferred rather than PASS.
- Task 6.5 explicitly supersedes only the 1920 Usage column-count assertion in Task 6.4's loading-state spec; all loading authority, request, transition, and other viewport assertions remain unchanged.

- [ ] **Step 1: Lock the audit regressions in RED E2E tests**

First add collection-topology tests and run `--list`: mocked config must collect portable human reflow plus Agents responsive, while root config excludes every `mocked/**/*.mocked.spec.ts`. Parameterize each viewport as a separately named test so evidence is attributable.

Cover Issues filter/card density, non-empty Agents Pending, Settings forms, enabled Operations Runs, WorkItem detail, and the named project-strip region. Existing post-Phase-3 Approvals document containment is a regression guard, not a presumed RED. Task 6.5 owns the project-strip behavior in `app/page.tsx`: lock a localized named wrapper with `tabIndex={0}`, `display:flex`, `flex-wrap:nowrap`, bounded local overflow, fixed-size children, region containment, `scrollWidth > clientWidth`, and real ArrowLeft/ArrowRight `scrollLeft` movement on narrow viewports; do not demand overflow on wide screens. Add a targeted page test for its accessible name, focusability, handled keys, and preservation of ordinary child-link activation. Record fresh measured failures for Issues or any other surface before changing it.

For every viewport attach named screenshots and sanitized geometry JSON for document/body/shell/main/dominant surface and local wrappers. Browser screenshots supplement, and never replace, rectangle/scroll/focus assertions.

- [ ] **Step 2: Run RED**

Run portable `human-reflow.spec.ts` plus `e2e/mocked/agents-responsive.mocked.spec.ts` with mocked config. Expected RED must come from the fresh run; currently known targets are the project-strip local-scroll contract, reduced-motion `animationName`, and measured sub-40px primary mobile hit targets. Do not cite the pre-Phase-3 Issues/Approvals screenshots as current failures.

- [ ] **Step 3: Implement exact breakpoints**

Keep the repository's existing breakpoints; do not globally rewrite them to a new 640/960/1280 system. Add only narrow selectors required by fresh failures. Make `.project-strip` a no-wrap flex row with a contained inline scroll and `flex: 0 0 auto` children, plus the explicit focus/Arrow scroll behavior above. Stack filters, retain approved internal-scroll table regions or labelled mobile cards, and constrain code/URLs with `overflow-wrap:anywhere`. Primary discrete mobile controls—buttons, form fields, tabs/selectors, summaries, and checkbox labels—must expose at least 40×40px hit rectangles; inline text links, compact status pills, and the pointer-only/aria-hidden board resize affordance are not misreported as equivalent touch controls. Keep AppShell's current mobile navigation. At both 760 and 761 assert exactly one navigation mode, a positive main width fully contained between viewport edges, and a real primary control reachable by Tab with its complete rectangle inside the viewport.

- [ ] **Step 4: Add reduced-motion fallback**

The two current animation owners are shared `.wm-skeleton` and app `.work-surface-stale`; the stale selector must use the real class name. Under `@media (prefers-reduced-motion: reduce)`, set both and all newly added non-essential animation to `animation: none !important` while preserving their status text/marker without motion. Add shared UI and app contract coverage. In Chromium, exercise a real Task 6.4 Skeleton and a real same-scope stale refresh after Task 6.4 is accepted, use `page.emulateMedia({ reducedMotion: 'reduce' })`, and require computed `animationName === 'none'`; a synthetic class-only probe must be labeled as a weaker seam rather than full product proof.

- [ ] **Step 5: Verify**

Run the Home/project-strip focused test, shared UI focused tests, Web layout contract, portable human reflow and Agents responsive mocked specs, the existing Operations UX mocked spec, full Web tests, UI/Web typecheck, Web lint/build, and diff-check. Record `--list` collection counts, every declared viewport, 760/761 single-navigation/main-width/primary-control results, reduced-motion computed styles, local scroll movement, primary touch rectangles, and wide-PC `.app-workspace`/content/panel/grid/table geometry with numeric ratios and left/right margin difference. Stage 1 runs only after the dedicated topology preflight passes; otherwise record the exact defer.

**DoD:** At 320/375/390/768/1440/1920 the document remains contained; 760/761 preserve exactly one shell navigation mode, contained positive-width main, and a Tab-reachable primary control. Approved dense regions and the project strip scroll only inside labeled focusable wrappers with demonstrated Arrow movement. Standard wide content consumes 85-90% of `.app-workspace` with symmetric margins, Settings panel is at least 98% of its inner width, Runs (`1120±2px`) and WorkItem detail (`1180±2px`) retain readable bounds, and no sparse slab or accidental half-screen island is accepted. Primary discrete mobile controls are at least 40×40px and no responsive CSS hides or clips an existing keyboard path; the complete keyboard/semantic audit remains Task 6.6. Under reduced motion, both WorkSurface stale pulse and Skeleton report `animationName === 'none'` while their non-motion state remains perceivable.

### Task 6.6: Accessibility keyboard and semantic audit gate

**Files:**
- Create: `apps/web/e2e/mocked/accessibility-keyboard.mocked.spec.ts`
- Create: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/task-6.6-report.md`
- Modify: `apps/web/e2e/project-work-preview-server.mjs` only when a deterministic scenario/reset endpoint is preferable to a spec-local strict route installer.
- Modify conditionally for concrete semantic failures: `packages/ui/src/index.tsx`, `packages/ui/src/index.test.ts`, `packages/ui/src/tokens.css`, `apps/web/app/agents/team-access-drawer.tsx`, `apps/web/app/agents/team-access-drawer.test.tsx`, `apps/web/app/connect/page.tsx`, `apps/web/app/operations/page.tsx`, `apps/web/app/login/page.tsx`, `apps/web/app/install/page.tsx`, `apps/web/app/lib/i18n.tsx`, `apps/web/app/lib/i18n.test.ts`, and `apps/web/app/styles.css`.
- Modify: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/progress.md` only after independent review.

**Interfaces:**
- Uses existing Playwright and Testing Library; this is explicitly a keyboard/semantic gate, not an axe or automated WCAG conformance claim.
- Starts only after the Phase 5 gate and Tasks 6.1-6.5 are independently accepted. Before this gate, rerun their owner browser specs rather than auditing stale implementations.
- Audits Home/Issues, WorkItem detail, Agents and Agent/Session deep links, Settings/Operations, Connect, and public Login/Install semantic smoke. The mock must enable Operations features so real content, not a disabled placeholder, is exercised.
- The deterministic fixture must provide canonical `{ key, tier, enabled }` feature records; non-empty Operations collections with a valid UUID run/session link; query-aware Pending and one exact terminal History status; at least two Agents plus detail; Connect discovery/info and MCP `401`. Each journey fails on any unexpected API `404`/`5xx`. Prefer a spec-local strict route installer, or an explicit scenario/reset API; do not mutate the server's global default into an order-dependent all-enabled state.
- The authenticated shortcut contract is: only a non-editable target with no live layer may open exactly one command center via `/` or Ctrl/Meta+K. Editable/interactive targets, IME composition, repeat events, or an existing modal must not open or stack one. Public Login/Install/Connect disable both page hotkeys and the command center; if that product choice changes, the alternative must remain static-only and prove it never requests or displays authenticated resources.
- This gate owns the cross-page spec, audit-only fixtures, report/progress, and only the listed small semantic/focus repairs. A shortcut/scope failure reopens 6.1; modal/dismissal/focus containment reopens 6.2; toast/return-focus reopens 6.3; loading/state authority reopens 6.4; responsive geometry/project-strip/reduced-motion reopens 6.5. Task 6.6 conditionally owns a Team Access tab-semantic repair proved by this audit; it does not absorb any other owner implementation.

- [ ] **Step 1: Write RED keyboard journeys**

Use real Tab/Shift+Tab rather than `.focus()`: the skip link must enter the viewport and Enter must leave `document.activeElement === #workmesh-main` with a visible focus or accepted scroll cue. Every ready route has one `main` and exactly one visible page `h1`; the AppShell brand is not a second heading. Settings with embedded Operations has a Settings `h1` plus Operations `h2`. Login/Install/Connect have their own `h1`, localized skip labels, and a valid `#workmesh-main`.

For every visible control assert an accessible name. Resolve every `aria-labelledby`/`aria-describedby`/`aria-controls` token to one unique connected ID, reject duplicate IDs and nested interactive content except native `label > input`. Desktop shared Tabs have one selected/tabIndex-0 tab per tablist and pass Arrow/Home/End; Agents' nested tablists and Team Access tabs are checked independently. Team Access must either reuse shared `Tabs` or implement the complete equivalent contract: `role=tablist`, one `aria-selected=true`/`tabIndex=0` tab, resolvable `aria-controls`/tabpanel labelling, roving focus, ArrowLeft/ArrowRight/Home/End, and no duplicate interactive nesting. At 390px, each corresponding compact instance has no tablist, one distinctly named select, and each tabpanel has a resolvable accessible name.

Use non-empty Pending, History, and Runs fixtures and assert native table/header/cell/link/error-description semantics. At 390px their focusable local scroll wrappers must have `scrollWidth > clientWidth`, visibly receive focus, change `scrollLeft` under keyboard input, and leave `document.scrollWidth === document.clientWidth`. Cards expose title/project/status as separate perceivable fields and contain no nested interactive controls.

The 1920×1080 English journey covers Home skip/h1/landmarks/filters and WorkItem detail Sheet/Tabs/Escape focus restore; Agents desktop Tabs, Pending/History, J/K, Space Peek, Team Access, and modal shortcut suppression; Settings Workspace labels/delete-dialog cancel and focus restore, embedded Operations heading levels, standalone Runs caption/six columns/error description/Session link; and Connect skip/h1/client picker/config region with the frozen public-shortcut policy. The 390×844 Chinese journey repeats structural smoke, mobile navigation focus, compact selectors, local table scrolling, top-layer Escape/restore, focus-visible-in-viewport, and document containment. Agent/Session detail routes receive a smaller semantic smoke.

- [ ] **Step 2: Run the spec and classify failures**

```bash
pnpm --filter @workmesh/web exec playwright test --config playwright.mocked.config.ts e2e/mocked/accessibility-keyboard.mocked.spec.ts
```

Record each failing selector and interaction in the task report before code changes.

- [ ] **Step 3: Implement only evidenced fixes**

Prefer semantic HTML and shared primitives. Replace the AppShell brand `h1` with non-heading emphasis and retain one real page `h1`; update its shared test and selector. Add the Connect skip target and localized labels, repair Team Access tabs through shared Tabs or the complete contract above, and repair Login/Install/standalone Operations headings/labels only if RED proves the current gaps. Do not add ARIA roles to replace native links/buttons/tables. Add `aria-live` only to async status regions, never to entire pages. Do not claim contrast verification unless a narrow computed foreground/background ratio and threshold is implemented; screenshots alone are not contrast evidence.

- [ ] **Step 4: Verify**

First rerun the accepted owner specs for page hotkeys, overlay contract, toast outcomes, loading states, human reflow, Agents responsive behavior, and Phase 5. Run `--list` to record collected audit cases, then run the focused mocked spec at 1920×1080 and 390×844. Save named success screenshots and sanitized JSON containing only roles/names/tags, heading/main/tab counts, ARIA-reference results, focus rectangles, and width geometry—never fragment, clipboard, or generated config values. Then run Web tests/typecheck/lint/build, UI tests/typecheck when shared UI changes, and `git diff --check`.

**DoD:** The documented desktop and phone keyboard journeys pass with exact main/heading/tab/table/focus/ARIA assertions; no duplicate focus trap, duplicate ID, unresolved ARIA reference, unexpected API error, or nested-interactive pattern remains. The report records base SHA/dirty boundary, collected/test counts, journey map, owner-task reopen decisions, viewport geometry, stable artifact paths, and the mocked-Next-dev versus production-build boundary. It explicitly does not claim WCAG conformance, axe, screen-reader, forced-colors, browser, or zoom coverage that was not run.

### Task 6.7: Local i18n completeness check for both locales

**Files:**
- Create: `apps/web/scripts/check-i18n.mjs`
- Create: `apps/web/scripts/check-i18n.test.mjs`
- Create: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/task-6.7-report.md`
- Modify: `apps/web/package.json`
- Modify: `apps/web/app/lib/i18n.tsx` only for missing/empty values or inaccurate fallback/inventory comments found by the check.
- Modify: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/progress.md` only after independent review.

**Interfaces:**
- Adds `pnpm --filter @workmesh/web check:i18n`.
- Starts after Task 6.6 so both tasks never edit `i18n.tsx` concurrently. Non-i18n call-site defects reopen their owning feature task rather than giving this gate a broad shared-component owner.
- The script uses the installed TypeScript compiler API. Its CLI creates a `ts.Program` from `apps/web/tsconfig.json`, uses the type checker to resolve imported `WorkItemCopy`, `WorkSurfaceCopy`, and `WorkItemDetailCopy` properties, and passes those exact contracts to a pure `checkSources` function. This is required to detect the case where both locale sides omit the same Partial property.
- `checkSources({ i18nSource, componentSources, copyContracts })` returns `{ ok, exitCode, diagnostics }`, where diagnostics are `{ severity, code, path, line, column, message }` sorted by normalized repo-relative POSIX path, line, column, and code. It compares `TranslationKey` with both flat `messages`, verifies every production literal `t('key')`, recursively checks object shape/leaf type/non-whitespace values for locale tables, and enforces exact Partial omission allowlists including stale-entry failure.
- Enumerate every top-level `Record<Locale, ...>` rather than only names ending in `Copies`; this includes `messages`, all object-copy tables, and `projectDeliveryHealthLabels`. An unknown locale table fails closed.
- Production UI copy is also an AST gate: scan visible JSX text and string/template literals in `aria-label`, `title`, `placeholder`, and `alt` under `apps/web/app` and `apps/web/features`. A nonlocalized UI literal fails unless an exact allowlist entry matches normalized POSIX path, AST kind, and literal; an unmatched or stale allowlist entry fails. Test-only files, data IDs, class names, URLs, protocol/status identifiers, and punctuation-only text are classified structurally rather than through a broad path exemption.
- Translator-call discovery uses the TypeScript checker and follows imported aliases, member access, destructured hooks, and injected translator parameters; renaming the local function cannot evade the check. Locale object leaves may be non-empty strings or type-compatible generator functions where the declared Copy contract requires a function; a string leaf is always non-whitespace, and function/string shape mismatches fail.
- Dynamic translator calls, spread, computed/duplicate keys, shorthand/method syntax unsupported by the declared contract, parse errors, unknown locale tables, and unsupported shapes are diagnostics that make the default CLI exit 1. Only explicit exact allowlists can discharge a Partial omission or justified UI literal. In current semantics, only an omitted Partial property falls back through downstream merge; an empty or whitespace string never falls back and always fails.

- [ ] **Step 1: Write RED script fixtures**

Create in-memory fixtures for flat-locale missing and extra keys in both directions; unknown literal and dynamic translator calls; imported alias, member-access, destructured, and injected translator resolution; top-level and nested Copy mismatch; valid function leaves plus function/string mismatches; empty and whitespace strings; visible JSX text and each UI-facing attribute; exact accepted and rejected/stale hardcoded-copy allowlists; a Partial key omitted by both sides without permission; a permitted bilateral omission; a unilateral omission even when allowlisted; stale Partial allowlist; spread/computed/duplicate key; stable multiple-diagnostic sorting; and one valid pair. Assert exact codes/paths/lines/columns and exit 1 for every unproved fixture, exit 0 only for the valid fixture.

- [ ] **Step 2: Run RED**

Run `node --test apps/web/scripts/check-i18n.test.mjs`; expect the checker module to be missing.

- [ ] **Step 3: Implement AST checks**

Do not use a regex-only parser. Export the pure checker above, while the CLI adapter derives `apps/web` and repo root from `fileURLToPath(import.meta.url)`, builds a typed Program, extracts the three imported Partial contracts, and walks production `.ts/.tsx` under `apps/web/app` and `apps/web/features` in sorted order while excluding test/spec files. Use checker-resolved symbols/signatures to cover aliases, member calls and injected translator parameters such as `workspace-navigation.tsx`; walk JSX nodes for hardcoded visible/accessible copy. Exact copy/Partial allowlists are data inputs with stale-entry diagnostics, never directory-wide suppressions. Use `pathToFileURL(resolve(process.argv[1])).href === import.meta.url` for direct execution and set `process.exitCode` rather than calling `process.exit()`.

- [ ] **Step 4: Wire and Verify locally**

```bash
node --test apps/web/scripts/check-i18n.test.mjs
node apps/web/scripts/check-i18n.mjs
pnpm --filter @workmesh/web check:i18n
pnpm --filter @workmesh/web typecheck

# From apps/web, proving caller-cwd independence:
node scripts/check-i18n.mjs
pnpm check:i18n

git diff --check
```

**DoD:** Every locale table is recognized; flat dictionaries exactly equal `TranslationKey`; checker-resolved alias/member/destructured/injected translator calls resolve; visible JSX and UI-facing attributes have no unallowlisted hardcoded copy. Copy objects are recursively shape-equal with non-empty strings and contract-compatible function leaves; Partial/copy allowlists are exact and non-stale; no unallowed dynamic call or unsupported AST remains. Valid input exits 0 and every unproved input exits 1 from both repo and package cwd. A fresh independently reviewed Task 6.7 report records inventory/counts, diagnostics, command output, and the no-GitHub-CI boundary.

### Task 6.8: Phase 6 verification

**Files:**
- Create: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/task-6.8-report.md`
- Modify: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/progress.md`

**Interfaces:**
- Consumes: Tasks 6.1-6.7 unit, build, keyboard, responsive, reduced-motion, and locale evidence.
- Produces: a reviewed Phase 6 PASS or exact owner-task reopen list.
- Gate ownership is verification/report/progress only. Task 6.8 changes no product, fixture, config, or test code and runs serially after 6.1→6.7 have independent acceptance. If the Phase 5 real-topology gate is still RED/deferred, Phase 6 remains RED/deferred even when mocked cross-cutting checks pass.

- [ ] **Step 1: Establish the RED gate**

Create the report with `Status: RED (unverified)` and unchecked entries for every command, viewport, shortcut, and reduced-motion assertion.

- [ ] **Step 2: Run cross-cutting unit gates**

```bash
pnpm --filter @workmesh/ui test
pnpm --filter @workmesh/ui typecheck
pnpm --filter @workmesh/ui lint
pnpm --filter @workmesh/web check:i18n
pnpm --filter @workmesh/web test
pnpm --filter @workmesh/web typecheck
pnpm --filter @workmesh/web lint
pnpm --filter @workmesh/web build
git diff --check
```

- [ ] **Step 3: Run keyboard/responsive E2E**

First run `--list`, then freshly run all accepted owner browser specs: `page-hotkeys.mocked.spec.ts`, `overlay-contract.mocked.spec.ts`, `toast-outcomes.mocked.spec.ts`, `loading-states.mocked.spec.ts`, `agents-responsive.mocked.spec.ts`, `accessibility-keyboard.mocked.spec.ts`, portable `human-reflow.spec.ts`, and `operations-ux.mocked.spec.ts`. Record exact collection/run counts per file and execute every named 320/375/390/760/761/768/1440/1920 case its owner declares, with deterministic Operations/Approvals fixtures and command-center `/` plus Cmd/Ctrl+K assertions. Capture explicit success screenshots; Playwright's failure-only screenshot setting is not completion evidence. Geometry JSON must contain the numeric viewport/document/workspace/content/panel/grid/table/control rectangles and ratios, 760/761 navigation/focus results, local scroll movement, and reduced-motion computed styles. Wide-PC evidence includes a short density/whitespace judgment backed by those measurements.

- [ ] **Step 4: Implement the gate result**

Include actual fresh command/spec counts, per-case viewport dimensions, screenshot/geometry paths, reduced-motion result, Phase 5 topology status, and any remaining browser-specific limitation. On failure, keep RED and reopen exactly one of Tasks 6.1-6.7; the gate owner changes no product, fixture, config, or test code.

- [ ] **Step 5: Verify GREEN**

Rerun each failed check after the owner fix and mark PASS only after every listed owner spec, UI/Web test/typecheck/lint, `check:i18n`, production build, and diff-check is fresh and the report/ledger contain matching counts and evidence. Missing real-topology prerequisites inherited from Phase 5 keep `Status: RED (deferred prerequisites)` rather than being silently replaced by mocked evidence.

**DoD:** Phase 6 has fresh reviewed evidence for every named owner spec and declared viewport, UI/Web tests/typechecks/lints, `check:i18n`, production build, diff-check, geometry, reduced motion, keyboard/semantic scope, and the Phase 5 real-topology prerequisite. Report and progress match exactly, P0/P1=0, and no required gate is skipped, stale, or described only as manual confidence; an unavailable real topology keeps Phase 6 RED/deferred.

---

# Phase 7 — Verification & Wrap-up (Day 15)

### Task 7.1: End-to-end coverage of the completed interaction model

**Files:**
- Create: `apps/web/e2e/mocked/mock-control.ts`
- Create: `apps/web/e2e/mocked/agents-interactions.mocked.spec.ts`
- Create: `apps/web/e2e/mocked/operations-settings.mocked.spec.ts`
- Create: `apps/web/e2e/mocked/command-center-routes.mocked.spec.ts`
- Create: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/task-7.1-report.md`
- Modify: `apps/web/e2e/project-work-preview-server.mjs` only to add deterministic, non-secret test-control scenarios.
- Modify: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/progress.md` only after independent review.

**Interfaces:**
- Uses `playwright.mocked.config.ts` and existing mock-server conventions.
- Mock-only files live under `e2e/mocked/` and match `*.mocked.spec.ts`; root `pnpm test:e2e` excludes them while mocked config includes them.
- This gate owns only the mock-control helper/server and the three cross-component journeys. A product behavior failure reopens its exact owner in Tasks 3.5/3.6, 5.2-5.4, 6.1, or 6.2 rather than being redesigned here.
- The loopback-only mock control plane exposes `POST /__test/reset` with an explicit scenario and `GET /__test/requests`. Every `beforeEach` resets fixed IDs, clock, ordering, cursors, mutations, and request evidence, then asserts the request list/count is exactly zero; every `afterEach` restores the server-global scenario to `default` so file order cannot leak state into existing specs.
- Sanitized request evidence contains only method/path/status/cursor/limit, presence of an idempotency key, and a server-assigned equivalence-group number. It never returns CSRF, Cookie, Authorization, a full Idempotency-Key, fragments, clipboard/config values, or payload secrets.
- Scenarios include `agents-interactions`, `settings-workspace`, `settings-delete-failure`, `settings-delete-retry`, `command-center`, and the Task 7.2-owned `large-list`. Only `large-list` enforces Issues/Agents `limit=100`; `command-center` accepts its real `limit=50` queries.
- Mutation ledger semantics are exact: same key/equivalent payload replays the same response without a second commit; same key/different payload returns `409 IDEMPOTENCY_KEY_REUSED`. UI retry uses a deterministic first `503`, second success under the same server equivalence group; a separate credential-free direct fixture proves replay/conflict behavior.
- Fixtures contain active/inactive Agents, pending/approved/rejected Approvals, canonical feature records, Operations rows, multiple Settings teams, stable opaque cursors, and no production or credential-like values.

- [ ] **Step 1: Write Agents journey**

Cover only the cross-component Agents closure not already owned by Phase 3/6 units: exact URL-restored outer/inner tabs and filters, mixed-status Pending defense, one exact terminal History result, read-only History, Space Peek, and Team Access as an independent layer. Focus, selected approval, Peek, and Team Access IDs stay independent. Where a real permitted dismissal child exists inside Team Access, first Escape closes that child and the next closes/refocuses the Sheet; Command Center is suppressed while the modal lives and is never used to manufacture a second layer. Native Enter follows the once-encoded stable Agent link and browser Back restores the exact prior list URL and focus context.

For bulk retry, the first UI request deterministically returns 503 and the same logical retry succeeds under one server equivalence group with commit count exactly one. A credential-free direct fixture replays the same key plus equivalent body to the same response, while the same key plus a non-equivalent body returns `409 IDEMPOTENCY_KEY_REUSED`; evidence exposes only key presence and the server-assigned group.

- [ ] **Step 2: Write Operations/Settings journey**

Do not repeat Phase 4's Operations matrix. Cover the Settings/Operations boundary: a second-page Team remains in the URL until pagination is exhausted and is never prematurely corrected; Operations emits no Team or workflow-state requests; Workspace alone requests States after exact Team resolution. Assert the custom color POST body by strict deep equality with no UI-only position/preset fields. Delete assertions freeze the confirmation snapshot across cancel/failure/repeated confirm, prove the synchronous duplicate-submit guard and same-intent retry, separate committed DELETE from refresh failure, restore exact focus, and let Task 5.2—not deletion—reconcile an absent Team URL after success.

- [ ] **Step 3: Write command-center route journey**

Reuse Phase 6 for opening-shortcut/editable-target assertions. Here assert the real command request uses `limit=50`, select an Agent result into its stable once-encoded route, return to the exact prior URL/focus context, and verify `g a` only navigates and never opens or stacks the command center.

- [ ] **Step 4: Implement deterministic fixtures and integration seams**

Build the reset/control/ledger before the journeys. Add only required route handlers: Agent list/detail/access/approvals, Settings Teams/states/color/delete, and minimum discovery/command records. Keep IDs/times/order stable; scenario-scope limit rules; expose only sanitized counts; reset and assert zero requests in every `beforeEach`, restore `default` in every `afterEach`; assert every state transition through DOM, exact URL, focus, and request evidence; and never relax an assertion to fit current UI.

- [ ] **Step 5: Verify RED then GREEN**

Run each new file before its fixture/implementation is complete and record the failing assertion. After implementation run:

```bash
pnpm --filter @workmesh/web exec playwright test --config playwright.mocked.config.ts --list e2e/mocked/agents-interactions.mocked.spec.ts e2e/mocked/operations-settings.mocked.spec.ts e2e/mocked/command-center-routes.mocked.spec.ts
pnpm --filter @workmesh/web exec playwright test --config playwright.mocked.config.ts e2e/mocked/agents-interactions.mocked.spec.ts e2e/mocked/operations-settings.mocked.spec.ts e2e/mocked/command-center-routes.mocked.spec.ts
pnpm --filter @workmesh/web typecheck
git diff --check
```

**DoD:** Every named state change has deterministic DOM, exact URL, focus, and sanitized request assertions; `beforeEach` zero-count reset plus `afterEach` default restoration isolate every test. Agent outer/inner state, Pending/History, Peek/Team Access/dismissal ordering, native deep link/Back, Settings second-page authority/request boundary/color body/delete snapshot, Command Center `limit=50`, retries/replays and single commit all pass. Scenario-scoped cursor/limit rules do not break Command Center, all named commands pass, and no source, fixture, request evidence, report, or artifact contains `wmp_`/`wmi_` values.

### Task 7.2: Large-list pagination and focus determinism gate

**Files:**
- Create: `apps/web/e2e/mocked/large-list-pagination.mocked.spec.ts`
- Create: `apps/web/app/lib/pagination.test.tsx`
- Modify: `apps/web/features/work-items/work-surfaces-pagination.test.tsx`
- Modify: `apps/web/e2e/project-work-preview-server.mjs`
- Modify: `apps/web/features/work-items/work-surfaces.tsx` to remove the viewport-root automatic observer and retain explicit Load More.
- Modify: production Agents files only if the new deterministic keyboard assertions fail; such a failure reopens Task 6.1.
- Create: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/task-7.2-report.md`
- Modify: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/progress.md` only after independent review.

**Interfaces:**
- The `large-list` scenario serves three exact 100-record pages for Issues and Agents with stable IDs, opaque `p2`/`p3` cursors, camelCase `nextCursor`, and page 3 `nextCursor: null`. Only this scenario rejects Issues/Agents requests whose `limit` is not 100; no global rule may break Task 7.1's Command Center `limit=50`.
- This gate does not add `@tanstack/react-virtual`; pagination evidence, not a speculative dependency, decides future virtualization work.
- WorkSurfaces and Agents both use explicit Load More. Remove the current viewport-root `IntersectionObserver`/320px root margin and reverse the old unit test that fossilized automatic pagination; scrolling or initial layout alone must never request a hidden page.
- At 300 records the gate also owns measurable interaction/render budgets. Pagination correctness alone cannot justify the “no virtualization dependency” decision: if any budget fails, Task 7.2 remains RED and future virtualization stays an explicit unresolved decision. Task 7.3 reruns the same large-list evidence against a production-mode Web process plus deterministic mocked API.

- [ ] **Step 1: Write the RED large-list fixture/test**

Serve 100 records per page. Before implementation, use a delayed page-2 response to prove the current WorkSurface auto-drain is RED. After removal, initial stabilization and real scrolling both leave page-2 request count at zero. A `usePagedApiList` unit test calls `loadMore()` three times while one delayed Promise is in flight and proves exactly one request. Browser tests use two explicit Load More activations and assert 100→200→300 nodes, 300 unique IDs, boundary records 99/100/101 and 199/200/201, and exact Issues/Agents request keys `(cursor=null,p2,p3)` once each with `limit=100`. After page 3, Load More disappears; scrolling, layout switching, and another stability wait cause no fourth request.

- [ ] **Step 2: Implement the deterministic cursor fixture**

Reset into `large-list`; return exactly 100 records per page, `p2` after page 1, `p3` after page 2, and `null` after page 3. Validate `limit=100` only inside this scenario. Count requests by collection/cursor through sanitized test control so both single-flight and terminal exhaustion are provable.

- [ ] **Step 3: Verify board/list parity**

Reset before each layout. In Issue list and board, explicitly load to 300 and assert the same complete loaded ID set and boundary samples are scroll/focus reachable. Switching list→board→list retains all 300 IDs, never refetches page 1, and returns the DOM node count to a recorded explainable range rather than monotonically leaking nodes. Source and unit assertions prove no WorkSurface `IntersectionObserver` contract remains and exactly one explicit Load More control owns each append.

- [ ] **Step 4: Verify Agents keyboard state**

Use the Agent Load More button twice to reach 300, assert page-3 terminal cursor, vanished Load More, no fourth request, unique IDs/boundaries, and per-cursor request counts. Move focus from item 100 through J to item 101, open Peek with Space, close with Escape, and assert focus returns to item 101. Applying a filter that hides item 101 moves focus to the first visible Agent link and leaves no Peek/opened state behind; there is no Agent IntersectionObserver claim.

- [ ] **Step 5: Run and verify GREEN**

Instrument the deterministic browser case with `PerformanceObserver`/marks and assert cumulative layout shift `<=0.10`; no single long task exceeds `200ms`; total long-task duration for one measured interaction is `<=500ms`; no-network list↔board, filter, and Peek open/close reaches its next stable animation frame within `250ms`; and each page-2/page-3 response reaches a stable 200/300-unique-node DOM within `1500ms`. Record per-action samples and DOM counts in sanitized JSON. A budget failure is a RED result, not permission to relax a threshold or claim pagination makes virtualization unnecessary.

```bash
pnpm --filter @workmesh/web exec vitest run app/lib/pagination.test.tsx features/work-items/work-surfaces-pagination.test.tsx
pnpm --filter @workmesh/web exec playwright test --config playwright.mocked.config.ts e2e/mocked/large-list-pagination.mocked.spec.ts
pnpm --filter @workmesh/web test
pnpm --filter @workmesh/web typecheck
git diff --check
```

**DoD:** Issues and Agents each have exact 100/200/300 assertions, boundary samples, `(null,p2,p3)` request counts, `limit=100`, single-flight, terminal page 3, vanished Load More, and no fourth request. All 300 IDs are unique and retained across list/board/list without DOM growth leakage; Agent item-100→101 focus, Peek return, and filter fallback are exact; WorkSurface and Agents are explicit-load only with no observer auto-drain. CLS/long-task/interaction/render budgets all pass in mocked Chromium and are rerun at the final production-Web gate; otherwise virtualization remains unresolved and Task 7.2 is RED. All named commands pass and no speculative dependency is added.

### Task 7.3: Final local verification and handoff

**Files:**
- Create: `apps/web/e2e/mocked/final-visual-tour.mocked.spec.ts`
- Create: `apps/web/playwright.production.config.ts`
- Modify: `playwright.config.ts`
- Modify: `apps/web/playwright.mocked.config.ts`
- Create: `scripts/verify-web-ui-final-preflight.mts`
- Create: `scripts/verify-playwright-suite-scope.mts`
- Create: `scripts/run-web-ui-final-playwright.mts`
- Create: `scripts/audit-web-ui-scope-and-conflicts.mts`
- Create: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/final-report.md`
- Modify: `.superpowers/sdd/2026-08-22-web-ui-ux-improvements/progress.md`
- Modify: `AGENTS.md` only if the user authorizes product-documentation changes in the implementation worktree.

**Interfaces:**
- Consumes: every accepted phase report and the repository-required command set.
- Produces: `final-report.md` plus a matching terminal ledger state; it performs no push/deployment. After every required gate is PASS and all owners are quiescent, the root owner may create one explicit-file local checkpoint commit under the 2026-08-23 authorization.
- Requires Phase 6.7 `check:i18n` PASS and a verified local test topology before running stateful integration/E2E commands.
- Verification owner changes no product code. It owns only the final spec/config/verification scripts/report/progress; any product failure reopens its exact owner task.
- Evidence has three non-interchangeable labels: root mixed topology is real API/Web processes with a mixture of real and route-mocked journeys; mocked-dev is deterministic API plus `next dev`; production-Web-plus-mocked-API uses a fixed `NEXT_PUBLIC_API_URL` build, `next start`, and the deterministic API server. None is described as wholly production-data E2E, and a production build by itself is not runtime performance evidence.
- Root, mocked-dev, and production configs accept one absolute, path-constrained, per-run `WORKMESH_PLAYWRIGHT_RUN_DIR`. Auth state, output, HTML, traces, and videos remain below that directory; stable screenshots/geometry are copied only after PASS into a separate evidence directory with a source/copy SHA-256 manifest.
- Per the 2026-08-23 user direction, Task 7.3 is the single consolidated audit for this frontend program. Its scope is product behavior, responsive geometry, visual quality, regression coverage, performance, evidence consistency, and read-only branch conflict analysis. It does not perform or claim a safety/security audit, introduce security-specific validation, or add unusual defensive policy.

- [ ] **Step 1: Establish the RED final report**

Create `final-report.md` with `Status: RED (unverified)`, the required command list, non-empty visual matrix, performance budgets, stable-artifact manifest, frontend scope audit, test-topology preflight, repair-worktree conflict audit, evidence-boundary labels, and completion-report headings. Leave every evidence entry unchecked until executed.

Implement and run the verification-only preflight before any destructive reset:

```powershell
rtk pnpm exec tsx scripts/verify-web-ui-final-preflight.mts `
  --output artifacts/web-ui-final/preflight.json

rtk pnpm exec tsx scripts/verify-playwright-suite-scope.mts `
  --output artifacts/web-ui-final/suite-scope.json
```

The preflight first repairs or provisions the owned local prerequisites where possible, then verifies `RUN_INTEGRATION=1`; PostgreSQL accepts a connection, `current_database()` exactly equals the URL database, and its name contains a standalone `test` segment; Redis returns `PING === PONG`; the explicit one-time bootstrap token exists without printing its value; ports 3100/3101/3200/3201 can each be temporarily bound and immediately released; and Docker Compose interpolation is complete, including `PAGINATION_CURSOR_KEYS`. Only an exhausted, recorded local-recovery attempt may leave the gate blocked. The suite-scope check proves root excludes `e2e/mocked/**/*.mocked.spec.ts`, mocked-dev collects its declared mocked files plus portable human reflow, and production config collects only the named production-runtime cases.

- [ ] **Step 2: Run repository-required local gates**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm --filter @workmesh/web check:i18n
pnpm --filter @workmesh/web build
pnpm --filter @workmesh/web exec playwright test --config playwright.mocked.config.ts --list
pnpm --filter @workmesh/web exec playwright test --config playwright.mocked.config.ts
git diff --check
```

Expected: every command exits 0. Do not claim completion while any required command fails.

Before `pnpm test:e2e`, create one unique validated run directory and use `scripts/run-web-ui-final-playwright.mts` to list and execute root, mocked-dev, then production-Web-plus-mocked-API serially so no two commands reset the same database or reuse auth/output paths. The production gate builds Web with one fixed loopback `NEXT_PUBLIC_API_URL`, starts that exact output with `next start`, starts the deterministic API, and reruns Task 7.2 large-list performance plus the final tour smoke; record it only as production Web + mocked API. If optional S3/two-database recovery matrices skip because their environment is not configured, record the exact skip instead of calling recovery complete. A failed Task 7.2 performance budget leaves virtualization unresolved.

- [ ] **Step 3: Run the full visual tour**

Implement and run `final-visual-tour.mocked.spec.ts` against deterministic non-empty accepted scenarios. Freeze at least these exact routes/records:

- `/?view=my-work` with a non-empty Issues list;
- `/?view=projects&project=project-1&tab=board` with a non-empty board;
- `/?view=my-work&workItem=work-101` with WorkItem `work-101` detail;
- `/agents?tab=agents&name=Codex&team=team-2&status=active`;
- `/agents?tab=sessions`;
- `/agents?tab=approvals&approvalView=pending`;
- `/agents?tab=approvals&approvalView=history&approvalStatus=rejected`;
- `/agents/agent%2F1`, followed by Back to the exact originating list URL;
- `/settings?tab=workspace&team=team-page-2`;
- `/settings?tab=operations&team=team-page-2&opsQuery=Failed#operations-runs`;
- `/connect#test`, where `#test` is deliberately non-credential-shaped.

Run every route at 390×844 zh-CN, 768×1024 en, 1440×1000 zh-CN, and 1920×1080 en; Connect additionally runs 390×844 en. Add one 1920×1080 en evidence-only case for standalone `/operations#operations-metrics` so the intentionally full-width Operations/Usage geometry is measured on the surface that actually owns it rather than inferred from embedded Settings. Before each screenshot assert the fixture's unique business record is visible, no skeleton/loading remains, there is exactly one visible page `h1` and one `main`, every ARIA reference resolves, one real operation control has a visible focus ring with its full rectangle inside the viewport, the exact query/hash is retained, reduced-motion behavior is stable, and `document.scrollWidth === viewport width`. Capture named PNG plus sanitized geometry/locale/focus/ARIA/URL JSON. Explicitly map the Linear-like closure: J/K/arrows move only roving focus, Space opens Peek, Escape closes/refocuses, native Enter follows the real link, Back restores tab/filter/list URL and focus context, and `g a` navigates without opening or stacking Command Center.

At 1920×1080 use numeric machine assertions, not visual adjectives alone: sidebar `248±1px`; workspace/main `1672±2px`; ordinary bounded `.content`/`.agent-center` width `1421–1482px` with left/right whitespace difference `<=2px`; Home/Issues retain that accepted bounded content geometry and their dominant collection occupies at least 98% of content inner width; the intentionally full-width Operations root occupies at least 95% of main and its dominant grid/table occupies at least 98% of content inner width; Settings content `1421–1482px`, current panel at least 98% of inner width, and workflow form `720–960px`; Connect shell `1118–1122px` with symmetric whitespace; Runs wrapper/table `1118–1122px` with no meaningless desktop horizontal scroll; WorkItem detail `1178–1182px`; Usage at least 85% of its root with 200–289px cards in 2–3 rows. Record Agent registry and side-stack widths separately so one cannot hide the other's narrow island. Every page also asserts exact document containment. Reject accidental narrow islands, over-stretched forms/tables, sparse slabs, or excessive empty space whenever a threshold fails.

- [ ] **Step 4: Final frontend scope/conflict audit and run-directory cleanup**

Use dedicated disposable local test state. `scripts/run-web-ui-final-playwright.mts` resolves the requested `WORKMESH_PLAYWRIGHT_RUN_DIR`, proves it is the unique child of the approved run root, passes it to all three configs, and refuses a workspace/root/broad/shared directory. Auth state, HTML, output, trace, and video paths never escape it. After the exact child processes finish, delete only that validated run's `.auth`, trace, and video entries—never enumerate and delete all `test-results`. This is deterministic test-run cleanup, not a safety/security audit.

Implement and run the read-only scope/conflict audit:

```powershell
rtk pnpm exec tsx scripts/audit-web-ui-scope-and-conflicts.mts `
  --ui-worktree 'G:\Projects\MetronX\WorkMesh\.worktrees\web-ui-ux-continuation' `
  --repair-worktree 'G:\Projects\MetronX\WorkMesh\.worktrees\fix-issues-75-78' `
  --output artifacts/web-ui-final/conflict-audit.json
```

For both worktrees record HEAD and merge-base; porcelain-v2 tracked/untracked counts; SHA-256 of `diff --binary --no-ext-diff`; an untracked path/raw-byte SHA-256 manifest; committed, dirty-tracked, and untracked path intersections; same-path zero-context hunk-range intersections; different-path identical-content hashes; `diff --check`; and a read-only committed-tree conflict result. Compare the actual change set with the frontend allowlist of `apps/web/**`, `packages/ui/**`, explicitly approved Playwright/config/verification scripts, this plan/task reports/progress, and artifact manifests. Any other changed path is reported and routed to its owner instead of being silently modified or sampled away. The old repair snapshot (`e5e74de812aad7d299a9bc35dbec30e501ec555e`, 38 tracked + 8 untracked) is only a baseline and must be refreshed. Do not merge/rebase or claim UI validation substitutes for repair-branch image/integration verification.

- [ ] **Step 5: Implement the final handoff record**

Record implemented scope, exact changed files, migrations (none), API/events changed (none), actual root-mixed, mocked-dev, and production-Web-plus-mocked-API boundaries/counts without promoting any of them to production-data E2E; demo routes/keystrokes; stable screenshot/geometry paths and hashes; performance samples; known limitations; optional skips; and any plan divergence. Accessibility wording is limited to the keyboard/semantic/reflow evidence actually run and explicitly excludes untested screen-reader, forced-colors, browser zoom, and full WCAG conformance. The user has not authorized `AGENTS.md` changes in this continuation, so keep shared hooks/components, interaction keys, URL parameters, and localStorage keys in the final report.

- [ ] **Step 6: Verify report/ledger agreement**

After every PASS screenshot/geometry JSON is final and before another Playwright run can overwrite it, copy the declared stable evidence and write a manifest containing source path/hash, copy path/hash, title, route, locale, viewport, request counts, and geometry schema version. Verify every source/copy SHA-256 pair. Compare every command/spec count, topology label, performance sample, screenshot/manifest path, limitation, optional skip, scope/conflict result, and changed-file boundary between `final-report.md` and `progress.md`; set both to PASS/complete only when they match and all required commands exit 0.

**DoD:** Phase 7 passes only when 7.1 scenario isolation/URL/DOM/focus/request/idempotency assertions and 7.2 100→200→300/single-flight/terminal-cursor/focus/performance budgets pass without cross-test leakage; every non-empty 390/768/1440/1920 route case has reproducible locale/focus/ARIA/URL/reduced-motion/screenshots/geometry; and numeric 1920 thresholds reject narrow islands, sparse slabs, or over-stretched controls. PostgreSQL/Redis/bootstrap/port/Compose preflight precedes every destructive gate after bounded local recovery. Root mixed, mocked-dev, and production-Web-plus-mocked-API evidence is separately collected and accurately labeled; all auth state/trace/video stays in and is precisely cleaned from the unique run directory. The frontend change set stays within the declared scope, the current repair HEAD/patch/untracked/hunk/content conflict audit passes, stable source/copy artifact hashes match, required commands exit 0, optional skips are exact, and final report/progress agree. Accessibility claims remain limited to the keyboard/semantic/reflow scope actually executed, and no safety/security audit is performed or claimed.

---

## Continuation v2 self-review

### Coverage and deliberate corrections

| Requirement / finding | Task |
| --- | --- |
| Task 3.4 CSS regression | 3.4-R |
| Clean-tip load-more TS contract | B.1 |
| Shared UI Client Component boundary | B.2 |
| Cwd-independent UI Vitest + build baseline | B.3 |
| Pending vs History; mixed-status defense; URL state | 3.5 |
| Peek + stable Agent route + separate Team Access Sheet | 3.6 |
| Operations anchors/search/semantic table | 4.1-4.3 |
| Aggregate usage without fabricated series | 4.4 |
| Shared Settings Tabs/popstate and truthful team scope | 5.1-5.2 |
| Workflow color presets and destructive Dialog | 5.3-5.4 |
| Connect client explanations without remote logos | 5.5 |
| Separate focus/selection/opened state and Linear-style keys | 6.1 |
| Shared overlay behavior | 6.2 |
| Toast/skeleton/reflow/reduced-motion | 6.3-6.5 |
| Accessibility and bilingual parity | 6.6-6.7 |
| Deterministic E2E and large-list gates | 7.1-7.2 |
| Full local verification/build/scope/visual handoff | 7.3 |

The following original proposals were intentionally removed: a time-series sparkline without time-series input, generic Settings export/import without a portable contract, a second page-local focus-trap hook, `/` page search that conflicts with the command center, and conditional virtualization without evidence.

### Known data-boundary limitations

- Approval History cannot show decision actor, requester, or decision time because the existing Web `Approval` type does not expose them. It shows only real fields and does not modify contracts.
- Approval History queries one exact terminal status (`approved`, `rejected`, `expired`, `consumed`, or `canceled`) at a time so server filtering and pagination remain aligned; it intentionally has no client-composed “all terminal” view.
- Operations search filters only pages already loaded. Copy and tests must not imply server-wide completeness.
- Approval decisions have no backend inverse operation, so the UI intentionally provides no Undo.
- Usage Summary contains aggregates only; no chart or trend is claimed.

### Placeholder and type scan

- The executable continuation (3.4-R, B.1-B.3, 3.5-7.3) contains explicit files, RED commands/assertions, implementation boundaries, verification commands, and DoD.
- Historical Phase 0-2 and Tasks 3.1-3.4 remain unchanged as execution history; their terse original steps are not continuation instructions.
- `ApprovalView`, `AgentsRouteState`, `SettingsTab`, `OperationsSectionId`, `localVitestSetup`, `nextFocusedId`, and `listIntent` have one consistent spelling/signature throughout the continuation.
- No new annotation relies on the removed global `JSX` namespace; React 19 inference is used.
