# Autonomous control plane, Web Push, and Agent enrollment

Spec: `docs/adr/0062-autonomous-control-plane-and-agent-lifecycle.md`

## 1. Publish contracts and additive migrations

Add the Approval Autonomy Policy, policy reconciliation, policy-authored Approval
decision provenance, browser push subscription/delivery, Agent Enrollment Policy,
redemption, and Agent archive contracts. Update OpenAPI, consolidated schema,
Drizzle schema, route-policy bindings, SDK types, and event invalidations first.

Tests: contract parsing, route-policy inventory, migration from 0035, clean
database migration, backfills, indexes, constraints, and idempotent recovery.

DoD: every subsequent API and Worker change compiles against one shared contract;
existing data remains valid and all new autonomous behavior defaults off.

## 2. Implement Approval autonomy and expiry reconciliation

Implement admin policy read/update, project exclusions, synchronous policy
approval for new requests, durable reconciliation for existing pending Approvals,
and atomic Approval expiry plus Inbox resolution. Preserve existing authority and
final Approval events while adding explicit workspace-policy provenance.

Tests: all risk levels, project opt-out, stopped/stale sessions, revoked authority,
required-approval quorum bypass, stale revision, duplicate idempotency, concurrent
policy change, Worker restart/replay, expiry race, and active/history projection.

DoD: eligible YOLO Approvals advance without a browser or fabricated Human actor;
invalid authority never advances and expired items cannot remain actionable.

## 3. Implement durable browser Web Push

Implement VAPID configuration, Human-device subscription APIs, approval
notification admission, per-subscription Worker delivery, transient retry,
permanent subscription deactivation, Service Worker display/click behavior, and
user-triggered notification permission controls.

Tests: VAPID disabled/enabled, multi-device delivery, preference filtering,
dedupe, 404/410 deactivation, transient retry, no sensitive payload fields,
permission denial, and Attention deep linking.

DoD: a new Human-required Approval produces one durable generic push per active
subscribed device even when WorkMesh tabs are closed; YOLO approvals do not push.

## 4. Implement Agent enrollment and archive reconciliation

Implement bounded Enrollment Policy administration, `wme_` secret issuance,
single-call Agent redemption to `wmi_`, atomic Agent/authority/Connection creation,
and lifecycle reconciliation across all revocation paths and periodic recovery.

Tests: expired/exhausted/revoked policy, capability ceiling, duplicate slug,
concurrent redemption, encrypted idempotent replay, transaction failure, token
authentication, partial revocation, last-authority archive, active session cancel,
restart repair, and explicit reactivation boundary.

DoD: an Agent can self-register from one bounded policy without Human per-Agent
entry; revoked but still-authorized Agents remain active and fully deauthorized
Agents move to an auditable archive.

## 5. Build the selected Human and Agent control surfaces

Implement the selected compact attention rail, governed decision workspace,
persistent direct action bar, YOLO/project-exclusion banner, browser push control,
server-paged Agent/Connection/archive tabs, and Enrollment Policy creation and
copy-once handoff. Preserve the existing WorkMesh visual tokens and route-owned
selection state.

Tests: direct Approve/Reject visibility, no nested Approval modal, grouped urgency,
expired read-only deep link, realtime refresh, admin/read-only policy states,
server paging/filtering, archive defaults, keyboard/focus behavior, 1440x1024 and
390x844 responsive visual comparison.

DoD: the core Approval and onboarding journeys complete from the first visible
surface without hidden action controls; Product Design QA has no P0/P1/P2 finding.

## 6. Run integrated acceptance and publish evidence

Run focused suites, all required local checks, migration/restart recovery, real
Agent credential verification, browser push smoke, exact-SHA container build, and
public gateway verification. Record every result and any honest limitation in the
matching WorkMesh Work Item activities and the repository acceptance evidence.

Tests: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`,
`pnpm test:e2e`, production Web topology, `verify_connection`,
`get_current_identity`, and `get_workmesh_context`.

DoD: repository, deployed build SHA, public behavior, WorkMesh Project, and Work
Item evidence agree; no required check or known product blocker remains.
