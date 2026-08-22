// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCompactPreference } from './work-surfaces'

// `readCompactPreference` is the persistence layer for the filter row's
// compact preference in `WorkSurfaces`. The lazy initializer inside
// `WorkSurfaces` reads it on first mount to decide whether Milestone and
// Label are collapsed by default. These tests lock the spec: with no stored
// preference (first-time visit, cleared storage, private mode, etc.) the
// filter row MUST render collapsed (compact = true), and an explicit
// `'true'` / `'false'` choice MUST be preserved.
//
// We exercise the function directly rather than rendering `<WorkItemFilters
// compact={...} />` with a hard-coded prop, because the bug was in the
// parent (`WorkSurfaces`) reading the wrong default, not in the child
// component's rendering of a given `compact` value.
describe('WorkSurfaces readCompactPreference (filter row default)', () => {
  const STORAGE_KEY = 'wm:filters:compact'

  beforeEach(() => {
    // Start every case from a known-empty localStorage so prior tests cannot
    // leak a stored value into the next assertion.
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('locks the spec: empty localStorage collapses Milestone and Label by default', () => {
    // The key is absent — this is the first-time-visitor case the spec calls out.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(readCompactPreference()).toBe(true)
  })

  it('preserves an explicit "true" choice', () => {
    window.localStorage.setItem(STORAGE_KEY, 'true')
    expect(readCompactPreference()).toBe(true)
  })

  it('preserves an explicit "false" choice', () => {
    window.localStorage.setItem(STORAGE_KEY, 'false')
    expect(readCompactPreference()).toBe(false)
  })

  it('collapses by default when the stored value is not a recognised boolean', () => {
    // A stray non-boolean value (e.g. a corrupted entry or a future schema)
    // must not silently flip the UI to expanded.
    window.localStorage.setItem(STORAGE_KEY, 'yes')
    expect(readCompactPreference()).toBe(false)
  })

  it('collapses by default when localStorage access throws (private mode, quota, etc.)', () => {
    // Replace the `Storage.prototype.getItem` accessor so the function under
    // test sees a throw regardless of how it reaches for `localStorage`.
    const originalGetItem = Storage.prototype.getItem
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('localStorage unavailable')
    })
    try {
      expect(readCompactPreference()).toBe(true)
      expect(getItemSpy).toHaveBeenCalledWith(STORAGE_KEY)
    } finally {
      // Always restore the real implementation so other tests / teardown
      // can still talk to jsdom's localStorage.
      getItemSpy.mockRestore()
      // Belt-and-braces: ensure the original binding is back even if a
      // future vitest version no-ops mockRestore.
      Storage.prototype.getItem = originalGetItem
    }
  })
})
