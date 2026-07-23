# Agent session transition table and server-side stop gate

Status: Accepted

## Context

Work-item workflow status cannot express an individual agent run. Agents must be stoppable even when their runner is delayed or malicious.

## Decision

Use the Stage 1 closed transition table for `queued`, `acknowledged`, `planning`, `executing`, wait/block/pause states, `stopping`, `stale`, and terminal states. Route handlers submit commands; a shared domain policy validates the current state and transition. Entering `stopping` revokes ordinary agent writes immediately. It permits exactly one `stop_ack` cleanup summary, then transitions only to `canceled`; heartbeat may be accepted diagnostically without restoring authority.

Retry never reopens or transitions a terminal session. An authorized human retry command creates a distinct `queued` session with `retry_of_session_id` pointing to the failed, canceled, or stale source session. The new session receives fresh revision, token, sequence, and idempotency scope while the source history remains immutable.

## Alternatives

Frontend-only controls; a free-form state string; treating a stopped runner as proof that writes ended; automatically canceling the work item.

## Consequences

All agent commands load the current session state and cannot infer authority from a client flag. Work-item status remains independent and humans may change it through its own policy.

## Migration

Stage 1 adds the session state, sequence, revision, `retry_of_session_id`, stop timestamp, and one-time cleanup acknowledgement projection. Existing Stage 0 work items are unchanged.

## Spec changes

Invalid state changes return `INVALID_SESSION_TRANSITION`; post-stop ordinary writes return `SESSION_STOPPED`; ineligible retry sources return `AGENT_SESSION_RETRY_NOT_ALLOWED`.
