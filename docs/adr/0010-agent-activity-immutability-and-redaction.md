# Agent activity immutability and redaction

Status: Accepted

## Context

Agent progress and tool use must be auditable, but activity content can contain credentials, personal data, or private model reasoning that WorkMesh must not retain.

## Decision

Activities are append-only facts with a session-local sequence. They contain concise operational summaries, sanitized tool inputs, result summaries, evidence references, and visibility. They never require hidden chain-of-thought. Writers redact secrets before persistence; sensitive content is handled as a tombstoned/redacted replacement rather than silently deleting the fact that an activity existed. Large tool output belongs in an artifact, not the activity timeline.

## Alternatives

Mutable progress rows; raw runner logs in activities; requiring model reasoning; silent deletion of sensitive entries.

## Consequences

Consumers can safely treat activities as historical facts and must tolerate redacted content. API/UI code must not expose raw credentials or assume all tool output is inline.

## Migration

Stage 1 introduces immutable activity records and redaction metadata. No Stage 0 comment history is reinterpreted as activity.

## Spec changes

`POST /api/v1/agent-sessions/{id}/activities` accepts sanitized operational data and is idempotent. Activity events are independently versioned.
