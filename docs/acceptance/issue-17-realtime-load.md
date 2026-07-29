# Issue 17 realtime load and recovery acceptance

This harness is an explicit, destructive-to-its-own-resources acceptance run.
It is not part of `pnpm test`, `pnpm test:integration`, or the normal CI
workflow.

## Run modes

Run the formal acceptance only on a dedicated Linux host with at least 4
vCPUs, 8 GiB RAM, and a soft open-file limit of 8192:

```bash
ulimit -n 8192
pnpm test:load:realtime
```

The runner refuses a formal run when any of those requirements is absent. A
small nonformal check is available for development and Docker Desktop:

```bash
pnpm test:load:realtime -- --diagnostic
```

Diagnostic sizes can be reduced or raised without changing formal thresholds:

```bash
pnpm test:load:realtime -- --diagnostic \
  --clients=20 \
  --hold-seconds=2 \
  --backpressure-mib=1 \
  --redis-outage-seconds=6
```

### Evidence-only continuation after a failed Phase C

When a diagnostic run needs to collect Phase D evidence after Phase C has
already failed, use the explicit evidence-only waiver:

```bash
pnpm test:load:realtime -- --diagnostic \
  --diagnostic-waive-phase-c-failure-for-evidence-only \
  --clients=1000 \
  --ramp-per-second=50 \
  --hold-seconds=2 \
  --backpressure-mib=32 \
  --redis-outage-seconds=60 \
  --redis-outage-events=100
```

This flag does not waive acceptance. Phase C still runs and retains its
original error and partial metrics. After failure, the harness destroys the raw
socket, attempts to close every existing SSE client, marks Phase C as
`failed_incomplete_evidence_only`, and only then builds the Phase D client set.
The JSON and Markdown reports remain failed and the process exits nonzero even
when Phase D passes. The flag is rejected unless `--diagnostic` is also present
and must never be used for a formal acceptance result. It is a one-time
WorkMesh v1 GA evidence-continuation mechanism, not a reusable success path for
future acceptance runs.

The harness creates a unique Compose project, uses dynamically allocated
loopback ports, creates a fresh PostgreSQL database, and always runs
`docker compose down -v --remove-orphans` in `finally`. Set
`REALTIME_LOAD_KEEP=1` only while investigating a failed run. The retained
Compose project name is recorded in the report and must then be removed
manually.

Reports are written below `.tmp/realtime-load/<timestamp>/` as both JSON and
Markdown. Use `--output=<path>` to select another output directory. Every
threshold failure makes the process exit nonzero, while still writing a
partial report and the last 200 API and Redis log lines. Worker evidence is
captured separately before teardown: an allowlisted inspect snapshot, bounded
log category counts and timestamps without raw log text, allowlisted lifecycle
events capped at 100 entries, and an outbox status/attempt summary. Full container inspection,
environment variables, event payloads, and raw Worker logs are never retained.
Formal platform preflight failures and exceptions inside a phase also produce
both reports. Each failed phase retains its elapsed time, completed assertions,
partial metrics, and contextual error.

HTTP requests, SSE response headers and error bodies, raw response headers,
raw saturation and close waits, client close waits, Docker commands, and image
builds have explicit deadlines. Defaults can be adjusted with
`--request-timeout-ms`, `--sse-open-timeout-ms`,
`--raw-header-timeout-ms`, `--raw-saturation-timeout-ms`,
`--redis-recovery-timeout-ms`, `--compose-timeout-seconds`, and
`--compose-build-timeout-seconds`. Deadline errors identify the phase,
endpoint or Compose project, operation, and timeout.

## Formal workload and thresholds

The runner records the Git SHA, deterministic seed, platform and hardware,
container image IDs/digests, all parameters, PostgreSQL statistics, Docker CPU
and RSS samples, latency p50/p95/p99, missing/duplicate/out-of-order counts,
cursor lag, and the result of every threshold.

### Phase A — capacity and fan-out

- Ramp 1000 authenticated SSE clients to API A at 50 clients/second.
- Hold for 60 seconds with zero unexpected closes.
- Require the 1001st client to receive structured HTTP 503
  `REALTIME_CAPACITY_EXCEEDED` and `Retry-After: 1`.
- Close one client and require replacement admission within two seconds.
- Reset `pg_stat_statements` after ramp-up and prove that reconciliation calls
  are bounded by the one API instance subscribed to the workspace, rather than
  by client count.
- Capture API CPU and RSS with `docker stats`.

### Phase B — deterministic reconnect and replay

