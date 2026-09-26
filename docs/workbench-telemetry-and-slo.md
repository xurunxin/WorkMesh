# Workbench Turn/Attempt telemetry and SLO baseline (W17)

Status: frozen baseline, 2026-09-26. Owner: WM-WEBPI W17.

This document freezes the measurable service-level objectives for the Pi agent
workbench and records how each signal is derived. Every number is derived from
durable `workbench_turns` / `workbench_runner_attempts` columns, so any operator
can reproduce the baseline with a SQL query — no separate metrics store is
required, and no signal depends on in-memory state.

## 1. Source of truth

| Column | Table | Meaning |
| --- | --- | --- |
| `queued_at` | `workbench_turns` | Turn admitted by the Human; queue clock starts |
| `dispatch_requested_at` | `workbench_turns` | Outbox row committed; wake hint requested |
| `started_at` | `workbench_turns` | Runner claimed and started execution |
| `settled_at` | `workbench_turns` | Terminal outcome recorded (settled/failed/canceled/stopped) |
| `started_at`, `settled_at` | `workbench_runner_attempts` | Per-attempt execution window |
| `usage` (jsonb) | `workbench_runner_attempts` | Token accounting for the attempt |
| `error_code`, `stop_reason` | `workbench_turns` | Why a Turn did not settle |

The derived signals live in `@workmesh/observability`
(`packages/observability/src/workbench-slo.ts`), which is pure and framework
independent so both the API process and offline analysis share one definition.

## 2. Derived signals

| Signal | Definition | Why it matters |
| --- | --- | --- |
| Queue wait | `started_at − queued_at` | Human-perceived admission delay |
| Dispatch lag | `dispatch_requested_at − queued_at` | Outbox/wake-hint latency |
| Run duration | `settled_at − started_at` | Model + tool execution time |
| Total duration | `settled_at − queued_at` | End-to-end Turn latency |
| Total tokens | `usage.totalTokens` | Cost/budget pressure per Turn |
| Error rate | `(terminal − settled) / terminal` | Failed/canceled/stopped share |

Two invariants keep the signals honest:

- A missing timestamp yields `null`, never `0`, so an incomplete Turn is not
  counted as an instantaneous one.
- A negative difference (writer clocks disagreeing) is clamped to `0` rather than
  reported as negative latency.

## 3. Frozen SLO thresholds

Encoded in `workbenchSloThresholds`:

| Metric | Threshold | Rationale |
| --- | --- | --- |
| `queue_wait_p95_ms` | 5 000 | A queued Turn should be claimed within one poll cycle of an idle worker |
| `dispatch_lag_p95_ms` | 2 000 | Outbox wake hint must beat the durable reconcile interval |
| `run_duration_p95_ms` | 120 000 | Bounds a single Turn against the documented execution budget |
| `error_rate` | 0.05 | Above 5% of terminal Turns failing is a regression, not noise |

`evaluateWorkbenchSlo` returns only the breached thresholds. Note that a set with
zero terminal Turns reports `errorRate = 0` by construction, so the error-rate
check is skipped rather than reported as healthy — an empty window proves nothing.

## 4. Emission

`emitTurnTelemetry` writes one structured record per settled Attempt, after the
settlement transaction commits:

```
{"level":"info","message":"Workbench turn telemetry","event":"workbench.turn.telemetry",
 "turnId":…,"conversationId":…,"attemptNo":…,"sessionId":…,"correlationId":…,
 "status":…,"outcome":…,"queueWaitMs":…,"dispatchLagMs":…,"runDurationMs":…,
 "totalDurationMs":…,"totalTokens":…,"errorCode":…}
```

Lineage carried: conversation, turn, attempt number, agent session, correlation
id. **Never carried**: prompt text, assistant content, tool arguments, model
chain-of-thought, or any secret material. Emission is wrapped so a failing log
sink can never change a settlement outcome or block a response.

## 5. Reproducing the baseline from durable rows

```sql
SELECT count(*) FILTER (WHERE status = 'settled') AS settled,
       count(*) FILTER (WHERE status IN ('settled','failed','canceled','stopped')) AS terminal,
       percentile_disc(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (started_at - queued_at)) * 1000) AS queue_wait_p50_ms,
       percentile_disc(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (started_at - queued_at)) * 1000) AS queue_wait_p95_ms,
       percentile_disc(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (settled_at - started_at)) * 1000) AS run_p95_ms
  FROM workbench_turns
 WHERE workspace_id = $1 AND queued_at >= $2;
```

The unit tests in `packages/observability/src/workbench-slo.test.ts` pin the
derivation rules (missing timestamp, clock skew, negative/infinite tokens,
terminal vs non-terminal, percentile ranking, threshold breaches, and the
no-content emission shape).

## 6. Known limitations

- Token totals come from the runner's settlement summary, so a Turn that crashes
  before settlement reports `null` tokens rather than a partial count.
- Latency percentiles are computed over the queried window; there is no rolling
  in-process histogram, so long-window baselines are read from SQL.
- The signals cover Turn/Attempt scheduling and execution. Per-tool-call timing
  is not derived here; the tool ledger records counts and sanitized input shapes
  (see W13), which is sufficient for the W17 objectives.
