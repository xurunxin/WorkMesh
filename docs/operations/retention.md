# Retention operations

WorkMesh starts in `archive_only` mode. Event archival is enabled; generic
cleanup and event pruning are disabled. Keep these defaults through the first
24-hour soak and backup/restore rehearsal.

The accepted horizons are:

- ordinary events online for 90 days and archived for at least 365 days;
- generic idempotency replay material for 24 hours and conflict tombstones for
  30 days;
- encrypted authentication replay for 15 minutes and conflicts for 24 hours;
- expired or revoked Human Sessions, Agent tokens, and delivered/processed
  webhooks for 30 days.

`GET /api/v1/admin/retention/status` requires a Human Workspace administrator.
Agents, services, and ordinary members are denied. It reports policy, floor,
archive state, durable job fences, blockers, and Redis length without object
keys, tenant identifiers in logs, secrets, or download URLs.
`mode` and `workerSeenAt` come from the Worker's durable runtime heartbeat.
`unknown` means no Worker has published a mode for that Workspace; it must not
be interpreted as archive-only or as proof that pruning is disabled.

Before enabling cleanup, verify a current database backup and keep
`WORKMESH_RETENTION_CLEANUP_ENABLED=false` during tests except in an isolated
test database. Before enabling event pruning, additionally require:

1. a successful 24-hour archive-only soak;
2. verified object readback and restore rehearsal;
3. no failed/unverified segments or undelivered outbox rows;
4. explicit `WORKMESH_EVENT_PRUNE_ENABLED=true` on the Worker, followed by a
   fresh `archive_and_prune` Worker heartbeat in the admin status response;
5. retention objects protected from deletion for at least 365 days.

Undelivered or missing outbox proof blocks archival at that cursor. Unknown
events, A2A references, Agent webhook references, and audit/recovery facts stay
physically present but may fall below the realtime floor after their complete
archive segment is verified. Do not delete those protected rows manually.
Disable the switch and investigate any archive or checksum failure.

Issue #11, not this endpoint, owns any future archive download, discovery,
restore, legal-hold, or archive-key rotation API.
