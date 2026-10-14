import { z } from 'zod'
import net from 'node:net'

const schema = z.object({
  WORKMESH_DEPLOYMENT_PROFILE: z.enum(['personal', 'team', 'enterprise']),
  WORKMESH_QUEUE_BACKEND: z.literal('redis'),
  WORKMESH_ARTIFACT_BACKEND: z.literal('s3'),
  WORKMESH_RUNNER_PLACEMENT: z.literal('external'),
  WORKMESH_API_REPLICAS: z.literal('1'),
  WORKMESH_WORKER_REPLICAS: z.literal('1'),
  WORKMESH_MCP_REPLICAS: z.literal('1'),
  WORKMESH_BIND_ADDRESS: z.enum(['127.0.0.1', '::1']),
  WEB_ORIGIN: z.string().url(),
  PUBLIC_MCP_ORIGIN: z.string().url(),
  S3_PUBLIC_ENDPOINT: z.string().url(),
  SESSION_COOKIE_SECURE: z.literal('true'),
  NODE_EXTRA_CA_CERTS: z.string().optional(),
  AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS: z.string().default(''),
}).superRefine((value, context) => {
  for (const name of ['WEB_ORIGIN', 'PUBLIC_MCP_ORIGIN', 'S3_PUBLIC_ENDPOINT'] as const) {
    const url = new URL(value[name])
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      context.addIssue({ code: 'custom', path: [name], message: 'HTTPS endpoint without credentials is required' })
  }
  if (value.WORKMESH_DEPLOYMENT_PROFILE === 'enterprise' && !value.NODE_EXTRA_CA_CERTS)
    context.addIssue({ code: 'custom', path: ['NODE_EXTRA_CA_CERTS'], message: 'Private CA is required' })
  if (value.NODE_EXTRA_CA_CERTS && (!value.NODE_EXTRA_CA_CERTS.startsWith('/') || /[\r\n\0]/.test(value.NODE_EXTRA_CA_CERTS)
    || value.NODE_EXTRA_CA_CERTS.split('/').includes('..')))
    context.addIssue({ code: 'custom', path: ['NODE_EXTRA_CA_CERTS'], message: 'Safe absolute CA path is required' })
  for (const cidr of value.AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS.split(',').filter(Boolean)) {
    const [ip, mask, ...rest] = cidr.split('/')
    const family = net.isIP(ip ?? '')
    if (!family || rest.length || (mask !== undefined && (!/^\d+$/.test(mask) || Number(mask) <= 0
      || Number(mask) > (family === 4 ? 32 : 128))))
      context.addIssue({ code: 'custom', path: ['AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS'], message: 'Explicit bounded proxy CIDR is required' })
  }
})

/** Existing Compose remains compatible; versioned distributions always set an explicit profile. */
export function loadDeploymentProfile(environment: NodeJS.ProcessEnv) {
  if (environment.WORKMESH_DEPLOYMENT_PROFILE === undefined) return undefined
  const result = schema.safeParse(environment)
  if (!result.success)
    throw new Error(`DEPLOYMENT_PROFILE_INVALID:${[...new Set(result.error.issues.map(issue => issue.path[0]))].sort().join(',')}`)
  return result.data
}
