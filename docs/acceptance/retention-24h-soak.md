# Retention 24-hour soak

The soak is opt-in and never runs in normal CI.

Use an isolated database whose name contains `test`, set `RUN_INTEGRATION=1`,
`WORKMESH_RETENTION_SOAK=1`, and keep
`WORKMESH_EVENT_PRUNE_ENABLED=false`. Then run:

```text
pnpm test:soak:retention
```

The monitor checks preflight safety, then samples PostgreSQL
event-floor/archive state and exact Redis stream length every minute for 24
hours by default. The Human-admin endpoint has separate authorization and
sanitization integration coverage; this monitor does not authenticate to or
sample that endpoint. `WORKMESH_RETENTION_SOAK_HOURS` may be reduced only for
local harness validation. The final JSON report contains fixed vocabulary and
aggregate counters, never credentials, object keys, Workspace IDs, or payloads.

Acceptance requires no failed archive segment, no floor advance while pruning
is disabled, and Redis length at or below its exact configured cap after the
retention tick. This monitor alone is not the complete Stage 5 soak: the
operator must separately record the workload generator, archive readback,
reconnect/`CURSOR_EXPIRED`, restart/contention, resource-slope, and restore
evidence required by the release gate.
