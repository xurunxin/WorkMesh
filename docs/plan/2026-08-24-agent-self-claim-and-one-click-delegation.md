# Agent self-claim and one-click delegation implementation plan

Source ADR: `docs/adr/0047-agent-task-admission-and-forced-delegation.md`

Remote mirror: WorkMesh Project `WorkMesh Agent Autonomous Intake & One-click Delegation`
(`19b6ae65-2ce0-4d31-b52b-a198a386ff73`).

WorkItem mirror: T0 `#412`, T1 `#413`, T2 `#417`, T3 `#414`, T4 `#415`,
T5 `#416`.

## T0 — Contracts and assignment convergence

Objective

Make forced assignment and self-claim one coherent, atomic admission contract.

Implementation

- Update Agent Protocol, OpenAPI, Zod contracts and route policy.
- Keep `POST /api/v1/work-items/{id}/agent-session` as the Human
  force-assign-and-start route.
- Add Coordination-only `POST /api/v1/work-items/{id}/claim` and
  `claimable=true` Work Item filtering.
- Remove the public two-step Delegation/Session routes and the MCP
  `start_agent_session` alias.
- Reuse the ADR 0046 execution-only capacity predicate and existing active
  executor unique index; add no migration.

Tests

- Contract/OpenAPI equivalence and route-policy generation.
- Human vs Coordination actor matrix.
- Duplicate idempotency key and changed-body rejection.
- Existing assignment, stale revision, terminal workflow, wrong Team/principal,
  revoked grant/Connection, capability and capacity cases.

Definition of done

- REST, route policy and errors express the exact ADR contract.
- No external route can create a Delegation without atomically starting its
  initial execution Session.
- Generated route-policy bindings and matrix are current.

## T1 — Domain, API, SDK and MCP autonomous intake

Objective

Allow the current Coordination Agent to claim one eligible Issue for itself
without gaining authority to assign another Agent.

Implementation

- Implement deterministic authority locks and lock-after-read revalidation.
- Make forced assignment converge for the same assignment and atomically replace
  an incompatible assignment, preserving terminal facts.
- Implement claimable list filtering and atomic self-claim.
- Create/reuse Delegation, queued execution Session, context, prompt, exchange
  bootstrap, events, outbox and webhook delivery in one short transaction;
  exchange execution authentication through the existing endpoint in a second
  short transaction.
- Add Agent SDK method and MCP `list_claimable_work_items` / `claim_work_item`.
- Bridge later stateless MCP execution calls by refreshing exact-Session
  authority inside each request; return only redacted bridge metadata to the
  Agent, never a Session token.
- Return safe assignment/capacity details for recoverable 409 responses.

Tests

- 8–32 concurrent self-claims: exactly one Delegation and one non-terminal
  execution Session.
- Response-loss replay returns the original response.
- Human force assignment wins before, during and after a self-claim race.
- Transaction failure at each write boundary leaves no residual Delegation,
  Session, token, prompt, event, outbox, lease or executor projection.
- Coordination + first execution succeeds at concurrency 1; second execution is
  the only request rejected.
- SDK and MCP transport/input/error parity.
- Two independent MCP request/client instances complete
  `claim → acknowledge → activity → complete` without changing client config.

Definition of done

- Connected Agents can discover, claim, acknowledge and execute eligible work.
- Self-claim cannot displace an explicit assignment or cross Team/principal
  scope.
- Human forced assignment is atomic and convergent.

## T2 — One-click forced delegation UX

Objective

Make Human assignment a first-order Issue action with correct defaults and clear
recovery.

Implementation

- Move assignment/session controls into the Agent execution tab.
- Add a header and empty-state `Delegate to Agent` action.
- Use one-click direct submission when exactly one eligible Agent exists; use a
  compact chooser when several exist; keep advanced controls optional.
- Submit the persisted responsible Human, not the logged-in actor.
- Show queued, acknowledged, planning, executing, waiting, stopped and terminal
  states in one timeline/control surface.
- Preserve form state and idempotency semantics across recoverable failures.
- Add direct navigation for missing Team access/capability and occupied capacity.
- Keep English and Chinese copy synchronized.
- Validate 1440px wide quick sheet/full page plus 768/375px layouts.

