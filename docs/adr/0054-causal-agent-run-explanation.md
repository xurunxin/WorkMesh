# Causal Agent Run explanation

Status: Accepted

## Context

The version 1 Run Explanation projection established in ADR 0051 identifies a
Session, its current Plan, bounded Activity groups, Attention, changes, evidence,
health, and controls. Issue #93 requires the projection to explain the complete
execution story without asking the browser to infer causality from Activity text
or exposing hidden reasoning and unsanitized payloads.

## Decision

Extend the version 1 Run Explanation response with an ordered immutable Plan rail,
source-backed causal groups, typed resource/evidence references, validation state,
published trigger rationale, actor attribution, source timestamps, and expandable
technical records. The projection also includes all bounded Plan Versions needed
for stable-ID comparison and a deterministic pagination cursor for older groups.

The API assigns phases and action classes from durable Activity kinds and explicit
structured Activity metadata. Consecutive equivalent low-value reads, polling,
heartbeats, and successful lookups may collapse only when their phase, Plan
Version, Plan Step, actor, action class, risk, summary, and success state match.
Errors, warnings, state transitions, writes, Approvals, Decisions, Artifacts,
validation, Handoffs, and terminal outcomes always remain individually
discoverable.

The browser renders only server-supplied causal groups. URL parameters own phase,
step, actor, action, risk, evidence, failure, technical-record visibility, selected
group, selected Plan Version, comparison version, and timeline cursor. Compact and
full modes use the same Run Timeline component and data source.

Published rationale is concise operational context, never hidden chain-of-thought.
Only allowlisted structured metadata is projected. Secret-like keys, private
prompts, environment payloads, and unbounded raw logs are never returned. Exact
source IDs, correlation IDs, sequence/cursor, timestamps, sanitized tool/action
facts, and result summaries remain available under progressive disclosure.

Completion and verification are separate: terminal completion without sufficient
successful validation evidence is explicitly `not_verified`; failed validation is
`failed`; source-backed successful validation is `verified`.

## Alternatives

Browser-side inference from arbitrary Activity summaries was rejected because it
duplicates policy and can invent causal relationships. A new event store was
rejected because Activities, Plans, Artifacts, Approvals, Decisions, Handoffs, and
domain events already provide the durable source facts.

## Consequences

Run pages become explainable and deep-linkable while keeping the authoritative
records unchanged. Projection queries remain bounded and clients can request older
groups with a stable sequence cursor. New Activity metadata improves explanations
without making JSON the domain authority.

## Migration

No database migration is required. Existing Activities without structured metadata
receive conservative phase/action classifications and explicit unknown or
not-verified fields. Producers may add allowlisted metadata incrementally.

## Spec changes

`packages/contracts`, `OPENAPI.yaml`, Agent SDK, MCP, and the Run Explanation route
gain the causal grouping, Plan comparison, filtering, and pagination fields. No
mutation or domain-event semantics change.
