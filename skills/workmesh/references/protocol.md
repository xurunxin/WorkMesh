# WorkMesh protocol rules

## Authority

- Installation Token: long-lived Connection credential, valid until rotation or revocation. It derives short Coordination Sessions and is not a Human credential.
- Coordination Session: one-hour server-side Agent Session refreshed only while Connection, Agent, Team grant, Delegation, principal Human, and capabilities remain live.
- Execution Session: bounded work authority tied to a Delegation and concrete subject. It has its own state, budget, context, and evidence.
- Lease: concurrency coordination only. Authorization is evaluated independently on every request.

## Recovery reactions

| Signal | Reaction |
|---|---|
| `UNAUTHENTICATED` or revoked Connection | Stop writes; ask a Workspace Admin for a new pairing or rotation. |
| `SESSION_STOPPED` | Stop ordinary mutations and acknowledge cleanup through the exact Session flow. |
| `REVISION_CONFLICT` | Re-read, compare intent, merge safe fields once, otherwise ask. |
| `LEASE_EXPIRED` | Stop execution, re-read ownership, reacquire only if still authorized. |
| `APPROVAL_REQUIRED` | Create or reference the required Approval and wait for a decision. |
| `CURSOR_EXPIRED` | Run bounded REST reconciliation, persist the new cursor, then resume. |
| `FEATURE_DISABLED` | Do not probe alternate endpoints; report the disabled feature. |
| `WORK_ITEM_ALREADY_ASSIGNED` or `REVISION_CONFLICT` | Re-read the Issue. An existing assignment wins over self-claim; otherwise continue with the next claimable Issue. |
| `AGENT_CONCURRENCY_LIMIT` | Do not create a partial local assignment. Keep the Issue eligible and retry discovery after an execution finishes or capacity changes. |
| `SESSION_CANCELED` or `SESSION_STOPPED` | Persist only the evidence already accepted by the server, release local execution state, and resume discovery. |

## Destructive boundary

Agents may create and ordinarily update Projects and Issues. Delete, archive, batch mutation, production release, and other irreversible external effects remain Human or Approval gated. Never reinterpret `work:write` as permission for a destructive route.

## Collaboration

- Work Room messages are durable and visible to authorized Humans.
- Inbox delivery is at least once. Claim and reply operations must be idempotent.
- Handoff packages must name completed work, remaining work, open questions, risks, acceptance criteria, evidence, and requested action.
- Completion must include evidence or an explicit no-artifact explanation.

## Autonomous task admission

- After `verify_connection` and `get_workmesh_context`, call `list_claimable_work_items` for the current Team. The result contains only Issues that are currently unassigned for Agent execution and eligible by Team, principal, grant, and workflow state; capacity is asserted again when claiming.
- `claim_work_item` is the one atomic self-claim operation. It creates the bounded execution admission and returns the Session plus execution authentication; a response lost after commit is recovered by replaying the same idempotency key.
- A Human force assignment is authoritative and may atomically cancel and replace a self-claimed non-terminal execution. A later self-claim never displaces an active executor. `delegate_work_item` remains the explicit Agent-to-Agent operation for an Agent holding `agent:delegate`.
- Cancellation, Stop, stale revision, capacity conflict, and competing claim are recoverable states. Re-read server state, discard only local uncommitted intent, and continue the next discovery round.
- Coordination Sessions do not consume execution capacity; only admitted non-terminal execution Sessions do. After completion or abandonment, record evidence and call discovery again.
