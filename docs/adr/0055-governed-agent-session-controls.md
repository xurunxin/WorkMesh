# Governed Agent Session controls

Status: Accepted

## Context

Agent Session controls currently mix direct mutations, fixed audit reasons, and
browser-native prompts. The control-preview projection introduced by ADR 0051
already evaluates the shared domain state policy, but the Web does not bind a
Human-reviewed preview to the final revisioned command or preserve drafts when
that revision becomes stale.

## Decision

All Human Agent Session controls use one governed dialog and the authoritative
control-preview endpoint before a material command. The preview contains the
source revision and expiry, target resources, Lease and evidence behavior,
Approval invalidation, recovery path, supported stop modes, and supported steering
scopes. The final command uses the preview revision in `If-Match`; a revision
conflict keeps the Human draft, reloads the preview, and requires an explicit
reissue.

Pause, resume, and stop remain Session signal commands. Retry creates a distinct
linked Session. Current-step and whole-Session steering append a scoped Human
prompt. Remaining-Plan and replan requests carry the current Plan revision and ask
the Agent to publish a new immutable Plan Version. Project/Team guidance opens the
versioned Guidance workflow and is never injected as Session text. A Handoff
control requests a scoped offer from the current Agent; creation and acceptance
remain governed by the existing Handoff domain.

Force Lease release and Handoff rejection/cancel use explicit, focus-managed forms
with Human-authored reasons. Their final APIs remain revisioned and authoritative.
No browser prompt or confirm is used by these control-plane paths.

## Alternatives

Adding consequence copy around existing buttons was rejected because browser copy
cannot authoritatively determine current state or make stale previews detectable.
A new universal command endpoint was rejected because it would duplicate mature
Session, Plan, Handoff, Lease, and Guidance domain commands.

## Consequences

Control policy remains server-owned while interaction state stays local to one
dialog, so unrelated Sessions remain usable. Drafts survive conflicts and double
submits converge through existing idempotency. Handoff and replan controls clearly
represent requests until the authoritative resource is created.

## Migration

No database migration is required. Existing endpoints remain valid. Clients that
only send `{ action }` to control preview continue to receive defaults; new clients
may provide a stop mode or steering scope.

## Spec changes

`packages/contracts`, `OPENAPI.yaml`, the control-preview projection, Agent SDK,
MCP, and Web control surfaces gain stop-mode, steering-scope, recovery, and stale
reissue fields. Mutation and domain-event semantics remain unchanged.
