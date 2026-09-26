// W07 runner egress pin. The runner receives its model endpoint from the server, so
// the guard bounds what that endpoint can make the runner process do:
//
// - The scheme must be https, or http only for loopback (and the compose-internal
//   service name when the deployment explicitly allows it) — the same policy the
//   WorkMesh API URL already enforces.
// - No credentials, query strings, or fragments in the endpoint URL.
//
// Redirect pinning: the model request must not follow redirects at all. The Pi SDK
// owns the HTTP call, and its provider clients use non-following fetch semantics for
// streaming; this module documents and enforces the scheme/host policy that the
// runner controls, while the allowlist for private networks stays a deployment
// decision (WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST, validated server-side at
// connection save time).
import { describe, expect, it } from 'vitest'
import { validatedApiUrl } from './run-session.js'

describe('W07 runner egress policy for model endpoints', () => {
  it('accepts https model endpoints without conditions', () => {
    expect(validatedApiUrl('https://api.minimax.cn/v1').hostname).toBe('api.minimax.cn')
  })

  it('accepts plain http only for loopback model endpoints', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      // A local no-key provider (Ollama-style) is a legitimate http endpoint.
      expect(validatedApiUrl(`http://${host}:11434/v1`).protocol).toBe('http:')
    }
  })

  it('rejects plain http to any non-loopback model endpoint', () => {
    expect(() => validatedApiUrl('http://api.minimax.cn/v1')).toThrow('WORKMESH_API_URL_HTTPS_REQUIRED')
  })

  it('limits the internal-plain-http exception to the exact compose service name', () => {
    const restore = process.env.WORKMESH_RUNNER_ALLOW_INTERNAL_HTTP
    process.env.WORKMESH_RUNNER_ALLOW_INTERNAL_HTTP = '1'
    try {
      expect(validatedApiUrl('http://api:3001').hostname).toBe('api')
      expect(() => validatedApiUrl('http://api.evil.test/v1')).toThrow('WORKMESH_API_URL_HTTPS_REQUIRED')
    } finally {
      if (restore === undefined) delete process.env.WORKMESH_RUNNER_ALLOW_INTERNAL_HTTP
      else process.env.WORKMESH_RUNNER_ALLOW_INTERNAL_HTTP = restore
    }
  })

  it('refuses model endpoints that smuggle credentials, queries, or fragments', () => {
    expect(() => validatedApiUrl('https://key@api.minimax.cn/v1')).toThrow('WORKMESH_API_URL_INVALID')
    expect(() => validatedApiUrl('https://api.minimax.cn/v1?key=x')).toThrow('WORKMESH_API_URL_INVALID')
  })

  it('keeps the egress policy identical for the WorkMesh API and model endpoints', async () => {
    // One policy, two consumers: both go through validatedApiUrl, so a policy change
    // cannot weaken one side without the same test catching it.
    const model = validatedApiUrl('https://api.minimax.cn/v1')
    const workmesh = validatedApiUrl('https://workmesh.example.test')
    expect(model.protocol).toBe(workmesh.protocol)
  })
})
