import { lockAgentAuthorityPlan, tokenHash, withTx } from '@workmesh/db';
/** Commit a bounded send authorization before HTTP; never hold SQL locks over I/O. */
export async function authorizeSessionWebhook(db, delivery, workerId) {
    const payload = delivery.payload;
    if (typeof payload.sessionId !== 'string' || payload.sessionId !== delivery.sessionId)
        return false;
    const nonceHash = typeof payload.exchangeToken === 'string' ? tokenHash(payload.exchangeToken) : null;
    const notificationTokenId = typeof payload.sessionTokenId === 'string' && /^[a-f0-9-]{36}$/i.test(payload.sessionTokenId) ? payload.sessionTokenId : null;
    if (!nonceHash && !notificationTokenId)
        return false;
    return withTx(db, async (tx) => {
        // Revocation paths may hold installation before coordinator authority. Bound
        // every lock wait, including canonical acquisition, and retry only after rollback.
        await tx.query("SET LOCAL lock_timeout = '250ms'");
        const locate = () => tx.query(`SELECT session.workspace_id,session.team_id,session.agent_id,session.agent_actor_id,session.delegation_id,
        delegation.principal_human_actor_id AS principal_id,session.work_item_id,session.project_id,item.project_id AS item_project_id,
        token.id AS token_id,token.exchange_nonce_hash AS nonce_hash,installation.id AS installation_id,connection.id AS connection_id,credential.id AS credential_id,connection.delegation_id AS coordinator_id
      FROM agent_sessions session JOIN delegations delegation ON delegation.id=session.delegation_id
      JOIN agent_session_tokens token ON token.session_id=session.id AND (($2::text IS NOT NULL AND token.exchange_nonce_hash=$2) OR ($3::uuid IS NOT NULL AND token.id=$3 AND $2::text IS NULL))
      JOIN agent_installation_tokens installation ON installation.id=token.installation_token_id
      LEFT JOIN agent_connection_credentials credential ON credential.token_hash=installation.token_hash
      LEFT JOIN agent_connections connection ON connection.id=credential.connection_id
      LEFT JOIN work_items item ON item.id=session.work_item_id WHERE session.id=$1`, [delivery.sessionId, nonceHash, notificationTokenId]);
        const original = (await locate()).rows;
        if (original.length !== 1)
            return false;
        const binding = original[0];
        await tx.query('SELECT id FROM workspaces WHERE id=$1 FOR KEY SHARE', [binding.workspace_id]);
        await lockAgentAuthorityPlan(tx, {
            definitionIds: [binding.agent_id], teamGrants: [{ workspaceId: binding.workspace_id, agentId: binding.agent_id, teamId: binding.team_id }],
            delegationIds: [binding.delegation_id, ...(binding.coordinator_id ? [binding.coordinator_id] : [])], sessionIds: [payload.sessionId],
            sessionTokenIds: [binding.token_id], installationTokenIds: [binding.installation_id], workItemIds: binding.work_item_id ? [binding.work_item_id] : [],
            projectIds: [binding.project_id, binding.item_project_id].filter((id) => Boolean(id)),
        });
        // Source APIs use both outer and canonical locks. Never wait for an outer
        // source row while holding canonical locks: NOWAIT aborts this transaction
        // and the existing bounded webhook retry releases all locks before retrying.
        if (binding.connection_id)
            await tx.query('SELECT id FROM agent_connections WHERE id=$1 FOR SHARE NOWAIT', [binding.connection_id]);
        if (binding.credential_id)
            await tx.query('SELECT id FROM agent_connection_credentials WHERE id=$1 FOR SHARE NOWAIT', [binding.credential_id]);
        await tx.query('SELECT id FROM teams WHERE id=$1 FOR SHARE', [binding.team_id]);
        await tx.query('SELECT id FROM actors WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE', [[binding.agent_actor_id, binding.principal_id]]);
        await tx.query('SELECT actor_id FROM memberships WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3 FOR SHARE', [binding.workspace_id, binding.team_id, binding.principal_id]);
        await tx.query('SELECT id FROM agent_webhook_endpoints WHERE id=$1 FOR SHARE', [delivery.endpointId]);
        await tx.query('SELECT endpoint_id FROM agent_webhook_secrets WHERE endpoint_id=$1 AND version=$2 FOR SHARE', [delivery.endpointId, delivery.secretVersion]);
        const current = (await locate()).rows;
        if (current.length !== 1 || JSON.stringify(current[0]) !== JSON.stringify(binding))
            return false;
        const authorized = await tx.query(`SELECT delivery.id FROM agent_webhook_deliveries delivery
      JOIN domain_events event ON event.id=delivery.event_id AND event.event_type=delivery.event_type
        AND ($14::boolean OR event.payload->>'assignmentMode' IN ('self_claim','self_claim_recovery'))
        AND event.aggregate_type='agent_session' AND event.aggregate_id=delivery.session_id AND event.session_id=delivery.session_id
      JOIN agent_sessions session ON session.id=delivery.session_id AND session.workspace_id=event.workspace_id AND session.agent_id=delivery.agent_id
      JOIN delegations delegation ON delegation.id=session.delegation_id AND delegation.workspace_id=session.workspace_id
        AND delegation.team_id=session.team_id AND delegation.agent_id=session.agent_id AND delegation.agent_actor_id=session.agent_actor_id AND delegation.status='active'
      JOIN agent_definitions definition ON definition.id=session.agent_id AND definition.workspace_id=session.workspace_id AND definition.actor_id=session.agent_actor_id AND definition.is_active
      JOIN actors agent ON agent.id=session.agent_actor_id AND agent.workspace_id=session.workspace_id AND agent.kind='agent' AND agent.is_active
      JOIN actors principal ON principal.id=delegation.principal_human_actor_id AND principal.workspace_id=session.workspace_id AND principal.kind='human' AND principal.is_active
      JOIN teams team ON team.id=session.team_id AND team.workspace_id=session.workspace_id AND team.deleted_at IS NULL
      JOIN agent_team_access access ON access.workspace_id=session.workspace_id AND access.agent_id=session.agent_id AND access.team_id=session.team_id AND access.revoked_at IS NULL
      JOIN agent_session_tokens token ON token.id=$9 AND token.session_id=session.id AND token.agent_id=session.agent_id
        AND token.exchange_nonce_hash=$10 AND token.revoked_at IS NULL AND token.expires_at>clock_timestamp()
      JOIN agent_installation_tokens installation ON installation.id=token.installation_token_id AND installation.agent_id=session.agent_id
        AND installation.revoked_at IS NULL AND (installation.expires_at IS NULL OR installation.expires_at>clock_timestamp())
      LEFT JOIN agent_connection_credentials source ON source.token_hash=installation.token_hash
      LEFT JOIN agent_connections connection ON connection.id=source.connection_id
      LEFT JOIN delegations coordinator ON coordinator.id=connection.delegation_id
      JOIN agent_webhook_endpoints endpoint ON endpoint.id=delivery.endpoint_id AND endpoint.agent_id=delivery.agent_id AND endpoint.is_active AND endpoint.url=$11
      JOIN agent_webhook_secrets secret ON secret.endpoint_id=delivery.endpoint_id AND secret.version=delivery.secret_version
        AND secret.status IN ('active','retiring') AND (secret.valid_until IS NULL OR secret.valid_until>clock_timestamp())
      LEFT JOIN work_items item ON item.id=session.work_item_id AND item.workspace_id=session.workspace_id AND item.team_id=session.team_id AND item.deleted_at IS NULL
      LEFT JOIN projects project ON project.id=session.project_id AND project.workspace_id=session.workspace_id AND project.team_id=session.team_id AND project.deleted_at IS NULL
      WHERE delivery.id=$1 AND delivery.agent_id=$2 AND delivery.session_id=$3 AND delivery.event_id=$4 AND delivery.endpoint_id=$5
        AND delivery.secret_version=$6 AND delivery.status='delivering' AND delivery.locked_by=$7 AND delivery.attempt_count=$8
        AND delivery.payload=$12::jsonb
        AND (($13::timestamptz IS NOT NULL AND clock_timestamp()<$13::timestamptz)
          OR ($13::timestamptz IS NULL AND delivery.locked_at>clock_timestamp()-interval '60 seconds'))
        AND session.session_kind='execution' AND session.state IN ('queued','acknowledged','planning','executing','awaiting_input','awaiting_approval','blocked')
        AND (token.exchanged_at IS NOT NULL OR session.state='queued')
        AND ARRAY['work:read','work:write']::text[] <@ delegation.permissions_snapshot
        AND delegation.permissions_snapshot <@ definition.approved_capabilities AND delegation.permissions_snapshot <@ access.approved_capabilities
        AND COALESCE(delegation.capability_scope->'teamIds','[]'::jsonb) ? session.team_id::text
        AND (principal.workspace_role='admin' OR EXISTS(SELECT 1 FROM memberships membership WHERE membership.workspace_id=session.workspace_id AND membership.team_id=session.team_id AND membership.actor_id=principal.id))
        AND ((session.work_item_id IS NOT NULL AND item.id IS NOT NULL AND COALESCE(delegation.capability_scope->'workItemIds','[]'::jsonb) ? session.work_item_id::text
          AND (item.project_id IS NULL OR EXISTS(SELECT 1 FROM projects p WHERE p.id=item.project_id AND p.workspace_id=session.workspace_id AND p.team_id=session.team_id AND p.deleted_at IS NULL)))
          OR (session.work_item_id IS NULL AND (session.project_id IS NULL OR (project.id IS NOT NULL AND COALESCE(delegation.capability_scope->'projectIds','[]'::jsonb) ? session.project_id::text))))
        AND ((installation.origin_kind='native' AND installation.origin_connection_id IS NULL AND source.id IS NULL)
          OR (installation.origin_kind='connection' AND installation.origin_connection_id=connection.id
            AND source.revoked_at IS NULL AND source.valid_from<=clock_timestamp() AND (source.status='active' OR source.status='overlap' AND source.overlap_until>clock_timestamp())
            AND connection.status IN ('active','rotating') AND connection.revoked_at IS NULL AND connection.workspace_id=session.workspace_id AND connection.team_id=session.team_id
            AND connection.agent_id=session.agent_id AND connection.agent_actor_id=session.agent_actor_id AND connection.principal_human_actor_id=principal.id
            AND 'work:read'=ANY(connection.granted_capabilities) AND coordinator.status='active' AND coordinator.role='coordinator' AND coordinator.scope_type='team'
            AND coordinator.workspace_id=session.workspace_id AND coordinator.scope_id=session.team_id AND coordinator.team_id=session.team_id
            AND coordinator.agent_id=session.agent_id AND coordinator.agent_actor_id=session.agent_actor_id AND coordinator.principal_human_actor_id=principal.id
            AND 'work:read'=ANY(coordinator.permissions_snapshot) AND COALESCE(coordinator.capability_scope->'teamIds','[]'::jsonb) ? session.team_id::text))
      FOR UPDATE OF delivery`, [delivery.id, delivery.agentId, delivery.sessionId, delivery.eventId, delivery.endpointId, delivery.secretVersion, workerId, delivery.attemptCount, binding.token_id, binding.nonce_hash, delivery.endpointUrl, JSON.stringify(delivery.payload), delivery.leaseExpiresAt ?? null, Boolean(nonceHash)]);
        return authorized.rowCount === 1;
    });
}
