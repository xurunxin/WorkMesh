# A2A Version Boundary

Status

Accepted for Stage 4.

Context

A2A evolves independently from WorkMesh. External Agent cards, tasks, messages, artifacts, and streaming states cannot be allowed to leak protocol-version details into the domain or bypass WorkMesh authorization.

Decision

`packages/a2a-adapter` is a version-isolated adapter for A2A `0.3`. It maps Agent cards to manifests and tasks/status/messages/artifacts/streaming updates to stable WorkMesh commands. Protocol bindings pin an exact version.

The adapter validates a strict, bounded, typed envelope and invokes an authorization callback before any task mapping or Session creation. Task IDs have one 500-character maximum across the envelope validator, API event path, and OpenAPI contract. The API then proves the binding, Agent state, human Team membership, Agent Team access, requested capabilities, and Work Item scope inside one transaction. Only after those checks does it create the delegation and real Session. Delivery IDs are idempotent and bind the complete authorization envelope: protocol binding/version, Team, Work Item, requested capability set, inbound sequence, and typed task payload. A replay revalidates that envelope against the persisted Binding, Session, Delegation, and task binding before returning a Session identifier; conflicts return stable `A2A_DELIVERY_CONFLICT` without cross-Team disclosure. Per-task inbound sequences are monotonic, and conflicting or out-of-order deliveries return stable errors. A later delivery locks and atomically advances the existing Session through the WorkMesh transition table while adding only previously unseen prompts and artifacts.

Mapped prompts/messages use `agent_session_prompts`, mapped artifacts use the normal `artifacts` table, and task/session correlation is durable. Inbound sequence and outbound Domain Event cursor are persisted as distinct delivery directions. The authorized event endpoint scans durable domain events in bounded pages, returns the last scanned cursor as a decimal string even when a page maps no events, and records each outbound A2A delivery, so restart and replay do not rely on in-memory streaming state. A deterministic fake A2A Agent is the acceptance implementation.

Unknown protocol versions, states, capabilities, or provider operations return typed unsupported errors. The Gitea adapter follows the existing Git provider interface and publishes an explicit capability matrix; unsupported operations do not fall through to GitHub behavior.

Alternatives

Embedding A2A envelopes in domain events was rejected because it couples persisted semantics to an external version. Creating a Session before authorization was rejected because even rolled-back context construction risks disclosure. Duck-typing Gitea as GitHub was rejected because capability differences become silent runtime bugs.

Consequences

Adding a future A2A version requires a new mapping boundary but does not migrate internal events. Context disclosure remains downstream of proven authorization.

Migration

Migration `0018_stage4_loops_health_a2a.sql` adds versioned A2A bindings/delivery facts. Migration `0019_stage4_gitea.sql` adds the typed Gitea credential variant. Migration `0020_stage4_review_hardening.sql` adds delivery sequence, Session, and domain-event reconciliation coordinates. Migration `0021_stage4_a2a_direction_and_prompt_identity.sql` separates inbound/outbound sequence domains and adds immutable external prompt identity.

Spec changes

A2A binding/task/event endpoints and the Gitea provider credential variant are defined in `OPENAPI.yaml`; `AGENT_PROTOCOL.md` records the mapping boundary.
