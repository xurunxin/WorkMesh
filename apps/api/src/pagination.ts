import {
  createHash,
  createHmac,
  timingSafeEqual,
} from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import type { Config } from '@workmesh/config'
import { pageQuerySchema, type ListResponse } from '@workmesh/contracts'
import { DomainError } from '@workmesh/domain'

type CursorScalar = string | number | boolean | null
type CursorActor = { id: string; workspaceId: string }

export type PageSortField = {
  key: string
  sql: string
  direction: 'ASC' | 'DESC'
  value?: (row: Record<string, unknown>) => CursorScalar
}

type CursorPayload = {
  v: 1
  kid: string
  iat: number
  exp: number
  route: string
  workspaceId: string
  actorId: string
  filterHash: string
  sort: string
  values: CursorScalar[]
}

const payloadKeys = [
  'actorId',
  'exp',
  'filterHash',
  'iat',
  'kid',
  'route',
  'sort',
  'v',
  'values',
  'workspaceId',
] as const
const canonicalBase64Url = /^[A-Za-z0-9_-]+$/
const hashPattern = /^[a-f0-9]{64}$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable)
  if (value instanceof Date) return value.toISOString()
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stable(nested)]))
  return value
}

const canonicalJson = (value: unknown): string => JSON.stringify(stable(value))
const fingerprint = (value: unknown): string =>
  createHash('sha256').update(canonicalJson(value)).digest('hex')
const sortBinding = (sort: readonly PageSortField[]): string =>
  sort.map(field => `${field.key}:${field.direction}`).join(',')

function invalid(): never {
  throw new DomainError('PAGINATION_CURSOR_INVALID', 'Pagination cursor is invalid')
}

function mismatch(): never {
  throw new DomainError('PAGINATION_CURSOR_MISMATCH', 'Pagination cursor does not match this request')
}

function decodeSegment(segment: string, maximumBytes: number): Buffer {
  if (!segment || !canonicalBase64Url.test(segment)) invalid()
  let decoded: Buffer
  try {
    decoded = Buffer.from(segment, 'base64url')
  } catch {
    invalid()
  }
  if (decoded.length > maximumBytes || decoded.toString('base64url') !== segment) invalid()
  return decoded
}

function scalar(value: unknown): value is CursorScalar {
  return value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
}

function normalizeScalar(value: unknown): CursorScalar {
  if (value instanceof Date) return value.toISOString()
  if (scalar(value)) return value
  invalid()
}

export type PaginationBinding = {
  route: string
  filters?: unknown
  sort: readonly PageSortField[]
}

export type PreparedPage = {
  limit: number
  values: unknown[]
  predicate: string
  orderBy: string
  beforeQuery: () => Promise<void>
  finish: <T extends Record<string, unknown>>(rows: T[]) => ListResponse<T>
}

type Queryable = Pick<Pool | PoolClient, 'query'>