Tests

- Component tests for default Agent/capability selection and principal binding.
- Same-key unknown-result replay and new-key revision retry.
- Empty states for no Agent, no active Team access, no shared capability and no
  responsible Human.
- Existing self-claim replaced by Human forced assignment.
- Playwright keyboard/pointer flows at wide and narrow viewports.

Definition of done

- A Human can force assign with one primary action when a default is unambiguous.
- The user never needs to discover assignment under Discussion.
- Human responsibility, Agent delegate and Session state remain visibly distinct.

## T3 — Agent Skill and operational guidance

Objective

Teach installed Agents to pull eligible work, recover interruption, and defer to
Human forced assignment.

Implementation

- Update `skills/workmesh/SKILL.md` and protocol/client references.
- Specify initialization as
  `verify_connection → get_workmesh_context → list_claimable_work_items → claim_work_item`.
- Document stable idempotency keys, cancellation, response-loss replay, capacity,
  assignment conflict, Stop, completion and the next discovery cycle.
- Regenerate the LF-only public Skill artifact, hash and Ed25519 signature using
  a repository-external private-key build input; CI remains verification-only.
- Rotate the pinned public trust root in the same slice because the previously
  published private material is unavailable, and record that divergence in the
  WorkItem and release evidence.
- Keep the production Web image byte-download validator green.

Tests

- Skill generator positive check and CRLF/BOM/tail mutation negatives.
- Hash/signature verification against raw bytes.
- MCP tool names and examples match contracts.
- Real production image returns the exact versioned Skill bytes without redirect.

Definition of done

- A fresh Agent can follow the Skill without Human delegation.
- The generated artifact, manifest, signature and production bytes agree.

## T4 — Integrated verification and visual acceptance

Objective

Prove the whole local path before any remote merge or deployment.

Implementation

- Run focused contracts/domain/db/API/SDK/MCP/Web/Skill tests first.
- Run route-policy and production-image validators.
- Run required repository lint, typecheck, unit, integration and E2E suites.
- Independently review the final diff and verify mutation-region ownership.
- Capture final desktop and narrow screenshots of empty, chooser, queued,
  executing, conflict and forced-reassignment states.

Tests

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:integration`
- `pnpm test:e2e`
- `pnpm check:route-policy`
- `pnpm check:workmesh-skill`
- `pnpm validate:production-images`

Definition of done

- Every blocking assertion has current-tree evidence.
- No known regression or unresolved merge conflict remains.
- Wide-screen and narrow Human assignment journeys pass visual inspection.

## T5 — PR, OpenWrt rollout and production task-processing test

Objective

Merge the verified change and prove it on the current internal production MCP.

Implementation

- Commit verified feature slices, push the branch and open a PR.
- Wait for required GitHub checks, repair failures on the same PR and merge the
  exact accepted head into `origin/main`.
- Build four `linux/amd64` images from the merge SHA with the production public
  API URL, record IDs/digests and transfer them to the gateway.
- Back up the exact `.env.production`, update image tags/build SHA, validate
  Compose, run migrations and restart the application stack with rollback images
  retained.
- Verify Web/API/Worker/MCP/MinIO/PostgreSQL/Redis, public routes, Skill bytes,
  project data and webhook bridge recovery.
- Refresh the current MCP client identity. Create one production test Issue,
  discover and self-claim it, acknowledge/execute/append evidence/complete it,
  then exercise a Human forced-assignment precedence case.
- Only after the terminal gate, precisely remove superseded WorkMesh application
  images and transferred archives. Never run a global prune or touch Tailscale
  state.

Tests

- GitHub PR checks successful and merge SHA read back from `origin/main`.
- Gateway image architecture/digest/config/health checks.
- `verify_connection`, `get_current_identity`, Skill verification and full MCP
  task lifecycle.
- Database/API readback proves one active assignment/session during claims and no
  residual non-terminal state after completion/cancellation.

Definition of done

- Production runs the merged SHA and the current MCP connection processes work
  through self-claim.
- Human forced assignment has verified precedence.
- Rollback reference and sanitized deployment evidence are retained; superseded
  application images are removed precisely.
