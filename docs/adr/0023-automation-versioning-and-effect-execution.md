# Automation Versioning and Effect Execution

Status

Accepted for Stage 4.

Context

Rules may run from schedules or durable domain events. A retry, worker crash, duplicate delivery, or rule edit must not change what an admitted run means or repeat an already completed external effect. A dry-run must remain useful without mutating domain state or contacting external systems.

Decision

An `automation_rule` is mutable control state, while every rule definition is an immutable `automation_rule_version`. An occurrence is deduplicated by rule and occurrence key, and each admitted run pins the current version. The API and scheduler only admit durable occurrences/runs; workers execute the same application handlers used by interactive paths.

Every action has an ordered `automation_effect` checkpoint. For each run, workers may claim only the lowest ordinal whose predecessors have completed or been explicitly reconciled. A predecessor that is pending, claimed, waiting for retry, or dead-lettered blocks every later ordinal. Exhausting a predecessor dead-letters the run, and a terminal run is never eligible for another effect claim. Workers claim eligible effects with fresh fencing tokens, then re-check the Rule/Loop state, owner activity and Team membership, and any live Session, Delegation, Agent, Team grant, capability, resource scope, and approval immediately before each effect. Only the matching claimant may finalize a checkpoint. Database constraints reject effects for dry-runs.

An external request first commits an `automation_external_effect_intent` containing the stable effect key and request hash. The transport re-resolves and validates DNS at execution time, pins the validated address while preserving the HTTPS hostname/SNI, refuses redirects and private or mapped-private addresses, and bounds time and response bytes. A crash after the remote system succeeds but before acknowledgement moves the intent to `uncertain` on recovery; WorkMesh never repeats that effect automatically. Operators reconcile that durable fact explicitly. Retries are bounded; exhausted runs and effects enter `dead`.

Alternatives

Running actions directly in the API was rejected because failures could escape the transaction. Reading the latest rule during retry was rejected because it changes admitted intent. An in-memory scheduler was rejected because PostgreSQL is authoritative.

Consequences

Runs remain explainable and restart-safe, at the cost of more durable rows and explicit reconciliation. Unsupported actions fail with typed error codes rather than being silently ignored.

Migration

Migration `0017_stage4_automation_control_plane.sql` adds rule, version, occurrence, run, and effect tables plus immutability and dry-run guards. Migration `0020_stage4_review_hardening.sql` adds the durable external-effect intent and reconciliation state.

Spec changes

`OPENAPI.yaml` exposes version creation, dry-run, trigger, state control, and run inspection endpoints. Manual admission proves the caller's Team authorization; schedulers use a separate trusted-worker admission path. Rule and Loop writes accept only bounded five-field UTC cron syntax. `SCHEMA.sql` includes the executable Stage 4 migrations.
