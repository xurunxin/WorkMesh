# China-ecosystem ingress, channel delivery contract, and model presets

Status

Proposed

Context

The Lite class (ADR 0071, both **Proposed** and not yet implemented) targets a
person, a small team, or an internal team inside a company. In the Chinese market
that audience reaches its tools through a specific set of surfaces, and the
repository has no adapter for any of them. Scoped honestly: no existing
implementation was found for 企业微信, 钉钉, 飞书, or a mini-program client. That
is not the same as claiming the platform has no notification surface at all —
ADR 0062 already carries Human Web Push, and the schema has carried notification
channel and delivery tables since `0016_stage4_usage_notifications.sql:6,85-103`.
What is missing is a **channel** surface, not a notification capability, and this
ADR is scoped to that difference.

Two further corrections to what was assumed before designing this:

**Human Attention is a derived query, not a durable queue.** It has no table, no
outbox stream, and no scheduler of its own (ADR 0050 §). The worker's Redis sink
writes only `{cursor, workspaceId}` and trims to `MAXLEN`
(`apps/worker/src/index.ts:249-258`); PostgreSQL alone claims the outbox and marks
it delivered (`apps/worker/src/index.ts:291-325`). That is the ADR 0033 wake hint.
The Agent inbox (ADR 0037) is a claim-and-receipt fact for a specific actor and
session, not a general delivery queue. "Reuse the outbox" is therefore a design
task, not a description.

**Saving a model connection does not verify anything.** The create and update
paths format- and policy-check the configuration and store the secret; they send
**no** outbound request to the configured target, and ADR 0065 states this
explicitly. `normalizeLlmBaseUrl` (`apps/api/src/workbench-llm-connections.ts:49-69`)
normalises protocol, credential, private-host allowlist, and path — it is not a
probe. Any design that leans on "the server already verified the key" is leaning
on a capability that does not exist.

Two further gaps are real. Work stops for a human at two gates, and the only
place to act today is the web application; for the audience above, a decision
that requires leaving the browser is a decision made late. And the most common
self-hosted failure in this market is not a missing model but a pasted base URL,
which no catalogue currently prevents.

Decision

WorkMesh gains a **channel delivery contract**, **one** first channel, a
**read-only model preset catalogue**, and a documented answer for runners behind a
network WorkMesh cannot dial. Everything else in this space is explicitly
deferred.

### A channel is a transport, and v1 delivers only

A channel carries an already-authorized Human Attention projection to a human and
carries that human back to the web application. In v1 it carries **nothing else**.

v1 ships **one** channel, 企业微信, as a low-sensitivity notification with a deep
link into the signed-in web application, where the governed response happens
through the existing interface. It does **not** render a decision control on the
card.

This is a scoping decision forced by an unresolved trust problem, not a
simplification. A provider's message signature proves the message came from that
application; it does not prove **which WorkMesh Human** clicked, in which
workspace, or whether that Human still holds access and still holds the
authority. Today there is no account-linking contract, no stable composite key
binding a provider tenant and subject to an existing Human Actor, no unlinking
path, and no callback actor-resolution contract. A channel that carried decision
controls today would force an implementer to invent that bridge, and the obvious
inventions are all bad: trusting the channel target's owner, or letting a service
actor sign as a Human, or letting whoever receives a forwarded card inherit the
approval.

Direct card actions are therefore deferred to a **separate ADR** whose first
requirement is an identity-binding design, not a card protocol. This ADR records
the shape that design will have to satisfy: bind a stable
`(provider, tenant, app, subject)` composite to a verified existing Human, bind
and unbind only from a live Human session, re-check binding, Human activity,
workspace, Team, exact recipient, source revision, and Session Stop on **every**
callback, and persist a delivery id with a request digest to reject replay and
reject same-id-different-body. Until that exists, a card that someone forwards
must be harmless, and a deep link is.

### Delivery is a durable intent, not a projection side effect

The contract, because "reuse the outbox" turns out to be undefined work:

1. The business transaction that changes an attention's state, or a worker with a
   **durable cursor**, writes a **delivery intent** row in PostgreSQL. It never
   happens inside a `GET` of the attention projection; a Query has no side
   effects.
