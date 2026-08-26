# Work Item execution and decision workspace

Status

Accepted

Context

Work Item detail currently gives editable Issue fields first and places Human
responsibility, Agent execution, relationships, and collaboration behind separate
secondary tabs. WorkMesh already exposes authoritative Work Item execution
summaries, Human Attention, Run explanations, Active Executor projections, and
governed Session controls. Reconstructing an operational narrative from browser
strings would duplicate policy and can drift from durable state.

Decision

The Work Item detail surface will render an Overview first. It composes the
authorized Work Item execution-summary, Work Item-scoped Human Attention, compact
Run Timeline, Active Executor, relationships, and evidence references. The editor
remains mounted in a secondary Details section, and Discussion remains the Work
Room authority. Sheet and full-page modes share this model and URL-owned section.

The browser presents only server-provided summaries and typed projections. It may
format labels and empty states, but it does not infer blockers, verification, or
Agent policy from arbitrary activity text. Workflow edits, Human responsibility,
Agent delegation, and Session controls remain separate mutations.

Alternatives

- Extending the editable form with more status badges keeps operational context
  subordinate to metadata and was rejected.
- Building a new Work Item dashboard endpoint would duplicate the existing
  execution-summary, Attention, and Run projections and was rejected for this
  slice.

Consequences

The first view answers who owns the outcome, who is executing, what is happening,
what needs Human action, and what evidence exists. Existing drafts and conflict
handling stay isolated from realtime operational refreshes. Additional typed risk
or recovery projections can be added without replacing the layout.

Migration

No durable data migration is required. Existing URLs remain valid; the selected
detail section is added as an optional URL parameter and defaults to Overview.

Spec changes

Implements GitHub Issue #95 under roadmap #87. No protocol or persistence
invariant changes.
