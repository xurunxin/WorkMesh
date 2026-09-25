-- Durable workbench facts. A conversation serializes turn admission with its row
-- lock; queued turns are immutable facts until the coordinator claims them.
CREATE TABLE workbench_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES projects(id) ON DELETE RESTRICT,
  work_item_id uuid REFERENCES work_items(id) ON DELETE RESTRICT,
  responsible_human_actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 180),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  agent_session_id uuid REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  default_llm_connection_id uuid REFERENCES workbench_llm_connections(id) ON DELETE RESTRICT,
  default_llm_model_id uuid REFERENCES workbench_llm_models(id) ON DELETE RESTRICT,
  context_pins jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(context_pins)='array'),
  next_message_sequence integer NOT NULL DEFAULT 1 CHECK (next_message_sequence > 0),
  next_turn_sequence integer NOT NULL DEFAULT 1 CHECK (next_turn_sequence > 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,work_item_id) REFERENCES work_items(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,responsible_human_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,agent_session_id) REFERENCES agent_sessions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,default_llm_connection_id) REFERENCES workbench_llm_connections(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,default_llm_model_id) REFERENCES workbench_llm_models(workspace_id,id) ON DELETE RESTRICT,
  CHECK ((status='archived')=(archived_at IS NOT NULL))
);
CREATE INDEX workbench_conversations_owner ON workbench_conversations(workspace_id,responsible_human_actor_id,updated_at DESC,id DESC);
CREATE INDEX workbench_conversations_team ON workbench_conversations(workspace_id,team_id,updated_at DESC,id DESC) WHERE team_id IS NOT NULL;

CREATE TABLE workbench_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','dispatching','running','settled','failed','canceled','stopped')),
  initiated_by_actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,
  agent_session_id uuid REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  current_runner_attempt_id uuid,
  stop_reason text CHECK (stop_reason IN ('user_stop','authority_revoked','budget_exhausted','server_policy','upstream_error')),
  error_code text CHECK (error_code IS NULL OR length(error_code) BETWEEN 1 AND 120),
  llm_connection_id uuid REFERENCES workbench_llm_connections(id) ON DELETE RESTRICT,
  llm_model_id uuid REFERENCES workbench_llm_models(id) ON DELETE RESTRICT,
  queued_at timestamptz NOT NULL DEFAULT now(),
  dispatch_requested_at timestamptz,
  started_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id,sequence),
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,conversation_id) REFERENCES workbench_conversations(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,initiated_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,agent_session_id) REFERENCES agent_sessions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,llm_connection_id) REFERENCES workbench_llm_connections(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,llm_model_id) REFERENCES workbench_llm_models(workspace_id,id) ON DELETE RESTRICT,
  CHECK ((status IN ('settled','failed','canceled','stopped'))=(settled_at IS NOT NULL))
);
CREATE INDEX workbench_turns_queue ON workbench_turns(workspace_id,status,queued_at,id) WHERE status='queued';

CREATE TABLE workbench_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  turn_id uuid,
  sequence integer NOT NULL CHECK (sequence > 0),
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  author_actor_id uuid REFERENCES actors(id) ON DELETE RESTRICT,
  content_markdown text NOT NULL CHECK (length(content_markdown) BETWEEN 1 AND 50000),
  runner_attempt_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id,sequence),
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,conversation_id) REFERENCES workbench_conversations(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,turn_id) REFERENCES workbench_turns(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,author_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX workbench_messages_history ON workbench_messages(conversation_id,sequence DESC);

CREATE TABLE workbench_runner_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  turn_id uuid NOT NULL,
  agent_session_id uuid NOT NULL,
  attempt_no integer NOT NULL CHECK (attempt_no > 0),
  fence_token text NOT NULL CHECK (length(fence_token) BETWEEN 16 AND 128),
  status text NOT NULL CHECK (status IN ('preparing','running','settling','settled','aborted','failed','superseded')),
  runtime text NOT NULL DEFAULT 'pi_runner' CHECK (runtime='pi_runner'),
  llm_connection_id uuid REFERENCES workbench_llm_connections(id) ON DELETE RESTRICT,
  llm_model_id uuid REFERENCES workbench_llm_models(id) ON DELETE RESTRICT,
  supersedes_attempt_id uuid REFERENCES workbench_runner_attempts(id) ON DELETE RESTRICT,
  external_effects_reconciled boolean NOT NULL DEFAULT false,
  usage jsonb,
  stop_reason text CHECK (stop_reason IN ('user_stop','authority_revoked','budget_exhausted','server_policy','upstream_error')),
  error_code text,
  started_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(turn_id,attempt_no),
  UNIQUE(fence_token),
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,conversation_id) REFERENCES workbench_conversations(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,turn_id) REFERENCES workbench_turns(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,agent_session_id) REFERENCES agent_sessions(workspace_id,id) ON DELETE RESTRICT,
  CHECK ((status IN ('settled','aborted','failed','superseded'))=(settled_at IS NOT NULL))
);
ALTER TABLE workbench_turns ADD CONSTRAINT workbench_turn_current_attempt_fk
  FOREIGN KEY(workspace_id,current_runner_attempt_id) REFERENCES workbench_runner_attempts(workspace_id,id) ON DELETE RESTRICT;
ALTER TABLE workbench_messages ADD CONSTRAINT workbench_message_attempt_fk
  FOREIGN KEY(workspace_id,runner_attempt_id) REFERENCES workbench_runner_attempts(workspace_id,id) ON DELETE RESTRICT;
