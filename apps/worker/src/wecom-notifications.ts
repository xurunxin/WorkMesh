import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { ChannelAdapter, ChannelAdmission, ChannelPermit } from './automation.js'
import { fetchResolvedWebhook, resolveWebhookTarget, type WebhookDnsLookup, type WebhookFetch } from './agent-webhook.js'

export type WecomRedis = {
  eval: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<unknown>
}

// Redis TIME 是窗口时钟。额度保留到 D+60s，token 的 60s TTL 不释放额度。
// sentinel 保持桶存在；若已使用桶被单独淘汰，也按状态丢失共同冷却。
export const WECOM_RATE_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1])*1000 + math.floor(tonumber(time[2])/1000)
local state, quota, serial = KEYS[1], KEYS[2], KEYS[3]
local action, token, fingerprint = ARGV[1], ARGV[2], ARGV[3]
local epoch = redis.call('HGET', state, 'epoch')
if not epoch or (redis.call('HEXISTS', state, fingerprint)==1 and redis.call('EXISTS', quota)==0) then
  epoch = token
  redis.call('HSET', state, 'epoch', epoch, 'ready', now+120000)
end
local ready = tonumber(redis.call('HGET', state, 'ready'))
if now < ready then return {0, ready-now, epoch} end
if action == 'reserve' then
  redis.call('HSET', state, fingerprint, '1')
  redis.call('ZADD', quota, '+inf', '__sentinel')
  redis.call('ZREMRANGEBYSCORE', quota, '-inf', now)
  if redis.call('EXISTS', serial)==1 then return {0, redis.call('PTTL', serial), epoch} end
  if redis.call('ZCARD', quota)>20 then
    local first = redis.call('ZRANGE', quota, 0, 0, 'WITHSCORES')
    return {0, math.max(1, tonumber(first[2])-now), epoch}
  end
  local deadline = now+60000
  redis.call('ZADD', quota, deadline+60000, token)
  redis.call('SET', serial, token, 'PX', 60000)
  return {1, 60000, epoch}
end
if ARGV[4] ~= epoch then return {0, 120000, epoch} end
local score = redis.call('ZSCORE', quota, token)
if not score then return {0, 120000, epoch} end
if action == 'finish' then
  redis.call('ZADD', quota, math.max(tonumber(score), now+60000), token)
  if redis.call('GET', serial)==token then redis.call('DEL', serial) end
  return {1, 0, epoch}
