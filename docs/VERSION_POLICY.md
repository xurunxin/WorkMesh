# WorkMesh version and support policy

This document defines the WorkMesh 1.0 support boundary. Historical stage names
remain in migrations, tests, and ADRs as provenance; they are not the public
product version or support tier.

## Support tiers

### Stable boundary (Issue #1)

Stable capabilities are enabled in every 1.0 deployment and have no feature
flag:

- installation, human authentication, workspace, Team membership, workflow
  states, Projects, Work Items, comments, saved views, durable events, SSE
  replay, transactional outbox, and the main work-management UI;
- Agent definitions, Team access, delegations, scoped Agent Sessions, token
  exchange and revocation, state transitions, plans, activities, approvals,
  context snapshots, artifacts, and server-enforced stop;
- human-visible Work Rooms, messages, decisions, leases, handoffs, routing,
  parent-child completion policy, and context guidance;
- GitHub and fake-provider repository contexts, governed provider actions,
  uploaded delivery evidence, reviews, exact-head merge/CI controls, project
  delivery, milestones, updates, dependencies, and completion suggestions;
- REST 1.0, versioned domain-event envelopes, Agent Protocol 1.0, MCP 1.0.0,
  TypeScript Agent SDK 1.0, PostgreSQL authority, and recovery workers.

Stable means compatibility and security fixes are delivered across the 1.x
line. It does not mean that optional Beta or Experimental behavior becomes
implicitly enabled.

### Beta boundary (Issue #2)

Beta capabilities are production-shaped but may receive compatible UX or
contract refinements during the 1.x line. Each defaults disabled:

| Capability | Flag | Runtime dependencies | Data while disabled |
| --- | --- | --- | --- |
| Cycles, Initiatives, Advanced Views, project health, Notifications | `WORKMESH_BETA_PLANNING` | API, worker, web | Durable rows remain; admission, claim, delivery, and UI reads stop. Re-enable resumes pending work under current authorization. |
| Versioned Templates | `WORKMESH_BETA_TEMPLATES` | API, web | Versions remain queryable only after re-enable; imports remain inert drafts. |
| Usage, cost summaries, budgets | `WORKMESH_BETA_COSTS` | API, web | Append-only facts and policies remain; no gated aggregation is performed while disabled. |
| Gitea provider | `WORKMESH_BETA_GITEA` | API, provider worker, SDK/MCP through REST | Connections, repositories, contexts, actions, and webhook deliveries remain. They are not disclosed, claimed, or effected until re-enabled. |
| Operations UI | `WORKMESH_BETA_OPERATIONS_UI` | web only | Hides the optional UI entry point. It never enables any API or worker capability. |

Notifications belong to Beta Planning. A notification webhook additionally
requires `WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS`; disabling that second flag
does not block `in_app` or `browser` deliveries.

### Experimental boundary (Issue #3)

Experimental support levels and operational semantics may evolve during the 1.x
line, but existing REST 1.0 paths and fields remain subject to the same 1.x
backward-compatibility and deprecation window as every other REST v1 surface.
An incompatible wire-contract change requires a new API version or path with a
documented parallel-compatibility window. Release notes and migration
instructions are required for every such evolution:

| Capability | Flag | Runtime dependencies | Data while disabled |
| --- | --- | --- | --- |
| Automation Rules and effects | `WORKMESH_EXPERIMENTAL_AUTOMATION` | API, worker, web | Rules, runs, and effects remain durable; no new gated admission or claim occurs. |
| recurring Agent Loops | `WORKMESH_EXPERIMENTAL_AGENT_LOOPS` | API, worker, web | Loops, reservations, runs, and Sessions remain; scheduling and reconciliation stop until re-enabled. |
| A2A 0.3 adapter | `WORKMESH_EXPERIMENTAL_A2A` | API | Bindings and task facts remain; task admission and event reads are disabled. |
| outbound webhook effects | `WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS` | API, worker | Durable intents/deliveries remain unclaimed; non-webhook channels continue when their parent capability is enabled. |
| multi-runtime reservation | `WORKMESH_EXPERIMENTAL_MULTI_RUNTIME` | reserved, no runtime | Registry reservation only. There is no supported multi-runtime execution path in 1.0. |

