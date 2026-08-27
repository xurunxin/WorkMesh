# WM-UX-012 optional Graph integration boundary

Spec: `docs/adr/0060-optional-graph-integration-boundary.md`

## 1. Verify owning-domain availability

Confirm #46/#48/#49/#50 state and search current contracts, routes, and schema for
authoritative Graph, recommendation, and autonomy resources.

Tests: recorded issue state and repository evidence.

DoD: no optional capability is inferred from names or adjacent automation APIs.

## 2. Remove browser-owned Graph routing authority

Require an explicit server-negotiated internal href for Graph navigation. Reject
missing, external, protocol-relative, and script targets.

Tests: canonical route and internal-link sanitization unit tests.

DoD: a hidden Graph subject ID cannot create a route, count, or disabled control.

## 3. Record support and isolation evidence

Publish a machine-readable support matrix and verify focused plus repository
gates. Record the exact commit and PR in WorkMesh.

Tests: feature-disabled contract tests; `pnpm lint`; `pnpm typecheck`; `pnpm test`;
`git diff --check`.

DoD: Stable journeys remain unchanged and the enabled optional scope is explicitly
not claimed while its domain dependencies are unavailable.
