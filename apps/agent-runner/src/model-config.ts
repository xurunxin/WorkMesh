export type ProbeProtocol = 'openai-completions' | 'openai-responses'

/** Pi resolves the fixed environment reference at request time. No key enters models.json. */
export function minimaxProbeModels(protocol: ProbeProtocol) {
  return {
    providers: {
      'workmesh-minimax-cn': {
        baseUrl: 'https://api.minimax.cn/v1',
        api: protocol,
        apiKey: '$MINIMAX_CN_API_KEY',
        models: [{
          id: 'MiniMax-M3', name: 'MiniMax M3', reasoning: false,
          input: ['text'],
          // Pi requires numeric cost fields. WorkMesh does not treat these
          // placeholders as verified price or emit a cost estimate.
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 204_800, maxTokens: 4_096,
        }],
      },
    },
  }
}
