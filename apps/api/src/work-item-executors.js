import { deriveSessionBudgetUtilization, worstSessionBudgetUtilization } from '@workmesh/domain';
const assignment = (row, observedAt) => {
    if (!row.assignment_delegation_id
        || !row.assignment_agent_id
        || !row.assignment_agent_actor_id
        || !row.assignment_agent_slug
        || !row.assignment_agent_display_name
        || !row.assignment_assigned_at)
        return null;
    return {
        delegation_id: row.assignment_delegation_id,
        agent_id: row.assignment_agent_id,
        agent_actor_id: row.assignment_agent_actor_id,
        agent_slug: row.assignment_agent_slug,
        agent_display_name: row.assignment_agent_display_name,
        session_id: row.assignment_session_id,
        session_state: row.assignment_session_state,
        assigned_at: row.assignment_assigned_at.toISOString(),
        budget_utilization: worstSessionBudgetUtilization(deriveSessionBudgetUtilization({
            budget: row.assignment_session_budget ?? {},
            startedAt: row.assignment_session_created_at?.toISOString() ?? null,
            observedAt: observedAt,
        })),
    };
};
const executor = (row) => {
    if (!row.projection_role
        || !row.agent_id
        || !row.agent_actor_id
        || !row.agent_slug
        || !row.agent_display_name
        || !row.session_id
        || !row.lease_id
        || !row.lease_kind
        || !row.resource_type
        || !row.resource_id
        || !row.execution_state
        || !row.heartbeat_health
        || !row.lease_heartbeat_at
        || !row.lease_expires_at)
        return null;
    return {
        agent_id: row.agent_id,
        agent_actor_id: row.agent_actor_id,
        agent_slug: row.agent_slug,
        agent_display_name: row.agent_display_name,
        session_id: row.session_id,
        lease_id: row.lease_id,
        lease_kind: row.lease_kind,
        resource_type: row.resource_type,
        resource_id: row.resource_id,
        execution_state: row.execution_state,
        heartbeat_health: row.heartbeat_health,
        last_heartbeat_at: row.last_heartbeat_at?.toISOString() ?? null,
        lease_heartbeat_at: row.lease_heartbeat_at.toISOString(),
        lease_expires_at: row.lease_expires_at.toISOString(),
    };
};
/**
 * Adds responsibility, assignment, and runtime executor projections in one
 * bounded query. Assignment comes from the active executor Delegation and is
 * visible before a queued Session obtains a lease. Runtime execution remains
 * lease-backed; the expiry predicate prevents a delayed Worker sweep from
 * exposing an already-expired executor.
 */
export async function attachWorkItemExecutors(db, items) {
    if (!items.length)
        return [];
    const workspaceIds = [...new Set(items.map(item => item.workspace_id))];
    if (workspaceIds.length !== 1)
        throw new Error('Work Item projection query must be scoped to one Workspace');
    const result = await db.query(`SELECT item.id AS work_item_id,
            human.id AS responsible_human_actor_id,
            human.display_name AS responsible_human_display_name,
            assignment.id AS assignment_delegation_id,
            assignment.agent_id AS assignment_agent_id,
            assignment.agent_actor_id AS assignment_agent_actor_id,
            assignment_definition.slug AS assignment_agent_slug,
            assignment_actor.display_name AS assignment_agent_display_name,
            assignment_session.id AS assignment_session_id,
            assignment_session.state AS assignment_session_state,
            assignment_session.budget AS assignment_session_budget,
            assignment_session.created_at AS assignment_session_created_at,
            assignment.created_at AS assignment_assigned_at,
            projection.projection_role,projection.agent_id,
            projection.agent_actor_id,definition.slug AS agent_slug,
            agent_actor.display_name AS agent_display_name,
            projection.session_id,projection.lease_id,projection.lease_kind,
            projection.resource_type,projection.resource_id,
            projection.execution_state,projection.heartbeat_health,
            projection.last_heartbeat_at,projection.lease_heartbeat_at,
            projection.lease_expires_at
       FROM work_items item
       LEFT JOIN actors human
         ON human.id=item.responsible_human_actor_id
        AND human.workspace_id=item.workspace_id
       LEFT JOIN LATERAL (
         SELECT delegation.id,delegation.agent_id,delegation.agent_actor_id,
                delegation.created_at
           FROM delegations delegation
          WHERE delegation.workspace_id=item.workspace_id
            AND delegation.work_item_id=item.id
            AND delegation.role='executor'
            AND delegation.status='active'
          ORDER BY delegation.created_at DESC,delegation.id DESC
          LIMIT 1
       ) assignment ON true
       LEFT JOIN agent_definitions assignment_definition
         ON assignment_definition.id=assignment.agent_id
        AND assignment_definition.workspace_id=item.workspace_id
       LEFT JOIN actors assignment_actor
         ON assignment_actor.id=assignment.agent_actor_id
        AND assignment_actor.workspace_id=item.workspace_id
       LEFT JOIN LATERAL (
         SELECT session.id,session.state,session.budget,session.created_at
           FROM agent_sessions session
          WHERE session.workspace_id=item.workspace_id
            AND session.delegation_id=assignment.id
            AND session.session_kind='execution'
          ORDER BY session.created_at DESC,session.id DESC
          LIMIT 1
       ) assignment_session ON true
       LEFT JOIN work_item_executor_projections projection
         ON projection.work_item_id=item.id
        AND projection.workspace_id=item.workspace_id
        AND projection.lease_expires_at>now()
       LEFT JOIN agent_definitions definition
         ON definition.id=projection.agent_id
        AND definition.workspace_id=projection.workspace_id
       LEFT JOIN actors agent_actor
         ON agent_actor.id=projection.agent_actor_id
        AND agent_actor.workspace_id=projection.workspace_id
      WHERE item.workspace_id=$1 AND item.id=ANY($2::uuid[])
      ORDER BY item.id,projection.projection_role,definition.slug,
               projection.session_id,projection.lease_id`, [workspaceIds[0], items.map(item => item.id)]);
    const observedAt = new Date().toISOString();
    const projections = new Map();
    for (const row of result.rows) {
        const current = projections.get(row.work_item_id) ?? {
            responsible_human: row.responsible_human_actor_id && row.responsible_human_display_name
                ? { actor_id: row.responsible_human_actor_id, display_name: row.responsible_human_display_name }
                : null,
            active_assignment: assignment(row, observedAt),
            active_executor: null,
            shared_reviewers: [],
        };
        const projected = executor(row);
        if (projected && row.projection_role === 'primary')
            current.active_executor = projected;
        if (projected && row.projection_role === 'reviewer')
            current.shared_reviewers.push(projected);
        projections.set(row.work_item_id, current);
    }
    return items.map(item => ({
        ...item,
        ...(projections.get(item.id) ?? {
            responsible_human: null,
            active_assignment: null,
            active_executor: null,
            shared_reviewers: [],
        }),
    }));
}
