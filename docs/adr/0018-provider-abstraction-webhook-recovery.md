# Provider abstraction, webhook verification, and recovery

Status: Accepted

## Context

Stage 3 needs GitHub delivery now without making GitHub identifiers or SDK types part of the domain. Provider calls can fail after an API request commits, and native GitHub webhooks use a raw-body HMAC plus a unique delivery ID rather than WorkMesh's timestamped agent-webhook protocol.

## Decision

The API authorizes and persists provider intent, a domain event, and an outbox row in one PostgreSQL transaction. Immediately before every not-yet-performed provider mutation, the worker revalidates the exact actor, active ordinary-write session, delegation, agent and team grants, capability, scope, repository context, repository, provider connection, work item, project, and current plan step from PostgreSQL. Revocation is terminal and audited without calling the provider. A worker then calls a provider-neutral interface using opaque connection, repository, commit, and pull-request IDs. The deterministic fake provider implements that same interface before the built-in GitHub adapter. Provider action IDs are carried as idempotency markers in GitHub commits and pull requests; retries recover a checkpointed provider result without another external mutation. A merge that the provider already reports as completed may likewise reconcile locally only when its provider head and merge result still match the persisted exact-head approval binding; this recovery path does not grant authority for a new provider write. GitHub App is the production credential model: the private key is encrypted at rest, decrypted only by the worker, used to sign a short-lived app JWT, and exchanged for an installation token cached only in worker memory.

GitHub commit-object creation supplies deterministic author and committer metadata derived from the durable WorkMesh intent. Git trees and commits are content-addressed, so a retry after the commit-object POST but before the branch-ref PATCH converges to the identical tree and commit SHA. A lost PATCH response is reconciled by rereading the ref. GitHub cannot atomically combine arbitrary multi-file Git object creation with a conditional ref update; an unreferenced deterministic object may remain after a competing ref update, but retries do not create distinct commits for the same intent.

The provider port also exposes provider-neutral pinned-commit guidance discovery and approved CI check retry. GitHub uses commit/tree/blob reads for guidance and the check-run re-request endpoint for CI; the deterministic fake implements both paths first.

The public GitHub webhook endpoint bounds headers and the body, captures exact raw bytes, verifies `X-Hub-Signature-256` in constant time, and records the unique `X-GitHub-Delivery` plus body hash. The worker claims deliveries with `SKIP LOCKED`, normalizes supported events, applies idempotent projections, retries boundedly, recovers stale claims, and dead-letters exhausted work. Reusing a delivery ID with different bytes is a conflict.

## Alternatives

Calling GitHub from API routes; storing only normalized webhooks; requiring an invented timestamp header; embedding GitHub payloads in domain commands.

## Consequences

PostgreSQL remains authoritative and API latency does not include provider I/O. Provider actions may be eventually consistent. Queue delay never extends agent authority: a stop, revocation, scope change, context change, or repository deactivation fences any provider mutation that has not happened yet. Once the irreversible provider mutation has completed, recovery is restricted to idempotent local projection, artifact, approval, event, and outbox reconciliation. Deployment supplies the GitHub App ID, installation ID, private key, and webhook secret; the built-in worker performs installation authentication and GitHub REST operations behind the provider-neutral port.

## Migration

Migration 0008 adds provider connections, repositories, action/delivery queues, and provider projections. Migration 0013 permits human-owned asynchronous context-resolution actions.

## Spec changes

`OPENAPI.yaml` adds provider connection, repository, action, and native webhook routes.
