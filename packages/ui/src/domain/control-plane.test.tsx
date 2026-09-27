import { describe, expect, it, vi } from 'vitest'
import { SessionBudgetMeter, type SessionBudgetUtilizationView } from './control-plane.js'

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  let nextId = 0
  return { ...actual, useId: () => `ui-test-${++nextId}` }
})

type TestElement = { props: Record<string, unknown> }

// `children` nests arrays (the meter maps over entries), so the walk recurses
// through arrays rather than flattening only one level.
function elementsIn(node: unknown): TestElement[] {
  if (Array.isArray(node)) return node.flatMap(child => elementsIn(child))
  if (node === null || typeof node !== 'object') return []
  const props = (node as { props?: unknown }).props
  if (props === null || typeof props !== 'object') return []
  const element = { props: props as Record<string, unknown> }
  return [element, ...elementsIn(element.props.children)]
}

const entry = (overrides: Partial<SessionBudgetUtilizationView> = {}): SessionBudgetUtilizationView => ({
  limit: 'runtimeSeconds',
  cap: 600,
  used: 60,
  ratio: 0.1,
  measurable: true,
  warning: false,
  exhausted: false,
  ...overrides,
})

// SessionBudgetMeter is a hook-free function component, so it is called
// directly and its returned element tree inspected — the same technique the
// barrel contract test uses.
const render = (entries: readonly SessionBudgetUtilizationView[]) => elementsIn(SessionBudgetMeter({
  entries,
  entryLabel: (limit, used, cap) => `${limit}: ${used} / ${cap}`,
  label: 'Budget',
  percentLabel: ratio => `${Math.round(ratio * 100)}%`,
  unknownLabel: (limit, cap) => `${limit}: unknown (${cap})`,
}))

describe('SessionBudgetMeter', () => {
  it('renders nothing when the session declares no budget', () => {
    expect(render([])).toEqual([])
  })

  it('renders a meter whose value is carried by text, not colour alone', () => {
    const meter = render([entry({ ratio: 0.42 })]).find(node => node.props.role === 'meter')
    expect(meter?.props['aria-valuenow']).toBe(0.42)
    expect(meter?.props['aria-valuemin']).toBe(0)
    expect(meter?.props['aria-valuemax']).toBe(1)
    expect(meter?.props['aria-valuetext']).toBe('42%')
    expect(meter?.props['aria-label']).toBe('runtimeSeconds: 60 / 600')
  })

  it('flags the warning and exhausted states from the derived flags', () => {
    const warning = render([entry({ ratio: 0.9, warning: true })])
      .find(node => typeof node.props.className === 'string' && node.props.className.includes('wm-budget-meter'))
    expect(warning?.props.className).toContain('wm-budget-warning')
    const exhausted = render([entry({ ratio: 1, warning: true, exhausted: true })])
      .find(node => typeof node.props.className === 'string' && node.props.className.includes('wm-budget-meter'))
    expect(exhausted?.props.className).toContain('wm-budget-exhausted')
  })

  it('renders an unmeasurable limit as an explicit unknown, never as zero', () => {
    const nodes = render([entry({ measurable: false, used: null, ratio: null })])
    expect(nodes.some(node => node.props.role === 'meter')).toBe(false)
    const unknown = nodes.find(node => typeof node.props.className === 'string' && node.props.className.includes('wm-budget-unknown'))
    expect(unknown?.props.children).toBe('runtimeSeconds: unknown (600)')
  })

  it('renders every configured cap in a mixed budget', () => {
    const nodes = render([
      entry({ limit: 'runtimeSeconds', ratio: 0.1 }),
      entry({ limit: 'inputTokens', measurable: false, used: null, ratio: null }),
    ])
    expect(nodes.filter(node => node.props.role === 'meter')).toHaveLength(1)
    expect(nodes.filter(node => typeof node.props.className === 'string' && node.props.className.includes('wm-budget-unknown'))).toHaveLength(1)
  })
})
