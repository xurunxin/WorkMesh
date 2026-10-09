# M1逐操作映射与准确源码入口

当前REST来自source-snapshot.zip内准确main的完整OPENAPI；原M0记录作为历史输入分列。新增名称是Proposed，工具数量不计验收率。每项参数/返回$ref全文、currentPolicy、历史谓词和main锚点详见 [结构化映射](operation-decisions.json)。

普通E读取/写入要求active集合 acknowledged/planning/executing/awaiting_input/awaiting_approval/blocked；ACK、诊断heartbeat、stopAck和settle按各自专用例外。所有列表保cursor/limit与当前服务端过滤；角色无额外限制不代表所有目标允许。C目标执行用独立E身份，不以C qualification代E。

| operationId / REST | SDK → MCP → Runner | 准确领域规则 / source |
| --- | --- | --- |
| `listAgentSessions` GET `/api/v1/agent-sessions` | `listSessions` → `list_agent_sessions` → workmesh_list_sessions | 仅自身Session；过滤teamId/workItemId/agentId/principalHumanActorId/state不能扩大集合；`apps/api/src/agent/routes.ts:144` |
| `getAgentSession` GET `/api/v1/agent-sessions/{id}` | `getSession` → `get_agent_session` → workmesh_get_session | exact id=当前E；Human Team读取；C目标必须独立E bridge；`apps/api/src/agent/routes.ts:197` |
| `getAgentSessionContext` GET `/api/v1/agent-sessions/{id}/context` | `getSessionContext` → `get_session_context` → workmesh_get_session_context | 准确固定snapshot与guidance/document pins；不是context历史CRUD；`apps/api/src/agent/routes.ts:250` |
| `getAgentPlan` GET `/api/v1/agent-sessions/{id}/plan` | `getPlan` → `get_session_plan` → workmesh_get_session_plan | current plan可能null；原raw steps不冒context结构；`apps/api/src/agent/routes.ts:226` |
| `listAgentPlanVersions` GET `/api/v1/agent-sessions/{id}/plans` | `listPlanVersions` → `list_session_plan_versions` → workmesh_list_plan_versions | Plan摘要分页按revision/id；不新增历史版本详情路径；`apps/api/src/agent/routes.ts:227` |
| `listApprovals` GET `/api/v1/approvals` | `listApprovals` → `list_approvals` → workmesh_list_approvals | sessionId/status+cursor；Agent只看自身；Human viewer_actionability保留；`apps/api/src/agent/routes.ts:334` |
| `getApproval` GET `/api/v1/approvals/{id}` | `getApproval` → `get_approval` → workmesh_get_approval | approval.session_id=准确E；C bridge另需明确sessionId；`apps/api/src/agent/routes.ts:373` |
| `listLeases` GET `/api/v1/leases` | `listLeases` → `list_leases` → workmesh_list_leases | sessionId/resourceId+cursor；只本人；version与revision别名都保留，无getLease路由；`apps/api/src/collaboration/routes.ts:1145` |
| `heartbeatLease` POST `/api/v1/leases/{id}/heartbeat` | `heartbeatLease` → `heartbeat_lease` → workmesh_heartbeat_lease | exact lease.session_id；status=active；原heartbeat窗口，无If-Match，不新增Activity；`apps/api/src/collaboration/routes.ts:1339` |
| `renewLease` POST `/api/v1/leases/{id}/renew` | `renewLease` → `renew_lease` → workmesh_renew_lease | exact holder；status=active且expires_at>now；Lease If-Match；ttlSeconds 10..3600；`apps/api/src/collaboration/routes.ts:1385` |
| `releaseLease` POST `/api/v1/leases/{id}/release` | `releaseLease` → `release_lease` → workmesh_release_lease | exact holder；status=active；Lease If-Match；Stop后普通release拒，服务器Stop已释放；`apps/api/src/collaboration/routes.ts:1391` |
| `listRecoveryItems` GET `/api/v1/recovery-items` | `listRecoveryItems` → `list_recovery_items` → workmesh_list_recovery_items | 既有lifecycle/condition/severity/projectId/workItemId/sessionId/cursor；liveSessionReadPredicate；`apps/api/src/recovery/routes.ts:56` |
| `getRecoveryItem` GET `/api/v1/recovery-items/{id}` | `getRecoveryItem` → `get_recovery_item` → workmesh_get_recovery_item | 复合不透明id不是UUID；missing与unauthorized一致NOT_FOUND，C准确E桥；`apps/api/src/recovery/routes.ts:96` |
| `acknowledgeAgentSession` POST `/api/v1/agent-sessions/{id}/ack` | `acknowledge` → `ack_agent_session` → 受控生命周期 | queued/stale新ACK；acknowledged仅原key/body回执，不先普通manifest；`apps/api/src/agent/commands.ts:2707` |
| `transitionAgentSessionState` POST `/api/v1/agent-sessions/{id}/state` | `transitionState` → `transition_agent_session_state` → workmesh_transition_state | 原状态图与Session If-Match；Runner不提供Human pause/resume/stop/retry；`apps/api/src/agent/commands.ts:2809` |
| `heartbeatAgentSession` POST `/api/v1/agent-sessions/{id}/heartbeat` | `heartbeat` → `heartbeat` → 受控生命周期 | 所有状态仅诊断；准确live授权；K1/K2/K1不回退，不恢复执行；`apps/api/src/agent/commands.ts:2727` |
| `publishAgentPlan` PUT `/api/v1/agent-sessions/{id}/plan` | `publishPlan` → `publish_plan` → workmesh_publish_plan | reviewer拒；awaiting_approval需要原approvalId/hash；stable steps；Session revision；零前置Activity；`apps/api/src/agent/commands.ts:2819` |
| `requestApproval` POST `/api/v1/approvals` | `requestApproval` → `request_approval` → workmesh_request_approval | 准确自身work_item Session与canonical sanitized hash；Human/既有自主策略决定，不给Agent自批；`apps/api/src/agent/commands.ts:2926` |
| `consumeApproval` POST `/api/v1/approvals/{id}/consume` | `consumeApproval` → `consume_approval` → workmesh_consume_approval | 准确session/approved/hash/expiry/未consumed；Approval If-Match；不等于decide权限；`apps/api/src/agent/commands.ts:3200` |
| `acquireLease` POST `/api/v1/leases` | `acquireLease` → `acquire_lease` → workmesh_acquire_lease | work_item/plan_step exact resource；独占冲突详情；TTL；Lease不授予权限；`apps/api/src/collaboration/routes.ts:1320` |
| `completeAgentSession` POST `/api/v1/agent-sessions/{id}/complete` | `complete` → `complete_session` → workmesh_complete_session→受控settle | 当前state可completed；证据/no-artifact；required child门禁保持；reviewer还需artifact:write、本人Room review_result与code_review；`apps/api/src/agent/commands.ts:2880` |
| `failAgentSession` POST `/api/v1/agent-sessions/{id}/fail` | `fail` → `fail_session` → 受控已有失败settle；不新增模型terminal写 | 同领域fail状态图/evidence/code；停止后不能普通fail；保原失败处理；`apps/api/src/agent/commands.ts:2875` |
| `acknowledgeAgentSessionStop` POST `/api/v1/agent-sessions/{id}/stop-ack` | `stopAcknowledgement` → `stop_ack` → 受控finally；不交模型 | 仅stopping+exact原E+Session If-Match+live grant；不走makeTool/refresh；唯一cleanup事实；`apps/api/src/agent/commands.ts:2902` |
| `publishArtifact` POST `/api/v1/artifacts` | `publishArtifact` → `publish_artifact` → workmesh_publish_artifact | 原artifact:write与exact session/work_item，reviewer仅code_review；不新增上传/外发范围；`apps/api/src/agent/commands.ts:2912` |
| `signalAgentSession` POST `/api/v1/agent-sessions/{id}/signals` | `Human原REST；不新增SDK` → `不增加Agent控制tool` → 不提供 | Human-only stop/pause/resume；原信号/Stop Lease释放/审计不变；`apps/api/src/agent/commands.ts:2857` |
| `retryAgentSession` POST `/api/v1/agent-sessions/{id}/retry` | `retrySession` → `不增加Agent控制tool` → 不提供 | Human原重试新Session，不复活终态；不是M1普通E工具；`apps/api/src/agent/commands.ts:2614` |
| `decideApproval` POST `/api/v1/approvals/{id}/decide` | `Human原消费者` → `不提供` → 不提供 | Human决定原quorum/revision/hash与scope；不能自批；`apps/api/src/agent/commands.ts:3048` |
| `forceReleaseLease` POST `/api/v1/leases/{id}/force-release` | `mutateLease原Human分支` → `不提供` → 不提供 | Human-only +审批/原因/If-Match；不增Agent force-release；`apps/api/src/collaboration/routes.ts:1376` |
| `exchangeAgentSessionToken` POST `/api/v1/agent-sessions/{id}/token/exchange` | `exchangeClaimedSessionToken` → `adapter内部` → 受控附件 | 既有install/session/nonce绑定；本批不增加Token签发途径；`apps/api/src/agent/commands.ts:2494` |
| `refreshAgentSessionToken` POST `/api/v1/agent-sessions/{id}/token/refresh` | `原受控refresh` → `adapter内部` → RunnerApi.#refresh未停时 | Stop/terminal原拒绝；不作为401/403恢复；只读确认绝不调用；`apps/api/src/agent/commands.ts:2539` |
| `claimWorkItem` POST `/api/v1/work-items/{id}/claim` | `claimWorkItem` → `claim_work_item` → 不交E模型 | 原C接单前置，typed/身份产品M0已落；本批conformance消费queued链，不新增接单权限；`apps/api/src/agent/commands.ts:1462` |
| `delegateAndStartAgentSession` POST `/api/v1/work-items/{id}/agent-session` | `delegateAndStart` → `delegate_work_item` → 不交E模型 | 原H/C委派及目标资格；非E Team管理；`apps/api/src/agent/commands.ts:677` |
| `settleWorkbenchAttempt` POST `/api/v1/workbench/runner-attempts/{id}/settle` | `RunnerApi.request` → `adapter内部` → executeTurn | exact Session/attempt/fence/Runner service；保ADR0068外层回执重放，不泛化到complete/stopAck；`apps/api/src/workbench-runner.ts:301` |
| `getAgentSessionExecutionResult` GET `/api/v1/agent-sessions/{id}/execution-result`（新增提案） | `getSessionExecutionResult` → `get_session_execution_result` → 受控finally | [准确输入/DTO/live归属/零写合同](security-contract.md)，普通E拒绝；Proposed |

## 共同live门禁与逐操作反例

所有普通Agent操作逐次重验credential、definition/actor、Team grant、Delegation和能力交集；读取final live predicate与对象session FK，写命令under-lock exact authority。具体九类用例ID/测试文件/DoD见 [验证](verification.md)，不能用通用pending代审计完成。M0历史源码和本批main证据分列，不认为继承的旧test状态代表本批通过。

新增适配和Human保留见 [兼容](compatibility.md)，Stop特殊时序见 [生命周期](lifecycle.md)。
