import { llmModelCapabilitiesSchema, workbenchRunnerCredentialSchema } from '@workmesh/contracts'

type Credential = ReturnType<typeof workbenchRunnerCredentialSchema.parse>

/** Pi reads the per-process environment reference only when making a request. */
export function configuredModels(credential: Credential) {
  const capabilities = llmModelCapabilitiesSchema.parse(credential.capabilities)
  if (!capabilities.inputModalities.includes('text'))
    throw new Error('RUNNER_MODEL_TEXT_REQUIRED')
  return {
    providers: {
      'workmesh-configured': {
        baseUrl: credential.baseUrl,
        api: credential.apiType,
        apiKey: '$WORKMESH_RUNNER_MODEL_KEY',
        models: [{
          id: credential.modelId, name: credential.modelName,
          reasoning: capabilities.reasoning,
          input: capabilities.inputModalities,
          // Pi requires numeric cost fields. Zero here is an SDK placeholder,
          // never an asserted price or WorkMesh billing record.
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: capabilities.contextWindowTokens,
          maxTokens: capabilities.maxOutputTokens,
        }],
      },
    },
  }
}
