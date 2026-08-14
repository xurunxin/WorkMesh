import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Db } from '@workmesh/db'
import type { FeatureConfig } from '@workmesh/config'
import {
  capabilitySchema,
  createAgentCapabilityManifest,
  releaseMetadata,
  type Capability,
} from '@workmesh/contracts'
import { DomainError } from '@workmesh/domain'
import type { ApiActor } from './agent/types.js'

type ManifestSession = {
  state: 'queued' | 'acknowledged' | 'planning' | 'executing' | 'awaiting_input' | 'awaiting_approval' | 'blocked' | 'paused' | 'stopping' | 'stale' | 'completed' | 'failed' | 'canceled'
  revision: number
  permissions_snapshot: Capability[]
  capability_scope: {
    workspaceId: string
    teamIds?: string[]
    projectIds?: string[]
    workItemIds?: string[]
    repositoryIds?: string[]
    capabilities: Capability[]
  }
  definition_capabilities: Capability[]
  team_capabilities: Capability[]
  supported_protocols: Array<'native_http' | 'mcp' | 'a2a'>
  endpoint_url: string | null
}

const requestedProfileVersion = (request: FastifyRequest): string | undefined => {
  const raw = request.headers['workmesh-client-profile']
  return Array.isArray(raw) ? raw[0] : raw
}

export function registerClientProfileRoutes(
  app: FastifyInstance,
  options: { db: Db; features: FeatureConfig },
): void {
  app.get('/api/v1/agent-capabilities', async request => {
    const actor = request.actor as ApiActor
    if (actor.kind !== 'agent' || !actor.agentSessionId)
      throw new DomainError('FORBIDDEN', 'An exact Agent Session token is required')
    const requested = requestedProfileVersion(request)
    if (requested && !releaseMetadata.supportedClientProfileVersions.includes(requested as '1.0'))
      throw new DomainError(
        'PROFILE_VERSION_UNSUPPORTED',
        'The requested Agent Collaboration Client Profile version is not supported',
        {
          requestedVersion: requested,
          preferredVersion: releaseMetadata.preferredClientProfileVersion,
          supportedVersions: releaseMetadata.supportedClientProfileVersions,
        },
      )
    const session = (await options.db.query<ManifestSession>(
      `SELECT session.state,session.revision,
              delegation.permissions_snapshot,delegation.capability_scope,
              definition.approved_capabilities AS definition_capabilities,
              team_access.approved_capabilities AS team_capabilities,
              definition.supported_protocols::text[] AS supported_protocols,definition.endpoint_url
         FROM agent_sessions session
         JOIN delegations delegation
           ON delegation.id=session.delegation_id
          AND delegation.workspace_id=session.workspace_id
         JOIN agent_definitions definition
           ON definition.id=session.agent_id
          AND definition.workspace_id=session.workspace_id
         JOIN agent_team_access team_access
           ON team_access.workspace_id=session.workspace_id
          AND team_access.agent_id=session.agent_id
          AND team_access.team_id=session.team_id
          AND team_access.revoked_at IS NULL
        WHERE session.id=$1
          AND session.workspace_id=$2
          AND session.agent_actor_id=$3`,
      [actor.agentSessionId, actor.workspaceId, actor.id],
    )).rows[0]
    if (!session) throw new DomainError('DELEGATION_NOT_ACTIVE', 'Agent Session authority is unavailable')
    const definition = new Set(session.definition_capabilities)
    const team = new Set(session.team_capabilities)
    const effectiveCapabilities = session.permissions_snapshot.filter(capability =>
      definition.has(capability) && team.has(capability) && capabilitySchema.safeParse(capability).success,
    )
    return createAgentCapabilityManifest({
      actorId: actor.id,
      sessionId: actor.agentSessionId,
      sessionState: session.state,
      sessionRevision: session.revision,
      effectiveCapabilities,
      capabilityScope: {
        workspaceId: session.capability_scope.workspaceId,
        teamIds: session.capability_scope.teamIds ?? [],
        projectIds: session.capability_scope.projectIds ?? [],
        workItemIds: session.capability_scope.workItemIds ?? [],
        repositoryIds: session.capability_scope.repositoryIds ?? [],
        capabilities: session.capability_scope.capabilities,
      },
      supportedProtocols: session.supported_protocols,
      pushConfigured: Boolean(session.endpoint_url),
      features: options.features,
    })
  })
}
