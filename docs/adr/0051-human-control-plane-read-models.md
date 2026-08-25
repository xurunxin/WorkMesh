# Human Control Plane authorized read models

Status: Accepted

## Context

Human operators and authorized Agents currently reconstruct execution status from independent Project, Work Item, Session, Plan, Activity, Attention, Artifact, Approval, Decision, Lease, and Handoff reads. Client-side joins create N+1 load and can combine facts that were not authorized under the same live identity state. Session controls also lack a current-revision consequence preview.

## Decision

Add version 1 server-side projections for Workspace/Project Control Center, Run Explanation, Work Item execution summary, and Session Action Preview.

Every protected source is filtered by the existing live Human-Team or live Session authorization predicate before aggregation. Agent scope remains Session/resource bounded; Coordination Sessions may see only their current Team scope. Empty and not-found responses do not reveal hidden counts or names.

Expandable Control Center collections use stable `(updated_at,id)` cursors, a default limit of 20, and a hard limit of 100. Each database query has a 1.5 second statement/query timeout. Explanations group consecutive equivalent low-value activities while retaining their exact activity IDs and sequence range. All arrays have contract limits.

Projection responses carry version, source-derived revision, freshness timestamps, and a strong projection ETag. Targeted domain events remain the realtime invalidation source; clients invalidate only the matching Workspace, Project, Work Item, or Session key.

Action Preview is advisory, expires after 30 seconds, and does not reserve authority. It reports the Session revision that the final command must supply with `If-Match`. Preview and final `pause`, `resume`, `stop`, and `retry` commands share the same pure domain state policy. Final commands continue to revalidate identity, Team/resource scope, Delegation, capability, Lease, Approval, feature state, and revision inside their mutation transaction. Handoff, replan, and steer previews are conservative and explicitly retain final-command validation.

## Alternatives

Browser joins were rejected because they duplicate policy and expose partial-state ambiguity. New projection tables were deferred because the current facts are queryable, the projection is deterministic, and adding another eventually consistent authority surface is unnecessary for this slice.

## Consequences

The first control-plane view is available in one bounded request. Projection failure remains isolated from stable CRUD and mutation paths. Read responses may be stale but declare freshness and never grant execution authority.

## Migration

No database migration or backfill is required. The projections rebuild from existing durable facts.

## Spec changes

`OPENAPI.yaml` gains the five #89 read/preview routes and versioned component schemas. `packages/contracts` is the shared runtime contract source. The Agent SDK and MCP expose the same read fields.
