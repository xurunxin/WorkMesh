# Retention 24-hour soak

The formal retention soak is opt-in and never runs in normal CI. It is an
active acceptance gate, not a passive database monitor.

## Safety preflight

Use a disposable database whose name contains `test`. Start the real API,
Worker, PostgreSQL, Redis, and Object-Lock-enabled MinIO services. Create an
executing Agent Session dedicated to the soak. The Worker must have published
a fresh `archive_only` runtime state.

The formal entrypoint provisions a dedicated Workspace, Agent, delegation, and
executing Session and starts the harness immediately in the same process. Keep
its private state outside the evidence directory:

```text
WORKMESH_RETENTION_SOAK_API_URL=http://127.0.0.1:3001
WORKMESH_RETENTION_SOAK_PROVISION_MODE=clean_stack
WORKMESH_BOOTSTRAP_TOKEN=<isolated stack bootstrap token>
WORKMESH_RETENTION_SOAK_STATE_PATH=.tmp/retention-soak-state/session.json
```

`clean_stack` is only for a new, uninstalled isolated stack. For an already
installed isolated stack, use `existing_installation` and provide
`WORKMESH_RETENTION_SOAK_ADMIN_EMAIL` and
`WORKMESH_RETENTION_SOAK_ADMIN_PASSWORD` instead of a bootstrap token.

Run provisioning under WSL or Linux. Native Windows fails closed before file
creation or network access because POSIX mode bits do not prove an owner-only
NTFS ACL, and this harness does not implement or verify such an ACL.

Before its first remote mutation, the helper creates a mode-`0600` schema-v1
checkpoint containing generated/provided admin login material, the current
human session, and stable per-operation idempotency keys. On response loss,
rerun the same mode, state path, API URL, and required credentials within the
15-minute encrypted-auth replay window. The helper reuses the same human
session and operation keys, so installation, Agent registration, and token
exchange replay without duplicate resources. It never deletes a checkpoint
after partial remote success.

After provisioning completes, a same-directory atomic rename replaces the
checkpoint with schema-v2 final state containing only the Session ID,
installation token, and non-secret resource IDs. The final state never contains
the admin password, cookie/CSRF, exchange token, or short-lived Session token.
The dedicated Agent, Team grant, and delegation receive only the verified
`work:write` capability required by heartbeat and activity mutations.
If replay has expired, the checkpoint human session is invalid, or the
checkpoint context mismatches, fail closed: completely reset the disposable
stack first, then remove its checkpoint and provision again. Never delete only
the checkpoint while keeping a partially provisioned stack. Treat both
checkpoint and final state as credentials and keep them outside evidence.
The standalone `pnpm provision:soak:retention` command is only a checkpoint
recovery/diagnostic tool. It is not a formal-run entrypoint and its success is
not a safe pause point: operator delay can make the Session stale. A schema-v2
state whose Session is no longer `executing` and `healthy`, or whose last
heartbeat is more than 45 seconds old, is rejected before token refresh or
heartbeat. Completely reset that disposable state/session and provision a new
one; never revive it for formal evidence.

Set all of the following:

```text
RUN_INTEGRATION=1
WORKMESH_RETENTION_SOAK=1
WORKMESH_RETENTION_SOAK_HOURS=24
WORKMESH_RETENTION_ARCHIVE_ENABLED=true
WORKMESH_RETENTION_CLEANUP_ENABLED=false
WORKMESH_EVENT_PRUNE_ENABLED=false
DATABASE_URL=postgres://.../workmesh_test_retention
REDIS_URL=redis://...
WORKMESH_RETENTION_SOAK_API_URL=http://127.0.0.1:3001
WORKMESH_RETENTION_SOAK_SAMPLE_SECONDS=30
WORKMESH_RETENTION_SOAK_CONTAINERS=<api-container>,<worker-container>,<postgres-container>,<redis-container>,<minio-container>
```

Exactly five unique container names are required. Before the run, record
`git rev-parse HEAD`, the immutable image reference/digest and
`org.opencontainers.image.revision` for every application container, and the
IDs/images for the API, Worker, PostgreSQL, Redis, and MinIO containers. The
source SHA and application image revisions must be the exact candidate under
test; do not infer them from a branch name or mutable tag.

Run exactly one harness process per dedicated Session, guarded by a nonblocking
`flock` on the private state path dedicated one-to-one to that Session:

```text
install -d -m 700 "$(dirname "$WORKMESH_RETENTION_SOAK_STATE_PATH")"
exec 9>"${WORKMESH_RETENTION_SOAK_STATE_PATH}.lock"
flock -n 9
pnpm test:soak:retention:formal
```

If `flock -n` fails, do not start another process. A new formal run requires a
new disposable Session/state path, timestamped report directory, and baseline.
The harness creates `samples.jsonl` exclusively and refuses to append to an
earlier run.

The harness has fail-closed defaults for every release threshold. A formal run
may use these defaults or lower maxima for stricter limits; preflight rejects
any relaxed value. The report records the effective values:

