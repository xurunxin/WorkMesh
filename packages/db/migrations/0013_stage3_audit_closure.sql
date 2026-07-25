BEGIN;

ALTER TABLE provider_actions
  ALTER COLUMN session_id DROP NOT NULL,
  ALTER COLUMN work_item_id DROP NOT NULL;

ALTER TABLE provider_actions
  ADD CONSTRAINT provider_action_delivery_scope
  CHECK (
    (kind = 'resolve_repository_context' AND session_id IS NULL OR session_id IS NOT NULL)
    AND (kind = 'resolve_repository_context' OR work_item_id IS NOT NULL)
  );

ALTER TABLE repository_guidance_entries
  ADD COLUMN content text;

ALTER TABLE repository_guidance_entries DISABLE TRIGGER repository_guidance_entries_immutable;

UPDATE repository_guidance_entries
   SET content = ''
 WHERE content IS NULL;

ALTER TABLE repository_guidance_entries ENABLE TRIGGER repository_guidance_entries_immutable;

ALTER TABLE repository_guidance_entries
  ALTER COLUMN content SET NOT NULL;

ALTER TABLE structured_review_findings
  ADD COLUMN file text,
  ADD COLUMN summary text,
  ADD COLUMN evidence text,
  ADD COLUMN recommendation text;

ALTER TABLE structured_review_findings DISABLE TRIGGER structured_review_findings_immutable;

UPDATE structured_review_findings
   SET file = COALESCE(path, 'unknown'),
       line = COALESCE(line, 1),
       summary = title,
       evidence = COALESCE(body, title),
       recommendation = 'Address the finding and attach verification evidence.'
 WHERE file IS NULL;

ALTER TABLE structured_review_findings ENABLE TRIGGER structured_review_findings_immutable;

ALTER TABLE structured_review_findings
  ALTER COLUMN file SET NOT NULL,
  ALTER COLUMN line SET NOT NULL,
  ALTER COLUMN summary SET NOT NULL,
  ALTER COLUMN evidence SET NOT NULL,
  ALTER COLUMN recommendation SET NOT NULL;

COMMIT;
