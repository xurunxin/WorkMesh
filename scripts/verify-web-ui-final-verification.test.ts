import { describe, expect, it } from 'vitest'
import {
  databaseNameFromUrl,
  isDedicatedTestDatabase,
  parseLastJsonObject,
  parsePreflightArguments,
} from './verify-web-ui-final-preflight.mjs'
import {
  evaluateSuiteAssertions,
  normalizePlaywrightSpecPath,
  parsePlaywrightList,
  parseSuiteScopeArguments,
} from './verify-playwright-suite-scope.mjs'

describe('final Web UI preflight contracts', () => {
  it('accepts only the documented output argument or help', () => {
    expect(parsePreflightArguments(['--output', 'artifacts/preflight.json'])).toEqual({
      help: false,
      output: 'artifacts/preflight.json',
    })
    expect(parsePreflightArguments(['--help'])).toEqual({ help: true, output: null })
    expect(() => parsePreflightArguments([])).toThrow('--output is required')
    expect(() => parsePreflightArguments(['--output'])).toThrow('--output requires a file path')
  })

  it('extracts the exact database and requires a standalone test segment', () => {
    expect(databaseNameFromUrl('postgres://user:pass@127.0.0.1:5432/workmesh_ux_test')).toBe('workmesh_ux_test')
    expect(databaseNameFromUrl('postgres://user:pass@127.0.0.1:5432/workmesh%2Dtest')).toBe('workmesh-test')
    expect(databaseNameFromUrl('not-a-url')).toBeNull()
    expect(isDedicatedTestDatabase('workmesh_ux_test')).toBe(true)
    expect(isDedicatedTestDatabase('workmesh-test-local')).toBe(true)
    expect(isDedicatedTestDatabase('workmeshtest')).toBe(false)
    expect(isDedicatedTestDatabase(null)).toBe(false)
  })

  it('reads a child probe JSON record after package-runner status lines', () => {
    expect(parseLastJsonObject<{ ok: boolean }>('status\n{"ok":true}\n')).toEqual({ ok: true })
    expect(parseLastJsonObject('status only')).toBeNull()
  })

})

describe('Playwright suite-scope contracts', () => {
  it('accepts only the documented output argument or help', () => {
    expect(parseSuiteScopeArguments(['--output', 'artifacts/scope.json'])).toEqual({
      help: false,
      output: 'artifacts/scope.json',
    })
    expect(parseSuiteScopeArguments(['-h'])).toEqual({ help: true, output: null })
    expect(() => parseSuiteScopeArguments(['--unknown'])).toThrow('Unknown argument')
  })

  it('normalizes root, app-relative, and Windows spec paths', () => {
    expect(normalizePlaywrightSpecPath('apps/web/e2e/mocked/example.mocked.spec.ts')).toBe('mocked/example.mocked.spec.ts')
    expect(normalizePlaywrightSpecPath('e2e\\mocked\\example.mocked.spec.ts')).toBe('mocked/example.mocked.spec.ts')
    expect(normalizePlaywrightSpecPath('human-reflow.spec.ts')).toBe('human-reflow.spec.ts')
  })

  it('parses exact collected tests and unique files from Playwright list output', () => {
    const parsed = parsePlaywrightList(`Listing tests:
  [bootstrap] › stage0.spec.ts:10:3 › bootstrap › creates state
  [authenticated] › mocked\\tour.mocked.spec.ts:20:3 › tour › renders
  [authenticated] › mocked\\tour.mocked.spec.ts:30:3 › tour › returns
Total: 3 tests in 2 files
`)
    expect(parsed).toEqual({
      tests: 3,
      files: 2,
      specs: ['mocked/tour.mocked.spec.ts', 'stage0.spec.ts'],
    })
  })

  it('keeps root, mocked development, and production ownership disjoint', () => {
    const declared = [
      'mocked/final-visual-tour.mocked.spec.ts',
      'mocked/large-list-pagination.mocked.spec.ts',
      'mocked/owner.mocked.spec.ts',
    ]
    const root = evaluateSuiteAssertions('root-mixed', {
      tests: 2,
      files: 2,
      specs: ['stage0.spec.ts', 'human-reflow.spec.ts'],
    }, declared)
    expect(root[0]?.status).toBe('pass')

    const mocked = evaluateSuiteAssertions('mocked-dev', {
      tests: 4,
      files: 4,
      specs: [...declared, 'human-reflow.spec.ts'],
    }, declared)
    expect(mocked[0]?.status).toBe('pass')

    const production = evaluateSuiteAssertions('production-web-plus-mocked-api', {
      tests: 2,
      files: 2,
      specs: [
        'mocked/final-visual-tour.mocked.spec.ts',
        'mocked/large-list-pagination.mocked.spec.ts',
      ],
    }, declared)
    expect(production[0]?.status).toBe('pass')

    const leakingRoot = evaluateSuiteAssertions('root-mixed', {
      tests: 1,
      files: 1,
      specs: ['mocked/owner.mocked.spec.ts'],
    }, declared)
    expect(leakingRoot[0]?.status).toBe('blocked')
  })
})
