-- Workbench LLM settings are durable business configuration. The API alone
-- decrypts secrets with WORKMESH_MASTER_KEY; projections never select them.
CREATE TABLE workbench_llm_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('personal','team','workspace')),
  owner_actor_id uuid,
  team_id uuid,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  api_type text NOT NULL CHECK (api_type IN ('openai-completions','openai-responses')),
  base_url text NOT NULL CHECK (length(base_url) BETWEEN 1 AND 2048),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','revoked')),
  secret_ciphertext bytea NOT NULL,
  created_by_actor_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (workspace_id,id),
  FOREIGN KEY (workspace_id,owner_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id,created_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK ((scope='personal' AND owner_actor_id IS NOT NULL AND team_id IS NULL)
    OR (scope='team' AND owner_actor_id IS NULL AND team_id IS NOT NULL)
    OR (scope='workspace' AND owner_actor_id IS NULL AND team_id IS NULL)),
  CHECK ((status='revoked') = (revoked_at IS NOT NULL))
);
CREATE INDEX workbench_llm_connections_access ON workbench_llm_connections(workspace_id,scope,team_id,owner_actor_id,status);
CREATE UNIQUE INDEX workbench_llm_connections_name ON workbench_llm_connections(workspace_id,scope,COALESCE(owner_actor_id,team_id,workspace_id),lower(name)) WHERE status <> 'revoked';

CREATE TABLE workbench_llm_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  external_model_id text NOT NULL CHECK (length(external_model_id) BETWEEN 1 AND 200),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  enabled boolean NOT NULL DEFAULT true,
  capabilities jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id,external_model_id),
  UNIQUE (workspace_id,id),
  FOREIGN KEY (workspace_id,connection_id) REFERENCES workbench_llm_connections(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX workbench_llm_models_connection ON workbench_llm_models(connection_id,enabled);
