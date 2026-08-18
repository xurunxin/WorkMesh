# Agent Connection & Coordination MCP

Status

Accepted for v1.1 (Agent-first coordination).

## Context

Today WorkMesh assumes a Human opens a Linear-style work item and a
Workspace Admin hand-configures an external Agent to receive a webhook
for that one work item. The Agent's Installation Token is created in an
out-of-band setup, the per-work-item Session is opened by the platform,
and the Agent only sees a thin slice of context bounded by that single
Delegation. The same shape repeats for every new work item the Human
wants to drive.

This pattern works for episodic "one issue → one runner" flows, but it
breaks down once Agents are first-class collaborators in a Team:

- Humans still have to copy tokens, MCP config, Skill files, and webhook
  secrets by hand into every Codex / OpenCode / pi install.
- An Agent cannot start work on a brand-new Issue it just discovered,
  nor decompose a Project, nor hold a long-lived identity the UI can
  monitor and revoke.
- A pair of collaborating Agents must be kicked off by a Human because
  no one holds a "Coordinator" role with Team scope.
- The MCP surface is wired to a single Session token, so it cannot
  serve multiple concurrent Agents on the same MCP server.

The plan in `docs/plans/agent-first-coordination-mcp.md` upgrades
WorkMesh to Agent-first coordination. This ADR freezes the new
contract slice: how an Agent is paired, what a Connection is, what a
Coordination Session is, what the Coordination MCP looks like, and
which decisions stay with Humans.

The scope of this ADR is strictly the contract layer declared in plan
§A: shared contracts, the `route-policy` manifest, PRD, Agent
Protocol, OpenAPI. Database migration DDL, domain commands, route
handlers, SDK, MCP server entrypoint, UI, Skill bundle, and client
adapters are out of scope here and live in plan §B–G.

## Decision

### 1. Discovery

`GET /.well-known/workmesh-agent` is a public, unauthenticated,
cacheable manifest. It returns:

- `protocolVersion` — the Agent Connection protocol version, `v1`.
- `mcpUrl` — the Coordination MCP Streamable HTTP endpoint.
- `wellKnownUrl` — the same URL, self-referenced for clients.
- `apiVersion` — pinned `OPENAPI.yaml` major version.
- `supportedClients` — list of client adapters the server knows
  about (`codex`, `opencode`, `pi`).
- `skill` — `name`, latest `version`, `sha256`, and `signature` of
  the official `workmesh` Skill bundle the server currently
  publishes.

The manifest never returns secret material. It is served from the
same origin as the API and uses the existing Tailscale HTTPS
termination.

### 2. Agent Connection lifecycle

A Connection is a long-lived, single-Team binding between one named
Agent and one Human principal. The plan's endpoint list is the
authoritative surface; this ADR does not add a list endpoint, a Human
landing page, or any other path beyond the seven resource operations
declared in plan §"一次性配对":

- `POST /api/v1/agent-connections` — create a pre-authorized envelope
  (Workspace Admin).
- `POST /api/v1/agent-connections/redeem` — Agent exchanges a 10-minute
  single-use pairing code for an Installation Token.
- `GET /api/v1/agent-connections/{id}` — view the current Connection
  state, fingerprint prefix, MCP/Skill versions, last-use timestamp.
  The plaintext Token is never returned. The response carries an
  `ETag` header whose value is the Connection `revision` so PATCH
  and DELETE can apply optimistic concurrency.
- `PATCH /api/v1/agent-connections/{id}` — change non-privilege-
  escalating metadata: `name`, `principalHumanActorId` (within the
  bound Team), display notes. Cannot change `teamId`, `clientType`,
  `requestedCapabilities`, or `grantAgentDelegate`. Privilege changes
  go through Rotate. Requires `If-Match: "<revision>"`.
- `DELETE /api/v1/agent-connections/{id}` — revoke the Connection.
  Requires `If-Match: "<revision>"`.
