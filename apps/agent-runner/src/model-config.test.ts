import { describe, expect, it } from 'vitest'
import { minimaxProbeModels } from './model-config.js'

describe('MiniMax Pi model config', () => {
  it.each(['openai-completions', 'openai-responses'] as const)('pins %s without putting the credential into config', protocol => {
    const config = minimaxProbeModels(protocol)
    const provider = config.providers['workmesh-minimax-cn']
    expect(provider.api).toBe(protocol)
    expect(provider.baseUrl).toBe('https://api.minimax.cn/v1')
    expect(provider.apiKey).toBe('$MINIMAX_CN_API_KEY')
    expect(JSON.stringify(config)).not.toContain('Bearer ')
  })
})