end
if redis.call('GET', serial) ~= token then return {0, 0, epoch} end
return {1, math.max(0, tonumber(score)-60000-now), epoch}
`

const rateResponse = z.tuple([z.number().int(), z.number().finite(), z.string()])
export function createWecomAdmission(redis: WecomRedis, namespace = 'workmesh:{wecom}'): ChannelAdmission {
  if (!/^[A-Za-z0-9:{}_-]+$/.test(namespace)) throw new Error('WECOM_RATE_NAMESPACE_INVALID')
  const call = async (keys: string[], args: string[]) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return rateResponse.parse(await Promise.race([
        redis.eval(WECOM_RATE_SCRIPT, { keys, arguments: args }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('WECOM_RATE_UNAVAILABLE')), 1000) }),
      ]))
    } finally { clearTimeout(timer) }
  }
  return {
    reserve: async fingerprint => {
      if (!/^hmac:[a-f0-9]{64}$/.test(fingerprint)) return { retryAfterMs: 60_000 }
      const token = randomUUID(), keys = [`${namespace}:state`, `${namespace}:${fingerprint}:quota`, `${namespace}:${fingerprint}:serial`]
      const started = performance.now()
      try {
        const [allowed, remaining, epoch] = await call(keys, ['reserve', token, fingerprint])
        if (!allowed) return { retryAfterMs: Math.max(100, remaining) }
        // 往返耗时只缩短本机预算，不依赖 Worker 与 Redis 的墙钟同步。
        const deadline = started + Math.min(60_000, remaining)
        const permit: ChannelPermit = {
          remainingMs: async () => {
            try {
              const [valid, left] = await call(keys, ['validate', token, fingerprint, epoch])
              return valid ? Math.max(0, Math.min(left, deadline - performance.now())) : 0
            } catch { return 0 }
          },
          finish: async () => { try { await call(keys, ['finish', token, fingerprint, epoch]) } catch { /* 未知完成：额度保留到 D+60s。 */ } },
        }
        return { permit, retryAfterMs: 0 }
      } catch { return { retryAfterMs: 60_000 } }
    },
  }
}

const providerResponse = z.object({ errcode: z.number().int() })
const knownErrors = new Set([45009, 93000, 93001, 93004, 93006, 93008, 93017, 93019])

export function validateWecomEndpoint(raw: string): string {
  try {
    const url = new URL(raw), key = url.searchParams.get('key')
    if (!key || raw !== `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${encodeURIComponent(key)}`) throw new Error()
    return raw
  } catch { throw new Error('WECOM_ENDPOINT_INVALID') }
}

export function wecomWebOrigin(raw: string): string {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error()
    return url.origin
  } catch { throw new Error('WECOM_WEB_ORIGIN_INVALID') }
}

export function wecomMarkdown(relativeHref: string, origin: string): string {
  if (!relativeHref.startsWith('/?view=inbox&attentionSelected=') || /[\\\u0000-\u0020\u007f]/.test(relativeHref)) throw new Error('WECOM_LINK_INVALID')
  const url = new URL(relativeHref, origin)
  if (url.origin !== origin || url.hash || url.searchParams.size !== 2 || !/^v1:[a-z_]+:[a-f\d-]{36}$/.test(url.searchParams.get('attentionSelected') ?? '')) throw new Error('WECOM_LINK_INVALID')
  const content = `WorkMesh 有待处理事项\n请登录 WorkMesh 查看并处理。\n[打开 WorkMesh](${url.href})`
  if (Buffer.byteLength(content, 'utf8') > 4096) throw new Error('WECOM_PAYLOAD_TOO_LARGE')
  return content
}

export function createWecomNotificationAdapter({ webOrigin, admission, fetcher = fetchResolvedWebhook, dnsLookup }: {
  webOrigin: string
  admission: ChannelAdmission
  fetcher?: WebhookFetch
  dnsLookup?: WebhookDnsLookup
}): ChannelAdapter {
  const origin = wecomWebOrigin(webOrigin)
  return {
    admission,
    send: async ({ secretMaterial, content, signal, deadline = performance.now() + 5000 }) => {
      let url: string, body: string
      try {
        url = validateWecomEndpoint(secretMaterial)
        body = JSON.stringify({ msgtype: 'markdown', markdown: { content: wecomMarkdown(content.url, origin) } })
      } catch (error) {
        const code = error instanceof Error ? error.message : ''
        return { result: 'failed', errorCode: ['WECOM_ENDPOINT_INVALID', 'WECOM_LINK_INVALID', 'WECOM_PAYLOAD_TOO_LARGE'].includes(code) ? code : 'WECOM_INPUT_INVALID' }
      }
      let target: Awaited<ReturnType<typeof resolveWebhookTarget>>
      if (signal.aborted || performance.now() >= deadline) return { result: 'failed', errorCode: 'WECOM_NOT_SENT' }
      let onAbort: (() => void) | undefined
      try {
        target = await Promise.race([
          resolveWebhookTarget(url, { dnsLookup, allowPrivateAgentWebhooks: false }),
          new Promise<never>((_, reject) => {
            onAbort = () => reject(new Error('WECOM_NOT_SENT'))
            signal.addEventListener('abort', onAbort, { once: true })
          }),
        ])
      }
      catch { return { result: 'failed', errorCode: 'WECOM_DNS_REJECTED' } }
      finally { if (onAbort) signal.removeEventListener('abort', onAbort) }
      // 事件循环暂停可能延后 Abort 回调；DNS 后按单调截止上界再校验，不能迟发。
      if (signal.aborted || performance.now() >= deadline) return { result: 'failed', errorCode: 'WECOM_NOT_SENT' }
      try {
        const response = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) }, body, redirect: 'error', signal, resolvedAddresses: target.addresses, readBody: true })
        if (!response.body || Buffer.byteLength(response.body) > 64 * 1024) throw new Error()
        const parsed = providerResponse.parse(JSON.parse(response.body))
        if (parsed.errcode !== 0) return { result: 'failed', errorCode: knownErrors.has(parsed.errcode) ? `WECOM_${parsed.errcode}` : 'WECOM_PROVIDER_REJECTED' }
        if (response.status < 200 || response.status >= 300) throw new Error()
        return { result: 'delivered' }
      } catch { return { result: 'unknown', errorCode: 'WECOM_RESULT_UNKNOWN' } }
    },
  }
}