- `POST /api/v1/agent-connections/{id}/rotate` — issue a new pairing
  code and pending credential. Old and new credentials stay valid
  for 15 minutes (real `overlap_until` deadline). During the overlap
  window the Admin may call `/rotate-confirm` to revoke the old
  fingerprint early; if the Admin does not, the worker auto-invalidates
  the old fingerprint at `overlap_until`. Either path revokes only
  the old fingerprint — the new fingerprint, the Connection, and any
  live Coordination Session are not affected. The outbox event is
  `agent.connection.rotated`. `DELETE` is still the hard path that
  revokes the entire Connection.
- `POST /api/v1/agent-connections/{id}/rotate-confirm` — revoke
  the old fingerprint introduced by the current Rotation. The new
  fingerprint remains valid; the Connection returns to `active`;
  any live Coordination Session keeps running. Requires `If-Match:
  "<revision>"`. This is the explicit implementation of the plan's
  "确认成功后撤销旧凭据" requirement. The same end state is reached
  passively when the worker expires the old fingerprint at
  `overlap_until`, so the Admin can choose to wait.

`POST /api/v1/agent-connections` (Workspace Admin) creates a
pre-authorized envelope. The body fixes:

- `name` — the human-readable Agent name shown in the UI.
- `agentSlug` — slug used by the Agent SDK and Skill.
- `teamId` — the single Team the Connection is bound to.
- `principalHumanActorId` — defaults to the Admin who created the
  Connection; Admins may pick any other active Human in the Team.
- `clientType` — one of `codex | opencode | pi`.
- `requestedCapabilities` — initial capability set.
- `grantAgentDelegate` — explicit boolean flag for `agent:delegate`.
  Defaults to `false` and is recorded in the Connection row.

The response includes `id`, the `connect_url` with the pairing code
in the **fragment**, the `pairing_code_expires_at` (ten minutes),
the bound `skill_version` and its `skill_sha256`, and a
`redacted_token: true` flag. The pairing code is stored only as a
salted hash; the plaintext is shown once in the Admin wizard and
never re-fetched. The `connect_url` schema requires the fragment
to be present so the server cannot accidentally hand out a
query-string-embedded code.

`POST /api/v1/agent-connections/redeem` accepts the plaintext
pairing code and an `agent_slug` claim. The endpoint is
unauthenticated. The server:

1. Requires an `Idempotency-Key` header (mirroring the
   `/api/v1/auth/*` pattern).
2. Verifies the pairing code is not expired and not already
   redeemed.
3. Atomically inserts a `credential_fingerprints` row for the new
   Installation Token, marks the pairing code redeemed, and emits
   `agent.connection.pairing_redeemed` plus an outbox row in one
   PostgreSQL transaction.
4. Returns the **plaintext `wmi_` Installation Token exactly once**
   together with the pinned Skill bundle, the MCP configuration
   blob, the `principal_human_actor_id`, and the bound `team_id`.
   Pairing fragments use the distinct `wmp_` prefix, and the client verifies
   the returned token's SHA-256 prefix against the Connection fingerprint
   before persisting it, preventing a pairing fragment from being installed as
   the long-lived MCP credential.
5. Retains the success response keyed by `Idempotency-Key` for the
   pairing-code lifetime. A second call with the same key returns
   the same response, so an Agent whose network drops the response
   after the server committed can recover without losing the Token.

A second redeem attempt with the **same pairing code but a
different `Idempotency-Key`** returns
`AGENT_CONNECTION_PAIRING_CONSUMED` — pairing codes are
single-use. Brute-force guessing is rate-limited in the shared
Redis limiter (per source IP, per target Connection) and returns
`AGENT_CONNECTION_PAIRING_LOCKED` once the threshold is hit.

