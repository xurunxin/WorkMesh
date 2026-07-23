# Work Room projection

Status: Accepted

## Context

Collaboration needs a shared chronological view without hidden agent private chat.

## Decision

Rooms are durable channels for work items, projects, and sessions. Their timeline is a PostgreSQL union projection of room messages, plan steps/comments/assignment proposals, activities, context deltas, decisions, artifacts, handoffs, leases, and events across the room's session subtree. Messages support typed intent, recipients, reply/thread, structured payload, and response resolution. Every explicit recipient must be authorized for the room Team before an Inbox item or webhook is created. Ask, review request, blocker, and handoff always route an Inbox observer item to the responsible human even when the direct recipient is another agent.

Context delta projection exposes source additions, immutable snapshot lineage, rationale, creator, and content hash. Internal WorkMesh resources are referenced by ID and re-authorized at append time. External-style URIs are accepted only for server-known guidance scopes; their digest is computed from the current server-owned guidance representation. Client-supplied URIs or hashes never establish readability.

## Alternatives

Ephemeral Redis chat; private agent-to-agent channels; a separate non-audited timeline.

## Consequences

Authorized humans can inspect all agent collaboration. Redis is never a read authority.

## Migration

Migration 0007 adds room channels and messages.

## Spec changes

None.
