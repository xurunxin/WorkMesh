# Parent child completion policy

Status: Accepted

## Context

Parent sessions must not report complete while delegated required work is unresolved.

## Decision

Child sessions carry a required-for-parent flag, stable plan-step/version identity, and bounded parent and per-step child-session counts. Child capabilities must remain a subset of the parent delegation and target agent/team grants. Child budgets inherit the parent budget and may only be reduced by child input. Parent completion rejects with stable blocker session IDs until every required child is `completed`; failed, canceled, stale, or active required children remain blockers. Review delegations are required children and additionally require a reviewer-authored `review_result` plus `code_review` artifact. Plan dependencies continue to be an acyclic DAG.

## Alternatives

Implicit child completion; treating terminal failure as success; mutable step identity.

## Consequences

The parent result is reliable and callers can display exact blockers.

## Migration

Migration 0007 adds child policy columns.

## Spec changes

None.
