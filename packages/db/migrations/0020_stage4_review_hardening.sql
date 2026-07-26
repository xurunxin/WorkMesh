BEGIN;

-- Preserve the configured overlap policy on each admitted run so PostgreSQL
-- can enforce the invariant without an unsafe cross-table partial predicate.
ALTER TABLE automation_runs
  ADD COLUMN enforce_no_overlap boolean NOT NULL DEFAULT false;
UPDATE automation_runs run
SET enforce_no_overlap=loop.no_overlap
FROM loops loop
WHERE run.loop_id=loop.id;
DROP INDEX loops_no_active_overlap;
CREATE UNIQUE INDEX loops_one_active_run_when_enforced
  ON automation_runs(loop_id)
  WHERE loop_id IS NOT NULL
    AND enforce_no_overlap
    AND status IN ('pending','claimed','running');

-- An external effect is durably moved to "prepared" before network I/O. If a
-- worker crashes after the receiver accepted the request, reconciliation marks
-- the unknown outcome without repeating a side effect that has no supported
-- idempotency contract.
CREATE TYPE automation_external_intent_state AS ENUM
  ('prepared','acknowledged','uncertain');
CREATE TABLE automation_external_effect_intents (
  effect_id uuid PRIMARY KEY REFERENCES automation_effects(id) ON DELETE RESTRICT,
  effect_key text NOT NULL UNIQUE,
  request_hash text NOT NULL,
  state automation_external_intent_state NOT NULL DEFAULT 'prepared',
  response_status integer,
  response_receipt text,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  reconciled_at timestamptz,
  CHECK((state='acknowledged')=(acknowledged_at IS NOT NULL)),
  CHECK(state<>'uncertain' OR reconciled_at IS NOT NULL)
);

-- A2A deliveries are monotonic per binding/task and can be consumed as a
-- durable WorkMesh-events-to-A2A stream.
ALTER TABLE a2a_deliveries
  ADD COLUMN sequence bigint,
  ADD COLUMN session_id uuid REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  ADD COLUMN domain_event_id uuid REFERENCES domain_events(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX a2a_delivery_task_sequence
  ON a2a_deliveries(binding_id,external_task_id,sequence)
  WHERE external_task_id IS NOT NULL AND sequence IS NOT NULL;
CREATE UNIQUE INDEX a2a_delivery_domain_event
  ON a2a_deliveries(binding_id,domain_event_id)
  WHERE domain_event_id IS NOT NULL;
CREATE INDEX a2a_delivery_claim
  ON a2a_deliveries(received_at)
  WHERE status='received' AND attempt_count<8;

COMMIT;
