import { z } from 'zod'

const id = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
export const repositoryListQuerySchema = z.object({
  teamId: id.optional(),
  availableOnly: z.enum(['true', 'false']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict()

export const repositoryConfigurationSchema = z.object({
  id, workspace_id: id, connection_id: id, team_id: id,
  external_id: z.string(), full_name: z.string(), default_branch: z.string(),
  clone_url: z.string().nullable().optional(), required_checks: z.array(z.string()),
  active: z.boolean().optional(), revision: z.number().int().optional(),
  created_at: timestamp.optional(), updated_at: timestamp.optional(),
  can_configure_context: z.boolean(),
}).strict()
export const repositoryConfigurationPageSchema = z.object({
  items: z.array(repositoryConfigurationSchema), nextCursor: z.string().nullable(),
}).strict()
export const repositoryContextConfigurationSchema = z.object({
  id, workspace_id: id, repository_id: id,
  project_id: id.nullable(), work_item_id: id.nullable(), session_id: id.nullable(),
  base_branch: z.string(), base_sha: z.string(), branch_pattern: z.string(),
  allowed_paths: z.array(z.string()),
  permissions: z.array(z.enum(['read', 'write_branch', 'open_pr', 'review', 'merge', 'ci'])),
  guidance_manifest_hash: z.string(), created_by_actor_id: id, created_at: timestamp,
  provider_action_id: id.nullable(),
  guidance: z.array(z.object({ path: z.string(), blobSha: z.string(), contentHash: z.string(), content: z.string() }).strict()),
}).strict()
export const providerConnectionConfigurationSchema = z.object({
  id, workspace_id: id, provider: z.enum(['fake', 'github', 'gitea']),
  external_account_id: z.string(), display_name: z.string(), installation_id: z.string().nullable(),
  service_actor_id: id, active: z.boolean(), revision: z.number().int(),
  created_at: timestamp, updated_at: timestamp,
}).strict()
// Only the fields needed to follow an asynchronous command cross this UI boundary.
export const repositoryContextActionSchema = z.object({
  id, kind: z.literal('resolve_repository_context'),
  status: z.enum(['pending', 'claimed', 'completed', 'failed', 'dead']),
}).strip()
export type RepositoryConfiguration = z.infer<typeof repositoryConfigurationSchema>
export type RepositoryContextConfiguration = z.infer<typeof repositoryContextConfigurationSchema>
