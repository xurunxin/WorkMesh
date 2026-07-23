import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Db } from '@workmesh/db'
import { describe, expect, it } from 'vitest'
import {
  createAgentWebhookWorker,
  decryptWebhookSecret,
  encryptWebhookSecretForTest,
  isUnsafeWebhookAddress,
  masterKeyFromEnvironment,
  resolveWebhookTarget,
  retryDelaySeconds,
  signWebhook,
} from './agent-webhook.js'

describe('agent webhook signing', () => {
  it('signs exactly timestamp, dot, and the unmodified JSON body', () => {
    const secret = Buffer.from('agent-secret')
    const body = '{"events":[{"id":"evt_1"}]}'
    const signature = signWebhook(secret, 1_784_745_000, body)
    const expected = createHmac('sha256', secret).update(`1784745000.${body}`).digest('hex')
    expect(signature).toBe(`v1=${expected}`)
  })

  it('decrypts AES-GCM webhook secrets only with the configured 32-byte key', () => {
    const key = Buffer.alloc(32, 3)
    const encrypted = encryptWebhookSecretForTest(Buffer.from('rotated-secret'), key)
    expect(decryptWebhookSecret(encrypted, key).toString()).toBe('rotated-secret')
    expect(() => masterKeyFromEnvironment('short')).toThrow('exactly 32 bytes')
  })

  it('uses bounded retry delays with deterministic jitter', () => {
    expect(retryDelaySeconds(1, () => 0)).toBe(0)
    expect(retryDelaySeconds(2, () => 0)).toBe(27)
    expect(retryDelaySeconds(6, () => 1)).toBe(7_920)
  })

  it('rejects unsafe URL forms and private IPv4/IPv6 DNS answers by default', async () => {
    const privateDns = async () => [{ address: '127.0.0.1', family: 4 as const }]
    await expect(resolveWebhookTarget('file:///etc/passwd', { dnsLookup: privateDns })).rejects.toMatchObject({ code: 'UNSAFE_WEBHOOK_TARGET', retryable: false })
    await expect(resolveWebhookTarget('https://user:pass@agent.example/events', { dnsLookup: privateDns })).rejects.toMatchObject({ code: 'UNSAFE_WEBHOOK_TARGET', retryable: false })
    await expect(resolveWebhookTarget('https://@agent.example/events', { dnsLookup: privateDns })).rejects.toMatchObject({ code: 'UNSAFE_WEBHOOK_TARGET', retryable: false })
    await expect(resolveWebhookTarget('https://agent.example/events', { dnsLookup: privateDns })).rejects.toMatchObject({ code: 'UNSAFE_WEBHOOK_TARGET', retryable: false })
    await expect(resolveWebhookTarget('http://[::1]/events')).rejects.toMatchObject({ code: 'UNSAFE_WEBHOOK_TARGET', retryable: false })
    expect(isUnsafeWebhookAddress('169.254.1.2')).toBe(true)
    expect(isUnsafeWebhookAddress('fe80::1')).toBe(true)
    expect(isUnsafeWebhookAddress('::ffff:127.0.0.1')).toBe(true)
  })

  it('allows public DNS answers and explicitly enabled private self-hosted targets', async () => {
    const publicDns = async () => [{ address: '8.8.8.8', family: 4 as const }]
    const privateDns = async () => [{ address: '10.20.30.40', family: 4 as const }]
    await expect(resolveWebhookTarget('https://agent.example/events', { dnsLookup: publicDns })).resolves.toMatchObject({ addresses: [{ address: '8.8.8.8' }] })
    await expect(resolveWebhookTarget('http://agent.internal/events', { dnsLookup: privateDns, allowPrivateAgentWebhooks: true })).resolves.toMatchObject({ addresses: [{ address: '10.20.30.40' }] })
    const previous = process.env.ALLOW_PRIVATE_AGENT_WEBHOOKS
    process.env.ALLOW_PRIVATE_AGENT_WEBHOOKS = 'true'
    try {
      await expect(resolveWebhookTarget('http://agent.internal/events', { dnsLookup: privateDns })).resolves.toMatchObject({ addresses: [{ address: '10.20.30.40' }] })
    } finally {
      if (previous === undefined) delete process.env.ALLOW_PRIVATE_AGENT_WEBHOOKS
      else process.env.ALLOW_PRIVATE_AGENT_WEBHOOKS = previous
    }
  })

  it('pins the validated DNS answer for the actual self-hosted HTTP connection', async () => {
    let receivedHost = ''
    const server = createServer((request, response) => {
      receivedHost = request.headers.host ?? ''
      request.resume()
      response.writeHead(204).end()
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    try {
      const port = (server.address() as AddressInfo).port
      const masterKey = Buffer.alloc(32, 4)
      const encrypted = encryptWebhookSecretForTest(Buffer.from('test-secret'), masterKey)
      const db = { query: async () => ({ rowCount: 1, rows: [] }) } as unknown as Db
      const worker = createAgentWebhookWorker({
        db,
        masterKey,
        allowPrivateAgentWebhooks: true,
        dnsLookup: async () => [{ address: '127.0.0.1', family: 4 }],
      })
      await worker.deliver({
        id: 'delivery-id',
        agentId: 'agent-id',
        endpointId: 'endpoint-id',
        secretVersion: 1,
        deliveryId: 'del_test',
        eventId: 'event-id',
        eventType: 'agent.session.created',
        sessionId: null,
        payload: {},
        endpointUrl: `http://agent.invalid:${port}/events`,
        secretCiphertext: encrypted.ciphertext,
        secretIv: encrypted.iv,
        secretAuthTag: encrypted.authTag,
        keyVersion: '1',
        attemptCount: 1,
      })
      expect(receivedHost).toBe(`agent.invalid:${port}`)
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
