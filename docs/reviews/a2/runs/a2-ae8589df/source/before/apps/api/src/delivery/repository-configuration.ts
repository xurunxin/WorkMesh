import type { PoolClient } from 'pg'
import type { FastifyRequest } from 'fastify'
import type { FeatureConfig } from '@workmesh/config'
import { repositoryListQuerySchema } from '@workmesh/contracts'
import { DomainError } from '@workmesh/domain'
import type { ApiActor } from '../agent/types.js'
import type { Paginator } from '../pagination.js'

export async function loadRepositoryConfiguration(
  tx: PoolClient, request: FastifyRequest, current: ApiActor,
  features: FeatureConfig, paginator: Paginator,
) {
  const query = repositoryListQuerySchema.parse(request.query)
  const filtered = query.teamId !== undefined || query.availableOnly !== undefined
  const available = query.availableOnly === 'true'
  const providers = features.WORKMESH_BETA_GITEA ? ['fake', 'github', 'gitea'].sort() : ['fake', 'github']
  if (query.teamId) {
    const visible = await tx.query(
      `SELECT t.id FROM teams t JOIN actors a ON a.workspace_id=t.workspace_id AND a.id=$3
       WHERE t.workspace_id=$1 AND t.id=$2 AND t.deleted_at IS NULL AND a.kind='human' AND a.is_active
         AND (a.workspace_role='admin' OR EXISTS(SELECT 1 FROM memberships m
              WHERE m.workspace_id=t.workspace_id AND m.team_id=t.id AND m.actor_id=a.id))`,
      [current.workspaceId, query.teamId, current.id],
    )
    if (!visible.rowCount) throw new DomainError('NOT_FOUND', 'Team not found')
  }
  const values: unknown[] = [current.workspaceId, current.workspaceRole, current.id]
  let predicate = ''
  if (filtered) predicate += ` AND EXISTS(SELECT 1 FROM teams live_team
    WHERE live_team.workspace_id=r.workspace_id AND live_team.id=r.team_id AND live_team.deleted_at IS NULL)`
  if (query.teamId) { values.push(query.teamId); predicate += ` AND r.team_id=$${values.length}` }
  if (available) { values.push(providers); predicate += ` AND r.active AND c.provider::text=ANY($${values.length}::text[])` }
  const response = await paginator.query<Record<string, unknown> & { feature_provider: string }>(tx, request, request.query, {
    route: '/api/v1/repositories',
    filters: filtered ? { teamId: query.teamId ?? null, availableOnly: query.availableOnly ?? null, ...(available ? { providers } : {}) } : {},
    sort: [{ key: 'full_name', sql: 'r.full_name', direction: 'ASC' }, { key: 'id', sql: 'r.id', direction: 'ASC' }],
  }, `SELECT r.*,c.provider AS feature_provider,
        (a.is_active AND a.kind='human' AND (a.workspace_role='admin' OR EXISTS(
          SELECT 1 FROM memberships m WHERE m.workspace_id=r.workspace_id AND m.team_id=r.team_id
           AND m.actor_id=a.id AND m.role IN ('admin','maintainer')))) AS can_configure_context
      FROM repositories r JOIN provider_connections c ON c.id=r.connection_id AND c.active
      JOIN actors a ON a.id=$3 AND a.workspace_id=r.workspace_id AND a.is_active
      WHERE r.workspace_id=$1 AND
        (($2='admin' AND a.workspace_role='admin') OR EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=r.workspace_id
         AND m.team_id=r.team_id AND m.actor_id=$3))${predicate}`, values)
  if (!available && response.items.some(repo => repo.feature_provider === 'gitea') && !features.WORKMESH_BETA_GITEA)
    throw new DomainError('FEATURE_DISABLED', 'WORKMESH_BETA_GITEA is disabled for this deployment', { feature: 'WORKMESH_BETA_GITEA', tier: 'beta' })
  return { items: response.items.map(({ feature_provider: _provider, ...repo }) => repo), nextCursor: response.nextCursor }
}
