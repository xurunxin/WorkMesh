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

## Destructive boundary

Agents may create and ordinarily update Projects and Issues. Delete, archive, batch mutation, production release, and other irreversible external effects remain Human or Approval gated. Never reinterpret `work:write` as permission for a destructive route.

## Collaboration

- Work Room messages are durable and visible to authorized Humans.
- Inbox delivery is at least once. Claim and reply operations must be idempotent.
- Handoff packages must name completed work, remaining work, open questions, risks, acceptance criteria, evidence, and requested action.
- Completion must include evidence or an explicit no-artifact explanation.
