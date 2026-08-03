-- WorkMesh consolidated executable schema entrypoint.
--
-- Run from the repository root with psql:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f SCHEMA.sql
--
-- The numbered migrations are the authoritative DDL for clean installations
-- and upgrades. psql's \ir resolves these paths relative to this file, keeping
-- this entrypoint executable without duplicating or reordering schema objects.
\set ON_ERROR_STOP on

\ir packages/db/migrations/0001_stage0.sql
\ir packages/db/migrations/0002_stage0_integrity_delivery.sql
\ir packages/db/migrations/0003_stage1_agent_identity_delegation.sql
\ir packages/db/migrations/0004_stage1_session_execution.sql
\ir packages/db/migrations/0005_stage1_tokens_webhooks_events.sql
\ir packages/db/migrations/0006_stage1_review_fixes.sql
\ir packages/db/migrations/0007_stage2_work_rooms_leases_handoffs.sql
\ir packages/db/migrations/0008_stage3_delivery_control_plane.sql
\ir packages/db/migrations/0009_stage3_production_adapters.sql
\ir packages/db/migrations/0010_stage3_provider_projection_provenance.sql
\ir packages/db/migrations/0011_stage3_provider_review_projection.sql
\ir packages/db/migrations/0012_stage3_regate_fencing_and_decisions.sql
\ir packages/db/migrations/0013_stage3_audit_closure.sql
\ir packages/db/migrations/0014_provider_action_kinds.sql
\ir packages/db/migrations/0015_stage4_planning_views_templates.sql
\ir packages/db/migrations/0016_stage4_usage_notifications.sql
\ir packages/db/migrations/0017_stage4_automation_control_plane.sql
\ir packages/db/migrations/0018_stage4_loops_health_a2a.sql
\ir packages/db/migrations/0019_stage4_gitea.sql
\ir packages/db/migrations/0020_stage4_review_hardening.sql
\ir packages/db/migrations/0021_stage4_a2a_direction_and_prompt_identity.sql
\ir packages/db/migrations/0022_route_policy_authorization_denials.sql
\ir packages/db/migrations/0023_auth_idempotency_records.sql
\ir packages/db/migrations/0024_cursor_pagination_indexes.sql
\ir packages/db/migrations/0025_realtime_event_envelope.sql
\ir packages/db/migrations/0026_retention_archive_and_heartbeat_health.sql
\ir packages/db/migrations/0027_worker_runtime_identity.sql
\ir packages/db/migrations/0028_worker_identity_conflict_count.sql
\ir packages/db/migrations/0029_exact_archive_membership.sql
\ir packages/db/migrations/0030_durable_archive_upload_intents.sql
\ir packages/db/migrations/0031_agent_session_external_urls_shape.sql
