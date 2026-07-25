BEGIN;

ALTER TABLE provider_actions
  DROP CONSTRAINT provider_actions_kind_check;

ALTER TABLE provider_actions
  ADD CONSTRAINT provider_actions_kind_check
  CHECK (kind IN (
    'create_branch',
    'create_commit',
    'open_pull_request',
    'merge_pull_request',
    'resolve_repository_context',
    'retry_ci_check'
  ));

COMMIT;
