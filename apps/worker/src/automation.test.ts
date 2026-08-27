import { describe, expect, it } from 'vitest'
import { loadFeatureConfig } from '@workmesh/config'
import type { Db } from '@workmesh/db'
import { assertPublicWebhookTarget, createAutomationWorker, nextCronOccurrence } from './automation.js'

describe('Stage 4 automation scheduling', () => {
  it('calculates deterministic UTC cron occurrences', () => {
    expect(nextCronOccurrence('*/15 * * * *', new Date('2026-07-26T01:07:30Z')).toISOString())
      .toBe('2026-07-26T01:15:00.000Z')
    expect(nextCronOccurrence('0 9 * * 1-5', new Date('2026-07-24T09:01:00Z')).toISOString())
      .toBe('2026-07-27T09:00:00.000Z')
  })

  it('bounds cron grammar and rejects mapped-private webhook answers', async () => {
    expect(() => nextCronOccurrence('* * * * * *', new Date())).toThrow('CRON_UNSUPPORTED')
    await expect(assertPublicWebhookTarget(
      'https://webhook.example.test/events',
      async () => [{ address: '::ffff:127.0.0.1', family: 6 }],
    )).rejects.toMatchObject({ code: 'UNSAFE_WEBHOOK_TARGET', retryable: false })
  })

  it('does not query, claim, or effect disabled automation work', async () => {
    const tx = {
      query: async (sql: string) => {
        if (/automation_(?:rules|runs|effects)/.test(sql))
          throw new Error('disabled worker must not touch automation state')
        return { rows: [], rowCount: 0 }
      },
      release: () => undefined,
    }
    const db = { connect: async () => tx } as unknown as Db
    const sink = {
      callWebhook: async () => {
        throw new Error('disabled worker must not call external webhooks')
      },
      deliverBrowser: async () => {
        throw new Error('disabled worker must not deliver notifications')
      },
    }
    const worker = createAutomationWorker({ db, sink, features: loadFeatureConfig({}) })
    await expect(worker.claimEffects()).resolves.toEqual([])
    await expect(worker.tick()).resolves.toBeUndefined()
  })

  it('claims durable notification work independently of the Beta Planning feature gate', async () => {
    let claimed = false
    const tx = {
      query: async (sql: string) => {
        if (sql.includes('UPDATE notification_deliveries')) claimed = true
        return { rows: [], rowCount: 0 }
      },
      release: () => undefined,
    }
    const db = { connect: async () => tx } as unknown as Db
    const worker = createAutomationWorker({
      db,
      features: loadFeatureConfig({ WORKMESH_EXPERIMENTAL_AUTOMATION: 'true' }),
    })
    await expect(worker.claimNotifications()).resolves.toEqual([])
    expect(claimed).toBe(true)
  })
})
