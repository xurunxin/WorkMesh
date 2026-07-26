# Loop Admission, Overlap, and Retry

Status

Accepted for Stage 4.

Context

A Loop repeatedly starts Agent work from a pinned template. Duplicate schedules, concurrent workers, stale authorization, or exhausted budgets must not create overlapping or unauthorized Sessions. A Loop run has no requirement to fabricate a Work Item.

Decision

Loop admission is one PostgreSQL transaction. It locks the Loop, verifies active state, live Agent and Team capability grants, template version, overlap policy, and the hard budget. An accepted occurrence atomically creates one `automation_run`, one budget reservation, a scoped delegation, one real `agent_session`, domain events, and outbox rows. The Session references `automation_run_id`; it may omit `work_item_id`.

A partial unique index fences active overlap only for runs that copied `no_overlap=true` into their immutable admission record; `no_overlap=false` Loops may have multiple active runs. Another unique index permits one Session per automation run. Duplicate occurrence keys return the existing durable run. Reconciliation projects the terminal Session result back to the run. Failures use the bounded retry/DLQ policy from ADR 0023 and create notifications through the same preference, mute, priority, digest, and channel-admission path as interactive notifications.

Alternatives

Checking overlap only in application memory was rejected as racy. Creating a synthetic Work Item per run was rejected because it pollutes issue planning and weakens the Session scope model. Reserving budget after Session creation was rejected because it can overspend concurrently.

Consequences

Loop execution is restart-safe and auditable. Admission may fail closed when authorization or budget cannot be proven. Reservations are intentionally conservative until terminal reconciliation.

Migration

Migration `0018_stage4_loops_health_a2a.sql` adds Loops, reservations, and run/Session references. Migration `0020_stage4_review_hardening.sql` replaces the unconditional overlap index with the conditional admission snapshot and index.

Spec changes

Loop create, manual run, pause/disable, list, and automation-run inspection endpoints are documented in `OPENAPI.yaml`.
