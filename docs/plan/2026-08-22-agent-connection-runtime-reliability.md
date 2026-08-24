# Agent Connection runtime reliability — GitHub #75–#78

Status: Implementation Complete — Verification Gates Pending

Base: `origin/main` at `e5e74de812aad7d299a9bc35dbec30e501ec555e`

Worktree: `G:\Projects\MetronX\WorkMesh\.worktrees\fix-issues-75-78`

Branch: `codex/fix-issues-75-78`

WorkMesh Project: `WorkMesh Runtime Reliability — GitHub #75–#78` (`91c53b41-959e-4cd7-8ae2-012d6e843990`)

WorkMesh WorkItems:

- T0 `GEN-377` (`862baba2-740a-4aeb-b26f-282268f5bbe6`)
- T1 `GEN-378` (`e1748946-2197-4840-a58b-2918a9700717`)
- T2 `GEN-379` (`b92e207e-3d4b-44f2-8a02-3399e78bbedc`)
- T3 `GEN-380` (`e0425922-61fb-4053-a63b-ce8ee959b8fe`)
- T4 `GEN-381` (`cedc35c1-237e-4de4-ab41-1f1322d206c9`)
- T5 `GEN-382` (`5f530e42-9469-400e-94b2-9279346ea900`)

Sources:

- https://github.com/xurunxin/WorkMesh/issues/75
- https://github.com/xurunxin/WorkMesh/issues/76
- https://github.com/xurunxin/WorkMesh/issues/77
- https://github.com/xurunxin/WorkMesh/issues/78

## Boundaries

- Work only in the isolated worktree. Do not alter the active `main` worktree or its Web conflict resolution.
- Local closure only: no OpenWrt deployment and no production credential rotation.
- No commit, push, PR, merge, rebase, or GitHub Issue state change.
- No database migration. `WORKMESH_PRD.md` is absent; use the Issues, `AGENT_PROTOCOL.md`, `OPENAPI.yaml`, `SCHEMA.sql`, and accepted ADRs.

## T0 — Specifications and shared contracts

Define ADR 0046, the additive current-identity REST/MCP contract, coordination lifecycle events, execution-capacity details, route policy, and documentation.

Tests:

- strict Zod/OpenAPI parity for new identity and error details;
- route-policy coverage and generated matrix consistency;
- unknown event fields/types remain ignorable and no event carries credentials.

Definition of done:

- local specs and WorkMesh Project/WorkItems contain the same tasks, tests, and dependencies;
- public changes are additive and Client Profile 1.0 remains compatible;
- no schema migration is introduced.

## T1 — #75 Coordination Session recovery

Validate the coordination row and backing Agent Session in one locked transaction. Close invalid coordination state, preserve terminal backing Sessions, cancel invalid non-terminal backing Sessions, create one replacement, and emit the defined generic and coordination lifecycle events with the outbox atomically.

Tests:

- completed, failed, canceled, queued, paused, stopping, stale, expired, and binding-mismatch cases;
- fault rollback between close/cancel/create/event/outbox steps;
- API/MCP restart and 8–32 concurrent active/overlap reconnects;
- `verify_connection` and `get_workmesh_context` succeed after recovery.

Definition of done:

- terminal Sessions are never revived or mutated;
- exactly one active coordination and one non-terminal backing Session remain;
- lifecycle events contain safe fixed reasons and no credentials.

## T2 — #76 Execution concurrency admission

Use a single execution-only, all-non-terminal capacity predicate after the target Agent lock across direct session/delegation/retry, child/review/handoff, Loop, Automation, and A2A admission.

Tests:

- coordination plus zero execution admits the first execution at max 1 and rejects the second;
- all state combinations and cross-entry concurrent admissions;
- scheduled Loop defer/retry, Automation effect retry/DLQ, and A2A new/existing/terminal behavior;
- rejected transactions leave no delegation, Session, event, outbox, or idempotency residue.

Definition of done:

- every execution creation path uses the shared assertion;
- same-Agent concurrent admission yields one success and one 409;
- safe error details expose counts only and the existing Web error surface is actionable.

## T3 — #77 Signed Skill in the production Web image

Pin Skill artifact bytes to LF, validate raw bytes, copy `public` into the standalone image, and dynamically verify the actual Web image over loopback.

Tests:

- raw LF artifact succeeds; CRLF, BOM, trailing-byte, hash, or signature variants fail;
- the previous missing-asset image fails the dynamic probe;
- the new image serves an unredirected 200 response with byte-identical, correctly signed content;
- artifact, image metadata, environment, and logs contain no credential-shaped value.

