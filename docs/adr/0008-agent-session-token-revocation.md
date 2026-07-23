# Agent session token format and revocation

Status: Accepted

## Context

Stage 1 agents need short-lived credentials that identify an agent session, its active delegation, scoped capabilities, and expiry. A self-contained token alone cannot immediately reflect Stop or delegation revocation.

## Decision

Issue an opaque, short-lived session token only after a one-time exchange token is redeemed. The durable server record is authoritative for token id/nonce, expiry, session state, delegation status, capability intersection, and resource scope. Every agent mutation checks that record, so Stop, capability changes, delegation revocation, and expiry take effect immediately. Persistent event/activity data never contains a bearer or exchange token.

## Alternatives

Long-lived installation tokens for ordinary writes; stateless JWTs with expiry-only revocation; storing a bearer token in the session-created event.

## Consequences

The API performs a server-side lookup on agent writes and the SDK must exchange the initial one-time token before using session APIs. This permits immediate revocation without persisting credentials.

## Migration

Stage 1 adds durable token-id/hash and revocation state with agent session storage. No Stage 0 browser-session migration is required.

## Spec changes

`POST /api/v1/agent-sessions/{id}/token/exchange` returns a short-lived bearer token. Agent mutations use `Authorization: Bearer` plus `Idempotency-Key` and `X-Correlation-Id`.
