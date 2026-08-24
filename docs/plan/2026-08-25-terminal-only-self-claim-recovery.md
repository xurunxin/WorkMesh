# GitHub #85 terminal-only self-claim recovery

Source: https://github.com/xurunxin/WorkMesh/issues/85

ADR: `docs/adr/0049-terminal-only-self-claim-recovery.md`

Branch: `codex/fix-terminal-only-self-claim-85`

Base: `38fdaaf70a90b1651d80b0221799ff3b93118b70`

## Outcome

An exact same-identity active executor Delegation remains autonomously
claimable when it has no live execution: every non-terminal execution is stale,
or the non-terminal set is empty because all historical executions are terminal
or no execution was materialized. Claim creates one distinct queued attempt,
keeps terminal history immutable, and does not require Human cleanup.

## Implementation

1. Extend the claim lock plan with the deterministic newest terminal execution
   source and revalidate it after locks. Separate Delegation identity
   compatibility from the non-terminal recovery set.
2. Admit compatible empty or all-stale non-terminal sets. Retain stale fencing;
   otherwise link the queued replacement to the newest terminal Session. Keep
   live and incompatible assignments as `WORK_ITEM_ALREADY_ASSIGNED`.
3. Make claimable discovery use the same no-non-stale predicate. Update Agent
   Protocol, OpenAPI, MCP descriptions, WorkMesh Skill sources and signed
   artifact.
4. Cover `completed`, `failed`, `canceled`, multiple terminal history,
   terminal plus stale, terminal plus live, exact-identity drift, concurrent
   claim convergence, idempotency replay, rollback, projection semantics, and
   post-claim execution bridge lifecycle.

## Definition of done

- Terminal rows keep state, reason, result, error, and `ended_at` unchanged.
- Exactly one queued replacement is created and linked to the deterministic
  latest historical attempt when one exists.
- Claimable listing and claim mutation agree for terminal-only and conflict
  states.
- Parallel attempts create no duplicate Delegation, Session, credential, event,
  outbox, prompt, context, or delivery records.
- Focused contracts, API, SDK/MCP, Skill, typecheck, lint, and integration tests
  pass with actual output recorded on the matching WorkMesh Work Item.
- No database migration is introduced.