2. An idempotent fan-out turns one intent into one attempt per
   `(intent, channel_target)`, so one broken channel cannot cause another
   channel to re-notify.
3. External send happens **after** the transaction commits, never before — the
   existing "no irreversible external request before commit" rule.
4. Fenced acknowledgement marks the attempt delivered. Retries are per target,
   with backoff, a timeout reclaim, and a terminal dead-letter state.
5. Before each send, the channel **re-authorizes the target Human** and rebuilds
   minimal content. A queued notification whose permission was revoked is
   suppressed, not sent.
6. A card is bound to the source revision it was rendered from. A stale card can
   never approve newer content; it deep-links instead.

Concurrency, restart, and the at-least-once boundary are named rather than
implied: a worker restart resumes from a persisted checkpoint, two workers
competing for one intent produce one attempt per target, and where the provider
offers no idempotency the promise is **at least once** with an explicit
reconciliation path for the indeterminate result. A database unique key does not
make an external side effect exactly once, and this ADR does not claim it does.

The no-Redis profile is a **follow-up compatibility gate, not an existing
capability**: ADR 0072 is Proposed and `auth-rate-limit/plugin.ts:53-59` still
builds a Redis store by default, so the channel fan-out must either work without
Redis or be explicitly declared unsupported in that profile.

### Presets are a read-only, versioned catalogue

A versioned catalogue ships the domestic providers with region-correct base URLs,
protocols, and model identifiers: MiniMax, DashScope, Z.AI/GLM, Moonshot/Kimi,
DeepSeek, Volcengine, SiliconFlow, and Baidu Qianfan, plus the global providers
reachable from the region. Selecting one **fills in editable configuration**.

Presets are deployment data, versioned and read-only over the API. They are not
an aggregate with CRUD, and they are not editable through a request. Loading,
overriding, and disabling rules are documented per deployment; a deployment may
replace the catalogue file wholesale.

**A preset does not claim the credential works.** The catalogue records, per
entry, the provider, region, api type, base URL, model ids, the source URL, the
date a human checked it, and whether it was machine- or human-confirmed. It makes
no compatibility claim it cannot support, because nothing in the current stack
verifies it. Real credential and model verification — if it is wanted at all — is
a **separate probe design** with its own task: a controlled runner or worker
probe, run outside any database transaction, bound to an exact connection and
model revision, using the existing outbound policy, with defined timeouts, cost
bounds, secret redaction, and a `verified` / `failed` / `unknown` result. Folding
a probe into the preset task would smuggle an outbound request into a
configuration write.

### Runners behind a network WorkMesh cannot dial

Stated here so the product does not imply a capability it lacks, in preference
order:

1. **The runner dials out.** Every enrollment, claim, and streaming path is
   already runner-initiated over HTTP, so a runner behind NAT needs no inbound
   path. This is the default and requires nothing.
2. **An operator-controlled relay**, run by the operator, holding no WorkMesh
   credential, forwarding an authenticated byte stream. It is infrastructure the
   operator already knows how to run, and it is explicitly not a WorkMesh
   service.
3. **Nothing else.** WorkMesh does not open inbound connections to a runner, and
   no "shell back into the company network" affordance is added: that would be a
   new authority path with a much weaker audit story than ADR 0055 already gives
   for human-initiated session control.

## Explicitly deferred, with the reason

| Deferred | Reason |
| --- | --- |
| 钉钉 / 飞书 / SMTP channels | Four protocols is a large surface for a contract that has never shipped one. The abstraction is narrow on purpose; a channel needing product-specific behaviour is a signal the abstraction is wrong, not that it needs an escape hatch. Each is its own adapter and its own acceptance. |
| Direct card decisions | Requires an identity-binding ADR that does not exist. See above. |
| Mini program as a client | A read-only, auth-compatibility spike first. A mini program cannot assume a resident session and must survive a cold reopen, and "no new endpoint" cannot be promised before the existing authentication path (ADR 0005) is shown to work in that client. |
| Directory identity for the first administrator | **Removed from v1.** ADR 0031 names `X-WorkMesh-Bootstrap-Token` as the only production credential transport and closes installation permanently behind a singleton. Adding an OAuth path without defining which tenant and which subject are pre-authorized degenerates into "the first person to complete corporate OAuth owns the instance", and two entry points race the same singleton. A later ADR must explicitly amend 0031, define the pre-authorised tenant and subject set, put both entries in one atomic installation transaction, and preserve the real authentication source in the audit record. |
| Credential and model probe | Separate design, as above. |

