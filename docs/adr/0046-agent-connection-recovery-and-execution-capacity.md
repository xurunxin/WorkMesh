# Agent Connection recovery, execution capacity, and credential proof

Status: Accepted

## Context

Real-world Agent Connection use exposed four related reliability gaps:

- a live `agent_coordination_sessions` row could point at a terminal or otherwise invalid backing `agent_sessions` row;
- Coordination Sessions were included in `max_concurrency` admission even though they are control-plane identity and not executor work;
- the signed WorkMesh Skill was absent from the production Web standalone image, while the Windows checkout could silently rewrite its signed LF bytes to CRLF;
- the MCP bootstrap tools could prove an Agent Session capability manifest, but could not prove which Connection credential authenticated the request during rotation overlap.

The accepted behavior in ADR 0040, ADR 0043, `AGENT_PROTOCOL.md`, and the signed Skill contract already requires stronger guarantees than the implementation provided. This ADR makes the recovery, capacity, byte-integrity, and credential-proof rules explicit.

## Decision

### Coordination recovery

A Coordination Session is reusable only when its coordination row is active and unexpired, its backing Agent Session is an authority-active `coordination` Session, and its Connection, workspace, Team, Agent, principal Human, delegation, and granted capabilities still match current authority.

Resolution locks the matched credential and Connection, the active coordination row, and its backing Session in one PostgreSQL transaction. An invalid coordination row is closed. A terminal backing Session remains immutable; an invalid non-terminal backing Session is canceled before a replacement is created. State, lifecycle events, domain events, and outbox rows commit together. Existing unique indexes remain the final convergence guard.

The Connection workspace and Team are the trusted archive scope for a coordination lifecycle event. A closed event includes its `sessionId` only while the backing Session remains in that same resource scope. If corruption crosses a workspace or Team boundary, the Connection-scoped event records `sessionReferenceOmitted: resource_scope_mismatch`; the backing Session state event is separately archived in its own scope without Connection identifiers. This prevents recovery from turning a corrupt binding into cross-Team metadata disclosure.

The protocol lifecycle events are:

- `agent.coordination_session.opened`;
- `agent.coordination_session.refreshed`;
- `agent.coordination_session.closed`.

Generic `agent.session.created` and `agent.session.state_changed` events remain. No separate `recovered` event is added; a closed/opened reason pair records recovery.

### Execution capacity

Only `session_kind='execution'` consumes `agent_definitions.max_concurrency`. Every non-terminal execution state reserves capacity: `queued`, `acknowledged`, `planning`, `executing`, `awaiting_input`, `awaiting_approval`, `blocked`, `paused`, `stopping`, and `stale`. Terminal states `completed`, `failed`, and `canceled` release capacity. Coordination Sessions never consume an execution slot.

All execution admission paths use one domain predicate and one database assertion after locking the target Agent definition. This includes direct delegation/session creation and retry, child/review/handoff, Loop admission, Automation `delegate_agent`/`start_session`, and new non-terminal A2A tasks. Existing A2A task updates and terminal-only imports do not request a slot.

Scheduled Loops defer the occurrence when capacity is full. Automation effects use their existing durable retry and dead-letter lifecycle. A new non-terminal A2A task fails with `AGENT_CONCURRENCY_LIMIT` and HTTP 409; no second queue or fabricated state is introduced.

### Signed Skill bytes

The checked-in public Skill is a signed byte artifact. Its working-tree bytes are LF, and validation hashes and verifies the raw bytes without normalization. Production builds verify the committed artifact using the public key only and place the complete `public` directory in the Next.js standalone runtime. Production-image validation starts the real image and verifies the HTTP response bytes, hash, signature, and absence of credential-shaped content.

### Current Connection identity

`GET /api/v1/agent-connections/current-identity` is an additive, read-only endpoint authenticated only by `X-WorkMesh-Installation-Token`. It returns the existing Connection/Coordination identity plus a redacted `authenticated_credential` projection containing the presented credential's 12-character fingerprint prefix, `active|overlap` status, and overlap deadline.

The Connection's existing fingerprint remains the current active credential. The authenticated credential projection proves the credential used for this request. No credential ID, token, request header, or full hash is exposed.

The API resolves the Installation Token once per request and caches the strict identity on the request. MCP bootstrap tools add `connectionIdentity` without removing legacy fields. Pairing writes client configuration only after raw Skill verification and a successful `initialize -> verify_connection -> get_workmesh_context` identity comparison.

Authentication failures remain a uniform public `UNAUTHENTICATED` response. Internal diagnostics use a server-generated diagnostic ID and a fixed reason enum; sensitive values never enter public errors, logs, activities, events, or artifacts.

## Alternatives

- Count only currently executing states: rejected because queued, paused, stopping, and stale Sessions can still acquire or resume work and must reserve capacity.
- Give Coordination Sessions a separate numeric quota: rejected because existing Connection uniqueness and expiry semantics already bound coordination, and executor capacity is a different invariant.
- Reuse the current active Connection fingerprint as credential proof: rejected because an overlap credential would appear to be the new active credential.
- Normalize signed Skill bytes before validation: rejected because normalization masks a production byte/signature mismatch.
- Add a second A2A or Loop queue: rejected because existing callers and Automation effects already provide retry semantics.

## Consequences

- A terminal or mismatched Coordination Session is replaced deterministically and never revived.
- `max_concurrency=1` permits one execution alongside its Connection's Coordination Session and rejects a second execution across all entry points.
- The public Skill served from a production Web image is byte-identical to its signed manifest.
- MCP clients can prove the exact authenticated credential during rotation overlap while existing clients keep their prior response fields.
- Public authentication errors disclose less detail than operator audit records.
- Admission SQL and lock-order manifests must stay synchronized.

## Migration

No database or data migration is required. Existing `session_kind`, state, credential, coordination, and uniqueness columns/indexes are sufficient. Deployments update contracts, API, Worker/DB helpers, SDK/MCP, scripts, and the Web image. Production deployment and live credential rotation remain a separate Human Gate.

## Spec changes

- `AGENT_PROTOCOL.md`: coordination validity, execution capacity states, lifecycle events, and credential-proof bootstrap.
- `OPENAPI.yaml`: current-identity endpoint/security/response and concurrency-limit details.
- Route policy and client profile bindings: additive current-identity operation and MCP bindings.
- Production deployment documentation: raw Skill and running-image verification.
