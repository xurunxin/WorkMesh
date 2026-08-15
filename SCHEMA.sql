-- WorkMesh consolidated executable schema entrypoint.
--
-- Run from the repository root with psql:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f SCHEMA.sql
--
-- The v1 baseline is the consolidated DDL reference for clean installations.
-- Production installs and upgrades must use `pnpm db:migrate` so schema SQL,
-- its SHA-256 checksum, and ledger registration commit atomically. The pre-v1
-- numbered SQL remains immutable legacy inventory and is not a clean-install
-- path after v1.
\set ON_ERROR_STOP on

\ir packages/db/migrations/v1/0001_v1_baseline.sql
\ir packages/db/migrations/v1/0002_active_executor_projection.sql
\ir packages/db/migrations/v1/0003_versioned_guidance.sql
\ir packages/db/migrations/v1/0004_agent_connections.sql
\ir packages/db/migrations/v1/0005_planning_domain_parity.sql
\ir packages/db/migrations/v1/0006_human_attachments.sql
\ir packages/db/migrations/v1/0007_active_milestone_name_uniqueness.sql
