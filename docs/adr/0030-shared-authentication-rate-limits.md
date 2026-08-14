# Shared authentication rate limits

Status

Accepted.

Context

Credential verification is intentionally more expensive and more abuse-sensitive
than ordinary WorkMesh reads and commands. Per-process counters do not provide a
single budget across API replicas, and trusting an arbitrary forwarded address
lets a caller evade an IP dimension. A rate-limit denial must not claim an
idempotency record, create a Session, append an event/outbox row, or become a
PostgreSQL authorization-denial fact.

Decision

Only these credential-verification operations use the shared authentication
limiter: Workspace installation, human login, Agent Session token exchange,
Agent Session token refresh, exact-target Handoff inspection, and exact-target
Handoff rejection. Logout, Agent registration/rotation, provider webhooks,
ordinary human or Agent work, heartbeat, activity, plan, artifact, SSE, and
health routes are outside this inventory.

The API uses Redis as a non-authoritative admission service. One Lua operation
uses Redis `TIME` to evaluate endpoint, immutable socket peer, derived client
IP, bootstrap, and subject-client token buckets and commits their consumption
all-or-none. Credential failures add an exponential, capped backoff for the
exact operation, client IP, and subject. A successful authentication clears
only that failure state. All keys share the `{authrl}` cluster hash tag and
contain full HKDF-derived HMAC fingerprints; raw email, token, Session/Handoff
identifier, IP address, and credential never enter Redis keys, logs, metrics,
or errors.

Redis offline queueing is disabled. Connect and command deadlines are bounded.
Redis unavailability returns `503 AUTH_RATE_LIMIT_UNAVAILABLE` only for the six
inventory routes. Admission denial returns `429 AUTH_RATE_LIMITED` with
`Retry-After` and rate metadata before credential SQL, Argon2, authorization,
idempotency, or business mutation. Credential failures, not policy,
idempotency, scope, revision, or business errors, advance backoff.

Fastify receives an explicit CIDR allowlist for `trustProxy`. The default is an
empty list, so forwarded headers are ignored. The limiter always records the
normalized immutable socket peer and separately uses Fastify's right-to-left
trusted-chain client address. `true`, numeric hop counts, and manual
left-most-header parsing are prohibited.

Login always performs one Argon2id verification. Unknown email uses a fixed
dummy hash generated with the same password-hash parameters and returns the
same response shape and headers as a wrong password.

Alternatives

Per-process counters were rejected because replica budgets diverge. PostgreSQL
rate-limit rows were rejected because abusive traffic must not amplify durable
writes. Fail-open Redis behavior was rejected because it removes protection
exactly during an infrastructure fault. Account-only lockout was rejected
because it enables trivial denial of service against a known account.

Consequences

Credential verification depends on Redis availability while all non-inventory
routes retain their existing PostgreSQL authority and availability. Operators
must provision Redis with `noeviction`, monitor limiter availability and
throttle ratios, and maintain the proxy CIDR allowlist. Client retries must
reuse the same request body, authentication context, and Issue #12 idempotency
key, honor `Retry-After`, and remain bounded.

Each API instance emits a bounded structured interval summary over four fixed
endpoint classes and five fixed outcomes, then resets its local counters.
Graceful shutdown flushes residual counts and stops the timer. A failed
post-commit success cleanup increments `unavailable` and emits a locally
sampled fixed-field error, but never rewrites the committed response.

Migration

No PostgreSQL migration or backfill is required. Deploy Redis configuration and
API environment values before introducing multiple API replicas. Existing
Redis data is not migrated; versioned fingerprints expire naturally.

Spec changes

The route-policy manifest declares `credentialRateLimit: shared_redis` for the
six operations. OpenAPI exposes `x-workmesh-auth-rate-limit: shared_redis`,
uniform 429/503 responses, and retry headers.
