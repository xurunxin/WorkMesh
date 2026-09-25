import { describe, expect, it } from 'vitest'
import { workbenchRunnerCredentialSchema } from '@workmesh/contracts'
import { configuredModels } from './configured-model.js'

const id = '11111111-1111-4111-8111-111111111111'
describe('configured Pi model', () => {
  it('pins protocol and model while keeping the credential out of models.json', () => {
    const credential = workbenchRunnerCredentialSchema.parse({
      runnerAttemptId: id, fenceToken: 'fence-token-test-value',
      baseUrl: 'https://api.minimax.cn/v1', apiType: 'openai-responses',
      apiKey: 'secret-value-never-in-model-file', modelId: 'MiniMax-M3', modelName: 'M3',
      capabilities: { inputModalities: ['text'], toolCalling: true, reasoning: false,
        contextWindowTokens: 204800, maxOutputTokens: 4096 },
      connectionRevision: 2, modelRevision: 1,
      messages: [{ role: 'user', content_markdown: 'Hello' }],
    })
    const configured = configuredModels(credential)
    expect(configured.providers['workmesh-configured'].api).toBe('openai-responses')
    expect(configured.providers['workmesh-configured'].models[0]?.id).toBe('MiniMax-M3')
    expect(JSON.stringify(configured)).toContain('$WORKMESH_RUNNER_MODEL_KEY')
    expect(JSON.stringify(configured)).not.toContain(credential.apiKey)
  })
})
