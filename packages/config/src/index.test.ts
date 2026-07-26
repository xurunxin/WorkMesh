import { describe, expect, it } from 'vitest'
import { featureDefinitions } from '@workmesh/contracts'
import { loadFeatureConfig, loadReleaseInfo } from './index.js'

describe('release and feature configuration', () => {
  it('defaults every non-stable feature to disabled', () => {
    const features = loadFeatureConfig({})
    expect(Object.keys(features)).toEqual(featureDefinitions.map(feature => feature.key))
    expect(Object.values(features).every(enabled => enabled === false)).toBe(true)
  })

  it('accepts only explicit true and false values', () => {
    expect(loadFeatureConfig({
      WORKMESH_BETA_PLANNING: 'true',
      WORKMESH_EXPERIMENTAL_AUTOMATION: 'false',
    })).toMatchObject({
      WORKMESH_BETA_PLANNING: true,
      WORKMESH_EXPERIMENTAL_AUTOMATION: false,
    })
    expect(() => loadFeatureConfig({ WORKMESH_BETA_PLANNING: '1' })).toThrow()
  })

  it('exposes only a bounded non-secret build identifier', () => {
    expect(loadReleaseInfo({ WORKMESH_BUILD_SHA: 'abc1234' }).buildSha).toBe('abc1234')
    expect(loadReleaseInfo({ WORKMESH_BUILD_SHA: 'secret value' }).buildSha).toBe('unknown')
  })
})
