# Recovery Center and explicit freshness states — GitHub #97

Local ADR: `docs/adr/0058-authorized-recovery-and-freshness-projection.md`

The plan implements one complete, authorized recovery slice. Each task is
mirrored as a WorkMesh Work Item under the matching Project and blocks the next
task.

## 1. Publish the authorized Recovery projection

Define the shared Recovery condition, lifecycle, source-fact, preserved-work,
attempt-bound, freshness, and action contracts. Add bounded list/detail routes
derived from live-authorized Session, Delegation, Lease, Approval, Activity,
Artifact, and replacement-Session facts. Update OpenAPI first and keep optional
Graph/autonomy sources absent when disabled or unsupported.

Tests: contract/OpenAPI parity; missing first heartbeat; stale/failed Session;
terminal-only assignment; lost Lease; expired Approval; repeated validation
failure; missing evidence; retry history; hidden-Team/detail non-inference.

Definition of done: a client can explain an explicit recovery condition without
joining source domains or receiving authority from the projection.

## 2. Build the Recovery Center and per-surface freshness policy

Add a global and Project-filtered Recovery Center with URL-owned view, filters,
selection, and history. Show active executor versus historical assignment,
preserved and unknown runtime work, source revision/cursor, attempts and bounds,
recommended and alternative actions, and progressive technical details. Route
dangerous actions through #94 previews and disable them unless the item is
current.

Tests: active/history separation; readable labels; per-card freshness; offline,
refreshing, partial, and resync-required behavior; draft/filter/focus retention;
Back/Forward; localization; keyboard and semantic structure.

Definition of done: Humans can understand and navigate the supported recovery
path while read-only context remains available under stale or offline state.

## 3. Reconcile realtime gaps and recovery outcomes

Refresh only affected Recovery scopes for durable events. On cursor resync,
retain the visible snapshot and input, disable current-state actions, fetch one
full authorized snapshot, and converge selection without duplication. Link
resolved items to replacement Sessions or Handoffs and keep terminal history
immutable.

Tests: duplicate/out-of-order invalidation; cursor-too-old resync; retry creates
a distinct Session; Lease expiry while executing; expired Approval; failure
attempt exhaustion; responsive layouts at 390/768/1440/1920.

Definition of done: reconnect and recovery converge without local repair state,
lost drafts, duplicate items, or revived terminal Sessions.

## 4. Integrated acceptance and release

Run focused contract, API, Web, integration, and browser coverage followed by
the repository gates. Record exact commands, results, commit, PR, screenshots,
and known unsupported sources in WorkMesh.

Tests: `pnpm lint`; `pnpm typecheck`; `pnpm test`; focused real-database
integration; Recovery Center Playwright; final diff and scope checks.

Definition of done: issue #97 is closed by a merged PR and the local/WorkMesh
records agree on implementation and validation evidence.
