# Declarative route policy and event audience

Status

Accepted

Context

WorkMesh had transport schemas and distributed authorization checks, but no
fail-closed inventory proving that every Fastify route was declared. Bearer
authentication identified a principal, while mutable Agent authority still
depended on live Session, Delegation, capability, resource, Approval, Lease,
revision, and idempotency facts. REST event pagination and SSE shared a broad
audience predicate that was suitable for humans but could expose unrelated
Workspace or Team events to Agents. MCP and the TypeScript SDK also needed an
auditable mapping back to REST authority without gaining independent power.

Decision

`routePolicyManifest` is the serializable declaration for each REST operation.
It records method, route template, operation and policy IDs, authentication and
actor kinds, human roles, Agent live-authority requirements, a named resource
resolver, Approval and Lease requirements, revision and idempotency, feature
tier behavior, denial audit behavior, and native transport bindings.

A root Fastify `onRoute` hook binds registered routes to the manifest and rejects
unknown, mismatched, or duplicate registrations. `onReady` rejects missing
registrations. Fastify-generated HEAD and the CORS wildcard OPTIONS route are
the only automatic routes accepted outside the manifest.

Request authorization identifies a human Session, Agent Session,
installation-target credential, or provider signature, then evaluates authority
in this order: identity, active Session, active Delegation, live capability
intersection, resource scope, Approval, Lease, revision and idempotency. Command
handlers continue to lock and revalidate mutable facts in their PostgreSQL
transaction. A Lease remains coordination and never grants authorization.

REST event pagination and SSE use one SQL `EventAudiencePolicy`. Humans retain
Workspace-admin or current Team-membership visibility. Agents see only explicit
recipient events, their current Session, authorized child Sessions, or events
whose aggregate provably intersects their live Delegation scope. The predicate
runs before payload selection. SSE revalidates the credential, Session,
Delegation, Agent definition, Team grant, and read capability before each page;
the SQL predicate prevents a revocation race from returning a protected event.

Authorization denials are append-only facts recorded independently from command
transactions. They contain policy metadata, principal identifiers, a route
template, reason and stage, and a keyed resource fingerprint. Raw URLs, query
values, bodies, prompts, Templates, events, messages, artifacts, and secrets are
not persisted. Repeated heartbeat denials use a keyed minute bucket.

MCP calls the TypeScript SDK, and the SDK resolves every outgoing route against
the same manifest. Neither transport refreshes or retries authorization
denials. Generated OpenAPI extensions and the Markdown route matrix are checked
against the manifest.

Alternatives

Keeping policy only in route handlers was rejected because a new raw Fastify
route could bypass review. A report-only route inventory was rejected because
it allows unsafe startup. Team-wide Agent event visibility was rejected because
Team membership is not Agent resource authorization. Using Lease ownership as
permission was rejected because revocation and capability scope are independent
facts. Auditing raw requests was rejected because it would persist protected
content and secrets.

Consequences

Adding or removing a route requires updating the manifest and generated
artifacts or startup/tests fail. Request authorization adds bounded database
lookups, and SSE performs periodic live reauthorization. Existing Workspace
Templates remain Workspace-admin-only; new Team-scoped Templates can be exposed
to explicit Team members while an Agent receives only its current Session's
pinned run Template. Denial audit availability is observable, but audit failure
never converts a denial into an allow.

Migration

Migration `0022_route_policy_authorization_denials.sql` creates the append-only
denial ledger and adds nullable `templates.team_id`. Existing Template rows are
not broadened or backfilled and therefore remain Workspace scoped.

Spec changes

OpenAPI operations carry `x-workmesh-policy-id`,
`x-workmesh-actor-kinds`, `x-workmesh-feature-key`, and
`x-workmesh-feature-tier`. `docs/route-policy-matrix.md` is generated from the
manifest. The three pre-existing runtime routes that lacked OpenAPI entries
(Agent webhook endpoint creation, webhook secret rotation, and Agent Session
state transition) are now documented.
