import type { FastifyInstance } from 'fastify'
import {
  routePolicyManifest,
  type RoutePolicyManifestEntry,
} from '@workmesh/contracts'

declare module 'fastify' {
  interface FastifyContextConfig {
    workmeshOperationId?: string
    workmeshPolicyId?: string
  }
}
const normalizedPath = (path: string): string =>
  path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')

const routeKey = (method: string, path: string): string =>
  `${method.toUpperCase()} ${normalizedPath(path)}`

export type RoutePolicyInventory = Readonly<{
  registeredRoutes: () => readonly string[]
}>

export function installRoutePolicyInventory(
  app: FastifyInstance,
  manifest: readonly RoutePolicyManifestEntry[] = routePolicyManifest,
): RoutePolicyInventory {
  const expected = new Map<string, RoutePolicyManifestEntry>()
  for (const route of manifest) {
    const key = routeKey(route.method, route.path)
    if (expected.has(key)) {
      throw new Error(`Duplicate route policy declaration: ${key}`)
    }
    expected.set(key, route)
  }

  const registered = new Set<string>()
  app.addHook('onRoute', (options) => {
    const methods = Array.isArray(options.method) ? options.method : [options.method]
    for (const candidate of methods) {
      const method = candidate.toUpperCase()
      const path = normalizedPath(options.url)

      if (method === 'OPTIONS' && (path === '*' || path === '/*')) continue
      if (method === 'HEAD') {
        if (expected.has(routeKey('GET', path))) continue
        throw new Error(`Undeclared automatic HEAD route: ${method} ${path}`)
      }

      const key = routeKey(method, path)
      const policy = expected.get(key)
      if (!policy) throw new Error(`Undeclared route: ${key}`)
      if (registered.has(key)) throw new Error(`Duplicate route registration: ${key}`)

      const configuredPolicyId = options.config?.workmeshPolicyId
      if (configuredPolicyId && configuredPolicyId !== policy.policyId) {
        throw new Error(
          `Route policy mismatch for ${key}: expected ${policy.policyId}, received ${configuredPolicyId}`,
        )
      }
      const configuredOperationId = options.config?.workmeshOperationId
      if (configuredOperationId && configuredOperationId !== policy.operationId) {
        throw new Error(
          `Route operation mismatch for ${key}: expected ${policy.operationId}, received ${configuredOperationId}`,
        )
      }

      options.config = {
        ...options.config,
        workmeshOperationId: policy.operationId,
        workmeshPolicyId: policy.policyId,
      }
      registered.add(key)
    }
  })

  app.addHook('onReady', async () => {
    const missing = [...expected.keys()].filter(key => !registered.has(key))
    if (missing.length) {
      throw new Error(`Missing route registrations: ${missing.join(', ')}`)
    }
  })

  return {
    registeredRoutes: () => Object.freeze([...registered].sort()),
  }
}