`PATCH` and `DELETE` are revisioned resources: the request must
include `If-Match: "<revision>"`, the response carries
`revision`, and the server returns `REVISION_CONFLICT` /
`IF_MATCH_REQUIRED` for stale or missing headers. Revocation
without `If-Match` is rejected to prevent stale Admin tooling
from killing live Connections.

### 3. Installation Token & Coordination Session

The Installation Token:

- Is opaque, high-entropy, and scoped to exactly one Connection.
- Is **never** a session token and **never** carries a capability
  set sufficient for ordinary mutations.
- Can only call `verify_connection`, `get_current_identity`, the
  Coordination Session bootstrap, and the well-known manifest.
- Lives until the Connection is revoked or rotated.

A Coordination Session is a short-lived (default 1 hour, max 2
hours) Session automatically minted by the Coordination MCP per
request:

- The MCP server resolves the Installation Token to a Connection.
- It re-checks the Agent, Team grant, Delegation, capability set,
  and revoke state inside the same PostgreSQL transaction that
  mints the Coordination Session.
- It reuses the existing Session table with a new
  `session_kind = 'coordination'` value and a `connection_id`
  foreign key.
- The Session is tagged with `role = 'coordinator'` and
  `delegation_scope = 'team'`.
- Token persistence and idempotency replay use the existing
  `installation_token` table; the new `coordination_sessions`
  row only tracks the live Session.

The Coordination Session refreshes itself before expiry; if the
Connection is revoked mid-Session, the next request fails closed
with `COORDINATION_SESSION_CONNECTION_REVOKED`.

### 4. Team Coordinator Delegation

A new `delegation_scopes` enum value `team` joins the existing
`work_item` and `plan_step` scopes. A Team-scoped Delegation
(`delegation_scopes.scope = 'team'`) carries the full capability
intersection of the Connection, the Agent's Team grant, and the
principal Human's Team membership. The existing per-row checks for
`work_item` and `plan_step` are preserved and reused.

The Delegation also carries `connection_id` and
`principal_human_actor_id`. Mutations recorded against a
Coordination Session record the Agent as the `actor_id` and the
principal Human as the `on_behalf_of_human_actor_id`. UI lists and
Work Room messages show both. The principal Human is the one who
can Revoke and Stop, not the Agent.

### 5. New capability: `agent:delegate`

The capability list gains `agent:delegate`. It is **not** granted
by default. A Connection only carries it when the Admin explicitly
sets `grantAgentDelegate: true` at creation. The
`agent_connection.granted_capabilities` response MUST NOT include
`agent:delegate` unless `grant_agent_delegate` is `true`; this
cross-field invariant is enforced in the Zod schema, in
`OPENAPI.yaml`'s `dependentRequired`, and on the server.

The capability gates exactly two Coordination MCP tools:

- `start_agent_session` — starts a new executor Session for a
  peer work item.
- `delegate_work_item` — creates a Delegation to a peer Agent for
  a peer work item.

