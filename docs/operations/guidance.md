# Versioned Guidance operations

WorkMesh stores Workspace, Team, and Project Guidance as independent documents. A Project
description remains product metadata and is never copied into Guidance automatically.

## Authority and precedence

Workspace administrators manage Workspace Guidance. Workspace administrators and Team admins
or maintainers manage Team and Project Guidance. Agents can read only current active Guidance
that is already inside their live delegation and resource scope. MCP exposes the same read-only
resources and does not expose Guidance mutation tools.

Context precedence is:

```text
Workspace -> Team -> Project -> Repository -> Work Item -> Session/Human prompt
```

This order changes instruction specificity, not authority. Guidance cannot grant or override
identity, delegation, capabilities, resource scope, approvals, Leases, revisions, idempotency,
or platform security rules.

## Lifecycle

Open **Guidance** in the Web navigation, select a scope, edit Markdown, add a change summary,
and publish. First publication uses `If-Match: "revision-0"`; later mutations use the current
document revision. Each publication creates a new immutable row with its author, publication
time, content SHA-256, and monotonically increasing content revision number.

Archive makes the current body unavailable to Agents but retains its revision and audit history.
Rollback selects an existing immutable revision as current and appends an audit fact; it never
rewrites or deletes a historical revision. History and line diff are Human-only operations.

The API rejects known credential forms in Markdown, change summaries, archive reasons, and
rollback reasons. Guidance bodies are not placed in domain event or outbox payloads; events carry
only IDs, revision numbers, hashes, and pointer changes. Operators must still avoid placing any
secret or private credential in Guidance.

## Session pinning

At Session admission, WorkMesh resolves all active applicable Guidance and stores the exact
revision ID, revision number, URI, and SHA-256 in the immutable Context Snapshot. Publishing or
rolling back Guidance later does not change that Session. A retry that explicitly reuses Context
keeps the old pins; a retry requesting fresh Context resolves a new set. Context Delta Guidance
additions are accepted only when the server can resolve the URI in the Session scope and its
current content hash exactly matches the supplied hash.

Inspect `GET /api/v1/agent-sessions/{id}/context` to see the pinned `guidancePins`. Use the scoped
`/api/v1/{workspaces|teams|projects}/{id}/guidance` endpoint or matching MCP resource to read the
current authorized document.
