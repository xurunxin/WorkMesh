# Control Plane read-model evidence

Issue: [#89](https://github.com/xurunxin/WorkMesh/issues/89)

## Source and authority

- Contracts and realtime invalidation keys: `packages/contracts/src/index.ts`
- Shared final-command and preview state policy: `packages/domain/src/index.ts`
- Authorized bounded joins and 1.5 second statement timeout: `apps/api/src/control-center/routes.ts`
- Existing Human Attention projection reused by Control Center and Run Explanation: `apps/api/src/human-attention/projection.ts`
- REST policy matrix: `docs/route-policy-matrix.md`

Every aggregate query embeds `liveHumanTeamReadPredicate` or `liveSessionReadPredicate` before returning protected rows. The five self-authorized projection routes use no generic resource resolver, so cross-Workspace, cross-Team, and out-of-scope resources converge on `404` without exposing resource existence.

## Integration acceptance

`apps/api/integration/human-attention.integration.test.ts` passed against PostgreSQL 16 on 2026-08-26. It covers:

- Human and exact Agent Session reads for all five projection routes;
- Project Control Center initial Needs You / Running / At Risk / Recently Verified / Ready / Blocked sections;
- three equivalent activities grouped into one causal group while preserving all source activity IDs;
- ETag and source revision metadata;
- preview followed by revision drift, with the final stop command rejected as `REVISION_CONFLICT`;
- same-Team out-of-scope, cross-Team, and cross-Workspace Project non-inference;
- revoked Delegation and terminal Session denial;
- 150 ready Work Items written in one statement, paged 100 + 50 with no duplicate or missing IDs.

Observed Fastify injection response times for the representative run were 39.1 ms for the initial Project Control Center, 14.2 ms and 7.1 ms for the two ready-work pages, 26.4 ms for Run Explanation, 7.7 ms for execution summary, and 8.5 ms for Action Preview.

## Query plan

A representative PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` of the 150-row ready-work core query reported:

```text
Limit ... actual time=0.189..0.196 rows=101
Nested Loop Anti Join ... actual time=0.046..0.131 rows=150
Index Scan using agent_sessions_work_item_active ... loops=151
Planning Time: 3.223 ms
Execution Time: 0.329 ms
Buffers: shared hit=166
```

The API query additionally applies the live-reader predicate, signed cursor tuple, hard collection limit, and read-only transaction statement timeout.

## Adapter parity

- Contract package tests: 141 passed.
- Domain shared-policy tests: 8 passed.
- Agent SDK tests: 33 passed.
- MCP adapter tests: 37 passed.
- API unit tests: 159 passed.
- Focused Control Plane database integration acceptance: 1 passed.

## Final local gates

The repository-required local gates completed on 2026-08-26:

- `pnpm lint`: 17/17 tasks passed.
- `pnpm typecheck`: 17/17 tasks passed.
- `pnpm test`: 28/28 tasks passed, including 141 Contract and 159 API tests.
- API integration: all 119 assertions passed across the full run and isolated reruns of six environment/timing cases.
- Database integration: all 75 assertions passed across the full run and isolated reruns of the slow migration cases.
- Worker integration: 36/36 passed.
- Recovery integration: 1/1 passed, including backup, interrupted-restore resume, S3 copy, and restored-state verification.
- `pnpm test:e2e`: 56/56 passed against the real API and Next.js servers.

Four existing infrastructure tests needed larger Windows Docker time budgets; their assertions and production behavior were unchanged:

- external-URL migration setup: 240 seconds to 300 seconds;
- migration failure-injection case: 120 seconds to 180 seconds;
- recovery setup and recovery scenario: 120 seconds to 300 seconds;
- Stage 0 defensive reset hook: explicit 300-second Playwright timeout.

No database migration or backfill is required; all projections rebuild deterministically from existing durable facts.
