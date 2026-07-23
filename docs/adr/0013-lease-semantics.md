# Lease semantics

Status: Accepted

## Context

Parallel agents need coordination without turning a lock into authority.

## Decision

Leases are durable PostgreSQL projections. Exclusive leases conflict with every active lease for the resource; `review_shared` leases may coexist only with other review leases. Acquisition takes a transaction advisory lock and checks/updates expired rows before insertion. TTL, heartbeat, renew, release, force release, worker expiry, and stale/terminal-session expiry are all audited events. Force release requires a human and a reason.

## Alternatives

Redis locks; treating a lease as permission; client-side timers.

## Consequences

Authorization checks capability and resource scope before lease checks. `LEASE_CONFLICT` includes holder/session/resource/expiry details. PostgreSQL remains authoritative.

## Migration

Migration 0007 adds `leases` and the active-exclusive partial unique index.

## Spec changes

None.
