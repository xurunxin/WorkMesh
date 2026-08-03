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
`lastVerifiedEndCursor` and the archive job watermark are monotonic telemetry
for the highest exact archived event cursor. Neither value proves continuous
coverage below it.

The archive bucket must be created with Object Lock and versioning enabled.
Retention first commits one PostgreSQL `planned` intent with a stable segment
UUID/key, fixed cutoff, canonical checksums/manifest, retain horizon, and
provisional exact-member reservations. It always recovers the oldest pending
intent before planning another. Provisional reservations do not count as
coverage.

Retention writes use `If-None-Match: *`, `COMPLIANCE` mode, a retain-until date
at least 365 days plus a five-minute safety margin in the future, and checksum
plus segment/snapshot/fixed-cutoff metadata. A planned recovery always
reconciles current HEAD before changing the retain horizon. A matching current
object pins its VersionId and LastModified. If its lock is shorter than
`max(LastModified + configured days + 300 seconds, current time + configured
days + 300 seconds, PostgreSQL retain_until)`, the current fenced owner first
locks and revalidates the still-planned, version-null segment and persists that
target in PostgreSQL. It then extends COMPLIANCE retention on that exact
VersionId with `PutObjectRetention`, never shortening retention or creating a
new version. A pinned HEAD reconciles response loss and its final S3 horizon is
persisted exactly with the VersionId. Only an explicit current HEAD 404 permits
refreshing the planned horizon before the conditional PUT. Success,
precondition failure, timeout, 5xx, and response loss all reconcile current
HEAD on the same key. An identity or protection mismatch becomes a fenced
deterministic conflict. Never delete an uncertain object, generate a
replacement key, or accept a second version. A lease lost after PUT leaves the
planned intent for its successor. Only a current fenced owner may persist the
reconciled non-empty `VersionId`.
HEAD, GET, checksum verification, prune preflight, restore, and early-delete
probes after that point must address the pinned version explicitly; resolving
latest by key is permitted only during pending-intent reconciliation.
Segment `start_cursor` and `end_cursor` are only the minimum/maximum object
envelope. Coverage exists only in `event_archive_segment_events` after pinned
readback and atomic `uploaded` to `verified`/`exact` finalization. An
`uploaded`, `failed`, or `legacy_unindexed` segment is not coverage.
The Worker probes bucket protection before every archive pass and fails closed
before planning or uploading when protection is absent. Existing buckets
cannot be retrofitted safely by changing only Compose configuration; create a
new Object-Lock-enabled bucket and migrate under an explicit procedure.

The production Worker identity must use the least-privilege policy template at
`infra/s3/worker-retention-policy.template.json`, rendered with the deployment
bucket and archive prefix. In particular, archival requires
`s3:PutObjectRetention` in addition to version-pinned read, conditional put,
Object Lock inspection, and version-list permissions. Do not grant
`s3:DeleteObject` or `s3:DeleteObjectVersion` to the Worker.

Before enabling cleanup, verify a current database backup and keep
`WORKMESH_RETENTION_CLEANUP_ENABLED=false` during tests except in an isolated
test database. Before enabling event pruning, additionally require:

1. a successful 24-hour archive-only soak;
2. verified object readback and restore rehearsal;
3. no failed/unverified segments or undelivered outbox rows; verified or pruned
   `legacy_unindexed` segments must first be lazily materialized from their
   pinned object;
4. explicit `WORKMESH_EVENT_PRUNE_ENABLED=true` on the Worker, followed by a
   fresh `archive_and_prune` Worker heartbeat in the admin status response;
5. retention objects protected from deletion for at least 365 days.

