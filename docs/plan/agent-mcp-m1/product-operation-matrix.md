# M1 产品逐操作映射

43 条均绑定当前 REST/Zod/policy 与具名消费者。参数、响应、角色/状态/capability/scope/feature、批准/Lease/If-Match/key 的精确结构见 [JSON](product-operation-matrix.json)；该 JSON 保存当前 OpenAPI components，不能拿规划快照冒当前合同。

普通读取与写入沿现行 active E 门禁；GET 确認由受限 C/安装或 Human 身份重验原事务来源。Human 控制、批准决定和 force release 保留。Runner 模型不持安装凭据，stopAck/确认、wait settlement/monitor/claim 为受控生命周期。HTTP MCP 不跨请求缓存 E；停止后 C 不能 refresh E 来 stopAck。

| operationId / REST | SDK / MCP / Runner | 证据范围 |
| --- | --- | --- |
| listAgentSessions<br>GET /api/v1/agent-sessions | listSessions<br>list_agent_sessions<br>workmesh_list_sessions | M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测 |
| getAgentSession<br>GET /api/v1/agent-sessions/{id} | getSession<br>get_agent_session<br>workmesh_get_session | M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测 |
| getAgentSessionContext<br>GET /api/v1/agent-sessions/{id}/context | getSessionContext<br>get_session_context<br>workmesh_get_session_context | M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测 |
| getAgentPlan<br>GET /api/v1/agent-sessions/{id}/plan | getPlan<br>get_session_plan<br>workmesh_get_session_plan | 既有 REST/M0 回归；不冒本批逐操作独立的全门禁测试 |
| listAgentPlanVersions<br>GET /api/v1/agent-sessions/{id}/plans | listPlanVersions<br>list_session_plan_versions<br>workmesh_list_plan_versions | M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测 |
| listApprovals<br>GET /api/v1/approvals | listApprovals<br>list_approvals<br>workmesh_list_approvals | M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测 |
| getApproval<br>GET /api/v1/approvals/{id} | getApproval<br>get_approval<br>workmesh_get_approval | M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测 |
| listLeases<br>GET /api/v1/leases | listLeases<br>list_leases<br>workmesh_list_leases | M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测 |
| heartbeatLease<br>POST /api/v1/leases/{id}/heartbeat | heartbeatLease<br>heartbeat_lease<br>workmesh_heartbeat_lease | M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测 |
| renewLease<br>POST /api/v1/leases/{id}/renew | renewLease<br>renew_lease<br>workmesh_renew_lease | M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测 |
| releaseLease<br>POST /api/v1/leases/{id}/release | releaseLease<br>release_lease<br>workmesh_release_lease | M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测 |
| listRecoveryItems<br>GET /api/v1/recovery-items | listRecoveryItems<br>list_recovery_items<br>workmesh_list_recovery_items | M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测 |
| getRecoveryItem<br>GET /api/v1/recovery-items/{id} | getRecoveryItem<br>get_recovery_item<br>workmesh_get_recovery_item | M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测 |
| acknowledgeAgentSession<br>POST /api/v1/agent-sessions/{id}/ack | acknowledge<br>ack_agent_session<br>受控生命周期 | 既有 REST/M0 回归；不冒本批逐操作独立的全门禁测试 |
| transitionAgentSessionState<br>POST /api/v1/agent-sessions/{id}/state | transitionState<br>transition_agent_session_state<br>workmesh_transition_state | 既有 REST/M0 回归；不冒本批逐操作独立的全门禁测试 |
| heartbeatAgentSession<br>POST /api/v1/agent-sessions/{id}/heartbeat | heartbeat<br>heartbeat<br>受控生命周期 | 既有 REST/M0 回归；不冒本批逐操作独立的全门禁测试 |
| publishAgentPlan<br>PUT /api/v1/agent-sessions/{id}/plan | publishPlan<br>publish_plan<br>workmesh_publish_plan | M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测 |
| requestApproval<br>POST /api/v1/approvals | requestApproval<br>request_approval<br>workmesh_request_approval | M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测 |
| consumeApproval<br>POST /api/v1/approvals/{id}/consume | consumeApproval<br>consume_approval<br>workmesh_consume_approval | M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测 |
| acquireLease<br>POST /api/v1/leases | acquireLease<br>acquire_lease<br>workmesh_acquire_lease | M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测 |
| completeAgentSession<br>POST /api/v1/agent-sessions/{id}/complete | complete<br>complete_session<br>workmesh_complete_session→受控settle | M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测 |
| failAgentSession<br>POST /api/v1/agent-sessions/{id}/fail | fail<br>fail_session<br>受控已有失败settle；不新增模型terminal写 | 既有 REST/M0 回归；不冒本批逐操作独立的全门禁测试 |
| acknowledgeAgentSessionStop<br>POST /api/v1/agent-sessions/{id}/stop-ack | stopAcknowledgement<br>stop_ack<br>受控finally；不交模型 | M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测 |
| publishArtifact<br>POST /api/v1/artifacts | publishArtifact<br>publish_artifact<br>workmesh_publish_artifact | 既有 REST/M0 回归；不冒本批逐操作独立的全门禁测试 |
| signalAgentSession<br>POST /api/v1/agent-sessions/{id}/signals | Human原REST；不新增SDK<br>不增加Agent控制tool<br>不提供 | 保留原 Human 路径，REST 回归与等待/控制代表场景；不新授 Agent 权限 |
| retryAgentSession<br>POST /api/v1/agent-sessions/{id}/retry | retrySession<br>不增加Agent控制tool<br>不提供 | 保留原 Human 路径，REST 回归与等待/控制代表场景；不新授 Agent 权限 |
| decideApproval<br>POST /api/v1/approvals/{id}/decide | Human原消费者<br>不提供<br>不提供 | 保留原 Human 路径，REST 回归与等待/控制代表场景；不新授 Agent 权限 |
| forceReleaseLease<br>POST /api/v1/leases/{id}/force-release | mutateLease原Human分支<br>不提供<br>不提供 | 保留原 Human 路径，REST 回归与等待/控制代表场景；不新授 Agent 权限 |
| exchangeAgentSessionToken<br>POST /api/v1/agent-sessions/{id}/token/exchange | exchangeClaimedSessionToken<br>adapter内部<br>受控附件 | 受控 Runner 实际生命周期与 API 回归；不交模型控制或安装凭据 |
| refreshAgentSessionToken<br>POST /api/v1/agent-sessions/{id}/token/refresh | 原受控refresh<br>adapter内部<br>RunnerApi.#refresh未停时 | 受控 Runner 实际生命周期与 API 回归；不交模型控制或安装凭据 |
| claimWorkItem<br>POST /api/v1/work-items/{id}/claim | claimWorkItem<br>claim_work_item<br>不交E模型 | 既有 REST/M0 回归；不冒本批逐操作独立的全门禁测试 |
| delegateAndStartAgentSession<br>POST /api/v1/work-items/{id}/agent-session | delegateAndStart<br>delegate_work_item<br>不交E模型 | 既有 REST/M0 回归；不冒本批逐操作独立的全门禁测试 |
| settleWorkbenchAttempt<br>POST /api/v1/workbench/runner-attempts/{id}/settle | RunnerApi.request<br>adapter内部<br>executeTurn | 受控 Runner 实际生命周期与 API 回归；不交模型控制或安装凭据 |
| listWorkbenchRunnerAssignments<br>GET /api/v1/workbench/runner/assignments | RunnerApi.request<br>adapter内部<br>main→monitor或execute | 受控 Runner 实际生命周期与 API 回归；不交模型控制或安装凭据 |
| listAgentWorkbenchTurns<br>GET /api/v1/agent-sessions/{id}/workbench-turns | RunnerApi.request<br>adapter内部<br>main | 受控 Runner 实际生命周期与 API 回归；不交模型控制或安装凭据 |
| claimWorkbenchTurn<br>POST /api/v1/workbench/turns/{id}/claim | RunnerApi.request<br>adapter内部<br>executeTurn | 受控 Runner 实际生命周期与 API 回归；不交模型控制或安装凭据 |
| getWorkbenchAttemptCredential<br>GET /api/v1/workbench/runner-attempts/{id}/credential | RunnerApi.request<br>adapter内部<br>promptFor | 受控 Runner 实际生命周期与 API 回归；不交模型控制或安装凭据 |
| startWorkbenchAttempt<br>POST /api/v1/workbench/runner-attempts/{id}/start | RunnerApi.request<br>adapter内部<br>executeTurn | 受控 Runner 实际生命周期与 API 回归；不交模型控制或安装凭据 |
| getWorkbenchAttemptStatus<br>GET /api/v1/workbench/runner-attempts/{id}/status | RunnerApi.request<br>adapter内部<br>runPi poll | 受控 Runner 实际生命周期与 API 回归；不交模型控制或安装凭据 |
| queueWorkbenchTurn<br>POST /api/v1/workbench/conversations/{id}/turns | Human原REST<br>不提供<br>真实输入触发 | 保留原 Human 路径，REST 回归与等待/控制代表场景；不新授 Agent 权限 |
| followupWorkbenchTurn<br>POST /api/v1/workbench/conversations/{id}/turns/{turnId}/followup | Human原REST<br>不提供<br>真实输入触发 | 保留原 Human 路径，REST 回归与等待/控制代表场景；不新授 Agent 权限 |
| promptAgentSession<br>POST /api/v1/agent-sessions/{id}/prompt | Human原REST<br>不提供<br>真实输入触发 | 保留原 Human 路径，REST 回归与等待/控制代表场景；不新授 Agent 权限 |
| getAgentSessionExecutionResult<br>GET /api/v1/agent-sessions/{id}/execution-result | getSessionExecutionResult<br>get_session_execution_result<br>受控finally确认；不交模型凭据 | M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测 |

等待合同增加的 sessionWait、executionWaits opt-in、continuation 引用是相关既有 operation 的字段增量。默认不开自动等待生产，旧消费者不领取续 Turn；Worker 部署开关只启用已授权能力，不授予权限。结果确认、等待恢复以及零写入统计各自分开，见 [九类矩阵](product-closure-matrix.md)。
