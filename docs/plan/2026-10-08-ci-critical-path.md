# CI critical path optimization

Status: executing

Reference: PR #199, `docs/CI.md`, `scripts/ci-policy.mjs`.
The local plan is authoritative. WorkMesh MCP is unavailable in this session;
the matching remote Project, WorkItems and activity stream cannot currently be
created. This is an explicit tracking limitation, not a completed remote sync.

## 1. Preserve test selection and cache correctness

Separate runtime consumers from tests that inspect other workspaces. API/worker
source changes must select the DB lock inventory without expanding the runtime
dependency graph. Declare shared configuration and external test inputs in Turbo.
Keep runtime environment hashing for builds/tests while allowing pure static
checks to reuse results across changing test credentials.

Tests: classifier selection and failure aggregation; Turbo dry-run input/hash
inspection; lint, typecheck and full unit suite.
DoD: API-only changes select the DB audit, not DB integration; input changes
invalidate cached consumers; credential changes do not invalidate pure checks.

## 2. Remove fixture waiting and repeated page preparation

Keep real SDK HTTP fixtures and retry counts, with an in-memory 1ms retry delay
only in tests. Restrict the root E2E entry to the web workspace. Run structural
and keyboard assertions on the same page navigation. Diagnose the documents
navigation failure and synchronize on the actual route transition.

Tests: both SDK suites, browser collection, documents acceptance, both viewport
accessibility audits and the complete browser suite.
DoD: no domain/protocol/security assertion removed; production retry unchanged;
all browser acceptance scenarios retained.

## 3. Shorten browser acceptance and reuse trusted compiler work

Run two native Playwright file shards on separate GitHub runners, each with its
own PostgreSQL/Redis/API/Web and one browser worker. Keep bootstrap dependencies
and shard-specific evidence. Required CI must fail if either shard fails. Restore
only pure typecheck results and Next compiler intermediates; save them only from
successful main pushes. Never persist integration/E2E results or application
build artifacts in the cross-run cache.

Tests: CI validator; shard collection union and duplicate checks; actual PR CI
and job/step timing; main acceptance after merge.
DoD: frozen installs, immutable actions, read-only CI permissions and strict
aggregate remain enforced; all selected checks pass before merging. Report queue
time separately from execution and cold-cache results separately from warm ones.