- Keep 500 clients on API A and 500 on API B.
- For 10 deterministic rounds, abort 200 selected clients, generate 10 real
  `work_item.created` events, apply seeded 0–250 ms jitter, then reconnect each
  client to its prior endpoint using its exact decimal `Last-Event-ID`.
- Require zero missing deliveries, zero lagging clients, zero out-of-order
  deliveries, and zero non-capacity 5xx responses.
- Report reconnect and event-delivery p50/p95/p99 plus duplicate counts.

### Phase C — bounded slow-client backpressure

- Close 999 ordinary clients, retain one, and open one raw `net.Socket` client.
  The raw client reads and validates HTTP response headers and then pauses.
- Generate real mutations whose durable event payload is at least 32 MiB and
  no more than the configured 64 MiB upper diagnostic envelope.
- Reject an error, end, or close before response headers, and first prove that
  the paused socket remains open. Record `pauseAt`, bytes already read,
  `readableLength`, and `readableHighWaterMark`.
- Wait for all corresponding domain events and outbox rows to be durably
  delivered. Separately require the paused socket to reach
  `readableLength >= readableHighWaterMark`; an early close or failure to reach
  that threshold is a hard failure.
- With `REALTIME_BACKPRESSURE_TIMEOUT_MS=5000`, start the seven-second close
  clock only at the monotonic `thresholdReachedAt` timestamp. Record `closeAt`,
  graceful end/error evidence, and elapsed time from threshold. Then require a
  replacement connection within two seconds.
- Record generated durable bytes, response headers, saturation evidence,
  timings, and API RSS before, at peak, and after recovery. If kernel or proxy
  buffering prevents saturation or backpressure, the harness fails with those
  diagnostics; it never treats an arbitrary early disconnect as success.

### Phase D — Redis fallback and API failover

- Re-establish 500 clients on each API instance.
- Stop the Redis container, pace 100 real events over 60 seconds, and require
  zero missing deliveries and zero cursor lag through PostgreSQL fallback.
- Record the Worker container ID, running state, restart count, and OOM state
  before the outage and sample those allowlisted fields throughout outage and
  recovery. The Worker service has `restart: "no"` so continuity cannot be
  hidden by a Compose restart policy. Require the same container to remain
  running with restart count zero, no OOM, no sampling gaps, and no
  `die`/`restart`/`oom`/`kill`/`stop`/`destroy` lifecycle event.
- Use `pg_stat_statements` to require fallback reconciliation calls to remain
  bounded by two subscribed API instances.
- Restart the same Redis container and endpoint, wait for that exact Compose
  service to be healthy, and require `redis-cli PING` to return `PONG`.
- Without changing outbox rows or retry timestamps, wait for every outage event
  to drain naturally to `delivered` with no remaining
  `pending`/`delivering`/`dead` row, then publish a post-recovery event and
  require its outbox row to be delivered as well.
- Poll `CLIENT LIST TYPE normal` until at least two clients are actively
  blocked in `cmd=xread`. These are the two API Redis-stream wake sources; the
  report retains their non-secret client fields. Only then reset PostgreSQL
  statement statistics, publish recovery events, and record recovery latency
  and reconciliation-query evidence.
- Stop API A and reconnect its 500 clients from their exact cursors to API B.
  Require API B to reach 1000 clients, reject client 1001 with the structured
  capacity response, and deliver final events without loss.

The Redis step validates application fallback while a single Redis endpoint is
unavailable and recovery after that same endpoint returns. It is explicitly
not Redis Sentinel or Redis Cluster failover validation.

## Determinism and cursor safety

The default seed is `17017`; override it with `--seed=<positive-integer>`.
The parser and client unit tests cover arbitrary CRLF/LF chunk boundaries,
live chunked delivery, exact decimal `Last-Event-ID` values beyond
`Number.MAX_SAFE_INTEGER`, duplicate and out-of-order classification, and raw
HTTP header validation. Durable cursors are never coerced through JavaScript
`Number`; comparisons use `BigInt` only after canonical decimal validation.

## Why this is not a standard hosted CI job

The formal run needs 1000 long-lived sockets, a raised file-descriptor limit,
two built API images, a dedicated PostgreSQL/Redis stack, a 60-second steady
hold, a 60-second Redis outage, and at least 32 MiB of intentionally
backpressured SSE data. Standard shared runners do not provide a stable enough
resource envelope for those thresholds. Run it on a labeled, isolated Linux
acceptance runner and archive `report.json` and `report.md` as build artifacts.
