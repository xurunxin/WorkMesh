# Governed WorkMesh Tools for Pi Runner

## Status

Accepted — 2026-09-25. This records the first W11 implementation slice. The remaining operation families stay open in W11. The isolated Docker WorkMesh tracks this ADR in Project `19a58123-88c7-4d5e-9bc7-619165bfc818` and WorkItem `ee2e9dbd-a657-47e5-8cb1-0b488df99ab3`.

## Context

The isolated Pi Runner could read Session context but could not use WorkMesh commands. Giving it a Human cookie, direct database access, or unrestricted Pi filesystem and shell tools would bypass delegation, capability, Stop, revision, and audit rules. Pi tool calls can be retried after transport failure, so a write must retain an operation identity across a retry.

## Decision

The Runner fetches the server's live `agent-capabilities` manifest for its exact Agent Session before creating Pi tools. Only supported operations eligible under the current capability set are presented. Every exposed tool maps to a published REST/SDK/MCP operation and validates its input at the boundary. The server remains the final authority and rechecks every request.

The current slice exposes the exact Session revision, authorized Project, Issue, and ordinary Document reads; ordinary Project/Issue creation and edits, Issue relations, Document creation/revision, evidence artifacts, approval requests, lease listing/acquisition/release, handoff offers, whole plan publication, Session activities, and an evidence-backed Session completion request. Human-only archive, Guidance publication, approval decisions, handoff acceptance, and administrator operations are absent. Pi's built-in shell, filesystem, and extension tools remain disabled.

For a write, the Runner derives a stable idempotency key from exact Session ID, Runner attempt ID, Pi tool-call ID, and operation ID. Ordinary writes append sanitized `started` and `succeeded` or `failed` Agent activities using distinct stable keys. Plan publication omits the pre-command activity because it would consume the required exact Session revision; the domain event records the command and a completion activity follows. The activity tool itself creates one visible activity without a recursive wrapper. The activity records the operation and payload hash, never the document body or a credential. The WorkMesh command runs through the normal API with the stable key, so the database idempotency ledger and domain event/outbox retain the authoritative result. Tool output is bounded; an oversized successful response returns its resource identity and revision rather than an ambiguous error.

Session completion is a Runner intent, not an immediate Pi REST write. The tool validates the shared completion contract and captures the model's current Session revision and stable operation key. ADR 0068 supersedes the original separate Turn-settle-then-Session-complete sequence: the public answer, Turn settlement, and optional exact Session completion now commit in one transaction. Explicit completion rejection permits a Turn-only settlement with a visible warning. Handoff acceptance remains Human-only per OpenAPI and is never a Pi tool.

## Alternatives

- Direct database mutation: rejected because it bypasses the command transaction and authorization.
- Human session cookie in Runner: rejected because it impersonates a Human and weakens actor separation.
- New random idempotency key per tool retry: rejected because it can duplicate writes.
- Expose every MCP operation without manifest filtering: rejected because the model would see operations not eligible for the Session.

## Consequences

Each governed write adds activity records and API round trips. Activity recording is at least once across crash boundaries; the command's idempotency ledger and domain event are authoritative. Live capability changes may remove authority after the Pi tool list is built; the API rejects those later calls. Full recovery and denial tests remain open in W11.

## Migration

No database migration. Existing sessions and stored artifacts keep their meaning. Runner images must include the new tool adapter and Zod dependency. Docker Compose passes the same service token to API and Runner; the model connection secret stays in the API vault. No credential is copied into Pi tool arguments or activity payloads.

## Spec changes

W11 plan status and operation matrix must reflect which tools are implemented, eligible, Human-only, and pending. ADR 0068 records the later Runner settlement REST contract change; this ADR's first tool slice called existing operations. The W12 Skill will document exact call sequences and recovery behavior after the W11 tool set is complete.
