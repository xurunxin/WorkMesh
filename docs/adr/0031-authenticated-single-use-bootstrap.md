# Authenticated single-use installation bootstrap

Status

Accepted.

Context

The installation endpoint creates the first human administrator. Treating the
absence of `platform_installation` as authorization allowed the first remote
caller to claim a newly exposed deployment. Installation also participates in
the shared Redis credential limiter, declarative route policy, and encrypted
authentication-response replay, so bootstrap authentication must preserve
their established ordering and failure boundaries.

Decision

`installWorkspace` uses the explicit `bootstrap` authentication policy. The
only production credential transport is `X-WorkMesh-Bootstrap-Token`.
Production startup requires a canonical unpadded base64url value containing 32
to 256 random bytes and rejects placeholder, repeated, low-diversity, or
reused-secret values before the API listens.

The processing order is fixed:

1. shared Redis admission derives the immutable socket peer and client IP only
   through the configured trusted-proxy CIDRs;
2. Fastify parses the request;
3. bootstrap authentication verifies the explicit header;
4. the bootstrap authorization is attached for declarative route policy and
   `Idempotency-Key` enforcement;
5. the handler re-verifies the credential immediately before encrypted
   authentication idempotency and the installation transaction.

Missing, malformed, wrong, comma-joined, and repeated header fields all perform
the same domain-separated fixed-length HMAC comparison using
`timingSafeEqual`, then return one generic authentication failure. The raw
credential is never a replay subject. A separate domain-separated irreversible
credential binding becomes the in-memory installation subject, and only Issue
12's keyed subject fingerprint is persisted.

An explicit non-production loopback mode may omit the token only when
`API_HOST` is exactly `127.0.0.1` or `::1`, trusted-proxy CIDRs are empty, the
socket peer is loopback, and no forwarding or client-address header is present.
It is forbidden in production.

`platform_installation` remains the permanent one-row closure. A successful
request and an exact retry with the same credential, key, normalized body, and
client context return the same encrypted cookie response. A changed request or
context conflicts, a changed credential cannot access the original replay, and
a new key reaches the permanent installation closure. Bootstrap authentication
failures create neither authentication-idempotency records nor PostgreSQL
authorization-denial facts.

Accepted and rejected attempts emit locally sampled fixed-field audit records.
They contain only event name, operation ID, outcome, and the bounded bootstrap
mode for accepted requests. They contain no token, header, IP, idempotency key,
password, cookie, body, or credential fingerprint.

Alternatives

A public first-request-wins endpoint was rejected because network exposure
would remain authorization. Query parameters, request bodies, cookies, and
generic bearer authorization were rejected because they broaden credential
transport and increase leakage risk. Persisting the bootstrap token or its
reversible encryption was rejected because replay needs only an irreversible
subject binding. A proxy-only allowlist was rejected because proxy
misconfiguration cannot be the administrator-creation authority.

Consequences

Operators must generate and deliver a unique bootstrap token before production
startup, preserve the exact token for response-loss replay, and keep it out of
shell history and proxy/access logs. Redis unavailability fails installation
closed with `AUTH_RATE_LIMIT_UNAVAILABLE`. After installation, the singleton
continues to reject all new installation attempts even if the configured token
is later rotated.

Migration

No database migration, backfill, domain change, or worker change is required.
Existing uninstalled deployments must configure a bootstrap token before
starting the upgraded API. Existing installed deployments must also provide a
safe value for production startup; `platform_installation` keeps them closed.

Spec changes

OpenAPI declares `BootstrapToken` and applies it only to
`POST /api/v1/auth/install`. The route-policy manifest declares
`authentication: bootstrap`. Environment, Compose, browser installation, CI,
and operator documentation carry the explicit credential.