Other tools, including `create_child_session` (which creates a
bounded sub-Session for a single plan step under the current
Coordinator's existing work item) and `offer_handoff`, do **not**
require `agent:delegate`. They continue to require the existing
per-tool preconditions (`work:write`, parent Session/Plan Step scope,
and Team access for child sessions; Team write access for handoffs).
The Coordinator cannot transitively
pass `agent:delegate`; only Humans grant it.

### 6. Mutation policy for Coordinators

Coordinators may perform the **everyday CRUD subset**:

- `create_project`, `update_project` (non-destructive fields only).
- `create_work_item`, `update_work_item` (non-destructive fields
  only).
- `post_work_room_message`, `comment_plan_step`,
  `propose_plan_step_assignment`.
- `list_projects`, `get_project`, `list_work_items`,
  `get_work_item`, `list_teams`, `list_workflow_states`,
  `list_inbox_items`, `claim_inbox_item`, `reply_inbox_item`,
  `list_work_room_messages`, `get_current_identity`,
  `verify_connection`, `draft_project_update`.
- `create_child_session` and `offer_handoff` against the Team.

Coordinators **may not** perform destructive or Human-gated
operations:

- `delete_project`, `archive_project`, batch mutation endpoints.
- `publish_project_update` and other Human-only transitions.
- `delete_work_item`, bulk archive / bulk reassign.
- Health updates published (not just drafted) to Project.
- Stop / Revoke on other Connections, Sessions, or Delegations.

These gates live in the domain command layer (not the MCP tool
layer), so REST, SDK, and MCP all enforce the same rules. The MCP
tool descriptions describe the policy; the server enforces it.

### 7. Coordinator-created Work Items

`create_work_item` accepts an optional
`responsible_human_actor_id`. When omitted by a Coordinator, the
server fills it from the Connection's `principal_human_actor_id`.
The UI shows the resolved value in the Work Item detail. A Human
may still override it.

### 8. Coordination MCP surface

The new `apps/mcp` entrypoint `coordination-http.ts` (feature-
flagged behind `WORKMESH_BETA_COORDINATION_MCP`) runs a per-
Connection Streamable HTTP MCP server. Auth is the Installation
Token carried in `X-WorkMesh-Installation-Token`, not a generic
Bearer credential, so common Authorization logs do not capture it.
Per request the server resolves the Connection, mints or
refreshes the Coordination Session, and proxies the tool call
through the existing domain gate.

Basic tools (always allowed for a Coordination Session whose
Connection is `active` and not revoked):

- `verify_connection` — round-trips the Connection identity and
  the pinned Skill version.
- `get_current_identity` — returns Agent actor, Connection,
  principal Human, Team, granted capabilities.
- `list_teams`, `list_workflow_states` — read-only Team and state
  discovery.
- `list_projects`, `get_project`, `create_project`,
  `update_project` — scoped to the bound Team; updates are
  restricted to safe fields.
- `list_work_items`, `get_work_item`, `create_work_item`,
  `update_work_item` — scoped to the bound Team; updates are
  restricted to safe fields; `responsible_human_actor_id` is
  filled from the Connection when the Agent omits it.
- `list_work_room_messages`, `post_work_room_message`,
  `list_inbox_items`, `claim_inbox_item`, `reply_inbox_item`.
- `draft_project_update` (publish remains Human-only).

Explicit authorization tools (require the matching capability):

- `delegate_work_item` (requires `agent:delegate` and the same
  preconditions as the existing `create_child_session` gate).
- `start_agent_session` (requires `agent:delegate`).
- `create_child_session` (requires existing `work:write`, parent
  Session/Plan Step scope, and Team access; the parent Coordinator may or may not carry
  `agent:delegate`).
- `offer_handoff` (requires Team write access).
- `request_approval` (records a structured approval request bound
  to the Work Item or Plan Step; approval is decided by a Human
  actor).

MCP-layer conveniences (not authority):

- The MCP server auto-generates an `Idempotency-Key` per tool
  call when the Agent omits one, using a stable hash of
  `(connection_id, tool_name, payload)`. The server still honors
  an explicit key when provided.
- The MCP server injects the active Coordination Session into
  every tool call so Agents never need to pass `sessionId`.
- Name → UUID resolution: when a tool accepts a Team slug, project
  slug, or Work Item identifier, the server resolves the UUID
  once, caches it for the lifetime of the Coordination Session,
  and forwards the UUID to the domain layer. The domain layer
  never sees a slug.
- Safe-field updates: `update_project` and `update_work_item`
  execute a one-shot read/merge/write inside the request
  transaction so a non-conflicting `description` edit does not
  require the Agent to know the current revision. The server
  returns the merged revision so Agents can still chain edits
  with explicit `If-Match` if they want.

The legacy `apps/mcp/src/http.ts` (session-scoped) and
`stdio.ts` keep working unchanged. The Coordination MCP does not
replace them; it is an additional entrypoint that proves out
Agent-first coordination while preserving every existing
integration.

### 9. Agent Connection protocol additions to `AGENT_PROTOCOL.md`

The protocol gains:

- Section **3.4 Agent Connection** — the pairing, Connection, and
  rotation lifecycle described above.
- Section **3.5 Coordination Session** — short-lived, per-
  Connection Session, and its refresh rules.
- Section **10.4 Connection-anchored identity** — the rules for
  `actor_id`, `connection_id`, `principal_human_actor_id`, and
  `delegation_scope = 'team'` on every event and Work Room
  message.
- Section **13 Coordination MCP** — the basic and explicit tools,
  plus the per-request identity / idempotency / slug resolution
  rules.

### 10. Beta flag

`WORKMESH_BETA_COORDINATION_MCP` gates the new entrypoint and
the new DB-backed flows during development. The RC turns it into
the default enabled feature, removes the flag, and re-pins
`OPENAPI.yaml` to the v1.1 manifest. The legacy session-scoped
MCP is unaffected; the v1.0 production Compose adds the
Coordination MCP as a sibling container under the same Tailscale
HTTPS path.

## Alternatives

- **Per-Agent SDK instead of an MCP server.** Rejected. A separate
  SDK creates a second transport for the same domain and would
  re-litigate the MCP-as-adapter decision in ADR 0012.
- **Long-lived per-Connection Session, no Coordination Session
  wrapper.** Rejected. A long-lived session would re-introduce
  the exact token rotation problem that ADR 0008 closed for
  executor sessions, and it would be impossible to detect a
  revoked Connection without forcing the Agent to re-handshake.
- **Implicit `agent:delegate` for every Coordinator.** Rejected.
  It collapses the "Coordinator can talk" boundary with the
  "Coordinator can start new Agents" boundary, which is the
  single most privilege-escalating capability the platform
  exposes. Humans must grant it explicitly.
- **Per-Team client secret instead of a pairing code.** Rejected.
  Long shared secrets leak through chat, repos, and CI logs. A
  10-minute single-use pairing code confines the long-lived
  secret to a single HTTP exchange.
- **Pure fragment-based credential carry.** Rejected. The
  well-known/protocol pattern is the only piece that can be
  cached; the pairing code itself is a one-shot secret that the
  server mints and the Agent redeems, so it lives in the
  existing `installation_token` table with the same replay
  protection.
- **Reuse the existing executor Session Token for Coordination.**
  Rejected. Executor Sessions are already short-lived and gated
  by a single Delegation. Coordinator Sessions need Team scope
  and an identity that survives across many work items.
- **No explicit rotation confirmation.** Rejected by plan v0.4.
  Relying only on the 15-minute `overlap_until` fallback does not
  represent the approved "确认成功后撤销旧凭据" action. The accepted
  `/rotate-confirm` endpoint revokes only the old fingerprint while
  preserving the Connection, new credential, and live Coordination
  Sessions; `DELETE` remains the whole-Connection revoke path.
- **Auto-revoke on new redeem (v0.2).** Withdrawn. The 15-minute
  overlap and "auto-revoke on the new redeem's success" are
  mutually exclusive: if the old credential is invalidated as
  soon as the new redeem succeeds, `overlap_until` is a lie. The
  v0.3 plan restores the original 15-minute overlap semantics;
  the worker enforces `overlap_until` on the old fingerprint.

## Consequences

- Agents gain a real Team identity, a UI-visible lifecycle, and
  a revoke path.
- The Coordination MCP and the legacy session-scoped MCP
  coexist; v1.0 integrations are not broken.
- Restrictive mutation policy keeps Humans in control of
  destructive and high-blast-radius operations while letting
  Agents drive the daily CRUD loop.
- `agent:delegate` becomes the single, narrowest capability
  that allows one Agent to start another. It is never implicit,
  and the cross-field invariant is locked at the schema layer
  in both Zod and OpenAPI.
- The `workmesh` Skill is out of scope for this contract slice;
  the plan places it under §E and any bundle is described only
  by the `AgentConnectionSkillManifest` shape consumed by the
  Connection API and the well-known discovery.

## Spec changes

This ADR is the contract slice the rest of v1.1 consumes. The
spec changes it locks are:

- `WORKMESH_PRD.md` gains Section 1.5 "Agent-first coordination"
  and the v1.1 acceptance scenario.
- `AGENT_PROTOCOL.md` gains sections 3.4, 3.5, 10.4, and 13 as
  described in Decision §9.
- `OPENAPI.yaml` gains:
  - `GET /.well-known/workmesh-agent` (public).
  - `POST /api/v1/agent-connections`, `GET`, `PATCH`, `DELETE`
    on the resource, `POST .../redeem`,
    `POST .../{id}/rotate`, and `POST .../{id}/rotate-confirm`.
    The two `rotate` operations are distinct: `rotate` issues
    a new pairing code; `rotate-confirm` revokes only the old
    fingerprint on Admin confirmation (plan v0.4 §"一次性配对"
    step 7 + 8). The well-known and the redeem endpoint are
    `authenticated: false`; every admin route is
    `authenticated: true`; PATCH/DELETE/rotate/rotate-confirm
    all require `If-Match`; all mutations require
    `Idempotency-Key`; GET responses declare `ETag`.
  - New schema components matching the snake_case wire format of
    existing endpoints, the unified `Error.code` enum extended
    with Stage 5 codes, and `Capability` /
    `DelegationScopeType` extended with `agent:delegate` and
    `team`. The 17 per-capability subset `if/then/else` blocks
    in `AgentConnectionResponse.allOf` and the 51 subset /
    equality blocks in `AgentConnectionIdentity.allOf` come
    from `scripts/generate-stage5-subset-blocks.mjs` (the
    canonical capability list, 17 entries). The 8 cross-Identity
    id bindings (d.1–d.8) are in
    `agentConnectionIdentitySchema.superRefine` and documented
    in the `AgentConnectionIdentity` schema description
    (JSON Schema 2020-12 cannot compare two dynamic values
    so OpenAPI documents them; Zod enforces them).
  - `skill_version` uses the official SemVer 2.0.0 regex from
    semver.org (the previous regex accepted `01.0.0` and
    `1.0.0-alpha..1`, rejected `1.0.0+build.1`).
- `packages/contracts/src/route-policy.ts` (the `stage5RouteManifest`
  export) lists the same six resource operations plus the
  well-known endpoint, the two `rotate` operations, and the
  new `rotate-confirm` (8 entries total), with `mutation: true`
  on every state-changing route and `revisioned: true` on
  PATCH/DELETE/rotate/rotate-confirm. The route manifest also
  enforces `authenticated: true` on every admin-side route and
  `authenticated: false` on the public well-known and redeem
  endpoints.

This ADR **does not** add:

- A list endpoint (the plan only declares `GET .../{id}`).
- A Human-facing landing page (the plan declares the Admin
  wizard produces a sentence that the Human pastes to the
  Agent; no server-rendered page is in scope).
- A migration file or DDL body (the plan puts migrations under
  §B; this contract slice is the freeze step, runtime is
  Phase B).
- A domain command, route handler, MCP server entrypoint, or
  UI (the plan places these under §B–F).

## Migration

This ADR is the contract-freeze step (Phase A). Database
migrations, route handlers, the Coordination MCP server, and
the runtime path through `apps/api` + `apps/mcp` are
intentionally deferred to plan §B. The schema-level invariants
in `packages/contracts/src/index.ts` are the durable artifact
for this slice and are the source of truth that runtime code
will import. No DDL, no `packages/db/migrations/0022_*.sql`,
and no runtime code in `apps/` is added by this ADR.
