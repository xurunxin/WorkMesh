import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { featureDefinitions } from '@workmesh/contracts'
import {
  loadConfig,
  loadFeatureConfig,
  loadRealtimeRedisHintConfig,
  loadReleaseInfo,
} from './index.js'

const bootstrapMaterial = randomBytes(32)
const bootstrapToken = bootstrapMaterial.toString('base64url')
const paginationMaterial = randomBytes(32)
const baseEnvironment = {
  DATABASE_URL: 'postgres://workmesh:workmesh@localhost/workmesh',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_SECRET: '0123456789abcdef0123456789abcdef',
  WORKMESH_BOOTSTRAP_TOKEN: bootstrapToken,
  PAGINATION_CURSOR_KEYS: `test-1:${paginationMaterial.toString('base64url')}`,
  PAGINATION_CURSOR_ACTIVE_KID: 'test-1',
}

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
    const config = loadConfig({ ...baseEnvironment, AUTH_RATE_LIMIT_REDIS_PREFIX: 'authrl:test:config', AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS: '127.0.0.1/32, 2001:db8::/32', AUTH_RATE_LIMIT_SUBJECT_BURST: '12', AUTH_RATE_LIMIT_SUMMARY_INTERVAL_MS: '5000' })
    expect(config.AUTH_RATE_LIMIT_REDIS_PREFIX).toBe('authrl:test:config')
    expect(config.AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS).toEqual(['127.0.0.1/32', '2001:db8::/32'])
    expect(config.AUTH_RATE_LIMIT_SUBJECT_BURST).toBe(12)
    expect(config.AUTH_RATE_LIMIT_SUMMARY_INTERVAL_MS).toBe(5000)
    expect(() => loadConfig({ ...baseEnvironment, AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS: 'not-a-network' })).toThrow()
    expect(() => loadConfig({ ...baseEnvironment, AUTH_RATE_LIMIT_REDIS_PREFIX: 'authrl:{unsafe}' })).toThrow()
  })

  it('bounds realtime recovery and delivery settings', () => {
    const config = loadConfig({
      ...baseEnvironment,
      REALTIME_HEALTHY_RECONCILE_MS: '20000',
      REALTIME_FALLBACK_RECONCILE_MS: '750',
      REALTIME_BATCH_LIMIT: '125',
      REALTIME_HEARTBEAT_MS: '10000',
      REALTIME_BACKPRESSURE_TIMEOUT_MS: '2500',
      REALTIME_MAX_CLIENTS: '250',
      WORKMESH_REALTIME_REDIS_MAXLEN: '5000',
    })
    expect(config.REALTIME_HEALTHY_RECONCILE_MS).toBe(20_000)
    expect(config.REALTIME_FALLBACK_RECONCILE_MS).toBe(750)
    expect(config.REALTIME_BATCH_LIMIT).toBe(125)
    expect(config.REALTIME_HEARTBEAT_MS).toBe(10_000)
    expect(config.REALTIME_BACKPRESSURE_TIMEOUT_MS).toBe(2_500)
    expect(config.REALTIME_MAX_CLIENTS).toBe(250)
    expect(config.WORKMESH_REALTIME_REDIS_MAXLEN).toBe(5_000)
    expect(loadRealtimeRedisHintConfig({
      REDIS_URL: baseEnvironment.REDIS_URL,
      WORKMESH_REALTIME_REDIS_MAXLEN: '5000',
    })).toEqual({
      redisUrl: baseEnvironment.REDIS_URL,
      maxLen: 5_000,
    })
    expect(() => loadConfig({
      ...baseEnvironment,
      WORKMESH_REALTIME_REDIS_MAXLEN: '99',
    })).toThrow()
    expect(() => loadConfig({
      ...baseEnvironment,
      REALTIME_HEALTHY_RECONCILE_MS: '1000',
      REALTIME_FALLBACK_RECONCILE_MS: '2000',
    })).toThrow(/fallback reconciliation/)
  })

  it('fails closed for production bootstrap configuration', () => {
    expect(() => loadConfig({ ...baseEnvironment, NODE_ENV: 'production', WORKMESH_BOOTSTRAP_TOKEN: undefined })).toThrow(/required in production/)
    expect(() => loadConfig({ ...baseEnvironment, NODE_ENV: 'production', WORKMESH_BOOTSTRAP_ALLOW_LOOPBACK: 'true' })).toThrow(/forbidden in production/)
    expect(loadConfig({ ...baseEnvironment, NODE_ENV: 'production' }).WORKMESH_BOOTSTRAP_TOKEN).toBe(bootstrapToken)
  })

  it('allows tokenless bootstrap only for an explicit isolated non-production loopback bind', () => {
    const loopback = loadConfig({
      ...baseEnvironment,
      NODE_ENV: 'development',
      API_HOST: '127.0.0.1',
      WORKMESH_BOOTSTRAP_TOKEN: undefined,
      WORKMESH_BOOTSTRAP_ALLOW_LOOPBACK: 'true',
    })
    expect(loopback.bootstrapAllowLoopback).toBe(true)
    expect(() => loadConfig({ ...baseEnvironment, WORKMESH_BOOTSTRAP_TOKEN: undefined })).toThrow(/required unless/)
    expect(() => loadConfig({
      ...baseEnvironment,
      API_HOST: '0.0.0.0',
      WORKMESH_BOOTSTRAP_TOKEN: undefined,
      WORKMESH_BOOTSTRAP_ALLOW_LOOPBACK: 'true',
    })).toThrow(/API_HOST/)
    expect(() => loadConfig({
      ...baseEnvironment,
      API_HOST: '::1',
      WORKMESH_BOOTSTRAP_TOKEN: undefined,
      WORKMESH_BOOTSTRAP_ALLOW_LOOPBACK: 'true',
      AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS: '127.0.0.1/32',
    })).toThrow(/trusted proxy/)
  })

  it('rejects malformed, noncanonical, placeholder, and low-diversity bootstrap credentials without echoing them', () => {
    expect(() => loadConfig({ ...baseEnvironment, WORKMESH_BOOTSTRAP_TOKEN: 'not-base64url' })).toThrow(/canonical unpadded base64url/)
    expect(() => loadConfig({ ...baseEnvironment, WORKMESH_BOOTSTRAP_TOKEN: `${bootstrapToken}=` })).toThrow(/canonical unpadded base64url/)
    expect(() => loadConfig({
      ...baseEnvironment,
      WORKMESH_BOOTSTRAP_TOKEN: randomBytes(31).toString('base64url'),
    })).toThrow(/32 to 256/)
    expect(() => loadConfig({ ...baseEnvironment, WORKMESH_BOOTSTRAP_TOKEN: 'Q0hBTkdFX01FX3BsYWNlaG9sZGVyX2Jvb3RzdHJhcF90b2tlbg' })).toThrow(/placeholder/)
    const lowDiversity = Buffer.alloc(32, 0x2a).toString('base64url')
    expect(() => loadConfig({ ...baseEnvironment, WORKMESH_BOOTSTRAP_TOKEN: lowDiversity })).toThrow(/low-diversity/)
    try {
      loadConfig({ ...baseEnvironment, WORKMESH_BOOTSTRAP_TOKEN: lowDiversity })
      throw new Error('expected low-diversity bootstrap token rejection')
    } catch (error) {
      expect(String(error)).not.toContain(lowDiversity)
    }
  })

  it('checks periodic patterns and configured secret reuse against decoded key material', () => {
    const repeatedPhrase = Buffer.from('repeated-key-123'.repeat(2)).toString('base64url')
    expect(() => loadConfig({
      ...baseEnvironment,
      WORKMESH_BOOTSTRAP_TOKEN: repeatedPhrase,
    })).toThrow(/repeated/)
    expect(() => loadConfig({
      ...baseEnvironment,
      SESSION_SECRET: bootstrapToken,
      WORKMESH_BOOTSTRAP_TOKEN: bootstrapToken,
    })).toThrow(/reuse another configured secret/)
    expect(() => loadConfig({
      ...baseEnvironment,
      AUTH_RATE_LIMIT_HMAC_KEY: bootstrapToken,
      WORKMESH_BOOTSTRAP_TOKEN: bootstrapToken,
    })).toThrow(/reuse another configured secret/)
    expect(() => loadConfig({
      ...baseEnvironment,
      WORKMESH_MASTER_KEY: bootstrapMaterial.toString('hex'),
      WORKMESH_BOOTSTRAP_TOKEN: bootstrapToken,
    })).toThrow(/reuse another configured secret/)
  })

  it('accepts a runtime-generated production bootstrap token without claiming entropy validation', () => {
    const generated = randomBytes(32).toString('base64url')
    expect(loadConfig({
      ...baseEnvironment,
      NODE_ENV: 'production',
      WORKMESH_BOOTSTRAP_TOKEN: generated,
    }).WORKMESH_BOOTSTRAP_TOKEN).toBe(generated)
  })

  it('fails closed and rejects unsafe pagination cursor key rings', () => {
    expect(() => loadConfig({
      ...baseEnvironment,
      NODE_ENV: 'production',
      PAGINATION_CURSOR_KEYS: undefined,
      PAGINATION_CURSOR_ACTIVE_KID: undefined,
    })).toThrow(/required in production/)
    expect(() => loadConfig({
      ...baseEnvironment,
      PAGINATION_CURSOR_ACTIVE_KID: 'missing',
    })).toThrow(/configured pagination cursor key/)
    expect(() => loadConfig({
      ...baseEnvironment,
      PAGINATION_CURSOR_KEYS: `test-1:${Buffer.alloc(32, 0x41).toString('base64url')}`,
    })).toThrow(/repeated or low-diversity/)
    const reused = randomBytes(32).toString('base64url')
    expect(() => loadConfig({
      ...baseEnvironment,
      SESSION_SECRET: reused,
      PAGINATION_CURSOR_KEYS: `test-1:${reused}`,
    })).toThrow(/reuse another configured secret/)
    expect(() => loadConfig({
      ...baseEnvironment,
      WORKMESH_BOOTSTRAP_TOKEN: reused,
      PAGINATION_CURSOR_KEYS: `test-1:${reused}`,
    })).toThrow(/reuse another configured secret/)
    expect(() => loadConfig({
      ...baseEnvironment,
      PAGINATION_CURSOR_KEYS: `test-1:${paginationMaterial.toString('base64url')},test-2:${paginationMaterial.toString('base64url')}`,
    })).toThrow(/distinct material/)
  })
})
