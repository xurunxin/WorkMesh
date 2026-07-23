# Stage 0 authorization and event scope integrity

Status: Accepted

## Context

Stage 0 stores a workspace identifier on many resources, but the original foreign keys did not prove that related teams, actors, workflow states, comments, and event audiences belonged to that workspace. The initial installation check also allowed concurrent callers to race on an empty `workspaces` table.

## Decision

Use composite unique keys and foreign keys to bind workspace-scoped relationships. Workflow states and comments carry their owning workspace explicitly. Comment mentions are normalized and may reference only human actors; thread parent and reply references must remain in the same channel.

`platform_installation` is a singleton and owns the installation workspace plus a service actor used for system-attributed bootstrap and administrative events. The installer holds a transaction advisory lock and checks that singleton. Human workspace roles are only `admin` and `member`; team membership roles retain their existing vocabulary.

Events can be team-scoped or directed to one audience actor. Idempotency records preserve the operation label. Outbox delivery attempts are constrained to zero through eight and the claim index excludes exhausted rows.

## Alternatives

Validate all scope relationships only in route handlers; keep mentions as an array; use an in-process install mutex; retain unbounded outbox attempts.

## Consequences

Writers must include `workspace_id` for workflow states and comments, and write normalized mention rows. Stage 0 startup creates exactly one service actor and uses it for system-originated events. Consumers can query event scope without inspecting JSON payloads.

## Migration

Migration `0002_stage0_integrity_delivery.sql` backfills workspace ownership from team/channel relationships, creates a service actor and singleton installation row for an existing installation, normalizes valid human mentions, and nulls legacy cross-channel parent/reply links before adding constraints.

## Spec changes

No REST shape changes are introduced by this ADR. The persistence and operational-event guarantees are strengthened.
