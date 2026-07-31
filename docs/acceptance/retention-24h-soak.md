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
WORKMESH_RETENTION_SOAK_EXPECTED_SHA=<clean lowercase 40-character Git SHA>
WORKMESH_RETENTION_SOAK_API_CONTAINER=<api-container>
WORKMESH_RETENTION_SOAK_WORKER_CONTAINER=<worker-container>
WORKMESH_RETENTION_SOAK_POSTGRES_CONTAINER=<postgres-container>
WORKMESH_RETENTION_SOAK_REDIS_CONTAINER=<redis-container>
WORKMESH_RETENTION_SOAK_MINIO_CONTAINER=<minio-container>
```

Exactly those five roles and five unique container names are required. The
harness rejects a dirty checkout or `HEAD` different from the expected SHA,
non-running/missing containers, images without immutable repo digests or OCI
revisions, API or Worker revisions that differ from that SHA, and
`/api/v1/info.buildSha` that differs from both. It records the safe role to
container ID/image ID/digest/revision mapping. Each container must carry the
matching `com.docker.compose.service` label, all five must share one
`com.docker.compose.project`, and the API, PostgreSQL, and Redis published host
ports must match the configured URLs. Do not infer provenance from a branch
name, container name, or mutable tag.

Run exactly one harness process per dedicated Session:

```text
pnpm test:soak:retention:formal
```

The combined entrypoint creates a mode-`0600` Session-specific lock file, passes
it as inherited FD 3, acquires nonblocking `flock` on that FD, and preserves the
same open-file-description across `exec`. The runner never locks the inherited
FD itself. It proves the inherited FD already carries a whole-file advisory
write `FLOCK` in `/proc/self/fdinfo`, matches its `fstat` device/inode to two
owner/mode-`0600` non-symlink `lstat` checks of the expected path, and runs a
separate non-inheriting `flock -n -x -E 73 <path> -c :` probe that must exit 73.
Both `fdinfoLockMatched` and `independentContentionObserved` are recorded.
An unlocked or unrelated FD cannot pass merely because another process holds
the path lock. Lock scope is recorded as a one-way Session fingerprint,
never a Session ID. If lock
acquisition fails, do not start another process. A new formal run requires a new
disposable Session/state path, timestamped report directory, and baseline. The
harness creates `samples.jsonl` exclusively and refuses to append to an earlier
run.

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
An independent heartbeat pump runs every 15 seconds. Session-token refresh and
all authorized workload requests share one serial queue, so refresh cannot
revoke a token used by an in-flight request. With a 10-second workload-request
budget, the bounded initial gap is 45 seconds of admitted Session age plus
45 seconds of refresh plus 10 seconds for heartbeat, or 100 seconds. The
steady-state bound is 15 + 10 + 45 + 10, or 80 seconds. The larger 100-second
bound remains 20 seconds below the server's hard 120-second stale age.

The heartbeat pump also starts before the initial Workspace-specific Worker
runtime proof. A clean installation can create its acceptance Workspace after
the Worker process starts, so the harness waits up to 90 seconds for the first
complete `worker_runtime` row while heartbeats continue. Only a wholly absent
runtime identity is retryable. A partial row, wrong Worker instance/build,
identity conflict, non-archive mode, or stale completed row fails immediately.

## What the gate exercises

The independent pump sends a real HTTP heartbeat immediately after initial
refresh and before the baseline, then every 15 seconds regardless of sampling,
activity, or outbox polling. It parses the server-returned
`last_heartbeat_at`, records the authoritative first/last acceptance timestamps
and maximum observed gap, and fails closed on a request failure, invalid
timestamp, or gap above 100 seconds. Stopping aborts only a pending interval
sleep: it awaits any already-started heartbeat and retains its success or
failure. The final interval from the last server acceptance through the recorded
`endedAt` is also included in the gate. Every configured number of samples the main
path appends a real Agent activity, waits until the real Worker delivers its
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
Refresh, heartbeat, and activity calls are serialized around both token
selection and the complete request. The 10-second activity request can delay a
due heartbeat, but 30-second asynchronous outbox polling and sampling do not
hold that queue.

Refresh and workload requests have bounded request timeouts. A delayed event
loop that is not scheduled before expiry is fail-closed: the manager increments
`expiredBeforeRefreshCount`, refreshes so evidence collection can continue, and
the formal report still fails. The same counter increments if a proactive
refresh completes only after the old token expires. A stall after the
pre-request check can instead produce terminal workload 401; it is never hidden
by reactive refresh.

The harness writes timestamped `samples.jsonl` and `report.json` artifacts. It
captures a baseline before sending workload, tags every subsequent sample,
and records exact-membership archive states and latency, backlog, retention floor, outbox
pending count and lag, exact Redis stream length, PostgreSQL rows/database
size/domain-event table size/dead tuples/connections, Redis connections,
heartbeat/activity latency, and Docker CPU/RSS for every configured container.
`docker stats` runs asynchronously with a five-second process timeout; it cannot
block the Node.js event loop or the heartbeat pump. Every invocation uses
`--no-trunc` and verifies each returned container ID against the initial role
proof before accepting the sample.
It fails on:

- missing samples or a stale/non-`archive_only` Worker;
- a run shorter than 24 hours;
- no same-run verified-segment or verified-row delta;
- any activity event generated by this invocation that lacks one exact member
  in a verified or pruned exact archive segment; a cursor envelope alone fails;
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
- heartbeat-pump failure or an authoritative observed heartbeat gap above
  100 seconds;
- no held Session-scoped lock, dirty/wrong source SHA, missing immutable image
  digest, wrong Compose project/service role, URL-to-published-port mismatch,
  wrong API/Worker OCI revision, or mismatched API build SHA;
- stale/non-`archive_only` durable Worker evidence, any per-sample container ID
  replacement, or any initial-to-end container/image/API provenance drift;
- Redis stream growth above the exact configured cap;
- CPU, RSS, PostgreSQL/Redis connections, heartbeat/activity/archive latency,
  or outbox lag above the recorded threshold;
- database row/byte, domain-event table byte, dead-tuple, Redis length, or
  per-container RSS growth above the recorded per-hour threshold. Growth is
  measured from the captured baseline to every sample, so a mid-run spike that
  later recovers cannot be hidden by a low first-to-last slope.

The schema-version-3 final report contains the effective thresholds and the
120/15/45/10/100/20-second stale/pump/refresh/request/gap/margin proof, baseline
counters, deltas,
the sorted numeric cursors generated by this invocation, maxima, end-to-end
slopes, maximum baseline-to-sample growth rates, end-state backlog, and each
boolean gate. It records only the successful refresh count and maximum refresh
latency plus the expired-before-refresh count.
`checks.tokenRotationExercised` requires at least two refreshes and
`checks.tokenNeverExpiredBeforeRefresh` requires a zero expiry count,
`checks.heartbeatLivenessBudget` proves the planned gap is below stale, and
`checks.tokenRefreshLatencyWithinBudget` bounds observed successful refreshes.
`checks.heartbeatPumpSucceeded`, `checks.observedHeartbeatGapBounded`,
`checks.formalLockVerified`, and `checks.provenanceVerified` require the live
runtime evidence. The report includes safe lock/provenance proof and
authoritative heartbeat timestamps/gap through `endedAt`. Live reports contain
initial and ending provenance snapshots, their deep-match result, and initial
and ending durable Worker freshness evidence. The Worker generates one startup
UUID bound to `WORKMESH_BUILD_SHA`, atomically writes the same identity to the
owner-only `/tmp/workmesh-worker-runtime-identity.json` file, and publishes its
UUID/build into authoritative `retention_job_state.worker_instance_id` and
`worker_build_sha` alongside every `worker_seen_at`. If a non-null identity/build
replaces a different non-null identity/build, the same atomic upsert increments
the monotonic `worker_identity_conflict_count`; later writes cannot reset it.
The harness reads the file with `docker exec` against the exact inspected
container ID, never the mutable name, and requires the initial and ending
database UUID/build to match the corresponding exact-container identity and the
ending conflict count to equal its initial baseline. A different Worker
refreshing the same database therefore remains detectable even if the candidate
subsequently writes its identity back.
Reports do not contain credentials, object keys, Workspace IDs,
Session IDs, or payloads. A historical verified segment or an earlier report
cannot satisfy the current invocation.
The ending Worker freshness timestamp is captured after the ending database
read and provenance collection. Heartbeat `endedAt` remains the separate
duration and trailing-gap observation.

## Dry run

`pnpm test:soak:retention:formal -- --dry-run` uses a disposable Session/state
path, acquires and independently verifies the real lock, and performs read-only
Git, container/image, and `/api/v1/info` provenance checks before writing a
sanitized `status: "dry_run"` plan, including Compose identities and URL host
port bindings. It does not connect to PostgreSQL/Redis or
collect samples, but provisioning still mutates the disposable stack. Do not
reuse its Session for a live run. Direct `pnpm test:soak:retention` invocation
fails without the already-held formal lock. A dry run never substitutes for a
24-hour result.

The soak is one release-gate component. Run the separate restore rehearsal and
restart/contention acceptance harness for Object Lock readback, early-delete
rejection, isolated restore, reconnect/`CURSOR_EXPIRED`, and restart recovery
evidence. The restart gate proves recovery with the recovered event's exact
Workspace, event ID, and cursor membership in a trusted exact segment; a sparse
segment envelope such as cursors 10 and 30 never proves cursor 20.
The archive crash matrix also injects failure after durable planning, successful
PUT response loss, before/after uploaded-state commit, before/mid/after final
commit, and post-PUT lease reclaim. It must show one segment/key/version, no
untracked immutable object, no stale-fence publication, provisional members
providing zero coverage, and exact membership plus watermark committing
atomically.

Before enabling destructive pruning, the Worker retention integration gate must
also pass the historical below-floor repair matrix: no exact member means no
deletion; missing/corrupt object bytes, a per-record digest mismatch, or a
changed fence fails closed; an eligible exact member is deleted and marked
once without lowering or advancing the floor; outbox proof follows the existing
safe cascade/cleanup rules; replay is idempotent; and an injected transaction
failure rolls back event, outbox, and member changes.
