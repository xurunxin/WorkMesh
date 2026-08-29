import { z } from 'zod'

// Agent identifiers are opaque transport IDs. Current PostgreSQL rows use
// UUIDs, while adapters and deterministic fixtures may expose stable routed
// identifiers; the boundary must validate presence without inventing a UUID
// requirement that is not part of the REST contract.
const idSchema = z.string().min(1)
const timestampSchema = z.string().datetime({ offset: true })
const revisionSchema = z.number().int().positive()

export const agentProtocolSchema = z.enum(['native_http', 'mcp', 'a2a'])
export const capabilitySchema = z.enum([
  'work:read', 'work:write', 'comment:write', 'plan:write', 'message:write', 'artifact:write',
  'repo:read', 'repo:write_branch', 'repo:open_pr', 'repo:merge', 'ci:run', 'deploy:staging',
  'deploy:production', 'secrets:use', 'automation:manage', 'admin:*', 'agent:delegate',
])
export const artifactTypeSchema = z.enum(['branch', 'commit', 'diff', 'pull_request', 'test_report', 'build', 'preview', 'code_review', 'document', 'link', 'file', 'other'])

const agentTimestampSchema = z.preprocess(value => value instanceof Date ? value.toISOString() : value, timestampSchema)

export const agentTeamAccessResponseSchema = z.object({
  agent_id: idSchema,
  team_id: idSchema,
  approved_capabilities: z.array(capabilitySchema),
  status: z.enum(['active', 'revoked']),
  approved_by_actor_id: idSchema,
  revision: revisionSchema,
  created_at: agentTimestampSchema,
  updated_at: agentTimestampSchema,
  revoked_at: agentTimestampSchema.nullable(),
})

export const agentLifecycleStatusSchema = z.enum(['active', 'archived'])

export const agentResponseSchema = z.object({
  id: idSchema,
  workspace_id: idSchema,
  actor_id: idSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  provider: z.string(),
  version: z.string(),
  endpoint_url: z.string().nullable(),
  supported_protocols: z.array(agentProtocolSchema),
  skills: z.array(z.string()),
  requested_capabilities: z.array(capabilitySchema),
  approved_capabilities: z.array(capabilitySchema),
  output_artifact_types: z.array(artifactTypeSchema),
  max_concurrency: z.number().int().positive(),
  heartbeat_interval_seconds: z.number().int().positive(),
  metadata: z.record(z.unknown()),
  team_access: z.array(agentTeamAccessResponseSchema),
  is_active: z.boolean(),
  lifecycle_status: agentLifecycleStatusSchema,
  revision: revisionSchema,
  archived_at: agentTimestampSchema.nullable(),
  archived_by_actor_id: idSchema.nullable(),
  archived_reason: z.string().nullable(),
  created_at: agentTimestampSchema,
  updated_at: agentTimestampSchema,
}).passthrough()

export type AgentResponse = z.infer<typeof agentResponseSchema>
