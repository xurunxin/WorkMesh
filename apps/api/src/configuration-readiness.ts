import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import type { FeatureConfig } from '@workmesh/config'
import {
  configurationReadinessQuerySchema,
  configurationReadinessResponseSchema,
  type ConfigurationReadinessQuery,
  type ConfigurationReadinessResponse,
} from '@workmesh/contracts'
import { DomainError } from '@workmesh/domain'
import type { ApiActor } from './agent/types.js'
import { liveHumanTeamReadPredicate } from './live-read-authorization.js'

type ReadinessFacts = { model_ready: boolean; agent_ready: boolean; repository_ready: boolean }

export async function loadConfigurationReadiness(
  db: Pool,
  current: ApiActor,
  query: ConfigurationReadinessQuery,
  features: FeatureConfig,
): Promise<ConfigurationReadinessResponse> {
  if (current.kind !== 'human') throw new DomainError('FORBIDDEN', 'Human account required')
  const values: unknown[] = [current.workspaceId, query.teamId, query.projectId ?? null,
    query.workItemId ?? null, query.workKind, features.WORKMESH_BETA_GITEA, current.id]
  const live = liveHumanTeamReadPredicate(current, 'team.workspace_id', 'team.id', values)
  // 一次快照中同时读取权限与配置；只取存在性，不取隐藏资源或密钥元数据。
  const facts = await db.query<ReadinessFacts>(
    `/* configuration-readiness */
     SELECT EXISTS (
       SELECT 1 FROM workbench_llm_connections connection
       JOIN workbench_llm_models model
         ON model.connection_id=connection.id AND model.workspace_id=connection.workspace_id
       WHERE connection.workspace_id=team.workspace_id
         AND connection.status='active' AND model.enabled
         AND (connection.scope='workspace'
           OR (connection.scope='personal' AND connection.owner_actor_id=$7)
           OR (connection.scope='team' AND connection.team_id=team.id))
     ) AS model_ready,
     EXISTS (
       SELECT 1 FROM agent_definitions definition
       JOIN agent_team_access access
         ON access.agent_id=definition.id AND access.workspace_id=definition.workspace_id
       WHERE definition.workspace_id=team.workspace_id AND definition.is_active
         AND access.team_id=team.id AND access.revoked_at IS NULL
     ) AS agent_ready,
     CASE WHEN $5::text='repository' THEN EXISTS (
       SELECT 1 FROM repository_contexts context
       JOIN repositories repository
         ON repository.id=context.repository_id AND repository.workspace_id=context.workspace_id
       JOIN provider_connections provider
         ON provider.id=repository.connection_id AND provider.workspace_id=repository.workspace_id
       WHERE context.workspace_id=team.workspace_id AND repository.team_id=team.id
         AND repository.active AND provider.active
         AND (provider.provider<>'gitea' OR $6::boolean)
         AND length(btrim(context.base_branch))>0
         AND (
           ($4::uuid IS NOT NULL AND context.work_item_id=item.id)
           OR (project.id IS NOT NULL AND context.project_id=project.id)
           OR ($3::uuid IS NULL AND $4::uuid IS NULL AND EXISTS (
             SELECT 1 FROM projects configured_project
             WHERE configured_project.id=context.project_id
               AND configured_project.workspace_id=team.workspace_id
               AND configured_project.team_id=team.id AND configured_project.deleted_at IS NULL
           ))
         )
     ) ELSE false END AS repository_ready
     FROM teams team
     LEFT JOIN work_items item ON item.id=$4::uuid AND item.workspace_id=team.workspace_id
       AND item.team_id=team.id AND item.deleted_at IS NULL
     LEFT JOIN projects project ON project.id=COALESCE($3::uuid,item.project_id)
       AND project.workspace_id=team.workspace_id AND project.team_id=team.id AND project.deleted_at IS NULL
     WHERE team.workspace_id=$1 AND team.id=$2 AND team.deleted_at IS NULL
       AND ($4::uuid IS NULL OR item.id IS NOT NULL)
       AND ($3::uuid IS NULL OR project.id IS NOT NULL)
       AND ($4::uuid IS NULL OR $3::uuid IS NULL OR item.project_id=$3::uuid)
       AND ${live}`,
    values,
  )
  const row = facts.rows[0]
  if (!row) throw new DomainError('NOT_FOUND', 'Configuration context was not found', {
    authorizationStage: 'resource_scope',
  })
  const configured = (ready: boolean) => ready
    ? { applicability: 'applicable' as const, state: 'ready' as const, reasonCode: 'configured' as const }
    : { applicability: 'applicable' as const, state: 'blocked' as const, reasonCode: 'unmet' as const }
  return configurationReadinessResponseSchema.parse({ checks: {
    model: configured(row.model_ready),
    agent: configured(row.agent_ready),
    repository: query.workKind === 'repository' ? configured(row.repository_ready)
      : { applicability: 'not_applicable', state: null, reasonCode: 'non_repository_work' },
    runner: { applicability: 'applicable', state: 'unknown', reasonCode: 'not_observable' },
  } })
}

export function registerConfigurationReadinessRoutes(
  app: FastifyInstance,
  h: { db: Pool; features: FeatureConfig },
): void {
  app.get('/api/v1/workbench/configuration-readiness', {
    onRequest: async (_request, reply) => { reply.header('Cache-Control', 'no-store') },
    // 在全局鉴权读取 query.teamId 前校验类型，非法 UUID 不进入 PostgreSQL。
    preValidation: async request => { configurationReadinessQuerySchema.parse(request.query) },
  }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    return loadConfigurationReadiness(h.db, request.actor as ApiActor,
      configurationReadinessQuerySchema.parse(request.query), h.features)
  })
}
