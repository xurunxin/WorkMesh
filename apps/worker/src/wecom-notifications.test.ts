import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createWecomAdmission, createWecomNotificationAdapter, validateWecomEndpoint, wecomMarkdown, wecomWebOrigin } from './wecom-notifications.js'
import type { WebhookFetch } from './agent-webhook.js'

const endpoint = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=fake-key'
const origin = 'https://workmesh.example.test'
const href = `/?view=inbox&attentionSelected=${encodeURIComponent(`v1:inbox_item:${randomUUID()}`)}`
const input = () => ({ provider: 'wecom', secretMaterial: endpoint,
  content: { effectKey: 'private-effect', title: '私密标题', body: '私密正文', url: href, sourceRevision: 1 }, signal: new AbortController().signal })
const admission = { reserve: async () => ({ retryAfterMs: 60_000 }) }
const make = (fetcher: WebhookFetch) => createWecomNotificationAdapter({ webOrigin: origin, admission, fetcher, dnsLookup: async () => [{ address: '8.8.8.8', family: 4 }] })

describe('C2 企业微信只提醒与深链', () => {
  it('Redis 不可用或坏响应停止准入，不持久化提供方秘密', async () => {
    for (const evalRedis of [async () => { throw new Error('private connection details') }, async () => ['bad response']]) {
      const result = await createWecomAdmission({ eval: evalRedis }).reserve('hmac:' + 'a'.repeat(64))
      expect(result).toEqual({ retryAfterMs: 60000 })
    }
  })
  it('DNS 等待遇到 Abort 安全终止，零 HTTP 请求', async () => {
    const controller = new AbortController(), fetcher = vi.fn<WebhookFetch>()
    const adapter = createWecomNotificationAdapter({ webOrigin: origin, admission, fetcher, dnsLookup: () => new Promise(() => {}) })
    const result = adapter.send({ ...input(), signal: controller.signal }); controller.abort()
    expect(await result).toEqual({ result: 'failed', errorCode: 'WECOM_DNS_REJECTED' }); expect(fetcher).not.toHaveBeenCalled()
  })
  it('DNS 结束时单调截止已过，即使 Abort 回调尚未执行也零 HTTP 请求', async () => {
    let now = 0
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
    const fetcher = vi.fn<WebhookFetch>(), dnsLookup = vi.fn(async () => { now = 20; return [{ address: '8.8.8.8', family: 4 as const }] })
    try {
      const adapter = createWecomNotificationAdapter({ webOrigin: origin, admission, fetcher, dnsLookup })
      expect(await adapter.send({ ...input(), deadline: 10 })).toEqual({ result: 'failed', errorCode: 'WECOM_NOT_SENT' })
      expect(dnsLookup).toHaveBeenCalledOnce(); expect(fetcher).not.toHaveBeenCalled()
    } finally { clock.mockRestore() }
  })
  it('只发送固定 Markdown 和 canonical 深链，不发送私密内容、指派身份或决策', async () => {
    const fetcher = vi.fn<WebhookFetch>().mockResolvedValue({ status: 200, body: '{"errcode":0,"errmsg":"ok"}' })
    expect(await make(fetcher).send(input())).toEqual({ result: 'delivered' })
    const [url, init] = fetcher.mock.calls[0]!
    expect(url).toBe(endpoint)
    expect(init.redirect).toBe('error')
    expect(init.resolvedAddresses).toEqual([{ address: '8.8.8.8', family: 4 }])
    expect(init.headers['content-length']).toBe(String(Buffer.byteLength(init.body)))
    expect(JSON.parse(init.body)).toEqual({ msgtype: 'markdown', markdown: { content: wecomMarkdown(href, origin) } })
    for (const forbidden of ['私密', 'private-effect', 'fake-key', 'sourceRevision', 'decision', 'template_card']) expect(init.body).not.toContain(forbidden)
  })
  it.each([4095, 4096, 4097])('按 UTF-8 内容字节限制 %i，URL 不截断', limit => {
    const short = 'https://x.test', length = Buffer.byteLength(wecomMarkdown(href, short))
    const longOrigin = `https://${'x'.repeat(1 + limit - length)}.test`
    if (limit <= 4096) expect(Buffer.byteLength(wecomMarkdown(href, longOrigin))).toBe(limit)
    else expect(() => wecomMarkdown(href, longOrigin)).toThrow('WECOM_PAYLOAD_TOO_LARGE')
  })
  it.each(['http://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=fake-key', endpoint + '&x=1', endpoint + '&key=other', endpoint + '#x', endpoint.replace('https://', 'https://user@'), endpoint.replace('qyapi.', 'qyapi..'), endpoint.replace('fake-key', 'fake%2Dkey'), endpoint.replace('/send?', '/send/?'), endpoint.replace('.com/', '.com:443/'), endpoint + '\n', endpoint.replace('fake-key', '')])('拒绝非 canonical 端点，零调用：%s', async secretMaterial => {
    const fetcher = vi.fn<WebhookFetch>()
    expect(() => validateWecomEndpoint(secretMaterial)).toThrow('WECOM_ENDPOINT_INVALID')
    expect(await make(fetcher).send({ ...input(), secretMaterial })).toMatchObject({ result: 'failed', errorCode: 'WECOM_ENDPOINT_INVALID' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([45009, 93000, 93001, 93004, 93006, 93008, 93017, 93019, 999999])('映射明确拒绝 %i，errmsg 不返回', async errcode => {
    const result = await make(async () => ({ status: 200, body: JSON.stringify({ errcode, errmsg: endpoint }) })).send(input())
    expect(result).toMatchObject({ result: 'failed' })
    expect(JSON.stringify(result)).not.toContain('fake-key')
    expect(result.errorCode).toBe(errcode === 999999 ? 'WECOM_PROVIDER_REJECTED' : `WECOM_${errcode}`)
  })
  it.each(['not-json', '{}', '{"errcode":"0"}', '{"errcode":0.5}', 'x'.repeat(65537)])('畸形或超限响应进入 unknown', async body => {
    expect(await make(async () => ({ status: 200, body })).send(input())).toMatchObject({ result: 'unknown' })
  })
  it('不确定 HTTP 与断连进入 unknown，不能自动当失败重送', async () => {
    expect(await make(async () => ({ status: 503, body: '{"errcode":0}' })).send(input())).toMatchObject({ result: 'unknown' })
    expect(await make(async () => { throw new Error(endpoint) }).send(input())).toEqual({ result: 'unknown', errorCode: 'WECOM_RESULT_UNKNOWN' })
  })
  it('网络启动后 Abort 进入 unknown', async () => {
    const controller = new AbortController()
    const fetcher: WebhookFetch = async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('fake timeout')), { once: true })
      controller.abort()
    })
    expect(await make(fetcher).send({ ...input(), signal: controller.signal })).toMatchObject({ result: 'unknown' })
  })
  it('公共 DNS 检查拒绝私网，不能使用 Agent 私网 allowlist', async () => {
    const fetcher = vi.fn<WebhookFetch>()
    const adapter = createWecomNotificationAdapter({ webOrigin: origin, admission, fetcher, dnsLookup: async () => [{ address: '127.0.0.1', family: 4 }] })
    expect(await adapter.send(input())).toMatchObject({ result: 'failed', errorCode: 'WECOM_DNS_REJECTED' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each(['http://example.test', 'https://u:p@example.test', 'https://example.test/path', 'https://example.test/?x=1', 'https://example.test/#x'])('拒绝不符合部署契约的网页 origin：%s', value => {
    expect(() => wecomWebOrigin(value)).toThrow('WECOM_WEB_ORIGIN_INVALID')
  })
  it.each(['//evil.test', '/?view=inbox&attentionSelected=javascript:alert(1)', href + '&owner=other', href + '#decision'])('拒绝携带额外身份、动作或非 canonical 深链', value => {
    expect(() => wecomMarkdown(value, origin)).toThrow('WECOM_LINK_INVALID')
  })
})
