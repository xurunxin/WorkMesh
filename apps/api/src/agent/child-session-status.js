import { childSessionStatusPageSchema, childSessionStatusQuerySchema } from '@workmesh/contracts';
import { DomainError } from '@workmesh/domain';
import { liveSessionReadPredicate } from '../live-read-authorization.js';
export async function listChildSessionStatus(db, paginator, request, parentId) {
    const current = request.actor;
    if (current.kind !== 'agent' || current.authentication !== 'agent_session')
        throw new DomainError('FORBIDDEN', 'Exact execution Session credential required');
    if (current.agentSessionId !== parentId)
        throw new DomainError('RESOURCE_SCOPE_DENIED', 'Parent must be the current Session');
    const query = childSessionStatusQuerySchema.parse(request.query);
    const values = [parentId, current.workspaceId, query.childSessionId ?? null, current.credentialHash ?? null];
    const live = liveSessionReadPredicate(current, 'parent.id', 'parent.workspace_id', values);
    const page = paginator.prepare(request, query, {
        route: '/api/v1/agent-sessions/:id/children',
        filters: { parentSessionId: parentId, childSessionId: query.childSessionId ?? null, exactSessionId: current.agentSessionId },
        sort: [{ key: 'created_at', sql: 'child.created_at', direction: 'DESC' }, { key: 'id', sql: 'child.id', direction: 'DESC' }],
    }, values);
    page.values.push(page.limit + 1);
    await page.beforeQuery();
    // The outer parent row is an authorization sentinel even when the page is empty.
    // All protected data and live authorization share one PostgreSQL snapshot.
    const row = (await db.query(`SELECT COALESCE(children.items,'[]'::jsonb) AS items
      FROM agent_sessions parent
      JOIN delegations parent_delegation ON parent_delegation.id=parent.delegation_id AND parent_delegation.workspace_id=parent.workspace_id
      JOIN actors principal ON principal.id=parent_delegation.principal_human_actor_id
        AND principal.workspace_id=parent.workspace_id AND principal.kind='human' AND principal.is_active
      JOIN teams team ON team.id=parent.team_id AND team.workspace_id=parent.workspace_id AND team.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(to_jsonb(selected) ORDER BY selected.created_at DESC,selected.id DESC) AS items FROM (
          SELECT child.id,child.created_at,child.parent_session_id AS "parentSessionId",
            child.required_for_parent AS "requiredForParent",child.state,child.revision,
            child.plan_step_id AS "planStepId",child.plan_step_version_id AS "planVersionId",
            ARRAY(SELECT evidence.id FROM artifacts evidence
              WHERE evidence.workspace_id=child.workspace_id AND evidence.session_id=child.id
                AND (evidence.work_item_id=parent.work_item_id OR evidence.work_item_id IS NULL)
                AND child.result_evidence->'artifactIds' @> jsonb_build_array(evidence.id::text)
              ORDER BY evidence.id LIMIT 100) AS "resultArtifactIds"
          FROM agent_sessions child
          JOIN delegations child_delegation ON child_delegation.id=child.delegation_id
            AND child_delegation.workspace_id=parent.workspace_id
            AND child_delegation.parent_delegation_id=parent.delegation_id
            AND child_delegation.principal_human_actor_id=principal.id
          JOIN agent_plan_versions version ON version.id=child.plan_step_version_id AND version.session_id=parent.id
          JOIN agent_plan_steps step ON step.plan_version_id=version.id AND step.id=child.plan_step_id
          JOIN agent_plan_step_identities identity ON identity.session_id=parent.id AND identity.stable_step_id=step.id
          WHERE child.parent_session_id=parent.id AND child.workspace_id=parent.workspace_id AND child.team_id=parent.team_id
            AND child.work_item_id IS NOT DISTINCT FROM parent.work_item_id
            AND ($3::uuid IS NULL OR child.id=$3)
            ${page.predicate ? `AND ${page.predicate}` : ''}
          ORDER BY ${page.orderBy} LIMIT $${page.values.length}
        ) selected
      ) children ON true
      WHERE parent.id=$1 AND parent.workspace_id=$2 AND parent.session_kind='execution' AND ${live}
        AND EXISTS(SELECT 1 FROM memberships membership WHERE membership.workspace_id=parent.workspace_id
          AND membership.team_id=parent.team_id AND membership.actor_id=principal.id)
        AND EXISTS(SELECT 1 FROM agent_session_tokens credential
          JOIN agent_installation_tokens installation ON installation.id=credential.installation_token_id
            AND installation.agent_id=parent.agent_id AND installation.revoked_at IS NULL
            AND (installation.expires_at IS NULL OR installation.expires_at>now())
          LEFT JOIN agent_connection_credentials source ON source.token_hash=installation.token_hash
          LEFT JOIN agent_connections connection ON connection.id=source.connection_id
          LEFT JOIN delegations authority ON authority.id=connection.delegation_id
          WHERE credential.session_id=parent.id AND credential.token_hash=$4
            AND credential.revoked_at IS NULL AND credential.exchanged_at IS NOT NULL AND credential.expires_at>now()
            AND ((installation.origin_kind='native' AND installation.origin_connection_id IS NULL AND source.id IS NULL)
              OR (installation.origin_kind='connection'
              AND installation.origin_connection_id=connection.id
              AND source.id IS NOT NULL
              AND source.revoked_at IS NULL AND source.valid_from<=now()
              AND (source.status='active' OR source.status='overlap' AND source.overlap_until>now())
              AND connection.status IN ('active','rotating') AND connection.revoked_at IS NULL
              AND 'work:read'=ANY(connection.granted_capabilities)
              AND connection.workspace_id=parent.workspace_id
              AND connection.team_id=parent.team_id AND connection.agent_id=parent.agent_id
              AND connection.agent_actor_id=parent.agent_actor_id AND connection.principal_human_actor_id=principal.id
              AND authority.status='active' AND authority.workspace_id=parent.workspace_id
              AND authority.principal_human_actor_id=principal.id
              AND authority.agent_actor_id=parent.agent_actor_id
              AND authority.agent_id=parent.agent_id AND authority.team_id=parent.team_id
              AND authority.role='coordinator' AND authority.scope_type='team' AND authority.scope_id=parent.team_id
              AND 'work:read'=ANY(authority.permissions_snapshot)
              AND authority.capability_scope->'teamIds' @> jsonb_build_array(parent.team_id::text)
            )))`, page.values)).rows[0];
    if (!row)
        throw new DomainError('RESOURCE_SCOPE_DENIED', 'Parent Session has no live read authority');
    if (query.childSessionId && !row.items.length)
        throw new DomainError('NOT_FOUND', 'Bound child Session not found');
    const result = page.finish(row.items);
    return childSessionStatusPageSchema.parse({ ...result, items: result.items.map(({ created_at: _createdAt, ...item }) => item) });
}