## Alternatives

- **Ship four channels at once.** Rejected: the delivery contract is unproven, and
  four protocols would multiply the unknowns rather than amortise them.
- **Let a channel message mutate a Work Item for low-risk transitions.** Rejected
  outright: the same class of shortcut ADR 0053 exists to prevent, and much harder
  to remove than to add.
- **Trust the provider signature to identify the Human.** Rejected: it
  authenticates the application, not the person. See the identity problem above.
- **Accept card actions and require the implementer to solve identity.** Rejected:
  that is a security architecture decided by whoever writes the code first.
- **Generate a delivery intent inside the attention read.** Rejected: it makes a
  Query stateful and would send notifications for projections the caller may not
  even be authorized to see.
- **Claim the existing Redis stream is the channel queue.** Rejected: it is a
  trimmed wake hint under ADR 0033, and the Redis profile is not yet implemented.
- **Rebuild notification delivery from zero.** Rejected: ADR 0062's Web Push and
  the existing channel and delivery tables are prior art to extend.
- **Hard-code providers in the UI.** Rejected: presets are deployment data so an
  operator can add the gateway their company already runs.
- **Verify keys on save because the reference product does.** Rejected: the
  reference product's server can phone its providers; this ADR must not import
  that assumption along with the feature.

## Consequences

The audience the Lite class targets can be reached where it already lives, at the
scale of one channel, and — critically — a forwarded or stale card is harmless
because a card carries no authority. A self-hosted deployment can reach a working
model configuration without anyone typing a base URL, and can tell the difference
between "this preset is filled in" and "this key works".

The costs are accepted. One channel means four ecosystems are not yet served, and
that is visible rather than hidden. The delivery contract adds tables and a
fan-out worker, and the at-least-once promise means an operator will occasionally
see a duplicate notification, which is stated rather than papered over. The
catalogue is a file a human must keep honest, and its per-entry provenance
columns exist precisely because nothing in the system verifies them.

Directory identity is not merely deferred but removed, because leaving it in
would have quietly changed ADR 0031's security policy in a document about
channels.

## Migration

No change to the domain, the actor model, or existing authentication defaults.
Channels and presets are additions behind their own feature flags, and a
deployment with all of them disabled behaves exactly as it does today. Nothing
in this ADR alters the bootstrap path it defers.

New tables — channel targets, delivery intents, delivery attempts, and preset
records — are added as `packages/db/migrations/v1/NNNN_*.sql` with the ADR 0038
v1 checksum manifest and `SCHEMA.sql` updated to match. Presets are catalogue
data with no migration beyond the file. Nothing here adds an endpoint for a
mini program, because a mini program is deferred.

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` and
`pnpm test:e2e` must stay green. The route-policy matrix is regenerated with
`pnpm generate:route-policy`; any new statement that locks an agent-visible row
is added to the agent lock inventory through `UPDATE_AGENT_LOCK_MANIFEST=1` and
reviewed per statement, including its owner and canonical lock order.

## Spec changes

- `CONTEXT.md` gains **Channel** (a transport for Human Attention delivery, never
  an authority) and **Preset** (a versioned, read-only model provider catalogue).
- `OPENAPI.yaml` declares channel target CRUD, the delivery intent and attempt
  model, and the read-only preset catalogue endpoint. It declares **no** channel
  decision endpoint, because v1 has none.
- `AGENT_PROTOCOL.md` gains a paragraph stating that the delivery and fan-out
  protocol never authorises: every action a human takes remains a governed
  response executed by an existing source command, wherever the human was when
  they took it.
- `docs/production-deployment.md` gains the runner reachability section, so
  "my runner is behind the company firewall" is answered by the deployment
  document rather than inferred to be a missing feature.
- `docs/plan/` gains the staged plan, with the delivery contract landing before
  the first channel adapter, and the identity-binding ADR named as a hard
  prerequisite for any future card action.