```text
WORKMESH_RETENTION_SOAK_MAX_ARCHIVE_BACKLOG=5
WORKMESH_RETENTION_SOAK_MAX_ARCHIVE_LATENCY_MS=300000
WORKMESH_RETENTION_SOAK_MAX_OUTBOX_PENDING=5
WORKMESH_RETENTION_SOAK_MAX_OUTBOX_LAG_MS=60000
WORKMESH_RETENTION_SOAK_MAX_CPU_PERCENT=85
WORKMESH_RETENTION_SOAK_MAX_MEMORY_BYTES=1073741824
WORKMESH_RETENTION_SOAK_MAX_DATABASE_CONNECTIONS=50
WORKMESH_RETENTION_SOAK_MAX_REDIS_CONNECTIONS=50
WORKMESH_REALTIME_REDIS_MAXLEN=100000
WORKMESH_RETENTION_SOAK_MAX_HEARTBEAT_LATENCY_MS=1000
WORKMESH_RETENTION_SOAK_MAX_ACTIVITY_LATENCY_MS=2000
WORKMESH_RETENTION_SOAK_MAX_DATABASE_ROWS_SLOPE_PER_HOUR=24
WORKMESH_RETENTION_SOAK_MAX_DATABASE_BYTES_SLOPE_PER_HOUR=16777216
WORKMESH_RETENTION_SOAK_MAX_TABLE_BYTES_SLOPE_PER_HOUR=8388608
WORKMESH_RETENTION_SOAK_MAX_DEAD_TUPLES_SLOPE_PER_HOUR=100
WORKMESH_RETENTION_SOAK_MAX_REDIS_LENGTH_SLOPE_PER_HOUR=24
WORKMESH_RETENTION_SOAK_MAX_CONTAINER_MEMORY_SLOPE_BYTES_PER_HOUR=16777216
```

The duration is deliberately fixed at exactly 24 hours. A shorter run cannot
produce a passing formal report. Formal sample cadence defaults to and is
capped at 30 seconds. A complete proactive refresh operation—including response
body reads, all attempts, and retry sleeps—has an absolute 45-second budget.
The maximum planned heartbeat-arrival gap is therefore 75 seconds against the
server's hard 120-second stale age, preserving a 45-second safety margin
independently of token expiry.

## What the gate exercises

Each sample sends a real HTTP heartbeat. Every configured number of samples it
also appends a real Agent activity, waits until the real Worker delivers its
outbox row, and backdates only that newly generated event in the isolated
acceptance database so the running retention Worker must archive it.

Before the baseline and first heartbeat, the harness refreshes a Session token
using the installation token. It refreshes again approximately three minutes
before the server-provided `expiresAt`. Refreshes are sequential and
single-flight. One random idempotency key is reused for a logical refresh's
bounded retry sequence; a later rotation gets a new key. Only network failures,
HTTP 429, and HTTP 5xx are retried, for at most three attempts. `Retry-After` is
capped at 60 seconds and total retry delay at 120 seconds, but the absolute
45-second operation budget dominates both: a request or sleep that would
consume the remaining liveness budget fails before another attempt. A workload
HTTP 401 is terminal and never triggers a reactive refresh. Rotated Session
tokens stay in memory and never enter state, samples, reports, or logs.

Refresh and workload requests have bounded request timeouts. A delayed event
loop that is not scheduled before expiry is fail-closed: the manager increments
`expiredBeforeRefreshCount`, refreshes so evidence collection can continue, and
the formal report still fails. The same counter increments if a proactive
refresh completes only after the old token expires. A stall after the
pre-request check can instead produce terminal workload 401; it is never hidden
by reactive refresh.

The harness writes timestamped `samples.jsonl` and `report.json` artifacts. It
captures a baseline before sending workload, tags every subsequent sample,
and records archive states and latency, backlog, retention floor, outbox
pending count and lag, exact Redis stream length, PostgreSQL rows/database
size/domain-event table size/dead tuples/connections, Redis connections,
heartbeat/activity latency, and Docker CPU/RSS for every configured container.
It fails on:

- missing samples or a stale/non-`archive_only` Worker;
- a run shorter than 24 hours;
- no same-run verified-segment or verified-row delta;
- any activity event generated by this invocation that is not covered by a
  verified archive segment;
- missing, duplicate, or malformed numeric cursor evidence for this
  invocation's generated activity events;
- archive or outbox backlog that exceeds its threshold or does not converge
  back to the captured baseline;
- any failed segment, any prune, or floor movement;
- no active heartbeat/activity workload;
- fewer than two successful Session-token refreshes;
- any token discovered expired before refresh;
- a configured liveness budget at or above the hard stale age, or successful
  refresh latency above the 45-second operation budget;
- Redis stream growth above the exact configured cap;
- CPU, RSS, PostgreSQL/Redis connections, heartbeat/activity/archive latency,
  or outbox lag above the recorded threshold;
- database row/byte, domain-event table byte, dead-tuple, Redis length, or
  per-container RSS growth above the recorded per-hour threshold. Growth is
  measured from the captured baseline to every sample, so a mid-run spike that
  later recovers cannot be hidden by a low first-to-last slope.

The schema-version-3 final report contains the effective thresholds and the
120/30/45/75/45-second stale/sample/refresh/gap/margin liveness proof, baseline
counters, deltas,
the sorted numeric cursors generated by this invocation, maxima, end-to-end
slopes, maximum baseline-to-sample growth rates, end-state backlog, and each
boolean gate. It records only the successful refresh count and maximum refresh
latency plus the expired-before-refresh count.
`checks.tokenRotationExercised` requires at least two refreshes and
`checks.tokenNeverExpiredBeforeRefresh` requires a zero expiry count,
`checks.heartbeatLivenessBudget` proves the planned gap is below stale, and
`checks.tokenRefreshLatencyWithinBudget` bounds observed successful refreshes.
Reports do not contain credentials, object keys, Workspace IDs,
Session IDs, or payloads. A historical verified segment or an earlier report
cannot satisfy the current invocation.

## Dry run

`pnpm test:soak:retention -- --dry-run` validates the complete harness
preflight (without provisioning) and
writes a `status: "dry_run"` plan without connecting to the services. It never
claims or substitutes for a 24-hour result.

The soak is one release-gate component. Run the separate restore rehearsal and
restart/contention acceptance harness for Object Lock readback, early-delete
rejection, isolated restore, reconnect/`CURSOR_EXPIRED`, and restart recovery
evidence.
