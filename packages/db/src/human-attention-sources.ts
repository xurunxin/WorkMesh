export const humanAttentionProjectionSql = `
WITH attention AS (
  SELECT 'decision'::text AS source_type,d.id AS source_id,d.status::text AS source_status,
         d.revision AS source_revision,'decision'::text AS kind,
         CASE WHEN transition.target_decision_id IS NOT NULL THEN 'superseded'
              WHEN d.status='proposed' THEN 'open' ELSE 'decided' END AS status,
         d.workspace_id,COALESCE(w.team_id,p.team_id,s.team_id) AS team_id,
         COALESCE(d.project_id,w.project_id,s.project_id) AS project_id,
         COALESCE(d.work_item_id,s.work_item_id) AS work_item_id,d.session_id,
         d.revision AS target_revision,d.title,d.rationale AS summary,
         'A Human decision determines the next authoritative course of work.'::text AS impact_summary,
         'medium'::text AS risk_level,NULL::timestamptz AS expires_at,
         d.proposed_by_actor_id AS requested_by_actor_id,
         COALESCE(w.responsible_human_actor_id,p.lead_actor_id) AS responsible_human_actor_id,
         jsonb_build_object(
           'evidence',d.evidence,
           'decisionOptions',d.options,
           'selectedOption',d.selected_option,
           'affectedResources',COALESCE((SELECT jsonb_agg(jsonb_build_object('type',resource_type,'id',resource_id)) FROM decision_affected_resources WHERE decision_id=d.id),'[]'::jsonb)
         ) AS payload,
         (SELECT correlation_id FROM domain_events WHERE aggregate_type='decision' AND aggregate_id=d.id ORDER BY cursor DESC LIMIT 1) AS correlation_id,
         d.created_at,COALESCE(d.finalized_at,d.created_at) AS updated_at,NULL::uuid AS recipient_actor_id
    FROM decisions d
    LEFT JOIN agent_sessions s ON s.id=d.session_id AND s.workspace_id=d.workspace_id
    LEFT JOIN work_items w ON w.id=COALESCE(d.work_item_id,s.work_item_id) AND w.workspace_id=d.workspace_id AND w.deleted_at IS NULL
    LEFT JOIN projects p ON p.id=COALESCE(d.project_id,s.project_id,w.project_id) AND p.workspace_id=d.workspace_id AND p.deleted_at IS NULL
    LEFT JOIN decision_transition_consumptions transition ON transition.target_decision_id=d.id
   WHERE d.workspace_id=$1
  UNION ALL
  SELECT 'approval',a.id,a.status::text,a.revision,'approval',
         CASE WHEN a.status='pending' AND a.expires_at<=now() THEN 'expired'
              WHEN a.status='pending' THEN 'open'
              WHEN a.status IN ('approved','rejected') THEN 'decided'
              WHEN a.status='consumed' THEN 'verified'
              WHEN a.status='expired' THEN 'expired' ELSE 'superseded' END,
         a.workspace_id,s.team_id,COALESCE(s.project_id,w.project_id),s.work_item_id,a.session_id,
         a.revision,concat('Approval: ',a.action_name),a.rationale_summary,
         concat('The protected action ',a.action_name,' remains governed by its existing approval handler.'),
         a.risk_level::text,a.expires_at,a.requested_by_actor_id,w.responsible_human_actor_id,
         jsonb_build_object(
           'approvalType',a.approval_type,
           'actionName',a.action_name,
           'actionPayload',a.action_payload_sanitized,
           'actionPayloadHash',a.action_payload_hash,
           'evidenceArtifactIds',COALESCE((SELECT jsonb_agg(id) FROM artifacts WHERE session_id=a.session_id),'[]'::jsonb)
         ),
         (SELECT correlation_id FROM domain_events WHERE aggregate_type='approval' AND aggregate_id=a.id ORDER BY cursor DESC LIMIT 1),
         a.created_at,a.updated_at,NULL::uuid
    FROM approvals a
    JOIN agent_sessions s ON s.id=a.session_id AND s.workspace_id=a.workspace_id
    LEFT JOIN work_items w ON w.id=s.work_item_id AND w.workspace_id=a.workspace_id AND w.deleted_at IS NULL
   WHERE a.workspace_id=$1
  UNION ALL
  SELECT 'inbox_item',i.id,i.status::text,i.revision,
         CASE WHEN i.kind IN ('waiting_input','ask') THEN 'clarification'
              WHEN i.kind='blocker' THEN 'conflict'
              WHEN i.kind IN ('session_stale','handoff') THEN 'recovery'
              ELSE 'completion_review' END,
         CASE WHEN i.status='open' THEN 'open' ELSE 'verified' END,
         i.workspace_id,i.team_id,COALESCE(s.project_id,w.project_id),s.work_item_id,i.session_id,
         COALESCE(s.revision,i.revision),
         CASE WHEN i.kind IN ('waiting_input','ask') THEN 'Clarification requested'
              WHEN i.kind='blocker' THEN 'Conflict needs resolution'
              WHEN i.kind='session_stale' THEN 'Agent execution needs recovery'
              WHEN i.kind='handoff' THEN 'Handoff needs review'
              ELSE 'Completion review requested' END,
         COALESCE(message.body,i.payload->>'summary','An authorized source requested Human attention.'),
         CASE WHEN i.kind='blocker' THEN 'Work cannot safely continue until the reported conflict is resolved.'
              WHEN i.kind='session_stale' THEN 'The current execution is stale and requires an explicit recovery action.'
              ELSE 'The requesting workflow is waiting for an authorized Human response.' END,
         CASE WHEN i.kind IN ('blocker','session_stale') THEN 'high' ELSE 'low' END,
         NULL::timestamptz,COALESCE(message.author_actor_id,s.agent_actor_id,i.recipient_actor_id),
         i.recipient_human_actor_id,
          i.payload || jsonb_build_object(
            'inboxKind',i.kind::text,
            'inboxSourceType',i.source_type,
            'inboxSourceId',i.source_id,
            'sourceMessageId',i.source_room_message_id,
            'inboxRevision',i.revision,
            'sessionRevision',s.revision,
            'handoffRevision',(SELECT h.revision FROM handoffs h WHERE h.id=i.source_id AND h.workspace_id=i.workspace_id)
          ),
         (SELECT correlation_id FROM domain_events WHERE aggregate_type='inbox_item' AND aggregate_id=i.id ORDER BY cursor DESC LIMIT 1),
         i.created_at,i.updated_at,i.recipient_actor_id
    FROM inbox_items i
    LEFT JOIN agent_sessions s ON s.id=i.session_id AND s.workspace_id=i.workspace_id
    LEFT JOIN work_items w ON w.id=s.work_item_id AND w.workspace_id=i.workspace_id AND w.deleted_at IS NULL
    LEFT JOIN room_messages message ON message.id=i.source_room_message_id AND message.workspace_id=i.workspace_id
   WHERE i.workspace_id=$1 AND i.kind IN ('waiting_input','ask','review_request','blocker','handoff','session_stale')
  UNION ALL
  SELECT 'agent_session',session.id,session.state::text,session.revision,
         CASE WHEN session.state='blocked' THEN 'conflict' ELSE 'recovery' END,
         CASE WHEN retry.id IS NOT NULL THEN 'verified' ELSE 'open' END,
         session.workspace_id,session.team_id,COALESCE(session.project_id,work.project_id),session.work_item_id,session.id,
         session.revision,
         CASE WHEN session.state='blocked' THEN 'Agent execution is blocked'
              WHEN session.state='failed' THEN 'Agent execution failed'
              ELSE 'Agent execution is stale' END,
         COALESCE(NULLIF(session.error_summary,''),NULLIF(session.state_reason,''),'The Agent Session requires an explicit Human recovery decision.'),
         'The authoritative Session cannot continue ordinary execution until an existing recovery command succeeds.',
         'high',NULL::timestamptz,session.agent_actor_id,work.responsible_human_actor_id,
         jsonb_build_object('errorCode',session.error_code,'retrySessionId',retry.id,'sessionRevision',session.revision),
         (SELECT correlation_id FROM domain_events WHERE aggregate_type='agent_session' AND aggregate_id=session.id ORDER BY cursor DESC LIMIT 1),
         session.created_at,session.updated_at,NULL::uuid
    FROM agent_sessions session
    LEFT JOIN work_items work ON work.id=session.work_item_id AND work.workspace_id=session.workspace_id AND work.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT successor.id
        FROM agent_sessions successor
       WHERE successor.workspace_id=session.workspace_id
         AND successor.retry_of_session_id=session.id
       ORDER BY successor.created_at DESC
       LIMIT 1
    ) retry ON true
   WHERE session.workspace_id=$1
     AND session.state IN ('blocked','stale','failed')
     AND NOT EXISTS (
       SELECT 1 FROM inbox_items existing
        WHERE existing.workspace_id=session.workspace_id
          AND existing.session_id=session.id
          AND existing.status='open'
          AND existing.kind=CASE WHEN session.state='blocked' THEN 'blocker'::inbox_item_kind ELSE 'session_stale'::inbox_item_kind END
     )
  UNION ALL
  SELECT 'completion_suggestion',suggestion.id,suggestion.status::text,suggestion.revision,'completion_review',
         CASE WHEN suggestion.status='open' THEN 'open' WHEN suggestion.status='accepted' THEN 'verified' ELSE 'superseded' END,
         suggestion.workspace_id,work.team_id,suggestion.project_id,suggestion.work_item_id,NULL::uuid,
         suggestion.revision,concat('Review completion: ',work.title),suggestion.rationale,
         'Accepting or dismissing this suggestion records a Human decision without changing the Work Item lifecycle.',
         'medium',NULL::timestamptz,suggestion.suggested_by_actor_id,work.responsible_human_actor_id,
         jsonb_build_object('evidenceArtifactIds',suggestion.evidence_artifact_ids),
         (SELECT correlation_id FROM domain_events WHERE aggregate_type='completion_suggestion' AND aggregate_id=suggestion.id ORDER BY cursor DESC LIMIT 1),
         suggestion.created_at,COALESCE(suggestion.decided_at,suggestion.created_at),NULL::uuid
    FROM completion_suggestions suggestion
    JOIN work_items work ON work.id=suggestion.work_item_id AND work.workspace_id=suggestion.workspace_id AND work.deleted_at IS NULL
   WHERE suggestion.workspace_id=$1
)
SELECT attention.*,to_char(attention.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_cursor,
       requester.kind::text AS requested_by_kind,requester.display_name AS requested_by_name,
       responsible.display_name AS responsible_human_name
  FROM attention
  JOIN actors requester ON requester.id=attention.requested_by_actor_id AND requester.workspace_id=attention.workspace_id
  LEFT JOIN actors responsible ON responsible.id=attention.responsible_human_actor_id AND responsible.workspace_id=attention.workspace_id AND responsible.kind='human'
 WHERE attention.workspace_id=$1`


export const notificationSourceAggregateTypes = ['decision', 'approval', 'inbox_item', 'agent_session', 'completion_suggestion', 'room_message', 'agent_activity', 'handoff'] as const

export const notificationSourceSelectionSql = humanAttentionProjectionSql + `
 AND attention.status='open' AND (
   (attention.source_type=$2 AND attention.source_id=$3)
   OR (attention.source_type='inbox_item' AND EXISTS (
     SELECT 1 FROM inbox_items source_inbox WHERE source_inbox.id=attention.source_id
       AND source_inbox.workspace_id=$1 AND source_inbox.source_id=$3
       AND source_inbox.source_type=CASE WHEN $2='agent_activity' THEN 'activity' ELSE $2 END
   ))
 )`