Migration 29 to 30 must use the tracked
`pnpm upgrade:retention:production` executor and the maintenance barrier in
`docs/production-deployment.md`; do not invoke the standalone migrator. Before
stopping the old Worker, the executor freezes MCP membership from the current
Compose project's container labels and validates all configuration and exact
images needed by that frozen topology. No MCP container means MCP remains
disabled: the upgrade requires no MCP token, never activates the `agent`
profile, and does not inspect the configured MCP image or start, wait for, or
inspect an MCP container after migration.
Exactly one running MCP container with the same Compose project, config-file,
and working-directory identity means MCP remains enabled and its token,
digest/revision, Compose rendering, recreation, and readiness checks are
mandatory. Multiple containers, unreadable labels, mismatched deployment
identity, or a stopped/restarting MCP container is ambiguous and aborts before
the irreversible migration. In execute mode, before disabling the old Worker
restart policy, the executor runs `/app/runtime-guard.mjs` from each exact
target image with the frozen migrate, API, Worker, Web, and enabled-MCP service
environment. The executor and image guard share one pure environment validator;
API and Worker additionally invoke their authoritative startup configuration
parsers, and enabled MCP tokens are checked against every other deployment
runtime secret for reuse. PostgreSQL CLI values and the post-migration
service/image set are validated and frozen in the same preflight, so migration
30 is never the first point where a deterministic local configuration error is
discovered.

After topology discovery, one complete rendered Compose JSON document becomes
the only Compose input for guard, barrier, migration, recreation, readiness,
ledger, and freshness commands. The source YAML and environment file are never
reread. The executor stores the snapshot in an owner-only POSIX directory
(`0700`) and file (`0600`), removes it in a `finally` path, and on the next run
removes only dead-PID residual directories owned by the current user with the
expected private mode. Every dollar sign in every rendered JSON string is
encoded as a Compose literal before persistence. An immediate second Compose
render must be deeply equal to the first render after, at most, the proven
reversible `$$` to `$` normalization used for Compose v5.3.1 `config` output.
This covers secrets, URLs, commands, labels, paths, and healthchecks, including
existing `$$` and consecutive dollar signs. Native Windows fails closed because
that owner check is not available.

The formal soak must use the tracked contiguous
`pnpm test:soak:retention:formal` entrypoint, not an untracked operator script
or a separately paused provision/run sequence. Run it under WSL/Linux; native
Windows is rejected because this workflow cannot verify an owner-only NTFS ACL.
Provisioning first writes a private schema-v1 recovery checkpoint with stable
idempotency keys and the human authentication subject, then atomically replaces
it with schema-v2 final state containing only the installation token and
resource IDs. Session tokens rotate in memory. A partial checkpoint must be
replayed within the 15-minute encrypted-auth replay window. After replay expiry
or human-session invalidation, completely reset the disposable stack before
removing the checkpoint. Never reuse a Session concurrently: one dedicated
Session has exactly one soak runner, and a runner restart creates a new report
directory and baseline rather than appending old samples.
The combined entrypoint guards that one-to-one Session/state path with
nonblocking `flock` on inherited FD 3. The verifier never calls `flock` on that
FD. It checks the expected path twice with `lstat` (regular, non-symlink,
current UID, mode `0600`), matches inherited-FD `fstat` device/inode, requires
that FD's `/proc/self/fdinfo` to report a whole-file advisory write `FLOCK`, and
runs an independent non-inheriting path probe that must observe contention with
exit code 73. Both `fdinfoLockMatched` and
`independentContentionObserved` must be true for `formalLockVerified`.
An unlocked expected FD, an unrelated FD on the same path, another holder,
wrong inode/owner/mode, a symlink, or unavailable fdinfo fails closed. The standalone
`pnpm provision:soak:retention` command exists only for checkpoint recovery and
diagnosis; completing it is not a safe pause point. The contiguous runner
rejects a schema-v2 Session that is stale, non-executing, non-healthy, or more
than 45 seconds past its last heartbeat before it attempts any refresh or
heartbeat. Reset the disposable state/session and provision a new one.

