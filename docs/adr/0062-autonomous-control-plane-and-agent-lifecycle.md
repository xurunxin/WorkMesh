# Autonomous control plane and Agent lifecycle

Status: Accepted

## Context

WorkMesh already exposes governed Approvals, Human Attention, durable Inbox and
Agent Connection lifecycles, but the deployed Human Control Plane still requires
manual approval for every protected action, browser notification delivery is a
stub, revoked Agents remain prominent in operational lists, and creating a new
Agent Connection requires a Human to enter every Agent-specific field.

The new behavior must preserve WorkMesh authority. Autonomous approval is a
policy-authored decision, never a fabricated Human decision, and cannot bypass
identity, active session, delegation, capability, resource scope, revision,
project exclusion, or Stop enforcement. Human Attention remains an authorized
projection over domain records rather than a second workflow engine.

## Decision

- A revisioned workspace Approval Autonomy Policy selects `human_required` or
  `yolo`. Projects may opt out. The default is `human_required`.
- A system-authored policy decision may satisfy any Approval risk level after the
  normal authority checks pass. It records policy provenance and continues to
  emit the existing Approval final events used by Agents.
- Enabling YOLO creates a durable reconciliation run. A bounded Worker processes
  existing eligible pending Approvals with retry-safe row locking.
- Expired Approvals are durably marked expired, their Inbox item is resolved, and
  the Human Attention history projection is the archive surface.
- Browser notifications use standards-based Web Push, one durable subscription
  per Human device, and one independently retried delivery per subscription.
  Approval payloads and rationale never enter the push payload.
- An Agent Enrollment Policy is a time- and use-bounded team capability ceiling.
  Redeeming its one-time-displayed secret atomically creates the Agent, authority,
  Connection, and installation credential without Human data entry.
- Agent archive state is explicit. Revocation reconciles credentials, grants,
  delegations, coordination sessions, and Agent Sessions before archiving an
  Agent that has no remaining usable authority or non-terminal work.
- The Human Control Plane uses the selected decision-workspace design: a compact
  grouped attention rail, full governed context, and a persistent direct action
  bar. Agent administration uses server-paged operational and archive surfaces.

## Alternatives

Client-side auto-clicking Approval buttons was rejected because it is not durable,
cannot advance when the browser is closed, and would misattribute policy decisions
to a Human. Poll-only browser notifications were rejected because they cannot
notify after all WorkMesh tabs close. Per-Agent manual pairing remains available
as an administrator recovery path but is not the default onboarding workflow.

## Consequences

Operators can deliberately trade Human review latency for policy-governed Agent
autonomy while retaining a complete audit trail. Self-hosted deployments must
configure VAPID keys before Web Push becomes available. Enrollment secrets and
installation credentials remain write-only and must never enter logs, activities,
notifications, or artifacts.

## Migration

Three additive migrations introduce Approval autonomy/provenance, browser push,
and Agent enrollment/archive state. Existing Approval decisions are backfilled as
Human-authored. Existing inactive Agent definitions are marked archived. All new
policies default to disabled or absent, so deployment does not silently enable
YOLO, Web Push, or Agent self-enrollment.

## Spec changes

Update `OPENAPI.yaml`, `SCHEMA.sql`, `AGENT_PROTOCOL.md`, shared contracts, event
invalidations, the Agent SDK, and the public Agent Connection skill. The matching
local plan is `docs/plan/2026-08-27-autonomous-control-plane-and-agent-lifecycle.md`.
The WorkMesh Project description points to this ADR and contains one Work Item per
plan task with the same tests and definition of done.
