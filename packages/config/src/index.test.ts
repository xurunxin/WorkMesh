import { describe, expect, it } from 'vitest'
import { featureDefinitions } from '@workmesh/contracts'
import { loadConfig, loadFeatureConfig, loadReleaseInfo } from './index.js'

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
  it('strictly parses authentication rate-limit and trusted proxy settings', () => {
    const config = loadConfig({ DATABASE_URL: 'postgres://workmesh:workmesh@localhost/workmesh', REDIS_URL: 'redis://localhost:6379', SESSION_SECRET: '0123456789abcdef0123456789abcdef', AUTH_RATE_LIMIT_REDIS_PREFIX: 'authrl:test:config', AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS: '127.0.0.1/32, 2001:db8::/32', AUTH_RATE_LIMIT_SUBJECT_BURST: '12', AUTH_RATE_LIMIT_SUMMARY_INTERVAL_MS: '5000' })
    expect(config.AUTH_RATE_LIMIT_REDIS_PREFIX).toBe('authrl:test:config')
    expect(config.AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS).toEqual(['127.0.0.1/32', '2001:db8::/32'])
    expect(config.AUTH_RATE_LIMIT_SUBJECT_BURST).toBe(12)
    expect(config.AUTH_RATE_LIMIT_SUMMARY_INTERVAL_MS).toBe(5000)
    expect(() => loadConfig({ DATABASE_URL: 'postgres://workmesh:workmesh@localhost/workmesh', REDIS_URL: 'redis://localhost:6379', SESSION_SECRET: '0123456789abcdef0123456789abcdef', AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS: 'not-a-network' })).toThrow()
    expect(() => loadConfig({ DATABASE_URL: 'postgres://workmesh:workmesh@localhost/workmesh', REDIS_URL: 'redis://localhost:6379', SESSION_SECRET: '0123456789abcdef0123456789abcdef', AUTH_RATE_LIMIT_REDIS_PREFIX: 'authrl:{unsafe}' })).toThrow()
  })
})
