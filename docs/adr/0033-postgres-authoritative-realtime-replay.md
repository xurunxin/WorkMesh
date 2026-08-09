# PostgreSQL-authoritative realtime replay

Status

Accepted

Context

WorkMesh clients need restart-safe realtime delivery without turning every SSE
connection into a database poller. Redis is already operational infrastructure,
but it is not the durable source of truth and its availability or retention must
not decide whether an authorized client can replay a committed domain event.
JavaScript numeric cursors also lose precision above `2^53`. Authorization can
change while a stream is connected, so a connection-time check alone is
insufficient.

Decision

`domain_events.cursor` remains the sole durable realtime cursor and is carried
as a canonical decimal string. Opaque collection cursors, Agent Session
sequences, and A2A cursors remain separate domains.

Each API instance owns one realtime coordinator. A Redis Stream supplies lossy
wake hints without consumer groups. Each hint contains only `workspaceId` and
the decimal `cursor`; event type, payload, aggregate, recipient, and resource
metadata never enter Redis. Approximate `MAXLEN` trimming is configured by the
bounded `WORKMESH_REALTIME_REDIS_MAXLEN` setting. The coordinator reconciles PostgreSQL at
startup, at a low healthy frequency, and through one bounded shared fallback
timer while Redis is unavailable. Heartbeats never query PostgreSQL. Event
delivery reads bounded PostgreSQL pages and reauthorizes every page.

Domain Event envelope v2 adds typed `audience`, `scopes`, and `invalidates`.
`domain_event_resources` stores their normalized resource keys in the same
transaction as the event and outbox record. The fixed resource vocabulary is
workspace, team, project, work_item, session, room, artifact, and delivery.
Lease ownership is not authorization.
`audience.visibility=resource` describes events whose exact normalized scopes
span resources or Teams while `team_id` is necessarily NULL; such events must
not claim Workspace visibility.

Human delivery also uses the normalized resources in the final page query.
An explicit recipient can read its directed event. A non-admin human can read
an undirected resource event only through live membership in one of its exact
normalized Teams, or as the verified owner of an Initiative. A Workspace admin
can read undirected Workspace events without Team membership. Events are
Workspace-wide only when they contain no non-Workspace resource; a NULL
`domain_events.team_id` is never itself evidence of Workspace scope. Legacy
Initiative or Project-dependency events whose Team resources cannot be proven
fail closed for ordinary members. Agent delivery retains its stricter
Delegation/resource-intersection policy.

Human credentials, personal saved views (including those with an optional Team
association), private advanced views, notifications, and notification
preferences are direct-recipient forms. Their producers supply an exact
`audienceActorId`, and the event writer verifies it against durable ownership
or recipient state. A missing, mismatched, deleted, or otherwise unprovable
private relation fails closed. Workspace administrators do not bypass this
direct-recipient boundary.

`event_retention_state.pruned_through_cursor` records an explicit per-workspace
retention floor. This change does not prune events. A cursor below the floor
receives `CURSOR_EXPIRED` as HTTP 409 before stream headers, or a
`cursor.expired` control event followed by stream close if the floor advances
while connected.

The browser uses one authenticated fetch-SSE provider per actor/workspace
identity, with Agent Session included for Agent identities. Checkpoints are
isolated by that identity and compared with BigInt. SDK callers own checkpoint
persistence; MCP `list_events` is stateless.
Clean EOF, post-header failure, HTTP 429/5xx, and
`REALTIME_CAPACITY_EXCEEDED` HTTP 503 reconnect through bounded exponential
backoff with jitter and an abort-aware delay. A saturated API returns
`Retry-After`; authorization denials remain terminal.

Alternatives

- Redis consumer groups were rejected because competing consumers would split
  hints among API instances and Redis would become part of replay correctness.
- Per-client database polling was rejected because database load grows with
  open connections even when no events exist.
- PostgreSQL LISTEN/NOTIFY alone was rejected because notifications are lossy
  across disconnects and still require reconciliation.
- JavaScript numeric cursors were rejected because they cannot exactly represent
  all PostgreSQL bigint values.

Consequences

Redis loss increases detection latency to the fallback interval but cannot lose
committed events. One reconciliation query covers all active workspaces on an
API instance. Delivery can stop immediately after revocation because each page
is reauthorized. Page size, connection count, and backpressure wait are bounded;
slow clients reconnect from their durable checkpoint.

Migration

Migration 0025 adds `domain_event_resources`, `event_retention_state`, and the
workspace-scoped event key required by normalized resource references. It
backfills workspace/team and inferable aggregate resources. Multi-Team
Initiatives are backfilled through durable Initiative/Project links.
Project-dependency resources are backfilled only when the payload is
corroborated by the durable dependency edge; unresolvable legacy edges remain
admin-only rather than becoming Workspace-visible. Private audiences are
reconstructed only from durable Session, saved-view, advanced-view,
notification, and preference relations. Unprovable private history receives no
Workspace resource and remains invisible even to administrators. No event rows
are deleted.

Spec changes

`OPENAPI.yaml`, `WORKMESH_PRD.md`, `AGENT_PROTOCOL.md`, `SCHEMA.sql`,
`.env.example`, and Docker Compose document the v2 envelope, decimal cursor,
expiry response, and bounded coordinator settings.
