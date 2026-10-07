# CI critical path optimization

Status: implemented and merged after green CI in
[PR #201](https://github.com/xurunxin/WorkMesh/pull/201). The PR records acceptance
and measured results; cache-input coverage has a follow-up refinement below.

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

## Acceptance and cache-input refinement

PR #201 passed all ten hosted checks. Execution excluding initial queue time
decreased from 10m07s in the PR #199 sample to 6m44s (33%); these are individual
observations on different hosted runners. The merged main passed all ten checks
in 7m07s total. A source-only rerun restored 18/18 typecheck results and reduced
the typecheck step from 51s to 1s, while the overall source job increased from
4m00s to 4m32s because other steps varied. No whole-job warm-cache speedup is
claimed.

Typechecking includes integration/E2E fixtures that import worker, MCP,
fake-agent and package source outside the runtime dependency graph. Add these
source inputs to API/Web typecheck tasks, and hash imported root scripts and
Playwright configuration globally. Preserve upstream typecheck dependencies.
The existing cache hashes invalidate older incomplete typecheck results.
Typecheck must retain Turbo's task dependency graph: `--only` discards dependency
hashes even when upstream workspaces are explicitly filtered. Removing it keeps
the same expanded workspace set and invalidates consumers after dependency edits.

Tests: complete typecheck, CI validator and all twelve classifier/aggregate
regressions passed. A Turbo dry-run mutation proof verified eight expected
consumer invalidations across five external source/configuration files; the
fixture files were restored byte-for-byte. Hosted full CI is required for this
follow-up before merge, as for the original implementation.
An actual `ci:source` dry-run also verified that a contracts edit invalidates the
worker typecheck while unrelated artifact-storage stays cached, with the same
seven prerequisite tasks. The final runner passed all eighteen typechecks and
then restored 18/18 in 407ms after changing test credentials and build SHA.