Definition of done:

- production build uses only the public verification key;
- runtime is still non-root/read-only compatible;
- the no-argument static validator remains supported.

## T4 — #78 Exact credential identity and pairing closure

Expose the redacted current Connection identity, distinguish active from overlap credentials, add additive MCP identity fields, keep public failures uniform, and make pairing replayable and verification-before-write.

Tests:

- active, overlap, overlap-expired, rotated, revoked, and inactive authority matrices;
- new and overlap Tokens return their own authenticated fingerprints;
- exact idempotency replay, MCP custom-header forwarding, and cross-field identity/Skill comparisons;
- response loss, pre-write verification failure, atomic config replacement, and stale environment diagnosis;
- logs, events, screenshots, and test artifacts contain no `wmp_` or `wmi_` secrets.

Definition of done:

- Connection, Agent, principal, Team, capabilities, coordination Session, Skill, and presented fingerprint agree end to end;
- legacy MCP fields remain available;
- the script cannot report success or persist the Token before live verification.

## T5 — Integration and local closure

Run focused suites, then all repository-required local checks. Compare the repair diff against the completed Web-optimization HEAD without modifying or merging it. Record actual outputs and remaining production gates in WorkMesh.

Tests:

- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm test:integration`;
- `pnpm test:e2e`;
- route-policy, Skill, and real production-Web-image validation.

Definition of done:

- all required local checks pass with actual results recorded;
- no unresolved overlap with the Web optimization remains in the repair diff;
- #77/#78 remain explicitly pending the separate OpenWrt/public-gateway Human Gate.

## Dependencies

- T0 blocks T1, T2, and T3.
- T1 and T3 block T4.
- T1, T2, T3, and T4 block T5.

## Execution results — 2026-08-22

Implementation and focused verification:

- T0–T4 are implemented in the isolated worktree. No migration was added.
- `pnpm lint`: 17/17 packages passed.
- `pnpm run typecheck`: 17/17 packages passed. The bare `pnpm typecheck` form is ambiguous in the current pnpm/RTK environment and invokes the `tsc` help command; the explicit script form executes the repository's declared `turbo run typecheck` task.
- `pnpm test`: 28/28 Turbo tasks passed; representative totals include API 149/149, Contracts 133/133, Web 130/130, MCP 33/33, and Worker 157 passed with 2 conditional skips.
- `pnpm test:integration`: exit 0 against real PostgreSQL and Redis. DB 75/75, API 102/102, Worker 76 passed with 1 conditional skip, and Recovery 1/1.
- `pnpm check:route-policy`, `pnpm check:workmesh-skill`, and `git diff --check`: passed. The verified Skill SHA-256 is `0e23345fdf4d1203474a6b2d310d985314997d6c2507ed040633fa818536e101`.
- The dynamic production-image validator passed against image ID `sha256:f3d05a8cccf3ceccef32ac1a4e52f4ff128ec40f6fcbb23ef42418a24b9a7683`; it downloaded the versioned Skill from container loopback, compared raw bytes, verified hash/signature, and completed its credential-shaped secret scan.
- Windows integration runs use Vitest's thread pool while non-Windows keeps the existing fork pool. This avoids Tinypool child-process IPC closing before long-lived integration servers finish.
- The Stage 4 A2A capacity test now provisions a dedicated WorkItem, so its admission assertion is independent of executor delegations created by earlier tests in the same suite.

Open gates and limitations:

- `pnpm test:e2e`: 41/42 passed. `apps/web/e2e/human-reflow.spec.ts:74` failed twice with `scrollWidth === clientWidth === 343`; the screenshot and DOM evidence hashes were identical across runs.
- The failing reflow test, its page implementation, and `apps/web/app/styles.css` are unchanged from the immutable repair base. The failure is the existing project-strip wrapping behavior and is owned by the concurrent Web optimization; this repair does not modify those shared UI files.
- T5 therefore remains unsatisfied until that Web baseline is green and the integrated HEAD is revalidated. No merge or rebase was performed.
- #77 and #78 remain behind the separately approved OpenWrt/public-gateway production Human Gate. This local run did not deploy OpenWrt or rotate production credentials.
- Pairing config replacement is atomic per file with best-effort rollback across files; it cannot make multiple independent filesystem replacements crash-atomic as one transaction.
