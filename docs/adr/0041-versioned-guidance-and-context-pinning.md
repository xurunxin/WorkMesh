# Versioned Guidance and context pinning

Status

Accepted

Context

Workspace and Team Guidance endpoints returned placeholders, while Project
Guidance reused descriptive project metadata. Agent Sessions therefore could
not reproduce which instruction revisions were actually used.

Decision

Store Guidance in independent `guidance_documents` and immutable
`guidance_revisions` tables for Workspace, Team, and Project scopes. Project
`description` remains descriptive metadata and is neither migrated nor used as
Guidance. Publishing always inserts a new immutable revision with author,
timestamp, change summary, and SHA-256 content hash, then advances the document
current pointer in the same transaction. Archiving deactivates the document
without deleting its pointer or history. Rollback changes only the current
pointer and appends an immutable audit fact; it never edits or copies a prior
revision.

Guidance precedence is lower to higher specificity:
Workspace, Team, Project, Repository, Work Item, then Session/Human prompt.
Later layers may refine earlier instructions but cannot grant capabilities,
expand resource scope, bypass approval or Lease requirements, or override
platform security policy.

Every newly materialized Session context snapshot records the exact active
Workspace, Team, and applicable Project Guidance revision ID and content hash.
Child and review Sessions inherit the parent's immutable snapshot. A retry that
does not reuse context materializes a new snapshot from the then-current
Guidance. Retrieval reauthorizes the requested scope; Agents cannot publish,
archive, rollback, or read another Team or Project.

Known secret and token forms are rejected before persistence. Guidance content
is returned only by authorized read endpoints and is not copied into domain
event payloads, audit reasons, or application logs.

Alternatives

Columns on Workspace, Team, and Project were rejected because they do not
provide immutable history or a shared contract. Reusing Project description was
rejected because descriptive metadata and executable instructions have
different meaning. Mutating an old revision during rollback was rejected
because it destroys provenance.

Consequences

Guidance publication adds one document update, one immutable revision, one
audit fact, one domain event, and one outbox row in a transaction. Context
snapshots remain reproducible after later publish, archive, or rollback actions.
Empty scopes are explicit unpublished resources rather than placeholder text.

Migration

`v1/0003_versioned_guidance.sql` creates the scope, document, revision, and
audit model. Existing Workspace, Team, and Project descriptions are retained
unchanged; no content is silently promoted to Guidance.

Spec changes

REST, OpenAPI, Agent SDK, MCP resources, Agent context, Web editing/history,
`SCHEMA.sql`, the Agent Protocol, and the PRD use the same revisioned Guidance
contract and precedence rules.
