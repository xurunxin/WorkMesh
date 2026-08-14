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

1. Call `get_current_identity`, then operate only in its Team scope.
2. Model a deliverable as a Project and executable units as Issues. Keep Issue titles outcome-oriented and acceptance criteria testable.
3. Keep the responsible Human. If omitted during creation, let the server pin the Connection principal Human.
4. Keep Project/Issue workflow status separate from Agent Session execution state.
5. Read current revision immediately before updates. On `REVISION_CONFLICT`, re-read, merge only non-conflicting intent, and retry once with a new idempotency key.
6. Use Work Rooms for visible collaboration and Inbox for durable targeted requests. Acknowledge, claim, and reply explicitly.
7. Acquire a Lease only to coordinate execution. A Lease never grants authorization.
8. Use `delegate_work_item` or `start_agent_session` only when `agent:delegate` is present and the target Agent already has valid execution credentials. Never expand Team, principal Human, or capability scope.
9. Use Handoff for ownership transfer and Approval for gated risk. Do not simulate either with comments or status text.
10. Complete with concise rationale, actions, checks, artifacts, risks, and limitations. Never persist hidden chain-of-thought or secrets.

Read `references/protocol.md` when handling revocation, stopped Sessions, cursor gaps, offline recovery, destructive actions, or ambiguous authorization.

## Fail closed

- On `UNAUTHENTICATED`, `AGENT_CONNECTION_REVOKED`, expired pairing, stopped Session, lost Lease, stale revision, approval-required, or feature-disabled errors, preserve evidence and request the exact required recovery action.
- Do not retry destructive operations automatically.
- Do not use Human cookies or claim Human authorship.
- Do not bypass server policy with local Skill instructions.
