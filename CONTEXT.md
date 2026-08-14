# WorkMesh domain language

## Human

A person represented by a Human Actor. A Human may be responsible for work, make decisions and grant authority through explicit platform mechanisms.

## Responsible Human

The Human accountable for a Work Item. Responsibility is not execution telemetry and is never replaced by an Agent, Delegation or Agent Session.

## Agent

A registered non-Human actor definition with declared skills and bounded approved capabilities. An Agent definition is not itself an active execution.

## Delegation

A revocable grant from a principal Human to an Agent for a bounded role, capability set, resource scope and time. A Delegation is authority; a Lease is not.

## Agent Session

One durable execution attempt under a Delegation. Its execution state is independent from the Work Item workflow state.

## Agent Execution

A Human-facing projection of one Delegation and Agent Session, including the Agent identity, execution state, current step and operational evidence.

## Work Item

A durable unit of planned work with a Responsible Human, workflow state, revision and optional Project, Milestone, hierarchy and relations.

## Workflow State

The planning lifecycle of a Work Item, such as Backlog, Ready, In Progress or Done. It does not describe whether an Agent Session is executing, paused or stopped.

## Execution State

The lifecycle of one Agent Session, such as queued, executing, awaiting input, stopping or completed. It does not change Work Item workflow state by implication.

## Project

A Team-scoped durable planning aggregate containing Work Items, Milestones, updates, dependencies and delivery evidence.

## Plan

An immutable versioned execution plan for an Agent Session. Plan steps retain stable identities across revisions.

## Approval

An auditable Human decision bound to one sanitized action and payload hash. Approval is neither visibility nor a generic capability.

## Lease

A durable coordination claim over a resource. It never grants authorization and remains subordinate to identity, Delegation, capability, scope and Stop checks.

## Artifact

Immutable evidence metadata with provenance. An Artifact may support a decision or completion but does not itself grant authority.

## Human Attachment

A file intentionally attached by a Human to an authorized Work Item collaboration surface. It uses the same bounded upload intent, checksum verification, MIME and size policy, provenance, expiry and immutable Artifact model as Agent-produced evidence, but it is authorized by the Human session and does not require or impersonate an Agent Session.

## Content Attribution

The durable identity context for Human- or Agent-authored collaboration content. It identifies the author Actor kind and, when applicable, the exact Agent Session and Plan Step without merging authorship with Work Item responsibility or execution authority.

## Draft

A non-authoritative local recovery copy of unsent Human content, scoped to the exact Human, Team, resource, field and base revision. A Draft never grants visibility or write authority and never submits itself after reload, reconnect or conflict.

## Durable Event Cursor

A PostgreSQL-backed ordered checkpoint used to resume event reads. It is not a browser cache version and does not make Redis or client storage authoritative.

## View Model

A Human-facing projection shaped for one interface. It may combine authorized facts but never becomes a source of domain authority.

## Command

An explicit request to mutate a durable resource. Commands preserve identity, revision, idempotency and all applicable server-side authority checks.

## Query

A read request that returns only resources authorized for the caller. Query visibility does not authorize a later Command.

## Conflict

A structured refusal to overwrite a newer revision or reuse an operation identity for different intent. Recovery begins by loading the latest server state.

## Stop

A server-enforced Agent Session transition that immediately removes ordinary write authority. It is not a frontend flag.
