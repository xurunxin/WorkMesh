# Agent routing

Status: Accepted

## Context

Skill-targeted handoffs and plan proposals need explainable, non-escalating selection.

## Decision

Routing considers only active agents with the requested skill, permitted team access, the parent-delegation capability intersection, and remaining concurrency. Skill shortlists sort deterministically by active-session count, slug, then agent ID; exact-agent requests still pass the same access, capability, status, and concurrency gates. Candidate and selected records contain concise filter/rank rationale, and the handoff keeps a routing snapshot. Every accept request also writes an idempotent routing-attempt fact with a sanitized filter summary, candidate count, outcome, and failure code. The attempt is committed independently of acceptance so a no-candidate or later validation failure remains explainable; it never creates delegation, session, lease, event, or outbox state. Per-agent row locking serializes the final concurrency check with session creation. Routing can never add a capability not already approved for the agent, team, and parent delegation.

## Alternatives

Random selection; model-selected hidden routing; capability elevation for a chosen agent.

## Consequences

Human operators can reproduce why an agent was selected and approve a target when ambiguity remains.

## Migration

Migration 0007 adds `routing_attempts` and `routing_records`.

## Spec changes

None.
