import { afterEach, describe, expect, it } from 'vitest'
import { normalizeLlmBaseUrl } from './workbench-llm-connections.js'

const initialAllowlist = process.env.WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST
afterEach(() => {
  if (initialAllowlist === undefined) delete process.env.WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST
  else process.env.WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST = initialAllowlist
})

describe('LLM base URL policy', () => {
  it('normalizes one endpoint suffix and rejects duplicate protocol paths', () => {
    expect(normalizeLlmBaseUrl('https://api.minimax.cn/v1/chat/completions/', false)).toBe('https://api.minimax.cn/v1')
    expect(normalizeLlmBaseUrl('https://api.minimax.cn/v1/responses', false)).toBe('https://api.minimax.cn/v1')
    expect(() => normalizeLlmBaseUrl('https://api.minimax.cn/v1/responses/responses', false)).toThrow()
  })

  it('rejects embedded credentials, queries, fragments, insecure URLs and encoded separators', () => {
    for (const url of [
      'http://api.minimax.cn/v1', 'https://user:pass@api.minimax.cn/v1',
      'https://api.minimax.cn/v1?key=x', 'https://api.minimax.cn/v1#key',
      'https://api.minimax.cn/v1%2fprivate', 'https://localhost./v1',
    ]) expect(() => normalizeLlmBaseUrl(url, false)).toThrow()
  })

  it('requires both workspace administrator authority and a deployment allowlist for private hosts', () => {
    delete process.env.WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST
    expect(() => normalizeLlmBaseUrl('https://127.0.0.1:9000/v1', true)).toThrow()
    expect(() => normalizeLlmBaseUrl('https://[::1]:9000/v1', true)).toThrow()
    expect(() => normalizeLlmBaseUrl('https://[::ffff:127.0.0.1]:9000/v1', true)).toThrow()
    process.env.WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST = '127.0.0.1,::1'
    expect(() => normalizeLlmBaseUrl('https://127.0.0.1:9000/v1', false)).toThrow()
    expect(normalizeLlmBaseUrl('https://127.0.0.1:9000/v1', true)).toBe('https://127.0.0.1:9000/v1')
    expect(normalizeLlmBaseUrl('https://[::1]:9000/v1', true)).toBe('https://[::1]:9000/v1')
  })
})
