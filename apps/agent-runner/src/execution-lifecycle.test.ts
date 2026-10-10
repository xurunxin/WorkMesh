import { describe, expect, it } from 'vitest'
import { ExecutionLifecycle, sessionWaitIntentSchema } from './execution-lifecycle.js'
import { promptFor } from './run-session.js'

describe('执行等待闭门和恢复上下文', () => {
  it('原请求失响应后二次403仍不确定，不能以二次拒绝清除首次effect',async()=>{
    const lifecycle=new ExecutionLifecycle()
    const rejection=Object.assign(new Error('second rejected',{cause:new Error('original transport')}),{status:403,code:'DELEGATION_NOT_ACTIVE',unreconciled:true})
    await expect(lifecycle.tool(()=>lifecycle.request('POST',async()=>{throw rejection}))).rejects.toBe(rejection)
    lifecycle.close('wait')
    expect(lifecycle.reconciled).toBe(false)
  })
  it('停止优先于等待，拒绝新工具并等已开始工具静止', async () => {
    const lifecycle = new ExecutionLifecycle()
    let finish!: () => void
    const inFlight = lifecycle.tool(() => new Promise<void>(resolve => { finish = resolve }))
    lifecycle.close('wait')
    expect(lifecycle.reconciled).toBe(false)
    await expect(lifecycle.tool(async () => 'new side effect')).rejects.toThrow('RUNNER_TOOL_CLOSED')
    lifecycle.close('stop')
    lifecycle.close('timeout')
    lifecycle.close('external_state')
    lifecycle.close('wait')
    expect(lifecycle.exit).toBe('stop')
    finish()
    await inFlight
    expect(lifecycle.reconciled).toBe(true)
  })

  it('已开始写请求的未知响应阻止登记自动恢复等待', async () => {
    const lifecycle = new ExecutionLifecycle()
    await expect(lifecycle.tool(async () => { throw new TypeError('connection lost') })).rejects.toThrow()
    lifecycle.close('wait')
    expect(lifecycle.reconciled).toBe(false)
  })

  it.each([new SyntaxError('invalid response JSON'), Object.assign(new Error('internal error'), { status: 500, code: 'INTERNAL_ERROR' }),
    new Error('wrapped transport', { cause: new TypeError('response lost') })])('原写可能提交的错误保留未知标记：%s', async error => {
    const lifecycle = new ExecutionLifecycle()
    await expect(lifecycle.tool(() => lifecycle.request('POST', async () => { throw error }))).rejects.toThrow()
    lifecycle.close('wait')
    expect(lifecycle.reconciled).toBe(false)
  })

  it('明确领域拒绝和GET解码错误不假定新增写入', async () => {
    const lifecycle = new ExecutionLifecycle()
    await expect(lifecycle.tool(() => lifecycle.request('POST', async () => {
      throw Object.assign(new Error('rejected'), { status: 403, code: 'CAPABILITY_DENIED' })
    }))).rejects.toThrow()
    await expect(lifecycle.tool(() => lifecycle.request('GET', async () => { throw new SyntaxError('invalid JSON') }))).rejects.toThrow()
    lifecycle.close('wait')
    expect(lifecycle.reconciled).toBe(true)
  })

  it('完整批准hash通过，裸hex和错主体等待结构拒绝', () => {
    const approval = { id: '11111111-1111-4111-8111-111111111111', actionPayloadHash: `sha256:${'a'.repeat(64)}` }
    expect(sessionWaitIntentSchema.parse({ state: 'awaiting_approval', reason: '请批准该动作', approval }).approval).toEqual(approval)
    expect(() => sessionWaitIntentSchema.parse({ state: 'awaiting_approval', reason: '等待', approval: { ...approval, actionPayloadHash: 'a'.repeat(64) } })).toThrow()
    expect(() => sessionWaitIntentSchema.parse({ state: 'awaiting_input', reason: '等待', approval })).toThrow()
    expect(() => sessionWaitIntentSchema.parse({ state: 'awaiting_approval', reason: '等待' })).toThrow()
  })

  it('续接使用公开记录和服务验证的触发，不伪造最后Human消息', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const messages = [{ id, role: 'user' as const, content_markdown: '原请求' },
      { id, role: 'assistant' as const, content_markdown: '等待批准' },
      { id, role: 'system' as const, content_markdown: '批准已由服务器核验' }]
    expect(() => promptFor(messages)).toThrow('RUNNER_LAST_MESSAGE_NOT_USER')
    const prompt = promptFor(messages, { waitId: id, sourceTurnId: id, sourceAttemptId: id, trigger: { kind: 'approval', id } })
    expect(prompt).toContain('[3 system]')
    expect(prompt).toContain('等待批准')
    expect(prompt).not.toContain('Current user request:')
  })
})
