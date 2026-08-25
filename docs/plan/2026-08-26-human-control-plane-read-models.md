# Human Control Plane read models

Issue: [#89](https://github.com/xurunxin/WorkMesh/issues/89)
Roadmap: [#87](https://github.com/xurunxin/WorkMesh/issues/87)
Depends on: #88, merged as `7d044c40f777658ec64e66012421bdb0182aadab`

## Objective

Deliver bounded, authorized, versioned Control Center, Run Explanation, Work Item execution summary, and Action Preview read models for REST, the Agent SDK, and MCP. The API performs the joins; browser clients do not reconstruct authority-sensitive projections.

## Tasks

1. Document projection authority, freshness, pagination, timeout, and preview semantics in ADR 0051.
2. Add shared Zod and OpenAPI contracts for the five #89 routes.
3. Implement live-authorized, bounded API projections and targeted ETags.
4. Share Session control state policy between preview and final commands.
5. Add Agent SDK and MCP read parity.
6. Verify authorization non-inference, bounds, grouping, stale preview race behavior, and adapter parity.

## Tests

- Contract schema and route-policy checks.
- Domain control-policy unit tests.
- API projection unit and integration tests covering Human and Agent scopes.
- Cross-Workspace, cross-Team, revoked/stopped Session, and hidden-resource non-inference tests.
- Cursor/limit, query timeout, grouping, and representative large-project tests.
- SDK and MCP parity tests.
- Required local lint, typecheck, unit, integration, and E2E gates.

## Definition of done

The acceptance criteria and required evidence in #89 are satisfied, linked on the Issue and roadmap, and the isolated PR is merged before #90 begins.
