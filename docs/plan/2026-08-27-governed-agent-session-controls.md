# Governed Agent Session controls

Issue: [#94](https://github.com/xurunxin/WorkMesh/issues/94)

Roadmap: [#87](https://github.com/xurunxin/WorkMesh/issues/87)

ADR: `docs/adr/0055-governed-agent-session-controls.md`

Depends on: #89 and #90

## Objective

Replace opaque Agent control buttons and fixed reasons with authoritative,
revision-bound consequence previews and scoped Human interaction flows.

## Tasks

### 1. Complete the control-preview contract

Extend the shared preview with stop modes, steering scopes, recovery, result
semantics, and current Plan/Step/heartbeat facts while retaining one shared domain
state policy for preview and command.

Tests: contract/OpenAPI parity; authorized/unauthorized reads; state matrix; Lease,
Approval, evidence, and stale-revision facts.

Definition of done: every dialog receives all consequence facts without deriving
policy from UI state.

### 2. Build the shared governed Session control dialog

Implement one localized, focus-managed form for pause, resume, stop, retry,
handoff request, replan request, and steering scopes. Bind submit to the preview
revision and preserve drafts through conflict/reissue.

Tests: semantic rendering; reason/scope/mode validation; per-action pending state;
idempotent double submit; stale preview recovery; result links.

Definition of done: all Session controls use the shared dialog and no generic fixed
Human reason remains.

### 3. Reconcile related control-plane actions

Replace Lease force-release and Handoff rejection/cancel browser dialogs with
revisioned reason forms. Remove related prompt/confirm usage and preserve existing
domain authority.

Tests: Human-authored audit reasons; cancel/focus return; stale revision; unrelated
actions remain enabled.

Definition of done: Agent Session, Lease, and Handoff Human paths use real forms.

### 4. Integrated acceptance and release

Exercise graceful/immediate Stop, steering scopes, retry identity, Handoff request,
stale reissue, responsive/focus behavior, realtime reconciliation, and repository
gates; open and merge the Issue-specific PR.

Tests: focused unit/integration/E2E plus local lint, typecheck, test,
test:integration, and test:e2e gates proportional to this slice.

Definition of done: Issue #94 is closed by a merged PR and WorkMesh carries exact
commit, PR, and validation evidence.

## Acceptance evidence

- Shared contracts: 141/141 passed; Agent SDK: 33/33 passed; MCP: 37/37 passed.
- API unit suite: 161/161 passed; DB lock-order inventory: 28/28 passed after
  regenerating the line-sensitive statement manifest.
- Real PostgreSQL/Redis integration: Human Attention 1/1 and Stage 2
  collaboration 8/8 passed, including Lease, Handoff rollback, Human reasons,
  idempotency replay, and cross-Team authority.
- Web unit suite: 92 files and 634/634 tests passed.
- Governed-control browser acceptance: 3/3 passed at 390, 768, and 1440 px for
  stale Immediate Stop reissue, Remaining Plan steering, and distinct Retry
  Session navigation; the resulting screenshots were visually inspected.
- Repository gates: lint 17/17, typecheck 17/17, root test 28/28 tasks, and
  `git diff --check` passed.
