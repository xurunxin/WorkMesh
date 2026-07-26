BEGIN;

-- Inbound A2A delivery sequence and outbound Domain Event cursor are distinct
-- monotonic domains. Keeping the direction on each fact prevents equal numeric
-- values from colliding while preserving one durable delivery audit table.
ALTER TABLE a2a_deliveries
  ADD COLUMN direction text NOT NULL DEFAULT 'inbound'
    CHECK(direction IN ('inbound','outbound'));
UPDATE a2a_deliveries
SET direction='outbound'
WHERE domain_event_id IS NOT NULL;
DROP INDEX a2a_delivery_task_sequence;
CREATE UNIQUE INDEX a2a_delivery_task_direction_sequence
  ON a2a_deliveries(binding_id,external_task_id,direction,sequence)
  WHERE external_task_id IS NOT NULL AND sequence IS NOT NULL;

-- A2A status deliveries repeat prior history. Persist the external identity so
-- later deliveries add only new prompts to the immutable prompt timeline.
ALTER TABLE agent_session_prompts
  ADD COLUMN a2a_external_message_id text;
CREATE UNIQUE INDEX agent_session_prompts_a2a_external_message
  ON agent_session_prompts(session_id,a2a_external_message_id)
  WHERE a2a_external_message_id IS NOT NULL;

COMMIT;
