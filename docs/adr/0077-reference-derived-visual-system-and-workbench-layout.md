# Reference-derived visual system, card anatomy, and workbench layout

Status

Proposed

Reads with, and does not re-decide: ADR 0028 (Accepted) frontend architecture and
M1-M5 staging, ADR 0045 (Proposed) single-token theme unification, ADR 0052
(Accepted) information architecture, ADR 0064 (Accepted) unified shell, ADR 0073
(Proposed) column position, ADR 0074 (Proposed) configuration readiness.

Context

WorkMesh's frontend direction is already decided and mostly written down. ADR 0028
sets the architecture and the M1-M5 staging, and makes an explicit choice that
matters here: **CSS variables and authored CSS are the M1 baseline, Tailwind is
deferred, and shadcn/ui, MUI and Chakra are rejected.** ADR 0045 then converges the
palette onto a single `--wm-*` token set, deletes a legacy dark theme and an
"operations" theme, and scopes itself to **light only**, stating that dark mode is
out of scope and that a future ADR may add `[data-theme="dark"]`.

A full measurement of a reference product is now available locally
(`G:\Projects\MetronX\todos-dev-analysis\`, with `design-tokens.md`,
`kanban-cards.md`, and 28 screenshots). It is a strong reference, and adopting it
naively would violate decisions WorkMesh has already made. Three tensions have to
be named before anything is copied.

**The reference implements its design with Tailwind utility classes.** A real card
carries `flex flex-col gap-1.5 rounded-lg border border-line bg-white px-3 py-2.5
dark:bg-surface-secondary`. Those classnames are the *implementation* of a
measurement, not the measurement. WorkMesh has deliberately not adopted Tailwind.
Copying the class strings would smuggle in a framework decision that ADR 0028
rejected, and would couple WorkMesh's markup to a class-name vocabulary that a
token rename would then have to rip out of every card.

**The reference is light and dark; WorkMesh's current scope is light only.** The
reference's values are worth having — a warm off-white light surface
(`#faf7f2`) against a neutral near-black dark surface (`#18181b`) is a more
deliberate pairing than the current slate/blue legacy palettes — but taking the
dark half would be a dark-mode decision, and that decision belongs to the ADR
0045 scope line, not to a card redesign.

**The reference has no semantic status tokens at all.** Its board status colours
are hardcoded utilities: gray-400 for pending, blue-500 for running, amber-500 for
needs-you, green-500 for done. WorkMesh has the opposite position: ADR 0045 keeps
`--wm-info`, `--wm-success`, `--wm-warning`, `--wm-danger` as tokens precisely so
status colour is themeable. Importing the reference's mechanism would re-create
the exact problem 0045 exists to fix, in a new place.

What is genuinely worth taking is the reference's **measurements** and its
**structural patterns**, both of which are mechanism-independent: a warm-neutral
surface ramp, a 4-column board whose columns are inset surfaces rather than
outlined regions, a card with a fixed three-region anatomy and a hard two-line
title clamp and no shadow at all, and a workbench whose conversation and board sit
side by side behind a draggable splitter that can be hidden or maximised with its
state remembered.

And one pattern is a genuine design rule rather than a taste preference: **only
the state that requires a human is rendered in the attention hue.** In the
reference, pending is gray, running is blue, done is green, and only *needs you* is
amber. A human scanning a board is therefore drawn to exactly one thing. WorkMesh
has two such states — `awaiting_review` and `awaiting_approval` — and both are
currently competing with the rest of the status vocabulary for attention.

Decision

WorkMesh adopts the reference's **measurements and structural patterns** into the
mechanism ADR 0028 and 0045 already chose. It does not adopt its framework, its
classnames, or its colour mechanism.

### Values move into the existing token namespace

The `--wm-*` token names and the single-palette direction stay exactly as ADR 0045
defines them. What changes is the **value** behind each semantic slot, taken from
the reference's measured scale, expressed as CSS custom properties:

| Slot | WorkMesh today | Reference measured | Adopt |
| --- | --- | --- | --- |
| light surface | legacy slate / operations white | `#faf7f2` warm off-white | yes |
| light inset surface | — | `#f2ede6` | yes, as a new slot |
| border | legacy | `#e2dbd1` | yes |
| text primary / secondary / tertiary | legacy | `#1c1917` / `#57534e` / `#78716c` | yes |
| primary action | — | `#4f46e5` (indigo-600) with `#6366f1` focus | yes |
| status: pending / running / needs-human / done | `--wm-*` slots already exist | `#9ca3af` / `#3b82f6` / `#f59e0b` / `#22c55e` | values yes, **as tokens** |
| radius: control / card / column | mixed | 6px / 8px / 12px | yes |
| spacing scale | mixed | 2, 4, 6, 8, 10, 12, 16, 24 | yes |

Semantic status tokens **stay semantic**. The reference's hardcoded utility colours
are recorded as the reason WorkMesh must not import its mechanism: a status colour
that lives in a classname cannot be themed, and WorkMesh already has the tokens
that make it themeable.

The reference's dark values are **captured in this ADR as a prepared target** and
otherwise untouched. ADR 0045's light-only scope stands; the follow-up dark-mode
ADR inherits a ready-made value table rather than starting from nothing.

### The card becomes a structural contract

The card's three regions are adopted as a **layout** contract, implemented in
authored CSS and shared components, with these measured properties:

| Property | Value | Why it is a contract, not a style |
| --- | --- | --- |
| regions | meta row, title, footer | every card must expose assignment, subject, and recency in the same places |
| title | 14px / weight 500, **`-webkit-line-clamp: 2`** | a hard two-line constraint makes title length a product rule, and it is testable |
| container | 8px radius, 1px border, 10px 12px padding, 6px column gap, **zero shadow** | shadow is reserved for overlays, so a dense board does not blur |
| column | 12px radius, **inset** surface, 1px border, 12px column gap | the board separates by surface depth, not by outline weight |
| meta typography | project identity at 11px, identifier at 10px, both in the tertiary text colour | density is a deliberate choice for a triage surface |

Zero shadow on the card is the load-bearing one: it is what lets a board hold
forty cards without turning into a texture, and it is cheap to get wrong later by
adding a hover shadow for polish.

### One warm colour, and it means "a human is needed"

This becomes an explicit, testable invariant for the board and any status
vocabulary:

> The attention hue (`--wm-warning`, `#f59e0b`) is used for **exactly one class
> of state**: work that cannot proceed without a Human. `awaiting_review` and
> `awaiting_approval` qualify. Pending is neutral, running and queued are
> informational, done and closed are success, blocked is a distinct neutral-warm
> that must not reuse the attention hue.

The invariant is testable as a rendered assertion over every status the board can
display, which is the point: a design rule that cannot be asserted is a preference.

### The workbench is conversation and board, side by side

The three-pane workbench — navigation, conversation, board — is adopted as the
target layout, with a draggable splitter, a hideable board, a maximised board, and
the layout state remembered. This **composes with** ADR 0052 and ADR 0064 rather
than replacing them: the panes are two views over the same authorized read
models, the conversation is the Chief surface, and the board is the triage
surface. Neither pane becomes a second source of truth, and the splitter changes
no URL ownership — ADR 0064's canonical navigation rules are untouched.

The reference's empty-state pattern — a short title, one sentence of explanation,
and a single primary action — is adopted for surfaces that correspond to an unmet
configuration check, and is left alone everywhere else. That boundary belongs to
ADR 0074 and is not widened here.

### Card interactions are adopted as governed commands

Adopted, because each is an improvement over a detail page round-trip:

- the card's primary action changes with state rather than sending the user to a
  detail page to discover what to do next;
- a context menu whose first item is the next action, with edit, duplicate, copy
  link, close, delete, and reopen behind it;
- dragging between columns, with modifier-click multi-select for a batch move;
- **dragging a card into the conversation composer**, which inserts it as a task
  reference so a Human can brief the Chief without leaving the board.

Every one of these is a normal `Command` with the existing discipline: identity,
`Idempotency-Key`, `If-Match` revision, optimistic concurrency, and the same
authorization checks. The board is a faster path to the same governed mutation,
never a second mutation API.

**One reference behaviour is explicitly not adopted.** Dragging a started card
back to a pending column resets the task, interrupts the build, and clears the
conversation, plan, and diff records, with no confirmation. WorkMesh does not add
that. Any destructive transition in the board requires an explicit confirmation
surface, and the column-position model from ADR 0073 already provides the revision
that makes a safe transition expressible.

## Alternatives

- **Adopt Tailwind because the reference uses it.** Rejected: ADR 0028 deferred
  Tailwind pending a measured migration and ADR 0045 rejected it again, both on
  evidence. A card redesign is not that evidence.
- **Copy the reference's classnames.** Rejected: same objection, and it couples
  markup to a vocabulary that a token rename must then rip out.
- **Take the reference's status colours as hardcoded utilities.** Rejected: it
  re-creates ADR 0045's problem in a new place, and WorkMesh already has the
  tokens that make status colour themeable.
- **Add dark mode now because the reference has it.** Rejected: that is ADR 0045's
  deferred scope. This ADR captures the values so the follow-up is cheap, and does
  not add `[data-theme="dark"]`.
- **Replace WorkMesh's information architecture and navigation with the
  reference's.** Rejected: ADR 0052 and ADR 0064 are Accepted and answer questions
  the reference does not ask — what is at risk, what was verified, who is
  accountable.
- **Copy the destructive drag-to-reset.** Rejected: an unconfirmed data-destroying
  gesture is a defect, not a pattern, and WorkMesh's governed-command model exists
  precisely to prevent it.
- **Redesign the visual system from scratch instead of using measured values.**
  Rejected: a measured scale is cheaper than taste and is defensible in review.

## Consequences

WorkMesh's board and shell gain a coherent measured visual system whose values
came from a real product rather than from a preference argument, and it gains one
design rule that is now testable: only a Human-blocked state is warm.

The costs are real. Changing token **values** is a visible change across every
screen, and the first consequence is procedural: a visual baseline must be
captured **before** the switch, or there is no way to review the diff. That is a
gate on this work, not a nicety. The card anatomy becomes a contract that every
future card must satisfy, which constrains later work on the board. And the
palette visibly shifts from slate/blue toward warm neutral, which some will read
as a downgrade; the values are defensible, the shift is not optional once made.

Dark mode remains out of scope by ADR 0045's own decision, so WorkMesh will look
unlike the reference in one respect for now. That is a named, prepared follow-up
rather than an omission.

## Migration

No domain change, no schema change, no endpoint change. This is presentation only.

The migration order is fixed and gated:

1. Capture a visual baseline of the affected screens in the current palette.
2. Introduce the reference values as **additional** semantic slots alongside the
   existing ones, so nothing is switched yet.
3. Migrate one surface at a time to the new slots, reviewing the visual diff
   against the baseline at each step.
4. Only once no surface consumes the old values, remove them.

Steps 2 and 3 are what make step 4 safe. Removing the old tokens first, or switching
the root values first, is the failure mode this ordering exists to prevent.

The Playwright spec added by ADR 0045 (`theme-unification.spec.ts`) is the
regression gate for steps 3 and 4, and this ADR adds to it rather than replacing
it: a status-hue assertion per board state, a two-line title clamp assertion, and a
zero-shadow assertion on cards.

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` and
`pnpm test:e2e` must stay green. No statement added to the agent lock inventory is
required by this ADR, because presentation owns no locked row.

## Spec changes

- `packages/ui/src/tokens.css` gains the adopted values, documented as a mapping
  from ADR 0045's semantic slots to the reference measurements, with the old
  values retained until step 4.
- `docs/plan/` gains the implementation plan for this ADR, with the baseline
  capture as an explicit gate and per-surface migration steps.
- A design-token reference document records the measured scale, its source, the
  date it was measured, and which values are adopted, which are captured for the
  dark follow-up, and which were rejected as mechanism.
- The board gains a card-structure test and the one-warm-colour invariant test
  described above.
