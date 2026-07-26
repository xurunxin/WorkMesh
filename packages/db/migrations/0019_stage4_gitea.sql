BEGIN;

ALTER TYPE provider_kind ADD VALUE IF NOT EXISTS 'gitea';

COMMIT;

BEGIN;

ALTER TABLE provider_connections ADD CONSTRAINT provider_connections_gitea_credentials_check
  CHECK(provider<>'gitea' OR (installation_id IS NOT NULL AND credentials_ciphertext IS NOT NULL));

COMMIT;
