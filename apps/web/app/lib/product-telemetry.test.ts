import { describe, expect, it, vi } from 'vitest'
import { PRODUCT_METRIC_MAX_ENTRIES, PRODUCT_METRIC_PREFIX, productMetricError, productMetricSurface, recordProductMetric } from './product-telemetry'

const environment = (overrides: Partial<Parameters<typeof recordProductMetric>[4]> = {}) => {
  const measures: Array<{ name: string; options: { detail: unknown; duration: number } }> = []
  const cleared: string[] = []
  const value = {
    now: () => 500,
    doNotTrack: '0',
    disabled: false,
    entries: () => [],
    clear: (name: string) => { cleared.push(name) },
    measure: (name: string, options: { detail: unknown; duration: number }) => { measures.push({ name, options }) },
    ...overrides,
  }
  return { value, measures, cleared }
}

describe('privacy-bounded product telemetry', () => {
  it('records only closed low-cardinality dimensions and clamps duration', () => {
    const fixture = environment()
    const dimensions = { surface: 'attention' as const, actionClass: 'respond' as const, resourceId: 'secret-id', path: '/private' }
    expect(recordProductMetric('attention_response', 999_999, dimensions, { outcome: 'failure', errorClass: 'conflict' }, fixture.value)).toBe(true)
    expect(fixture.measures).toEqual([{
      name: `${PRODUCT_METRIC_PREFIX}attention_response`,
      options: { start: 0, duration: 500, detail: { schemaVersion: 1, surface: 'attention', actionClass: 'respond', outcome: 'failure', errorClass: 'conflict' } },
    }])
    expect(JSON.stringify(fixture.measures)).not.toContain('secret-id')
    expect(JSON.stringify(fixture.measures)).not.toContain('/private')
  })

  it('honors both opt-outs and bounds document-lifetime entries', () => {
    const dnt = environment({ doNotTrack: '1' })
    expect(recordProductMetric('evidence_navigation', 1, { surface: 'evidence' }, { outcome: 'success' }, dnt.value)).toBe(false)
    expect(dnt.measures).toHaveLength(0)
    const disabled = environment({ disabled: true })
    expect(recordProductMetric('evidence_navigation', 1, { surface: 'evidence' }, { outcome: 'success' }, disabled.value)).toBe(false)
    const full = environment({ entries: () => Array.from({ length: PRODUCT_METRIC_MAX_ENTRIES }, (_, index) => ({ name: `${PRODUCT_METRIC_PREFIX}${index % 2}` })) })
    recordProductMetric('navigation_restore', 1, { surface: 'evidence', actionClass: 'back' }, { outcome: 'success' }, full.value)
    expect(full.cleared.sort()).toEqual([`${PRODUCT_METRIC_PREFIX}0`, `${PRODUCT_METRIC_PREFIX}1`])
  })

  it('reduces arbitrary source and failures to bounded categories', () => {
    expect(productMetricSurface('artifact-123')).toBe('unknown')
    expect(productMetricError({ status: 412 })).toBe('conflict')
    expect(productMetricError(new TypeError('fetch failed'))).toBe('network')
    expect(productMetricError(new Error('contains private server details'))).toBe('unknown')
    expect(vi.isMockFunction(productMetricError)).toBe(false)
  })
})
