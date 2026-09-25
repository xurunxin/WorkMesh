# Atomic Workbench Turn and Agent Session Completion

## Status

Accepted — 2026-09-25. W11 implementation; Docker test control plane Project `19a58123-88c7-4d5e-9bc7-619165bfc818`, WorkItem `ee2e9dbd-a657-47e5-8cb1-0b488df99ab3`.

## Context

Pi's `workmesh_complete_session` tool produces a completion intent while an Agent Session is executing. The public Turn must be settled before the Session becomes terminal. Separate REST transactions left a crash window after Turn settlement and before Session completion, during which the intent existed only in Runner memory.

## Decision

The Runner submits the final public answer, Turn settlement, and optional exact Session completion in one `runner-attempts/{id}/settle` request. The API checks the current Attempt fence and executing Session, then calls the existing Session completion command policy with the model-supplied `If-Match` revision, evidence, and stable operation key inside the same PostgreSQL transaction. The conversation message, Turn, Session, domain events, and outbox rows commit together. A failed completion rolls back all of them. A settled Turn requires a public answer; a failed or canceled Turn cannot complete its Session.

The Runner reuses a stable settlement idempotency key if the HTTP response is lost. The settle route permits a terminal Session through its preliminary active-Session policy so the transaction can return a previously committed idempotency result. A new write still reaches the normal in-transaction active-Session guard and is rejected. If the API explicitly rejects completion with a client error, the Runner retries a Turn-only settlement under a separate stable key and attempts a visible warning. It does not silently mark the Session completed. Stop, delegation, capability, scope, revision, and evidence checks remain in the server command. Handoff acceptance remains Human-only.

## Alternatives

- Persist a separate completion-intent queue and reconcile after Runner restart: viable, but adds a second durable workflow and an avoidable intermediate state.
- Complete the Session before settling the Turn: rejected because terminal Sessions cannot perform ordinary Turn writes.
- Treat a completed Turn as implicit Session completion: rejected because a Turn is not the Agent Session lifecycle and may be followed by another Turn.

## Consequences

The successful completion path has no gap between a committed public answer and a committed Session result. Completion rejection can still leave a settled Turn and an executing Session; the warning and server error identify this condition for Human review. Tool side effects performed before settlement remain independently committed and require explicit reconciliation after a failure. Runner crash before the atomic request leaves the Attempt for the existing stale-attempt recovery job; it does not complete the Session. This ADR does not claim full W11 denial, retry, and recovery acceptance.

## Migration

No database migration. Existing settled Turns and Sessions retain their state. Deploy API and Runner images together so the Runner can send the optional `sessionCompletion` field.

## Spec changes

`OPENAPI.yaml` and the shared Zod contract add optional `sessionCompletion` to the Runner settlement input and report `sessionCompletion` in the response. `AGENT_PROTOCOL.md`, ADR 0067, the W11 operation matrix, and the route plan record this behavior. No new event type is introduced; the existing `workbench.*` and `agent.session.completed` events share the transaction.