Formal evidence executable gates require a clean checkout at the exact expected
40-character SHA; explicit API, Worker, PostgreSQL, Redis, and MinIO role
mappings; running containers backed by immutable image digests; matching API
and Worker Compose service labels in one Compose project; API/PostgreSQL/Redis
published ports matching their configured URLs; matching API and Worker OCI
revisions; and matching `/api/v1/info.buildSha`. Each stats sample checks the
full container IDs, and the ending container/image/API proof must deep-match the
initial proof. On startup the Worker generates an instance UUID bound to
`WORKMESH_BUILD_SHA`, atomically writes it to the owner-only
`/tmp/workmesh-worker-runtime-identity.json`, and publishes the same UUID/build
to `retention_job_state.worker_instance_id`/`worker_build_sha` with its
freshness heartbeat. An atomic identity/build replacement increments the
nonnegative, monotonic `worker_identity_conflict_count`; a later candidate write
does not reset that evidence. Formal collection reads the file by exact
inspected container ID and requires both initial and ending database
identity/build to match it and the ending conflict count to equal the initial
baseline. An external Worker refreshing the same database, a process/container
restart, or build/identity drift fails the gate even if the candidate identity
is later restored. Threshold
overrides may keep the defaults or lower maximums; looser formal thresholds are
rejected. An independent 15-second heartbeat pump shares a serialized
credential/request queue with activities. The maximum initial/steady
server-accepted gaps are 100/80 seconds, leaving at least 20 seconds below the
hard 120-second stale age. The report must pass observed-gap, pump, lock, and
provenance gates. Pump shutdown awaits any in-flight heartbeat and extends the
observed-gap proof through the report `endedAt`.
The ending Worker freshness observation is captured separately after the
ending database and provenance reads. It may be later than heartbeat
`endedAt`, which remains the soak duration and trailing-gap boundary.

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

The formal rehearsal selects a membership-complete exact, still-locked segment.
An explicit `WORKMESH_RETENTION_RESTORE_ALLOW_LEGACY=1` compatibility run may
read a `legacy_unindexed` pinned object but cannot satisfy the formal gate.
The rehearsal verifies HEAD Object Lock metadata; downloads and checks the gzip checksum and canonical snapshot
digest; restores records into a temporary schema in the separate target;
re-reads and verifies the restored digest; attempts deletion of the exact
locked object version and requires rejection; verifies readback again; and
removes the temporary schema. It also writes a second version under the same key
and proves restore still reads the originally pinned version. Its timestamped
report contains no object key,
Workspace ID, Session ID, or credentials.

The restart/contention gate defaults to a non-mutating dry run. Its executable
archive matrix must prove recovery after plan commit, successful PUT with lost
response, before and after the fenced uploaded-state transaction, before and
inside finalization, and after final commit. Every recovery keeps one segment,
one stable key, one immutable version, non-authoritative provisional coverage,
and atomic exact-membership/watermark publication:

```text
RUN_INTEGRATION=1
DATABASE_URL=postgres://.../workmesh_test_retention_acceptance
pnpm test:acceptance:retention
```

After reviewing the timestamped plan, run it against the isolated production
Compose acceptance stack with `-- --execute`. The executable gate never builds
or pushes images. It first runs the real restore/Object Lock rehearsal, then
restarts Redis, API, and Worker and waits for healthy state. It runs the
committed-claim/outbox recovery, dual-Worker fencing, stale-owner rejection,
protected-row, and pre-header/live `CURSOR_EXPIRED` integration gates and
writes a sanitized final report.

Undelivered or missing outbox proof keeps that event out of the archive and
blocks the pruning prefix at its cursor, but does not block later
cutoff-eligible delivered events from being archived exactly. Unknown events,
A2A references, Agent webhook references, and audit/recovery facts stay
physically present but may fall below the realtime floor after their exact
member is verified and floored. Delivered outbox cleanup requires that exact
floored member and never uses a segment cursor range. Do not delete protected
rows manually.

Each prune run first repairs a bounded set of historical online holes at or
below the existing floor. A repair requires the exact member, a verified or
pruned segment, pinned-version readback, matching per-event digest, the fixed
cutoff, delivered outbox proof, the ordinary-event allowlist, no protected
reference, and the current job fence in one transaction. It marks every
successfully rechecked member `floored_at`, deletes only eligible ordinary
events (with their outbox proof through the existing cascade), and records
`repairedBelowFloor` in the prune counters. It never moves the floor. Missing
objects, checksum/digest changes, or fence loss fail closed and leave the
online event, outbox proof, and member state unchanged.

Disable the switch and investigate any archive or checksum failure.

Agent Inbox audit facts are protected from generic cleanup and ordinary event
pruning. This includes `room_messages`, actor and exact-Session recipient rows,
response-resolution rows, `inbox_items`, and `inbox_item_receipts`, plus the
`room.message.*` and `inbox.item.*` events that describe them. A future policy
that deletes or redacts any of these facts requires an explicit retention
decision and migration; enabling the existing cleanup/prune switches does not
authorize it.

The complete recovery bundle restores archive objects and exact database
references. This status endpoint still does not provide archive download,
discovery, legal-hold, or archive-key rotation APIs.
