import { describe, expect, it } from 'vitest'
import { matchesOperationsQuery, readOperationsQuery } from './filter'

describe('matchesOperationsQuery', () => {
  it('matches trimmed visible text case-insensitively', () => {
    expect(matchesOperationsQuery('nightly', ['Nightly sync', 'cron'])).toBe(true)
    expect(matchesOperationsQuery('  FAILED  ', ['run-1', 'failed'])).toBe(true)
    expect(matchesOperationsQuery('', ['anything visible'])).toBe(true)
    expect(matchesOperationsQuery('   ', [])).toBe(true)
  })

  it('matches Unicode and visible scalar values without inspecting hidden objects', () => {
    expect(matchesOperationsQuery('重试队列', ['夜间重试队列', null, 42])).toBe(true)
    expect(matchesOperationsQuery('42', [null, 42])).toBe(true)
    expect(matchesOperationsQuery('true', [true])).toBe(true)
    expect(matchesOperationsQuery('hidden', [{ secret: 'hidden' }, ['hidden']])).toBe(false)
  })

  it('normalizes compatible Unicode forms', () => {
    expect(matchesOperationsQuery('ＡＧＥＮＴ', ['Agent run'])).toBe(true)
  })
})

describe('readOperationsQuery', () => {
  it('decodes spaces, plus signs, percent encoding, and Unicode', () => {
    expect(readOperationsQuery('?tab=operations&opsQuery=retry%20queue')).toBe('retry queue')
    expect(readOperationsQuery('?opsQuery=nightly+sync')).toBe('nightly sync')
    expect(readOperationsQuery('?opsQuery=%E9%87%8D%E8%AF%95%E9%98%9F%E5%88%97')).toBe('重试队列')
  })

  it('trims the first repeated value and treats missing or blank values as empty', () => {
    expect(readOperationsQuery('?opsQuery=%20first%20&opsQuery=second')).toBe('first')
    expect(readOperationsQuery('?tab=operations')).toBe('')
    expect(readOperationsQuery('?opsQuery=')).toBe('')
    expect(readOperationsQuery('?opsQuery=%20%20')).toBe('')
  })
})
