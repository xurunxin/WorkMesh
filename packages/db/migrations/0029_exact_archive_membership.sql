BEGIN;

-- Segment cursor bounds are an object envelope, not proof that every cursor
-- between them is present. Existing segments must be indexed from their pinned
-- immutable object before they can authorize coverage, cleanup, or pruning.
CREATE TYPE event_archive_membership_state AS ENUM (
  'pending_exact',
  'exact',
  'legacy_unindexed'
);

ALTER TABLE event_archive_segments
  ADD COLUMN membership_state event_archive_membership_state
    NOT NULL DEFAULT 'legacy_unindexed';

ALTER TABLE event_archive_segments
  ALTER COLUMN membership_state SET DEFAULT 'pending_exact';

ALTER TABLE event_archive_segments
  DROP CONSTRAINT IF EXISTS
    event_archive_segments_workspace_id_start_cursor_end_cursor_key;

ALTER TABLE event_archive_segments
  ADD CONSTRAINT event_archive_segments_id_workspace_unique
    UNIQUE(id,workspace_id),
  ADD CONSTRAINT event_archive_segments_membership_state_check CHECK (
    membership_state <> 'exact'
    OR state IN ('verified','pruned')
  );

CREATE TABLE event_archive_segment_events (
  segment_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK(ordinal >= 0),
  event_id uuid NOT NULL,
  event_cursor bigint NOT NULL CHECK(event_cursor > 0),
  record_sha256 text NOT NULL
    CHECK(record_sha256 ~ '^sha256:[a-f0-9]{64}$'),
  floored_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(segment_id,ordinal),
  UNIQUE(workspace_id,event_id),
  UNIQUE(workspace_id,event_cursor),
  FOREIGN KEY(segment_id,workspace_id)
    REFERENCES event_archive_segments(id,workspace_id)
    ON DELETE RESTRICT
);

CREATE INDEX event_archive_segment_events_segment_floor
  ON event_archive_segment_events(segment_id,floored_at,ordinal);
CREATE INDEX event_archive_segment_events_workspace_floor
  ON event_archive_segment_events(workspace_id,event_cursor,floored_at);

COMMENT ON COLUMN event_archive_segments.start_cursor IS
  'Minimum event cursor in the immutable object; envelope only, never coverage.';
COMMENT ON COLUMN event_archive_segments.end_cursor IS
  'Maximum event cursor in the immutable object; envelope only, never coverage.';
COMMENT ON COLUMN event_archive_segments.membership_state IS
  'Only exact is authoritative; legacy_unindexed requires pinned-object materialization.';
COMMENT ON TABLE event_archive_segment_events IS
  'Exact immutable archive membership retained after online domain event deletion.';

COMMIT;