export function createPaginator(
  config: Pick<Config, 'paginationCursorKeys' | 'paginationCursorActiveKid' | 'PAGINATION_CURSOR_TTL_SECONDS'>,
  clock: () => number = () => Date.now(),
  beforePagedQuery?: (route: string) => Promise<void> | void,
) {
  const ttl = config.PAGINATION_CURSOR_TTL_SECONDS

  const encode = (payload: Omit<CursorPayload, 'v' | 'kid' | 'iat' | 'exp'>): string => {
    const now = Math.floor(clock() / 1_000)
    const full: CursorPayload = {
      v: 1,
      kid: config.paginationCursorActiveKid,
      iat: now,
      exp: now + ttl,
      ...payload,
    }
    const body = Buffer.from(canonicalJson(full)).toString('base64url')
    const key = config.paginationCursorKeys.get(full.kid)
    if (!key) invalid()
    const signature = createHmac('sha256', key).update(body).digest('base64url')
    return `${body}.${signature}`
  }

  const decode = (token: string): CursorPayload => {
    if (token.length > 8_192) invalid()
    const parts = token.split('.')
    if (parts.length !== 2) invalid()
    const body = parts[0]!
    const signature = decodeSegment(parts[1]!, 32)
    if (signature.length !== 32) invalid()
    const decoded = decodeSegment(body, 6_144)
    let parsed: unknown
    try {
      parsed = JSON.parse(decoded.toString('utf8'))
    } catch {
      invalid()
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) invalid()
    const record = parsed as Record<string, unknown>
    if (Object.keys(record).sort().join(',') !== [...payloadKeys].sort().join(',')) invalid()
    if (canonicalJson(record) !== decoded.toString('utf8')) invalid()
    if (
      record.v !== 1
      || typeof record.kid !== 'string'
      || !/^[A-Za-z0-9_-]{1,64}$/.test(record.kid)
      || typeof record.iat !== 'number'
      || !Number.isSafeInteger(record.iat)
      || record.iat < 0
      || typeof record.exp !== 'number'
      || !Number.isSafeInteger(record.exp)
      || record.exp < 0
      || typeof record.route !== 'string'
      || record.route.length < 1
      || record.route.length > 300
      || typeof record.workspaceId !== 'string'
      || !uuidPattern.test(record.workspaceId)
      || typeof record.actorId !== 'string'
      || !uuidPattern.test(record.actorId)
      || typeof record.filterHash !== 'string'
      || !hashPattern.test(record.filterHash)
      || typeof record.sort !== 'string'
      || record.sort.length < 1
      || record.sort.length > 1_000
      || !Array.isArray(record.values)
      || record.values.length < 1
      || record.values.length > 12
      || !record.values.every(scalar)
    ) invalid()
    const key = config.paginationCursorKeys.get(record.kid)
    if (!key) invalid()
    const expected = createHmac('sha256', key).update(body).digest()
    if (expected.length !== signature.length || !timingSafeEqual(expected, signature)) invalid()
    const now = Math.floor(clock() / 1_000)
    if (record.iat > now + 60 || record.exp <= now || record.exp <= record.iat || record.exp - record.iat > ttl) invalid()
    return record as CursorPayload
  }

  const prepare = (
    request: FastifyRequest,
    rawQuery: unknown,
    binding: PaginationBinding,
    baseValues: readonly unknown[] = [],
  ): PreparedPage => {
    if (!binding.sort.length || binding.sort.length > 12) throw new Error('Pagination sort tuple is invalid')
    const query = pageQuerySchema.parse(rawQuery)
    const current = request.actor as unknown as CursorActor
    const filterHash = fingerprint(binding.filters ?? {})
    const boundSort = sortBinding(binding.sort)
    const values = [...baseValues]
    let predicate = ''
    if (query.cursor) {
      const cursor = decode(query.cursor)
      if (
        cursor.route !== binding.route
        || cursor.workspaceId !== current.workspaceId
        || cursor.actorId !== current.id
        || cursor.filterHash !== filterHash
        || cursor.sort !== boundSort
        || cursor.values.length !== binding.sort.length
      ) mismatch()
      const disjunction: string[] = []
      for (let index = 0; index < binding.sort.length; index += 1) {
        const conjunction: string[] = []
        for (let equal = 0; equal < index; equal += 1) {
          values.push(cursor.values[equal])
          conjunction.push(`${binding.sort[equal]!.sql} IS NOT DISTINCT FROM $${values.length}`)
        }
        values.push(cursor.values[index])
        const operator = binding.sort[index]!.direction === 'ASC' ? '>' : '<'
        conjunction.push(`${binding.sort[index]!.sql} ${operator} $${values.length}`)
        disjunction.push(`(${conjunction.join(' AND ')})`)
      }
      predicate = `(${disjunction.join(' OR ')})`
    }
    const orderBy = binding.sort.map(field => `${field.sql} ${field.direction}`).join(',')
    const pageLimit = query.limit
    const finish = <T extends Record<string, unknown>>(rows: T[]): ListResponse<T> => {
      const hasMore = rows.length > pageLimit
      const items = rows.slice(0, pageLimit)
      const last = items.at(-1)
      const nextCursor = hasMore && last
        ? encode({
            route: binding.route,
            workspaceId: current.workspaceId,
            actorId: current.id,
            filterHash,
            sort: boundSort,
            values: binding.sort.map(field => normalizeScalar(
              field.value ? field.value(last) : last[field.key],
            )),
          })
        : null
      return { items, nextCursor }
    }
    const beforeQuery = async (): Promise<void> => {
      await beforePagedQuery?.(binding.route)
    }
    return { limit: pageLimit, values, predicate, orderBy, beforeQuery, finish }
  }

  const query = async <T extends Record<string, unknown>>(
    db: Queryable,
    request: FastifyRequest,
    rawQuery: unknown,
    binding: PaginationBinding,
    sql: string,
    baseValues: readonly unknown[] = [],
    beforeOrder = '',
  ): Promise<ListResponse<T>> => {
    const page = prepare(request, rawQuery, binding, baseValues)
    const where = page.predicate ? ` AND ${page.predicate}` : ''
    page.values.push(page.limit + 1)
    await page.beforeQuery()
    const result = await db.query<T>(
      `${sql}${where}${beforeOrder} ORDER BY ${page.orderBy} LIMIT $${page.values.length}`,
      page.values,
    )
    return page.finish(result.rows)
  }

  return { prepare, query, encode, decode }
}

export type Paginator = ReturnType<typeof createPaginator>
