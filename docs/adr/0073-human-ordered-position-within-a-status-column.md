# A Human-ordered position within a status column

Status: Proposed

## Context

An Issue's position inside a status column is currently not a fact. `work_items`
(`packages/db/src/schema.ts:98`) carries `status_id`, `priority`, `due_date`,
`responsible_human_actor_id`, `labels` and the project/milestone/cycle/parent
links — and nothing that says "this one comes before that one". The board
therefore cannot reorder anything; a Human can only change which column a card
is in.

That is a real gap. The board is the workspace's primary triage surface, and
"pull the blocked thing to the top" is the single most common physical gesture
people make on a board. Today the only way to express priority *within* a
column is to rename the card or use the priority chip, neither of which is the
gesture the Human is reaching for.

The reason the gap survived is that ordering is the one board operation that
is not a pure column move, and adding it touches three properties the rest of
the schema takes for granted: revision semantics, concurrent writes, and what
counts as a domain fact worth an event.

### What ordering must not become

The obvious implementation is an `integer position` that is renumbered on every
move. It is simple, and it is wrong here for a specific reason.

Renumbering changes rows the Human did not touch. Their stored state changes,
so by the rules in `AGENTS.md` — every mutation updates state, inserts a domain
event, and inserts an outbox row — each of them would need a revision bump and
a `work_item.updated` event. A Human reordering two cards would cause unrelated
concurrent edits to those cards to fail their `If-Match` precondition and
surface as "the server has a newer revision" for work they never touched. A
presentation concern would start manufacturing conflicts in the agent path, where
`updateWorkItem` also serves Agent-driven mutations under lease and delegation.

So the design constraint is sharper than "we need a rank column":

> Reordering must change exactly one row — the card being moved.

That rules out renumbering as the move primitive. It does not rule out
renumbering as rare maintenance, provided maintenance is not a mutation.

## Decision

Add `work_items.board_rank numeric`, ordered by `(status_id, board_rank, number)`.

**The client expresses intent, the server computes the rank.** A patch carries
`placement: { beforeItemId: <id> | null }` — "put this card immediately before
that one", or `null` for "at the end of the column". The client never sends a
rank. A client-supplied rank is a collision waiting to happen and would push
uniqueness enforcement into every writer.

**The server places between neighbours.** Under a column-scoped advisory lock,
the server reads the neighbour above the anchor and assigns the midpoint of the
two ranks. When the midpoint is no longer distinguishable from its neighbour —
the gap has been halved away — the server re-spaces the whole column and
recomputes, in the same transaction.

**Only the moved row is mutated.** Renumbering during a move writes
`board_rank` on the column's other rows, and that is deliberate: `board_rank`
is a **layout** column, not a domain fact. The Human-visible facts are the
status, the priority, the responsible Human, the dates. Nothing about the
workflow, the Agent delegation, the lease, or the evidence depends on where a
card sits among its peers. Re-spacing therefore writes no domain event, no
outbox row, and no revision bump for rows the Human did not move. The one row
that did change — the dragged card — gets the full treatment: `revision + 1`, a
`work_item.updated` event, and an outbox row, exactly like any other
`updateWorkItem`.

**The server owns placement errors.** A `beforeItemId` that is not in the
target column, or not in the Human's team, is `INVALID_INPUT` — not a silent
append. A concurrent move that already changed the anchor is caught by the
existing `assertRevision` precondition on the moved card, so the Human is told
to re-confirm rather than having their drop land somewhere they did not choose.

### Why `numeric` and not `double precision` or `integer`

`integer` with renumbering is excluded above. `double precision` is
expressible as `numeric`, and `numeric` has exact decimal semantics, so the
midpoint is reproducible and testable across platforms. The default spacing is
a power of two so that a handful of inserts into the same gap stay exact.

## Alternatives

**A dedicated `work_item_positions` table keyed by (team, status, item).**
Rejected: it duplicates identity, needs its own cascade and retention rules,
and buys nothing — the ordering is 1:1 with the Item and dies with it.

**Client-computed integer slots with a `position` unique constraint.** Rejected:
it makes a dropped card fail on a constraint violation rather than being
placed, and it forces the client to know the spacing policy.

**Letting `updated_at DESC` be the order.** It already is the list default for
agents. It is wrong for a Human: reordering would reorder by "when someone last
touched this", which changes under them for unrelated edits.

**Leaving ordering out entirely and relying on priority.** This is the status
quo. It fails the reach-for-the-top gesture, and it overloads priority, which
means something different to every team.

## Consequences

- `board_rank` is denormalised layout state. It is safe to rebuild from scratch
  at any time; nothing joins on it and nothing depends on its absolute value.
- Any future feature that needs a stable total order across columns (a sprint
  backlog, say) gets it from `board_rank` within each column plus `status_id`
  ordering, and must decide the column order itself — that is a workflow
  concept, not a storage one.
- A column with thousands of cards re-spaces more often. Columns are workflow
  states, and teams that reach that size are splitting states long before.
- The advisory lock is per `(workspace, team, status)`. Two Humans reordering
  different cards in the same column serialise; reordering across different
  columns does not.

## Migration

`0039_work_item_board_rank.sql`, forward-only:

1. `ADD COLUMN board_rank numeric` (nullable).
2. Backfill by ordering each column with `row_number() OVER (PARTITION BY
   workspace_id, team_id, status_id ORDER BY number)` and multiplying by the
   spacing, so existing Issues land on a spread-out, already-usable order.
3. `ALTER COLUMN board_rank SET DEFAULT <spacing>`, then `SET NOT NULL`.
4. Index on `(workspace_id, status_id, board_rank)`.

Adding the column nullable first means the table is never rewritten with a
default in the same statement, which on a large `work_items` is the difference
between an instant migration and a long one holding an exclusive lock. The
index is created after the backfill so it is built once against final values.

`SCHEMA.sql` is updated to match.

## Spec changes

- `workItemPatchSchema` gains an optional
  `placement: { beforeItemId: uuid | null }`, strict.
- `workItemResponseSchema` exposes `board_rank` so a client can render and
  verify order without guessing.
- The work-item list endpoint sorts by `board_rank` for Humans and keeps
  `updated_at DESC` for Agents, whose reads are scoped to a Session's own
  Items and are not a triage surface.
- `OPENAPI.yaml` documents both.