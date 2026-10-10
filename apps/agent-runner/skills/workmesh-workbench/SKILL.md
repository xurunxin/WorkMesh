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

## 等待、续接与停止

需要批准时，先调用 `workmesh_request_approval`，保留返回的准确 approval ID 与完整 `sha256:` action hash，再调用 `workmesh_wait`，选择 `awaiting_approval` 并给出公开等待原因。需要 Human 输入时使用 `awaiting_input`；阻塞等待使用 `blocked`。等待工具关闭当前模型和普通工具，Runner 把公开等待回复与原 Turn 一起结算。批准或输入满足持久条件后，Worker 创建唯一后续 Turn；新 Attempt 会重新校验实时权限和批准，重新取得所需 Lease。不要长时间占用旧 Attempt 等待，也不要自动解除 Human pause。

`workmesh_get_session_plan`、`workmesh_list_plan_versions`、`workmesh_list_approvals`、`workmesh_get_approval` 与具名 Recovery 工具读取当前授权事实。`workmesh_transition_state` 仅允许普通 planning/executing 转换；不要用普通状态命令代替等待结算。`workmesh_heartbeat_lease` 只诊断而不续租，`workmesh_renew_lease` 和 release 必须使用准确 Lease version。

观察 Stop 或撤权后立即停止新工具、steering 和模型调用。Runner 在 finally 清理本人资源，持有原准确 E Token 通过专用 Stop ACK 提交清理概要和残留风险；不使用普通工具 Activity、不刷新停止后的 Token，也不拿普通 Lease release 代替 Stop。ACK 丢响应只确认原动作结果；无法确认不表示未提交，不能盲目产生第二个执行动作。Pi 内部 Session completion 沿原外层 settle 回执恢复，不把内部 completion key 冒作独立 direct complete 回执。

## 完整分页、文档与协作

分页读取必须把 `nextCursor` 原样送回；`workmesh_list_work_items` 支持 Project、Milestone、parent 和状态筛选。Document 列表用 UUID cursor，history 用原 revision-number cursor，不能相互替代。读取 history、指定 revision 和 diff 后，以当前 `baseRevisionId`／`baseContentHash` restore；restore 创建新 revision，不能改历史。Markdown export 和 Guidance 是只读；评论只读，Decision 只允许提案和读取，finalize、Handoff accept、Guidance 发布仍由 Human 完成。

Room metadata 不授正文读取权。使用本人 Inbox 的 metadata→claim→get/read→acknowledge/reply 流程，回复须当前 Inbox revision。Handoff offer/request 后等待 Human 接受及目标实际接续，不能把请求当接受。导入恢复按实体 mapping 和各自 idempotency key 对账；部分成功不代表整项目原子提交。

## 普通 child 与独立 reviewer

`workmesh_comment_plan_step` 绑定当前 Plan/version/stable step；`workmesh_propose_plan_step_assignment` 仅提案，不自动分配或创建 Session。`workmesh_append_context_delta` 只追加当前 snapshot 下已授权的来源及准确 hash，Guidance 用可信 URI，内部来源用准确 ID；父身份由 Runner 固定，不接受替换 Session。

父身份固定为当前 Session。先读取当前 Plan/version 和稳定 step，使用 `workmesh_create_child_session` 或 `workmesh_create_review_delegation`。传入显式缩减 budget：未给出的维度仍继承父上限；旧 reservation 不因 child 完成自动释放。例如父 input 100、child 60 后 review 应显式 40，不能省略而隐式继承 100。

普通 child 使用有限能力。reviewer 不拥有 `plan:write`，不能发布 Plan；只能发布 `code_review` Artifact，并必须本人发送 Room `review_result`。Artifact 应包含审查 metadata 或真实引用，`noArtifactReason` 或 structured review 不能替代双证据。父用 `workmesh_list_child_sessions` 确认所有 required child 已 completed；其它每种状态都阻止父完成并返回准确 IDs。父终态或撤权不能继续读取子状态，Stop/pause 优先；父 Stop 不表示子已自动停止。
`workmesh_fail_session` 只请求准确自身 Session 的失败。它与 completion/wait 互斥并关闭后续模型工具；宿主先提交 failed Turn/Attempt，再执行原 `/fail` 命令。两事务之间崩溃或第二个响应不明没有自动恢复，Turn failed 不能证明 Session failed。Stop/撤权优先；后步拒绝不重做 settle 或 Stop cleanup。核查实际 Session 状态并保留原请求 key/revision 与拒绝/不明事实。

