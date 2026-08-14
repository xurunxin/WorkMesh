# Structured planning domain parity

Status

Accepted

Context

The WorkMesh GA model already stored Projects and a create-only Milestone record, but Kaneo-to-WorkMesh migration exposed three gaps. Agents could not manage Milestones through MCP, Work Item hierarchy was only expressible in prose, and blocker/related links had no durable typed representation. This prevented the Human Experience adoption project from using WorkMesh itself as its complete planning control plane.

Decision

- Milestones are stable Project-owned resources with list, get, create, revisioned update, and revisioned soft-delete operations.
- Work Items may reference one parent Work Item. Parent and child must be active, in the same workspace, Team, and Project (including both having no Project), and the hierarchy must be acyclic.
- `work_item_relations` stores `blocks` as a directed acyclic edge and `related` as a canonical undirected pair. Active duplicate and self links are rejected.
- A Work Item with an active parent, child, or relation cannot be soft-deleted until the links are detached. A Milestone with active Work Items cannot be deleted until those items are moved.
- REST is the authority boundary. SDK and MCP are typed adapters over the same REST operations and do not bypass authorization, optimistic concurrency, idempotency, domain events, or database constraints.
- Human and coordination-session callers may mutate these ordinary planning resources when their live Team grant includes `work:write`. Read operations require live `work:read` and resolved resource scope.
- Each mutation writes current state, a domain event, and an outbox record in one PostgreSQL transaction through the existing mutation/event infrastructure.

Alternatives

- Keep hierarchy and blockers in descriptions or labels. Rejected because they are not queryable, enforceable, or safe for agent automation.
- Copy Kaneo's backend model. Rejected because Kaneo remains a presentation and interaction reference; WorkMesh server authority and agent protocol invariants remain canonical.
- Model `blocked_by` as a second stored edge type. Rejected because it is the inverse projection of `blocks` and would allow contradictory duplicate facts.
- Cascade-delete hierarchy and relations. Rejected because implicit destructive graph edits are hard to audit and unsafe for autonomous clients.

Consequences

- Clients can reconstruct hierarchy, blockers, related work, and six-project-milestone plans without parsing prose.
- Related links are returned with canonical endpoint ordering; clients determine whether the requested Work Item is the source or target.
- Deletion may return an actionable conflict until links or Milestone assignments are removed.
- Database triggers are intentional defense in depth for concurrent or non-HTTP writers; command handlers translate known violations into stable error codes.

Migration

`v1/0005_planning_domain_parity.sql` adds `work_items.parent_id`, the `work_item_relation_kind` enum, `work_item_relations`, Milestone soft deletion, composite foreign keys, partial indexes, and cycle/deletion invariant triggers. The migration is checksummed and runs after the immutable v1 baseline for both clean installs and every supported pre-v1 upgrade endpoint.

Spec changes

- `OPENAPI.yaml`: complete Milestone CRUD/list routes; Work Item relation list/create/delete routes; `parentId` on Work Item input/patch; typed Milestone and relation schemas.
- `packages/contracts`: equivalent strict Zod request/response contracts and route-policy bindings.
- Events: `project.milestone.created`, `project.milestone.updated`, `project.milestone.deleted`, `work_item.relation_added`, and `work_item.relation_removed`.
- Agent SDK and MCP: paged Milestone/relation reads and revision/idempotency-aware planning mutations.
