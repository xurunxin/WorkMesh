# Retention operations

WorkMesh starts in `archive_only` mode. Event archival is enabled; generic
cleanup and event pruning are disabled. Keep these defaults through the first
24-hour soak and backup/restore rehearsal.

The accepted horizons are:

- ordinary events online for 90 days and archived for at least 365 days;
- generic idempotency replay material for 24 hours and conflict tombstones for
  30 days;
- encrypted authentication replay for 15 minutes and conflicts for 24 hours;
- expired or revoked Human Sessions, Agent tokens, and processed provider
  webhook inbox rows for 30 days;
- Agent webhook delivery references as durable protected protocol facts. They
  are not generic 30-day delivery logs and cleanup never deletes them.

`GET /api/v1/admin/retention/status` requires a Human Workspace administrator.
Agents, services, and ordinary members are denied. It reports policy, floor,
archive state, durable job fences, blockers, and Redis length without object
keys, tenant identifiers in logs, secrets, or download URLs.
`mode`, `workerSeenAt`, and `workerFresh` come from the Worker's durable runtime
heartbeat. A missing or stale heartbeat forces `mode` to `unknown`; it must not
be interpreted as archive-only or as proof that pruning is disabled.
`protectedWebhookEvents` reports the number of online events pinned by Agent
webhook delivery references.

The archive bucket must be created with Object Lock enabled. Retention writes
use `COMPLIANCE` mode and a retain-until date at least 365 days in the future.
The Worker probes bucket protection before every archive pass and fails closed
before planning or uploading when protection is absent. Existing buckets
cannot be retrofitted safely by changing only Compose configuration; create a
new Object-Lock-enabled bucket and migrate under an explicit procedure.

Before enabling cleanup, verify a current database backup and keep
`WORKMESH_RETENTION_CLEANUP_ENABLED=false` during tests except in an isolated
test database. Before enabling event pruning, additionally require:

1. a successful 24-hour archive-only soak;
2. verified object readback and restore rehearsal;
3. no failed/unverified segments or undelivered outbox rows;
4. explicit `WORKMESH_EVENT_PRUNE_ENABLED=true` on the Worker, followed by a
   fresh `archive_and_prune` Worker heartbeat in the admin status response;
5. retention objects protected from deletion for at least 365 days.

Run the isolated restore rehearsal with separate disposable source and target
databases (both names must contain `test`):

```text
RUN_INTEGRATION=1
DATABASE_URL=postgres://.../workmesh_test_retention_source
RESTORE_DATABASE_URL=postgres://.../workmesh_test_retention_restore
S3_ENDPOINT=http://127.0.0.1:9000
S3_BUCKET=workmesh-artifacts
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
pnpm test:restore:retention
```

The rehearsal selects a verified, still-locked segment; verifies HEAD Object
Lock metadata; downloads and checks the gzip checksum and canonical snapshot
digest; restores records into a temporary schema in the separate target;
re-reads and verifies the restored digest; attempts deletion of the exact
locked object version and requires rejection; verifies readback again; and
removes the temporary schema. Its timestamped report contains no object key,
Workspace ID, Session ID, or credentials.

Undelivered or missing outbox proof blocks archival at that cursor. Unknown
events, A2A references, Agent webhook references, and audit/recovery facts stay
physically present but may fall below the realtime floor after their complete
archive segment is verified. Do not delete those protected rows manually.
Disable the switch and investigate any archive or checksum failure.

Issue #11, not this endpoint, owns any future archive download, discovery,
restore, legal-hold, or archive-key rotation API.
