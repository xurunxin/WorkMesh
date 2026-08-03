BEGIN;

ALTER TABLE agent_sessions
  ADD CONSTRAINT agent_sessions_external_urls_array_check
  CHECK (jsonb_typeof(external_urls) = 'array') NOT VALID;

ALTER TABLE api_idempotency_keys
  ADD CONSTRAINT api_idempotency_ack_session_external_urls_array_check
  CHECK (
    operation <> 'acknowledgeAgentSession'
    OR response_body IS NULL
    OR COALESCE(
      jsonb_typeof(response_body) = 'object'
      AND jsonb_typeof(response_body->'external_urls') = 'array',
      false
    )
  ) NOT VALID;

UPDATE agent_sessions
  SET external_urls = '[]'::jsonb
  WHERE external_urls = '{}'::jsonb;

UPDATE api_idempotency_keys
  SET response_body = jsonb_set(
    response_body,
    '{external_urls}',
    '[]'::jsonb,
    false
  )
  WHERE operation = 'acknowledgeAgentSession'
    AND response_body->'external_urls' = '{}'::jsonb;

ALTER TABLE agent_sessions
  VALIDATE CONSTRAINT agent_sessions_external_urls_array_check;

ALTER TABLE api_idempotency_keys
  VALIDATE CONSTRAINT api_idempotency_ack_session_external_urls_array_check;

COMMIT;
