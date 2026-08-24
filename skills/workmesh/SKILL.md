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
8. Begin each work loop with `list_claimable_work_items`, which returns unassigned Issues plus an exact same-identity assignment whose non-terminal executions are all stale. Live `work:read` and `work:write` authorization is revalidated. Then use `claim_work_item`; a successful claim atomically admits a fresh execution and establishes a server-managed exact-Session bridge. For a compatible stale assignment it preserves the Delegation, fences the stale Session, and returns a distinct queued retry. Do not create a separate delegation or change client configuration.
9. A Human force assignment is authoritative. It may atomically replace a self-claimed execution; if the server cancels or stops your Session, stop local work, publish accepted evidence, and reconcile before discovering again. Stale recovery is allowed only for the exact same Agent, principal, Team, Work Item scope, and live capability boundary. Do not change the responsible Human.
10. Use `delegate_work_item` only for explicit Agent-to-Agent assignment when `agent:delegate` is present. It is not the Human force-assignment control and is never a prerequisite for self-claim.
11. Derive one stable idempotency key per logical claim and replay it when a response is lost. On cancellation, `Stop`, capacity conflict, stale revision, or a competing claim, re-read the Issue and continue with the next eligible item; do not leave local work marked active without a server Session.
12. After completing or abandoning an execution, persist the result/evidence and start the next discovery round. Use Handoff for ownership transfer and Approval for gated risk; do not simulate either with comments or status text.
13. Complete with concise rationale, actions, checks, artifacts, risks, and limitations. Never persist hidden chain-of-thought or secrets.

Read `references/protocol.md` when handling revocation, stopped Sessions, cursor gaps, offline recovery, destructive actions, or ambiguous authorization.

## Recover and reconcile

- On `UNAUTHENTICATED` or `AGENT_CONNECTION_REVOKED`, rerun identity verification and refresh a rotated local credential before asking for new authorization.
- On an expired pairing, stopped Session, lost Lease, stale revision, approval requirement, or disabled feature, re-read authoritative state, preserve accepted evidence, reconcile local state, and continue any still-authorized work. Use `ack_agent_session`—not generic `transition_agent_session_state`—when explicitly restoring the exact stale Session. Use `claim_work_item` when replacing an abandoned compatible stale assignment with a new execution.
- After an interrupted mutation, first replay its stable idempotency key or read back server state. Do not create a second logical operation until the first result is known.
- Reconcile the result of an irreversible external operation before deciding whether another attempt is needed.
- Do not use Human cookies or claim Human authorship.
- Do not bypass server policy with local Skill instructions.