Every flag defaults to `false`; accepted values are exactly `true` or `false`.
Unknown values fail configuration validation. Migrations are unconditional:
flags control runtime admission, disclosure, claim, effect, and presentation,
not the schema.

The code registry in `packages/contracts/src/index.ts` is the source for each
non-stable flag's tier, default, and runtime dependencies. Authenticated
`GET /api/v1/features` deliberately returns only `{key,tier,enabled}` deployment
state. Stable capabilities are documented statically above and are not expanded
into synthetic flags.

## Compatibility promises

| Surface | 1.0 compatibility rule |
| --- | --- |
| REST API 1.0 | Existing fields and operations remain compatible in 1.x. New response fields may be added; consumers must ignore unknown fields. Breaking removals require a major version. |
| Domain events | Event versions are independent of REST. Existing fields retain meaning; consumers must ignore unknown fields. A semantic break uses a new event version. |
| Agent Protocol 1.0 | Identity, delegation, authorization, state, idempotency, stop, and evidence semantics remain compatible in 1.x. |
| MCP 1.0.0 | Stable resources/tools retain their URI/name and input meaning in 1.x. Additions use minor versions; removals require a major version. |
| A2A adapter 0.3 | Upstream A2A 0.3 is isolated behind the Experimental adapter. Its version is not the WorkMesh Agent Protocol version. Unknown protocol versions fail closed. |
| Database schema baseline 1 | PostgreSQL is authoritative. Schema changes use forward-only numbered migrations and are never conditional on flags. |

Concrete deprecation example: if REST 1.1 replaces `legacyStatus` with `status`,
the server must accept both request fields and return both response fields for
at least one complete 1.x minor compatibility window. The 1.1 release notes
must mark `legacyStatus` deprecated and name the earliest removal major.
Telemetry and warnings must not disclose payloads or secrets. A 1.2 removal
would be forbidden unless 2.0 is the declared breaking release.

## Upgrade and schema support

For pre-v1 installations, the only supported starting migration ledgers are
complete, exact baselines ending at:

- `0002_stage0_integrity_delivery`;
- `0006_stage1_review_fixes`;
- `0007_stage2_work_rooms_leases_handoffs`;
- `0014_provider_action_kinds`;
- `0021_stage4_a2a_direction_and_prompt_identity`.

An empty database is supported through `v1/0001_v1_baseline.sql`. A database
already at the final immutable pre-v1 migration may be adopted without replaying
schema SQL. Every accepted upgrade records the complete immutable legacy
checksum inventory and registers the v1 baseline with execution mode `adopted`.

Unknown migration names, a non-contiguous ledger, checksum drift, and any other
intermediate pre-v1 endpoint fail closed before serving traffic. Each migration
runs its SQL and ledger registration in one runner-owned PostgreSQL transaction
under a session advisory lock. Operators must back up PostgreSQL and inspect the
ledger before upgrade; see [Database migrations](operations/migrations.md).

Disabling or re-enabling Beta/Experimental flags never deletes data or rewrites
history. On re-enable, workers reclaim only eligible durable rows and re-run
current authorization or provider checks before effects. If policy changed
while disabled, the work remains blocked, suppressed, or fails through its
normal auditable retry/dead-letter path.

Feature configuration is loaded once at process startup and treated as immutable
for that process lifetime. Operators change flags through a graceful restart;
the flags are not a dynamic runtime kill switch. A provider connection's
provider kind is likewise immutable through the public API. Changing provider
kind requires creating a new connection rather than updating an existing row.
Effect-time revalidation protects durable work across supported restarts; direct
out-of-band database mutation remains unsupported.

Automation admission fails closed for a mixed rule version: if any action needs
a disabled child capability, the entire scheduled, event, manual, or dry-run
occurrence is rejected or skipped before occurrence, run, and effect creation.
Planning notifications enable in-app and browser delivery; webhook notification
delivery additionally requires External Webhooks.
