# Agent Collaboration Client Profile 1.0

Status: Stable Core normative profile.

This profile defines adapter-neutral behavior for an external coding agent that
joins WorkMesh as a durable, auditable team participant. “MUST”, “MUST NOT”,
“SHOULD”, and “MAY” are normative. Native HTTP and MCP are bindings of the same
server policy; neither adapter grants authority. A2A and Engineering Graph are
optional Experimental extensions and are disabled unless explicitly negotiated.

## 1. Discovery and version negotiation

1. A client MUST read public `GET /api/v1/info` before exchanging or attaching a
   Session. It MUST select one value from `supportedClientProfileVersions`; 1.0
   servers prefer `preferredClientProfileVersion=1.0`.
2. After Session-token authentication, the client MUST read
   `GET /api/v1/agent-capabilities` with `WorkMesh-Client-Profile: 1.0`, or the
   MCP resource `workmesh://agent/capabilities`. An unsupported version fails
   with `PROFILE_VERSION_UNSUPPORTED`; the server does not silently downgrade.
3. The manifest is generated from the route-policy, feature, and MCP binding
   registries. `supported` means the deployment implements and enables the
   operation. `eligibleByCapability` is a hint from the current live capability
   intersection. `authorizationEvaluatedPerRequest=true` is invariant: the
   server rechecks identity, Session, Delegation, live grants, scope, approval,
   Lease, revision, and idempotency on every operation.
4. Clients MUST ignore unknown response fields and operations. They MUST NOT
   infer that an omitted optional operation is authorized or emulate it through
   another route.

## 2. Required and optional capabilities

| Capability | 1.0 client requirement | Native HTTP | MCP |
| --- | --- | --- | --- |
| exact Session attach/token renewal | Required | Session exchange/refresh routes | configured Session token |
| ACK, Context, Activity, completion/failure | Required | REST 1.0 | stable resources/tools |
| Inbox list/get/claim/ack/reply | Required for collaboration | `/api/v1/inbox` | Inbox tools |
| durable reconnect | Required | events page and SSE | stateless `list_events` page |
| Artifact evidence | Required unless an explicit no-artifact reason applies | Artifact routes | Artifact tools |
| Work Room collaboration | Required | Room routes | Room tools |
| Handoff | Required for an executor client | Handoff routes | Handoff tools |
| webhook push | Optional delivery optimization | signed, at-least-once webhook | outside MCP transport |
| A2A 0.3 | Experimental | feature-negotiated adapter | not implicit |
| Engineering Graph | Experimental, not shipped in Stable Core | disabled | disabled |

Beta and Experimental entries are usable only when their manifest feature is
enabled. Feature support never widens a Delegation or capability scope.

## 3. Collaboration lifecycle

A conforming client performs the following ordered behavior:

1. Verify server/Profile versions, authenticate the installation, and exchange
   a single-use Session token. Tokens MUST remain local and MUST NOT appear in
   logs, Activity, messages, snapshots, or Artifacts.
2. Receive an assignment by signed push, Inbox pull, or both. Push is a wakeup;
   the durable Session, Context, Inbox, and event log remain authoritative.
3. ACK promptly, transition the acknowledged Session to `executing` with the
   returned revision, retrieve the exact Session Context and pinned Guidance,
   and refetch the current Session revision before completion or any other
   later revisioned mutation. Native clients use the Session/state routes; MCP
   clients use `workmesh://session/{id}` and
   `transition_agent_session_state`.
4. Reconcile Inbox items. Claiming coordinates an Agent-targeted item but does
   not grant authority. ACK appends a receipt; reply uses the server-derived
   Work Room thread and recipients.
5. Publish concise operational Activity, human-visible Room messages, immutable
   Plan versions where applicable, and evidence-bearing Artifacts. Never send
   hidden chain-of-thought.
6. Acquire a Lease only for an operation that requires it. A Lease coordinates
   work and MUST NOT be treated as authorization.
7. Request input or approval, offer a complete scoped Handoff package when work
   moves, and complete/fail with structured evidence. Stop is server-enforced;
   ordinary writes cease immediately and cleanup ACK is the only allowed write.

Every mutation MUST use one stable idempotency key per logical intent. A retry
of the same intent MUST preserve method, target, body, revision, Session, and
key. A different intent MUST use a different key.

## 4. Push, pull, disconnect, and offline resume

- Push receivers MUST verify HMAC over raw bytes and the timestamp window, ACK
  transport promptly, and durably deduplicate `WorkMesh-Delivery-Id`.
- Pull clients MUST persist opaque collection cursors only for their exact
  route/filter/identity. They MUST also persist the decimal Domain Event cursor
  separately; the two cursor families are never interchangeable.
- Realtime/SSE and Redis notifications are wakeups. After any disconnect, a
  client MUST replay PostgreSQL-backed events from its last committed cursor,
  then reconcile its current Session, Context revision, Inbox, outstanding
  approvals, Handoffs, and Leases before resuming effects.
- Duplicate delivery is normal. The client MUST deduplicate delivery and still
  rely on server idempotency for committed mutations.
- `CURSOR_EXPIRED` requires a bounded snapshot rebuild followed by reconnect at
  the returned `resyncCursor`; silently skipping the gap is non-conforming.

## 5. Canonical fail-closed reactions

| Error | Required reaction |
| --- | --- |
| `DELEGATION_NOT_ACTIVE` | discard Session credentials; do not continue work |
| `UNAUTHENTICATED` for an expired Session token | refresh once with active installation authority, otherwise stop |
| `SESSION_STOPPED` | cease ordinary writes and perform allowed cleanup acknowledgement |
| `RESOURCE_SCOPE_DENIED` | do not retry the same target; request a new Delegation if needed |
| `REVISION_CONFLICT` | refetch current state and explicitly rebase the intent |
| `LEASE_EXPIRED` | stop the protected action; reacquire only after live reauthorization |
| `APPROVAL_REQUIRED` | request or wait for a matching approval; never weaken payload binding |
| `FEATURE_DISABLED` | disable the optional capability and continue only Stable behavior |
| `CURSOR_EXPIRED` | rebuild the authorized snapshot and use the server resync cursor |

401/403 authority failures, stop, and revoked/expired Delegations are terminal
for the current credentials. Network errors, 429, and retryable 5xx use bounded
backoff. A 409 is never blindly retried.

## 6. Public CLI behavior fixtures

The conformance package describes public interaction patterns, not vendor
internals:

- `codex-style`: push assignment with durable SSE cursor resume;
- `opencode-style`: Inbox/event polling with pull cursor resume;
- `pi-style`: hybrid event wakeup plus Inbox reconciliation.

All three fixtures execute the same authority and evidence contract. A client
may use a different UI or process model and still conform.

## 7. Executable conformance and evidence

`@workmesh/conformance` exposes an adapter-neutral driver interface, Native HTTP
and MCP reference drivers, the three fixtures, hostile-state matrix, and JSON,
JUnit, and Markdown transcript reporters. Each hostile scenario prepares a
specific server-side failure state and then issues the corresponding Native or
MCP operation; a driver that merely echoes the expected error is non-conforming.

```powershell
pnpm test:conformance -- --output D:\workmesh-conformance
```

The command must report six successful adapter/fixture runs and creates
`report.json`, `junit.xml`, and `transcript.md`. A failure includes the exact
check, expected/observed error, and required client reaction. Release CI retains
these files with the Agent protocol smoke evidence.
