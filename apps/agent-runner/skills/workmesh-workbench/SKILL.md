---
name: workmesh-workbench
description: Operate the current delegated WorkMesh Agent Session through the Pi Runner's authorized workmesh_* tools. Use for Project and Issue planning, documents, reviews, and evidence inside an Agent Workbench turn.
---

# WorkMesh Agent Workbench

This Skill applies only to the exact Agent Session supplied by the Runner. The server decides identity, Team scope, capabilities, approval, lease, revision, and Stop. A tool appearing in the session does not by itself grant permission. Never use a Human cookie, invent a completed test, or put secrets or hidden reasoning in WorkMesh.

## Discover and plan

1. Start with `workmesh_session_context`, then `workmesh_get_session`. Use returned IDs and the live capability filtered tools. Read the relevant Project or Issue before mutating it. If the context does not match the user's request, explain the mismatch and stop.
2. For a new Project, use `workmesh_list_projects` to avoid duplicates. Create with `workmesh_create_project` only when the delegation permits it, then read it back with `workmesh_get_project`.
3. For executable work, use `workmesh_list_work_items` and `workmesh_get_work_item`; create outcome oriented Issues with `workmesh_create_work_item`. Read each back. Add a `workmesh_create_work_item_relation` only after both Issues exist and the dependency direction is clear. Check both Issues afterward.
4. For multi-step Agent execution, publish the whole plan with stable step IDs through `workmesh_publish_plan` using the current Session revision. A revision conflict means the plan changed: re-read and reconcile before a new version. Keep Issue workflow status separate from Session execution state.

## Change and review

1. Read the current resource and revision before `workmesh_update_project` or `workmesh_update_work_item`; pass that revision. On a conflict, read the new state and merge only the still-valid intent. Never overwrite a newer Human edit silently.
2. Use `workmesh_list_documents` and `workmesh_get_document` before creating or editing a Project or Issue document. `workmesh_update_document` requires the current revision and content hash. After a write, read the document back; a conflicting revision requires Human reconciliation when the contents cannot be merged safely.
3. Use `workmesh_request_approval` for an approval-gated action. State the specific decision and evidence; wait for a Human decision. A Lease from `workmesh_acquire_lease` coordinates work but never authorizes it. Release only a Lease you own with `workmesh_release_lease` after checking `workmesh_list_leases`.
4. Use `workmesh_offer_handoff` for an ownership transfer. The receiving Human decides acceptance. Do not treat an offer as accepted.

## Evidence and recovery

1. Record concise actions, observed checks, failures, and uncertainty with `workmesh_append_activity`; publish real artifacts with `workmesh_publish_artifact`. A claim that a command or test passed needs its actual observed result. If there is no artifact, explain why in the result.
2. After a lost response, read the authoritative resource or replay the same logical operation. The Runner assigns stable idempotency keys to tool calls. Never intentionally make a second external side effect while the first outcome is unknown.
3. On `FORBIDDEN`, `SESSION_STOPPED`, revoked authority, an approval requirement, or a lost Lease, stop ordinary writes and report the exact required Human action. On `REVISION_CONFLICT`, read the latest state before retrying. A stopped Session cannot be reopened by this Skill.
4. Finish with a concise answer that distinguishes completed actions, verified evidence, remaining work, and limits. Call `workmesh_complete_session` only when the delegated task is actually done and its evidence or explicit no-artifact explanation is ready. The Runner commits that completion with the public answer in one settlement transaction.

The Workbench exposes only a subset of WorkMesh operations. If a named tool is absent, report that capability as unavailable in this Session; do not substitute an unrelated tool or a fabricated result.
