# Versioned Project and Issue Documents

## Status

Accepted — 2026-09-25. Implements W06 of `docs/plan/2026-09-24-prototype-pi-agent-workbench.md` under GitHub issue #128. The isolated Docker stage tracks this ADR in Project `f5884215-8b1c-48bb-9b7f-717fa9994cd5` and WorkItem `9007b561-aabd-4a9a-b5fc-42b006a7db3b`, separately from the earlier persistent WorkMesh IDs.

## Context

Project descriptions, Issue descriptions, versioned Guidance, and evidence artifacts have different authority and retention rules. A Project or Issue needs multiple named Markdown documents with reviewable history. Concurrent Human and Agent edits must preserve committed revisions and identify the author. Agent session context must continue to refer to the revision it originally received.

## Decision

Add `documents` and append-only `document_revisions` in PostgreSQL. Each document belongs to exactly one Project or WorkItem in the same Workspace and Team. The document row holds its current revision, optimistic revision, and reversible archive state. Each immutable revision records title, Markdown, SHA-256 content hash, author, base revision, optional restored revision, and timestamp. The current pointer and ownership use database constraints; the API writes state, domain event, and outbox entry in one transaction.

Human members use Team authorization. Agents use an active delegated Session, approved capability, exact owner scope, idempotency, revision, and server enforced Stop. Ordinary document tools do not publish Guidance or change permissions. A restore creates a new revision; archive and unarchive preserve all revisions. Project and Issue descriptions retain their existing semantics.

REST, SDK, MCP, and Web use the same API. Session context snapshots pin exact document revision IDs and hashes; subsequent edits do not rewrite existing pins. Markdown export returns the stored source bytes. History and collections are bounded and paginated.

## Alternatives

- Reuse Guidance revisions: rejected because ordinary editing would inherit instruction publication semantics.
- Store documents in Project description or WorkItem JSON: rejected because it loses multiple named histories and queryable ownership.
- Overwrite a single Markdown value: rejected because concurrent edits and Agent provenance become unrecoverable.

## Consequences

Documents introduce a separate authorization and event surface, plus storage growth proportional to revisions. History is immutable; corrections require a new revision. Clients must handle stale If-Match or base hashes as conflicts and retain local drafts. Snapshot pins make old content available to a Session even after later edits, subject to normal read authorization.

## Migration

`v1/0011_versioned_documents.sql` creates new tables, indexes, constraints, and immutability triggers. Existing descriptions, Guidance, and artifacts remain where they are. There is no backfill. Apply the numbered migration on both clean and v1/0008 databases; failed migration rolls back atomically. No old column or table is dropped.

## Spec changes

Update `SCHEMA.sql`, `OPENAPI.yaml`, shared contracts, route policy, Agent SDK, MCP, and the W06 plan execution record. New events are `document.created`, `document.revised`, `document.restored`, `document.archived`, and `document.unarchived`.
