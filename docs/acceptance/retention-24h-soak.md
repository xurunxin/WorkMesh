# Retention 24-hour soak

The formal retention soak is opt-in and never runs in normal CI. It is an
active acceptance gate, not a passive database monitor.

## Safety preflight

Use a disposable database whose name contains `test`. Start the real API,
Worker, PostgreSQL, Redis, and Object-Lock-enabled MinIO services. Create an
executing Agent Session dedicated to the soak. The Worker must have published
a fresh `archive_only` runtime state.

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
WORKMESH_RETENTION_SOAK_SESSION_ID=<dedicated executing session UUID>
WORKMESH_RETENTION_SOAK_SESSION_TOKEN=<dedicated session token>
WORKMESH_RETENTION_SOAK_CONTAINERS=<api-container>,<worker-container>,<postgres-container>,<redis-container>,<minio-container>
```

Then run:

```text
pnpm test:soak:retention
```

The duration is deliberately fixed at exactly 24 hours. A shorter run cannot
produce a passing formal report.

## What the gate exercises

Each sample sends a real HTTP heartbeat. Every configured number of samples it
also appends a real Agent activity, waits until the real Worker delivers its
outbox row, and backdates only that newly generated event in the isolated
acceptance database so the running retention Worker must archive it.

The harness writes timestamped `samples.jsonl` and `report.json` artifacts. It
records archive states and latency, backlog, retention floor, exact Redis
stream length, PostgreSQL rows/size/connections, Redis connections,
heartbeat/activity latency, and Docker CPU/memory for every configured
container. It fails on:

- missing samples or a stale/non-`archive_only` Worker;
- no verified archives, any failed segment, any prune, or floor movement;
- no active heartbeat/activity workload;
- Redis stream growth above the exact configured cap.

Reports use fixed counters only. They do not contain credentials, object keys,
Workspace IDs, Session IDs, or payloads.

## Dry run

`pnpm test:soak:retention -- --dry-run` validates the complete preflight and
writes a `status: "dry_run"` plan without connecting to the services. It never
claims or substitutes for a 24-hour result.

The soak is one release-gate component. Run the separate restore rehearsal and
restart/contention acceptance harness for Object Lock readback, early-delete
rejection, isolated restore, reconnect/`CURSOR_EXPIRED`, and restart recovery
evidence.
