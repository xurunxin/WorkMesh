# Agent plan versioning and conflict handling

Status: Accepted

## Context

Plans are collaborative execution objects, not mutable todo text. Concurrent edits and removal of started work can otherwise erase accountability or re-run work incorrectly.

## Decision

Each publication creates a new immutable plan version and advances the session projection only with `If-Match`. Steps retain stable IDs across versions; all dependencies must resolve inside the version and form a DAG. A started, blocked, or completed old step cannot disappear: it remains completed or is marked canceled with a reason. A stale plan revision returns a conflict and must be re-read and merged, never blindly overwritten.

Plan approvals use distinct append-only event meanings. `approval.requested` is emitted once when the initial pending request is created. Every individual approver vote emits `approval.decision.recorded`, including the resulting quorum projection. `approval.approved` and `approval.rejected` are emitted only when the approval reaches that terminal status; they are not aliases for individual votes. An undecided request that times out emits `approval.expired` as its terminal event.

## Alternatives

One mutable JSON plan; position-based step identity; last-write-wins update; deleting started steps.

## Consequences

Clients retain plan history and can show diffs. Command code validates dependency cycles, missing dependencies, stable started steps, and revision before publication.

## Migration

Stage 1 introduces plan-version and plan-step records. There is no prior plan data to backfill.

## Spec changes

`PUT /api/v1/agent-sessions/{id}/plan` requires `If-Match` and returns `PLAN_REVISION_CONFLICT` for a stale revision. Approval event consumers must distinguish requests, recorded decisions, terminal approval/rejection, and expiry.
