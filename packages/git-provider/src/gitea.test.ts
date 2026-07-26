import { describe, expect, it, vi } from 'vitest'
import {
  GiteaProvider,
  UnsupportedProviderCapability,
  giteaCapabilityMatrix,
} from './index.js'

describe('Gitea GitProvider adapter', () => {
  it('uses the provider port and reports unsupported capabilities with a typed error', async () => {
    const provider = new GiteaProvider({
      baseUrl: 'https://gitea.example.test',
      accessToken: 'test-token-which-is-long-enough',
      fetch: vi.fn(),
    })
    expect(giteaCapabilityMatrix).toMatchObject({
      create_branch: true,
      open_pull_request: true,
      retry_check: false,
    })
    await expect(provider.retryCheck({
      provider: 'gitea',
      connectionId: 'connection',
      repositoryId: 'repository',
      checkRunId: 'check',
    })).rejects.toEqual(expect.objectContaining<Partial<UnsupportedProviderCapability>>({
      code: 'PROVIDER_CAPABILITY_UNSUPPORTED',
      provider: 'gitea',
      capability: 'retry_check',
    }))
  })
})
