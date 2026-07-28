import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import { describe, expect, it } from 'vitest'
import { createPaginator } from './pagination.js'

const key = randomBytes(32)
const workspaceId = randomUUID()
const actorId = randomUUID()
const request = {
  actor: { id: actorId, workspaceId },
} as unknown as FastifyRequest
const config = {
  paginationCursorKeys: new Map([['current', key]]),
  paginationCursorActiveKid: 'current',
  PAGINATION_CURSOR_TTL_SECONDS: 900,
}
const binding = {
  route: '/api/v1/things',
  filters: { ownerId: actorId, state: 'open' },
  sort: [
    { key: 'updated_at', sql: 'thing.updated_at', direction: 'DESC' as const },
    { key: 'id', sql: 'thing.id', direction: 'DESC' as const },
  ],
}

const canonical = (value: Record<string, unknown>): string => JSON.stringify(
  Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))),
)
const sign = (value: Record<string, unknown>, kid = 'current'): string => {
  const body = Buffer.from(canonical(value)).toString('base64url')
  return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`
}

describe('opaque pagination cursors', () => {
  it('uses default 50, accepts 1 and 200, and rejects 201', () => {
    const paginator = createPaginator(config, () => 1_000_000)
    expect(paginator.prepare(request, {}, binding).limit).toBe(50)
    expect(paginator.prepare(request, { limit: 1 }, binding).limit).toBe(1)
    expect(paginator.prepare(request, { limit: 200 }, binding).limit).toBe(200)
    expect(() => paginator.prepare(request, { limit: 201 }, binding)).toThrow()
  })

  it('emits a cursor only for limit plus one and anchors it to the last returned row', () => {
    const paginator = createPaginator(config, () => 1_000_000)
    const page = paginator.prepare(request, { limit: 50 }, binding)
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: randomUUID(),
      updated_at: new Date(900_000 - index).toISOString(),
    }))
    expect(page.finish(rows.slice(0, 50))).toEqual({ items: rows.slice(0, 50), nextCursor: null })
    const response = page.finish(rows)
    expect(response.items).toHaveLength(50)
    expect(response.nextCursor).toEqual(expect.any(String))
    expect(paginator.decode(response.nextCursor!).values).toEqual([
      rows[49]!.updated_at,
      rows[49]!.id,
    ])
  })

  it('rejects tampering, truncation, noncanonical encoding, unknown versions, and unknown kids generically', () => {
    const now = 1_000
    const paginator = createPaginator(config, () => now * 1_000)
    const page = paginator.prepare(request, { limit: 1 }, binding)
    const token = page.finish([
      { id: randomUUID(), updated_at: new Date().toISOString() },
      { id: randomUUID(), updated_at: new Date().toISOString() },
    ]).nextCursor!
    const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`
    expect(() => paginator.decode(tampered)).toThrow(/invalid/)
    expect(() => paginator.decode(token.slice(0, 40))).toThrow(/invalid/)
    const [body, signature] = token.split('.')
    expect(() => paginator.decode(`${body}=.${signature}`)).toThrow(/invalid/)
    const base = paginator.decode(token)
    expect(() => paginator.decode(sign({ ...base, v: 2 }))).toThrow(/invalid/)
    expect(() => paginator.decode(sign({ ...base, kid: 'retired' }, 'retired'))).toThrow(/invalid/)
  })

  it('rejects expiry and all route, actor, workspace, filter, and sort mismatches', () => {
    let now = 1_000_000
    const paginator = createPaginator(config, () => now)
    const first = paginator.prepare(request, { limit: 1 }, binding).finish([
      { id: randomUUID(), updated_at: new Date().toISOString() },
      { id: randomUUID(), updated_at: new Date().toISOString() },
    ]).nextCursor!
    expect(() => paginator.prepare(request, { cursor: first }, { ...binding, route: '/api/v1/other' })).toThrow(/does not match/)
    expect(() => paginator.prepare(request, { cursor: first }, { ...binding, filters: { ownerId: actorId, state: 'closed' } })).toThrow(/does not match/)
    expect(() => paginator.prepare(request, { cursor: first }, { ...binding, sort: [...binding.sort].reverse() })).toThrow(/does not match/)
    expect(() => paginator.prepare({ actor: { id: randomUUID(), workspaceId } } as unknown as FastifyRequest, { cursor: first }, binding)).toThrow(/does not match/)
    expect(() => paginator.prepare({ actor: { id: actorId, workspaceId: randomUUID() } } as unknown as FastifyRequest, { cursor: first }, binding)).toThrow(/does not match/)
    now += 901_000
    expect(() => paginator.decode(first)).toThrow(/invalid/)
  })

  it('accepts retained rotation keys while emitting only the active key id', () => {
    const oldKey = randomBytes(32)
    const newKey = randomBytes(32)
    const oldPaginator = createPaginator({
      paginationCursorKeys: new Map([['old', oldKey]]),
      paginationCursorActiveKid: 'old',
      PAGINATION_CURSOR_TTL_SECONDS: 900,
    }, () => 1_000_000)
    const oldCursor = oldPaginator.prepare(request, { limit: 1 }, binding).finish([
      { id: randomUUID(), updated_at: '2026-07-27T00:00:00.000Z' },
      { id: randomUUID(), updated_at: '2026-07-26T00:00:00.000Z' },
    ]).nextCursor!
    const rotated = createPaginator({
      paginationCursorKeys: new Map([['old', oldKey], ['new', newKey]]),
      paginationCursorActiveKid: 'new',
      PAGINATION_CURSOR_TTL_SECONDS: 900,
    }, () => 1_000_000)
    expect(() => rotated.prepare(request, { cursor: oldCursor }, binding)).not.toThrow()
    const newCursor = rotated.prepare(request, { limit: 1 }, binding).finish([
      { id: randomUUID(), updated_at: '2026-07-27T00:00:00.000Z' },
      { id: randomUUID(), updated_at: '2026-07-26T00:00:00.000Z' },
    ]).nextCursor!
    expect(rotated.decode(newCursor).kid).toBe('new')
  })

  it('builds a unique-id tie-breaker predicate for repeated sort values', () => {
    const paginator = createPaginator(config, () => 1_000_000)
    const first = paginator.prepare(request, { limit: 1 }, binding).finish([
      { id: randomUUID(), updated_at: '2026-07-27T00:00:00.000Z' },
      { id: randomUUID(), updated_at: '2026-07-27T00:00:00.000Z' },
    ]).nextCursor!
    const next = paginator.prepare(request, { cursor: first, limit: 1 }, binding, [workspaceId])
    expect(next.predicate).toContain('thing.updated_at <')
    expect(next.predicate).toContain('thing.updated_at IS NOT DISTINCT FROM')
    expect(next.predicate).toContain('thing.id <')
    expect(next.values.at(-1)).toEqual(expect.any(String))
  })

  it('treats filter aliases as the same cursor scope after effective normalization', () => {
    const paginator = createPaginator(config, () => 1_000_000)
    const normalized = { ...binding, filters: { responsibleHumanActorId: actorId } }
    const cursor = paginator.prepare(request, { limit: 1 }, normalized).finish([
      { id: randomUUID(), updated_at: '2026-07-27T00:00:00.000Z' },
      { id: randomUUID(), updated_at: '2026-07-27T00:00:00.000Z' },
    ]).nextCursor!
    expect(() => paginator.prepare(request, { cursor }, {
      ...binding,
      filters: { responsibleHumanActorId: actorId },
    })).not.toThrow()
  })

  it('traverses repeated sort values across three or more pages without duplicates or omissions', () => {
    const paginator = createPaginator(config, () => 1_000_000)
    const rows = Array.from({ length: 73 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      updated_at: index < 60 ? '2026-07-27T00:00:00.000Z' : '2026-07-26T00:00:00.000Z',
    })).sort((left, right) =>
      right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id))
    const seen: string[] = []
    let cursor: string | undefined
    let pages = 0
    do {
      const prepared = paginator.prepare(request, { cursor, limit: 17 }, binding)
      const tuple = cursor ? paginator.decode(cursor).values : undefined
      const remaining = tuple
        ? rows.filter(row => row.updated_at < tuple[0]!
          || (row.updated_at === tuple[0] && row.id < tuple[1]!))
        : rows
      const page = prepared.finish(remaining.slice(0, 18))
      seen.push(...page.items.map(row => row.id))
      cursor = page.nextCursor ?? undefined
      pages += 1
    } while (cursor)
    expect(pages).toBeGreaterThanOrEqual(4)
    expect(seen).toEqual(rows.map(row => row.id))
    expect(new Set(seen).size).toBe(rows.length)
  })

  it('keeps batches bounded while traversing more than 100 cursor pages', () => {
    const paginator = createPaginator(config, () => 1_000_000)
    const rows = Array.from({ length: 10_050 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      updated_at: '2026-07-27T00:00:00.000Z',
    })).sort((left, right) => right.id.localeCompare(left.id))
    let cursor: string | undefined
    let itemCount = 0
    let pageCount = 0
    let maximumBatch = 0
    do {
      const tuple = cursor ? paginator.decode(cursor).values : undefined
      const start = tuple
        ? rows.findIndex(row => row.id < tuple[1]!)
        : 0
      const batch = start < 0 ? [] : rows.slice(start, start + 101)
      maximumBatch = Math.max(maximumBatch, batch.length)
      const page = paginator.prepare(request, { cursor, limit: 100 }, binding).finish(batch)
      itemCount += page.items.length
      cursor = page.nextCursor ?? undefined
      pageCount += 1
    } while (cursor)
    expect({ pageCount, itemCount, maximumBatch }).toEqual({
      pageCount: 101,
      itemCount: rows.length,
      maximumBatch: 101,
    })
  })
})
