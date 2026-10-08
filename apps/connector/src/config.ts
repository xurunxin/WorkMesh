import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { agentConnectionRedeemInputSchema, capabilitySchema, agentConnectionClientTypeSchema, agentConnectionWellKnownSkillSchema } from '@workmesh/contracts'
import { ConnectorError } from './errors.js'

const digest = z.string().regex(/^[a-f0-9]{64}$/)
const approvedUrl = z.string().url().refine(value => {
  const url = new URL(value)
  return !url.username && !url.password && !url.hash && !url.search
    && (url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)))
})
const capabilities = z.array(capabilitySchema).min(1).refine(value => new Set(value).size === value.length)
export const expectationSchema = z.object({
  deploymentUrl: approvedUrl,
  discoveryUrl: approvedUrl,
  redeemUrl: approvedUrl,
  mcpUrl: approvedUrl,
  skillUrl: approvedUrl,
  workspaceId: z.string().uuid(), connectionId: z.string().uuid(), agentActorId: z.string().uuid(),
  teamId: z.string().uuid(), principalHumanActorId: z.string().uuid(),
  agentSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  client: agentConnectionRedeemInputSchema.shape.client,
  profileVersion: z.string().min(1),
  requestedCapabilities: capabilities,
  capabilities,
  grantAgentDelegate: z.boolean(),
  skill: agentConnectionWellKnownSkillSchema,
}).strict().superRefine((value, context) => {
  if (/\bwm[a-z]_[A-Za-z0-9_-]{43,}/.test(JSON.stringify(value)))
    context.addIssue({ code: 'custom', message: 'Expectation must not contain credentials' })
  const origin = new URL(value.deploymentUrl).origin
  for (const key of ['discoveryUrl', 'redeemUrl'] as const) {
    if (new URL(value[key]).origin !== origin) context.addIssue({ code: 'custom', path: [key], message: 'Endpoint origin mismatch' })
  }
  if (value.discoveryUrl !== origin + '/.well-known/workmesh-agent' || value.redeemUrl !== origin + '/api/v1/agent-connections/redeem')
    context.addIssue({ code: 'custom', message: 'Unexpected bootstrap endpoint' })
  if (!value.capabilities.every(capability => value.requestedCapabilities.includes(capability))
    || (!value.grantAgentDelegate && value.capabilities.includes('agent:delegate')))
    context.addIssue({ code: 'custom', message: 'Expected capabilities exceed the envelope' })
})
export type Expectation = z.infer<typeof expectationSchema>
export const pendingSchema = z.object({
  key: z.string().uuid(), body: z.string(), expectationHash: digest,
  target: approvedUrl, origin: z.string(), userAgent: z.string().min(1),
}).strict()
export type Pending = z.infer<typeof pendingSchema>
export const configurationSchema = z.object({
  expectation: expectationSchema, secretReference: z.string().uuid(),
  fingerprint: z.string().regex(/^[a-f0-9]{12}$/),
  completion: z.object({ pairingDigest: digest, expectationHash: digest, key: z.string().uuid() }).strict(),
  skillFile: z.string().regex(/^skill-[a-f0-9]{64}\.md$/),
  replayableUntil: z.string().datetime(),
}).strict()
export type Configuration = z.infer<typeof configurationSchema>
export const journalSchema = z.object({
  oldConfiguration: z.string().nullable(), nextConfiguration: configurationSchema,
  nextHash: digest, secretReference: z.string().uuid(),
  skillExisted: z.boolean(),
}).strict()
export type Journal = z.infer<typeof journalSchema>
export const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex')
export const serialize = (value: unknown): string => JSON.stringify(value) + '\n'
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new ConnectorError('CONNECTOR_INVALID_RECORD')
  return result.data
}
export function parseJson<T>(schema: z.ZodType<T>, bytes: string): T {
  try { return parse(schema, JSON.parse(bytes)) } catch { throw new ConnectorError('CONNECTOR_INVALID_RECORD') }
}
export function defaultDirectory(): string {
  if (process.env.WORKMESH_CONNECTOR_DIRECTORY) return process.env.WORKMESH_CONNECTOR_DIRECTORY
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'WorkMesh', 'connector')
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'WorkMesh', 'connector')
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'workmesh', 'connector')
}
export { agentConnectionClientTypeSchema }
