ALTER TABLE project_milestones
  DROP CONSTRAINT project_milestones_project_id_name_key;

CREATE UNIQUE INDEX project_milestones_active_project_name_unique
  ON project_milestones(project_id,name)
  WHERE deleted_at IS NULL;
