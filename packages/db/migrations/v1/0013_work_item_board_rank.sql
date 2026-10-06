-- A Human-ordered position within a status column (ADR 0073).
--
-- work_items had no column that said "this one comes before that one", so the
-- board could only change a card's column, never its position inside one.
--
-- board_rank is LAYOUT state, not a domain fact. Re-spacing a column during a
-- move therefore writes no domain event, no outbox row, and no revision bump
-- for the rows the Human did not touch: only the dragged card is a mutation.
-- That is the whole reason this is a fractional rank rather than an integer
-- position that is renumbered on every move -- renumbering would change rows
-- the Human never edited and manufacture If-Match conflicts in the Agent path.

ALTER TABLE work_items ADD COLUMN board_rank numeric;

-- Backfill from the existing deterministic order (Issue number) so a database
-- that already carries Issues lands on a spread-out, immediately usable order
-- rather than a column of identical zeros.
--
-- The column is added nullable first on purpose: ADD COLUMN ... NOT NULL
-- DEFAULT forces PostgreSQL to rewrite every row under an exclusive lock,
-- whereas this sequence lets the rewrite happen as one plain UPDATE that the
-- migration transaction already holds open, and keeps the new default (for
-- Issues created after this migration) out of the backfill path entirely.
WITH ordered AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY workspace_id, team_id, status_id
           ORDER BY number
         ) * 1024 AS rank
  FROM work_items
)
UPDATE work_items item
SET board_rank = ordered.rank
FROM ordered
WHERE ordered.id = item.id;

-- 1024 is the default spacing: a fresh card appends past the current tail, and
-- a move inserts at the midpoint of its neighbours' ranks.
ALTER TABLE work_items ALTER COLUMN board_rank SET DEFAULT 1024;
ALTER TABLE work_items ALTER COLUMN board_rank SET NOT NULL;

-- The board reads one column at a time, ordered. The index is created after
-- the backfill so it is built once against final values.
CREATE INDEX work_items_board_rank
  ON work_items(workspace_id, status_id, board_rank);