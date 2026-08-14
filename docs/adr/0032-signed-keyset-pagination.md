# Signed, authorization-aware keyset pagination

Status

Accepted

Context

Unbounded REST collections produced response-size and memory risk. Offset pagination cannot give stable traversal under repeated sort values and makes sparse authorization expensive. A cursor must not become a substitute for current authorization or reveal filters, actor identity, or database tuples.

Decision

All externally consumed collections return exactly `{items,nextCursor}`. `limit` defaults to 50 and is restricted to 1 through 200. SQL applies workspace and live resource authorization, effective filters, the keyset predicate, deterministic ordering, and `LIMIT limit+1` in that order. Every tuple ends in the unique resource ID. The cursor is a canonical, versioned HMAC token bound to route, workspace, actor, normalized effective filters, and sort definition. The server validates canonical base64url and JSON, exact payload shape and scalar tuple values, version, key ID, issued/expiry times, and HMAC with a timing-safe comparison.

`PAGINATION_CURSOR_KEYS` is a comma-separated `kid:base64url` rotation ring. `PAGINATION_CURSOR_ACTIVE_KID` selects the signing key; all ring keys remain valid for verification. Keys are distinct random values of 32 to 256 bytes and cannot reuse session, master, bootstrap, rate-limit, database, object-store, or MCP secrets. Production starts fail closed without an explicit ring. Operators retain retired verification keys for at least the cursor TTL.

`GET /api/v1/events`, SSE `Last-Event-ID`, and A2A task event cursors retain their existing decimal durable cursor domain and never use these opaque pagination cursors. `GET /api/v1/rooms` remains a singleton lookup. Template export remains atomic and is hard-bounded to 100 templates with at most 100 versions each.

Alternatives

Offset pagination was rejected because authorization sparsity and concurrent writes make page cost and results unstable. Unsigned tuple cursors were rejected because they allow scope/filter substitution and disclose implementation details. Snapshot transactions were rejected because they require server-side cursor state and long-lived database snapshots.

Consequences

Clients must read `items` and pass `nextCursor` back unchanged. A changed route, principal, workspace, filter alias normalization, view revision, or sort returns `PAGINATION_CURSOR_MISMATCH`; malformed, expired, unknown-key, or tampered cursors return `PAGINATION_CURSOR_INVALID`. Authorization is re-run on every page, so revocation can shorten a later page immediately.

Migration

Deploy the new cursor key ring before starting the production API. Upgrade REST, Web, SDK, MCP, and native consumers atomically because top-level array responses are replaced. Add migration `0024_cursor_pagination_indexes.sql`. Keep the previous active key in the ring for at least `PAGINATION_CURSOR_TTL_SECONDS` after rotation.

Spec changes

`OPENAPI.yaml`, `WORKMESH_PRD.md`, `AGENT_PROTOCOL.md`, shared contracts, environment examples, Docker Compose, and `docs/pagination.md` define the response, cursor, mutation, security, and operational contracts.
