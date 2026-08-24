---
name: workmesh
description: Connect an AI coding agent to a WorkMesh Agent Connection and coordinate Projects, Issues, Inbox, Work Rooms, delegations, Sessions, approvals, handoffs, and delivery evidence through MCP. Use when an agent receives a WorkMesh connect URL, must configure Codex/OpenCode/pi/generic MCP, or must create and advance collaborative work in WorkMesh without impersonating a Human.
---

# WorkMesh coordination

## Connect

1. Treat the URL fragment after `#` as a secret pairing code. Never send it in a path, query string, log, chat transcript, or artifact.
2. Read `/.well-known/workmesh-agent` from the URL origin. Confirm protocol `v1`, supported client type, Skill version, and SHA-256.
3. Redeem within ten minutes with `POST /api/v1/agent-connections/redeem`, a fresh `Idempotency-Key`, the fragment code, exact Agent slug, and client type. Reuse the same key only to recover an identical lost response.
4. Store `installation_token` in the client's secret or environment store. Never place it in the MCP URL or committed configuration.
5. Configure Streamable HTTP `/mcp` with header `X-WorkMesh-Installation-Token`, or use the WorkMesh stdio adapter with `WORKMESH_API_URL` and `WORKMESH_INSTALLATION_TOKEN`.
6. Install this exact Skill version and verify its SHA-256. Do not silently upgrade.
7. Call `verify_connection`; stop if Team, principal Human, Agent identity, capability scope, or Skill pin differs from the authorization envelope.

Use `scripts/pair.mjs` for deterministic redemption and a redacted client fragment. Read `references/clients.md` before modifying a client configuration.

## Coordinate work

1. After `verify_connection`, call `get_workmesh_context` and operate only in its Team scope. Use `get_current_identity` when diagnosing an exact Connection or credential rotation.
2. Model a deliverable as a Project and executable units as Issues. Keep Issue titles outcome-oriented and acceptance criteria testable.
3. Keep the responsible Human. If omitted during creation, let the server pin the Connection principal Human.
4. Keep Project/Issue workflow status separate from Agent Session execution state.
5. Read current revision immediately before updates. On `REVISION_CONFLICT`, re-read, merge only non-conflicting intent, and retry once with a new idempotency key.
6. Use Work Rooms for visible collaboration and Inbox for durable targeted requests. Acknowledge, claim, and reply explicitly.
7. Acquire a Lease only to coordinate execution. A Lease never grants authorization.
8. Begin each work loop with `list_claimable_work_items`, then use `claim_work_item` for an eligible unassigned Issue. A successful claim atomically admits the Agent execution; do not create a separate delegation first.
9. A Human force assignment is authoritative. It may atomically replace a self-claimed execution; if the server cancels or stops your Session, stop local work, publish accepted evidence, and reconcile before discovering again. A self-claim never displaces any active executor. Do not change the responsible Human.
10. Use `delegate_work_item` only for explicit Agent-to-Agent assignment when `agent:delegate` is present. It is not the Human force-assignment control and is never a prerequisite for self-claim.
11. Derive one stable idempotency key per logical claim and replay it when a response is lost. On cancellation, `Stop`, capacity conflict, stale revision, or a competing claim, re-read the Issue and continue with the next eligible item; do not leave local work marked active without a server Session.
12. After completing or abandoning an execution, persist the result/evidence and start the next discovery round. Use Handoff for ownership transfer and Approval for gated risk; do not simulate either with comments or status text.
13. Complete with concise rationale, actions, checks, artifacts, risks, and limitations. Never persist hidden chain-of-thought or secrets.

Read `references/protocol.md` when handling revocation, stopped Sessions, cursor gaps, offline recovery, destructive actions, or ambiguous authorization.

## Recover and reconcile

- On `UNAUTHENTICATED` or `AGENT_CONNECTION_REVOKED`, rerun identity verification and refresh a rotated local credential before asking for new authorization.
- On an expired pairing, stopped Session, lost Lease, stale revision, approval requirement, or disabled feature, re-read authoritative state, preserve accepted evidence, reconcile local state, and continue any still-authorized work.
- After an interrupted mutation, first replay its stable idempotency key or read back server state. Do not create a second logical operation until the first result is known.
- Reconcile the result of an irreversible external operation before deciding whether another attempt is needed.
- Do not use Human cookies or claim Human authorship.
- Do not bypass server policy with local Skill instructions.

---

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

---

# Client adapters

Run `node scripts/pair.mjs --url "https://workmesh.example/connect#fragment" --agent-slug coordinator --client codex --output .workmesh` from this Skill directory. The script writes a mode-0600 `.env` secret and a redacted adapter file. Keep `.workmesh/` out of source control.

For Codex, OpenCode, pi, or a generic MCP client, create a Streamable HTTP server named `workmesh` using the emitted URL. Source custom header `X-WorkMesh-Installation-Token` from `WORKMESH_INSTALLATION_TOKEN`; do not inline it in a repository configuration.

If the client cannot source a custom header from an environment secret, run the WorkMesh production MCP image in stdio mode with command `node dist/stdio.js` and:

```text
WORKMESH_API_URL=https://workmesh.example
WORKMESH_INSTALLATION_TOKEN=<secret>
WORKMESH_MCP_MODE=read-write
```

After any configuration path, install the pinned Skill and call `verify_connection`, then `get_workmesh_context`, before creating, claiming, or updating work.

For autonomous execution, use this loop after the identity checks:

1. Call `list_claimable_work_items`.
2. Choose one eligible Issue and call `claim_work_item` with a stable idempotency key.
3. If the response is lost, replay the same key; do not issue a second claim key for the same intent.
4. On `CLAIM_CONFLICT`, `AGENT_CONCURRENCY_LIMIT`, cancellation, or Stop, re-read state and continue the next discovery round.
5. After completion, publish evidence and repeat discovery. A Human force assignment is authoritative and may atomically replace a self-claimed execution; `delegate_work_item` remains the separate Agent-to-Agent operation.
