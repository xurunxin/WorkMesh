import { humanAttentionItemSchema, } from '@workmesh/contracts';
const record = (value) => value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
const strings = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
const number = (value) => typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
const iso = (value) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const affectedResources = (row) => {
    const resources = [
        row.project_id ? { type: 'project', id: row.project_id } : undefined,
        row.work_item_id ? { type: 'work_item', id: row.work_item_id } : undefined,
        row.session_id ? { type: 'session', id: row.session_id } : undefined,
    ].filter((value) => Boolean(value));
    const supplied = record(row.payload).affectedResources;
    if (Array.isArray(supplied)) {
        for (const candidate of supplied) {
            const item = record(candidate);
            if (typeof item.type === 'string' && typeof item.id === 'string')
                resources.push({ type: item.type, id: item.id });
        }
    }
    return [...new Map(resources.map(resource => [`${resource.type}:${resource.id}`, resource])).values()];
};
const evidence = (row) => {
    const payload = record(row.payload);
    const references = [];
    if (typeof payload.inboxSourceType === 'string' && typeof payload.inboxSourceId === 'string')
        references.push({ type: payload.inboxSourceType, id: payload.inboxSourceId });
    for (const id of strings(payload.evidenceArtifactIds))
        references.push({ type: 'artifact', id });
    if (Array.isArray(payload.evidence)) {
        payload.evidence.forEach((candidate, index) => {
            if (typeof candidate === 'string') {
                references.push({ type: 'source_evidence', id: `${row.source_id}:${index}`, title: candidate });
                return;
            }
            const item = record(candidate);
            if (typeof item.id !== 'string')
                return;
            references.push({
                type: typeof item.type === 'string' ? item.type : 'source_evidence',
                id: item.id,
                ...(typeof item.title === 'string' ? { title: item.title } : {}),
                ...(typeof item.uri === 'string' ? { uri: item.uri } : {}),
                ...(typeof item.status === 'string' ? { status: item.status } : {}),
            });
        });
    }
    return [...new Map(references.map(item => [`${item.type}:${item.id}`, item])).values()];
};
const urgency = (row, observedAt) => {
    if (row.kind === 'conflict' || row.kind === 'recovery' || row.risk_level === 'critical')
        return 'immediate';
    if (row.risk_level === 'high')
        return 'immediate';
    if (row.expires_at) {
        const remaining = new Date(row.expires_at).getTime() - observedAt.getTime();
        if (remaining <= 60 * 60 * 1_000)
            return 'immediate';
        if (remaining <= 24 * 60 * 60 * 1_000)
            return 'soon';
    }
    return row.kind === 'decision' || row.kind === 'approval' || row.kind === 'completion_review'
        ? 'soon'
        : 'normal';
};
const reasonCodes = (row, approvalActionability) => {
    if (row.kind === 'decision')
        return [row.status === 'open' ? 'decision.response_required' : `decision.${row.status}`];
    if (row.kind === 'approval' && approvalActionability?.status === 'blocked')
        return [`approval.${approvalActionability.reason}`];
    if (row.kind === 'approval')
        return [row.status === 'open' ? 'approval.response_required' : `approval.${row.status}`];
    if (row.kind === 'clarification')
        return ['clarification.input_required'];
    if (row.kind === 'conflict')
        return ['conflict.blocker_reported'];
    if (row.kind === 'recovery') {
        if (record(row.payload).inboxKind === 'handoff')
            return ['recovery.handoff_requested'];
        return [row.source_type === 'agent_session'
                ? `recovery.session_${row.source_status}`
                : 'recovery.session_stale'];
    }
    return ['completion_review.acceptance_required'];
};
const option = (id, label, command, path, targetRevision, consequencePreviewPath) => ({
    id,
    label,
    command,
    method: 'POST',
    path,
    ...(targetRevision ? { targetRevision } : {}),
    requiredCapabilities: ['work:write'],
    requiredActorKinds: ['human'],
    requiresApproval: false,
    ...(consequencePreviewPath ? { consequencePreviewPath } : {}),
});
const options = (row, approvalActionability) => {
    if (row.status !== 'open')
        return [];
    const payload = record(row.payload);
    if (row.kind === 'decision')
        return [option('finalize', 'Finalize decision', 'finalizeDecision', `/api/v1/decisions/${row.source_id}/finalize`, row.target_revision)];
    if (row.kind === 'approval' && approvalActionability?.status === 'blocked')
        return [];
    if (row.kind === 'approval')
        return [
            option('approve', 'Approve', 'decideApproval', `/api/v1/approvals/${row.source_id}/decide`, row.target_revision),
            option('reject', 'Reject', 'decideApproval', `/api/v1/approvals/${row.source_id}/decide`, row.target_revision),
        ];
    if (row.source_type === 'completion_suggestion')
        return [
            option('accept', 'Accept completion', 'decideCompletionSuggestion', `/api/v1/completion-suggestions/${row.source_id}/decision`, row.target_revision),
            option('dismiss', 'Dismiss', 'decideCompletionSuggestion', `/api/v1/completion-suggestions/${row.source_id}/decision`, row.target_revision),
        ];
    if (row.kind === 'clarification' && row.source_type === 'inbox_item' && typeof payload.sourceMessageId === 'string')
        return [option('answer', 'Answer in context', 'replyInboxItem', `/api/v1/inbox/${row.source_id}/reply`, number(payload.inboxRevision))];
    if (row.kind === 'conflict' && typeof payload.sourceMessageId === 'string')
        return [option('resolve', 'Resolve conflict', 'resolveRoomMessage', `/api/v1/messages/${payload.sourceMessageId}/resolve`, null)];
    if (row.kind === 'recovery' && payload.inboxKind === 'handoff' && typeof payload.inboxSourceId === 'string')
        return [
            option('accept', 'Accept handoff', 'acceptHandoff', `/api/v1/handoffs/${payload.inboxSourceId}/accept`, number(payload.handoffRevision)),
            option('reject', 'Reject handoff', 'rejectHandoff', `/api/v1/handoffs/${payload.inboxSourceId}/reject`, number(payload.handoffRevision)),
        ];
    if (row.kind === 'recovery' && row.session_id)
        return [option('retry', 'Retry execution', 'retryAgentSession', `/api/v1/agent-sessions/${row.session_id}/retry`, number(payload.sessionRevision) ?? row.target_revision, `/api/v1/agent-sessions/${row.session_id}/control-preview`)];
    if (row.kind === 'completion_review' && row.source_type === 'inbox_item' && typeof payload.sourceMessageId === 'string')
        return [option('respond', 'Respond to review', 'replyInboxItem', `/api/v1/inbox/${row.source_id}/reply`, number(payload.inboxRevision))];
    return [];
};
const audience = (row, availableOptions, viewer) => {
    const relationship = !viewer
        ? 'visible_to_me'
        : row.responsible_human_actor_id === viewer.id || row.recipient_actor_id === viewer.id
            ? 'assigned_to_me'
            : viewer.workspaceRole === 'admin'
                ? 'workspace_administration'
                : 'visible_to_me';
    const requiresExactRecipient = availableOptions.some(candidate => candidate.command === 'replyInboxItem');
    return {
        relationship,
        canRespond: viewer?.kind === 'human'
            && row.status === 'open'
            && availableOptions.length > 0
            && (!requiresExactRecipient || row.recipient_actor_id === viewer.id),
    };
};
const response = (row) => {
    const payload = record(row.payload);
    const choices = row.kind === 'decision'
        ? strings(payload.decisionOptions).map(value => ({ id: value, label: value }))
        : [];
    return {
        workflow: row.kind,
        // Approval commands retain a non-empty audit reason, but the Human UI may
        // submit a stable default for direct Approve/Reject actions.
        requiresReason: ['decision', 'conflict', 'recovery'].includes(row.kind),
        requiresMessage: row.kind === 'clarification' || (row.kind === 'completion_review' && row.source_type === 'inbox_item'),
        choices,
        expectedStatus: row.kind === 'decision' || row.kind === 'approval' ? 'decided' : 'verified',
    };
};
const bulk = (row, approvalActionability) => {
    const payload = record(row.payload);
    const payloadHash = typeof payload.actionPayloadHash === 'string' ? payload.actionPayloadHash : null;
    const eligible = row.status === 'open'
        && row.kind === 'approval'
        && approvalActionability?.status !== 'blocked'
        && (row.risk_level === 'info' || row.risk_level === 'low')
        && payloadHash !== null;
    const prohibitedReason = eligible
        ? null
        : row.kind !== 'approval'
            ? 'bulk.kind_not_supported'
            : approvalActionability?.status === 'blocked'
                ? 'bulk.approval_not_actionable'
                : row.risk_level !== 'info' && row.risk_level !== 'low'
                    ? 'bulk.risk_prohibited'
                    : 'bulk.exact_payload_required';
    return {
        eligible,
        compatibilityKey: eligible ? `approval:${payloadHash}` : null,
        prohibitedReason,
        revalidateIndividually: true,
    };
};
export function projectHumanAttentionRow(row, observedAt = new Date(), viewer, approvalActionability) {
    const effectiveStatus = row.kind !== 'approval'
        || !approvalActionability
        || approvalActionability.status === 'actionable'
        ? row.status
        : approvalActionability.reason === 'expired'
            ? 'expired'
            : approvalActionability.reason === 'already_decided'
                ? 'decided'
                : approvalActionability.reason === 'viewer_already_decided'
                    ? 'seen'
                    : 'failed';
    const effectiveRow = effectiveStatus === row.status ? row : { ...row, status: effectiveStatus };
    const availableOptions = options(effectiveRow, approvalActionability);
    const sourceUpdatedAt = iso(effectiveRow.updated_at);
    const correlationId = row.correlation_id ?? `source:${row.source_type}:${row.source_id}`;
    return humanAttentionItemSchema.parse({
        projectionVersion: 1,
        id: `v1:${row.source_type}:${row.source_id}`,
        kind: effectiveRow.kind,
        status: effectiveRow.status,
        workspaceId: row.workspace_id,
        teamId: row.team_id,
        projectId: row.project_id,
        workItemId: row.work_item_id,
        sessionId: row.session_id,
        planVersionId: null,
        planStepId: null,
        title: row.title,
        summary: row.summary,
        summaryDerived: true,
        reasonCodes: reasonCodes(effectiveRow, approvalActionability),
        severity: effectiveRow.risk_level,
        urgency: urgency(effectiveRow, observedAt),
        requestedBy: {
            id: row.requested_by_actor_id,
            kind: row.requested_by_kind,
            displayName: row.requested_by_name,
        },
        responsibleHuman: row.responsible_human_actor_id && row.responsible_human_name
            ? { id: row.responsible_human_actor_id, kind: 'human', displayName: row.responsible_human_name }
            : null,
        options: availableOptions,
        recommendedOptionId: availableOptions[0]?.id ?? null,
        audience: audience(effectiveRow, availableOptions, viewer),
        response: response(effectiveRow),
        bulk: bulk(effectiveRow, approvalActionability),
        impactSummary: row.impact_summary,
        affectedResources: affectedResources(row),
        evidence: evidence(row),
        expiresAt: row.expires_at ? iso(row.expires_at) : null,
        sourceRevision: row.source_revision,
        source: { type: row.source_type, id: row.source_id, status: row.source_status },
        freshness: {
            state: approvalActionability?.status === 'blocked'
                && (approvalActionability.reason === 'session_inactive' || approvalActionability.reason === 'authority_revoked')
                ? 'stale'
                : row.source_status === 'stale'
                    ? 'stale'
                    : row.correlation_id ? 'current' : 'partial',
            observedAt: observedAt.toISOString(),
            sourceUpdatedAt,
            ...(row.expires_at ? { invalidAfter: iso(row.expires_at) } : {}),
        },
        correlationId,
        createdAt: iso(row.created_at),
        updatedAt: sourceUpdatedAt,
    });
}
export { humanAttentionProjectionSql } from '@workmesh/db';
