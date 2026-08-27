# WM-UX-013 Human Control Plane final acceptance

Spec: `docs/adr/0061-human-control-plane-final-acceptance-and-telemetry.md`

## 1. Freeze the acceptance contract

Publish the route/state matrix, topology labels, viewport matrix, performance
budgets, privacy boundary, optional-feature boundary, and evidence inventory.

Tests: JSON contract validation and existing final-runner contract tests.

DoD: every claimed quality dimension maps to an executable test or an explicit
nonclaim.

## 2. Add privacy-bounded product measures

Implement the closed metric/dimension registry, retention bound, opt-out behavior,
and instrumentation for Attention, Evidence, and focus restoration.

Tests: allowlist, redaction/non-cardinality, opt-out, retention, one-shot timer,
and component integration tests.

DoD: no user content, resource identity, URL, credential, payload, or hidden
reasoning can enter product telemetry.

## 3. Run cross-surface acceptance

Execute focused Human Control Plane flows, feature-disable isolation, the existing
four-viewport deterministic visual tour, keyboard/semantic checks, large-list
performance, and final production Web topology where available.

Tests: repository Playwright runner plus required local integration/E2E gates.

DoD: retained artifacts identify their topology accurately; failures are repaired
or recorded as real blockers.

## 4. Publish closure evidence

Write the exact SHA, commands, counts, artifact paths, limitations, and optional
integration state to a machine-readable result manifest. Synchronize WorkMesh,
merge child PRs in order, and close GitHub #87 after all tracked children close.

Tests: manifest validation, git diff check, GitHub/WorkMesh readback.

DoD: repository, GitHub, and WorkMesh evidence agree.
