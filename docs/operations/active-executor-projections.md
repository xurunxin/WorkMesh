# Active Executor projection repair

Work Item executor fields are a database-maintained read model. Lease, Agent
Session, delegation, and Work Item triggers refresh it inside the transaction
that changes the authoritative record. Clients must never write projection
rows or the `active_executor` / `shared_reviewers` response fields.

## When to rebuild

Use the repair command after restoring an older backup, after correcting
authoritative Lease or Session data under an approved incident procedure, or
when diagnostics find a mismatch between `leases` / `agent_sessions` and
`work_item_executor_projections`. Ordinary expiry and lifecycle transitions do
not require a scheduled rebuild.

The repair uses the same database function as the maintenance triggers. It
takes transaction-scoped advisory locks per Work Item, deletes only projected
rows in scope, and recreates them from active, unexpired leases whose Session
and delegation remain active. It fails if the authoritative data contains more
than one Work Item-level exclusive Session for a Work Item. Exclusive leases
for different Plan Steps remain valid parallel execution and are ordered
deterministically when no Work Item-level primary exists.

## Command

Set `DATABASE_URL` through the normal secret mechanism. To rebuild every live
Work Item:

```sh
pnpm --filter @workmesh/worker repair:executor-projections
```

To limit the repair to a Workspace, set
`WORKMESH_REPAIR_WORKSPACE_ID`. To repair one Work Item, set both
`WORKMESH_REPAIR_WORKSPACE_ID` and `WORKMESH_REPAIR_WORK_ITEM_ID`. The command
prints one JSON result with `status`, `rebuilt`, and the applied scope. A Work
Item scope without its Workspace is rejected before connecting.

For a production image, run the compiled entrypoint:

```sh
pnpm --filter @workmesh/worker repair:executor-projections:compiled
```

After repair, read the affected Work Item through REST and confirm that the
responsible Human remains unchanged, the primary executor matches the active
exclusive Session, and shared review leases appear only in `shared_reviewers`.
