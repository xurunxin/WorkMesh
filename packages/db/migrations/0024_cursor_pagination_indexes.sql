BEGIN;

-- Cover the authorization prefix and deterministic keyset tuple used by every
-- high-growth collection. Partial predicates match the live-row filters.
CREATE INDEX teams_workspace_name_page
  ON teams(workspace_id,name,id) WHERE deleted_at IS NULL;
CREATE INDEX workflow_states_team_position_page
  ON workflow_states(workspace_id,team_id,position,id) WHERE is_archived=false;
CREATE INDEX projects_workspace_updated_page
  ON projects(workspace_id,updated_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX actors_workspace_human_name_page
  ON actors(workspace_id,display_name,id) WHERE kind='human' AND is_active;
CREATE INDEX work_items_workspace_updated_page
  ON work_items(workspace_id,updated_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX comments_workspace_channel_created_page
  ON comments(workspace_id,channel_id,created_at,id) WHERE deleted_at IS NULL;
CREATE INDEX saved_views_owner_name_page
  ON saved_views(workspace_id,owner_actor_id,name,id);
CREATE INDEX agent_definitions_workspace_name_page
  ON agent_definitions(workspace_id,display_name,id);
CREATE INDEX agent_sessions_workspace_updated_page
  ON agent_sessions(workspace_id,updated_at DESC,id DESC);
CREATE INDEX agent_plan_versions_session_revision_page
  ON agent_plan_versions(session_id,revision,id);
CREATE INDEX artifacts_workspace_created_page
  ON artifacts(workspace_id,created_at DESC,id DESC);
CREATE INDEX approvals_workspace_created_page
  ON approvals(workspace_id,created_at DESC,id DESC);
CREATE INDEX inbox_items_recipient_status_created_page
  ON inbox_items(workspace_id,recipient_human_actor_id,status,created_at DESC,id DESC);
CREATE INDEX leases_workspace_created_page
  ON leases(workspace_id,created_at DESC,id DESC);
CREATE INDEX handoffs_workspace_created_page
  ON handoffs(workspace_id,created_at DESC,id DESC);
CREATE INDEX repositories_workspace_name_page
  ON repositories(workspace_id,full_name,id) WHERE active;
CREATE INDEX cycles_workspace_starts_page
  ON cycles(workspace_id,starts_at,id);
CREATE INDEX initiatives_workspace_priority_updated_page
  ON initiatives(workspace_id,priority DESC,updated_at DESC,id DESC);
CREATE INDEX advanced_saved_views_workspace_updated_page
  ON advanced_saved_views(workspace_id,updated_at DESC,id DESC);
CREATE INDEX project_health_updates_project_created_page
  ON project_health_updates(project_id,created_at DESC,id DESC);
CREATE INDEX automation_rules_workspace_updated_page
  ON automation_rules(workspace_id,updated_at DESC,id DESC);
CREATE INDEX automation_runs_workspace_created_page
  ON automation_runs(workspace_id,created_at DESC,id DESC);
CREATE INDEX loops_workspace_updated_page
  ON loops(workspace_id,updated_at DESC,id DESC);
CREATE INDEX templates_workspace_kind_name_page
  ON templates(workspace_id,kind,name,id);

COMMIT;
