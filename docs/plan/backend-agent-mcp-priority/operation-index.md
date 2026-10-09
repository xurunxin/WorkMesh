# 精确主线的逐操作接口索引

基准 `74f247f9240eaf21e74ef248f71a445c1d4276d7`。从完整 Git blob 解析 OPENAPI、生成的 route-policy matrix、MCP注册/绑定与Runner注册；不是运行验收。共 277 条 operation，144 条声明含 Agent。索引覆盖 Human/公共/运行内部动作，避免从工具数量推断全面性。

SDK栏以具名方法和请求用途核对；未见封装不等于领域不存在。Lease维护复用mutateLease(action)，不称已有独立具名方法。复合工具的额外操作见覆盖矩阵；resource不等于tools/list。参数及返回完整定义以精确SHA的OpenAPI/合同为准。

| operationId / REST（OPENAPI行） | 角色 / 认证 / 能力 / feature | MCP绑定 / Runner | SDK静态定位 | 状态 |
| --- | --- | --- | --- | --- |
| `listModelPresets`<br>`GET /api/v1/workbench/model-presets`<br>OPENAPI.yaml:22 |  / public / - / beta (WORKMESH_BETA_MODEL_PRESETS) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `live`<br>`GET /livez`<br>OPENAPI.yaml:42 |  / public / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `ready`<br>`GET /readyz`<br>OPENAPI.yaml:56 |  / public / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `health`<br>`GET /health`<br>OPENAPI.yaml:73 |  / public / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `getServerInfo`<br>`GET /api/v1/info`<br>OPENAPI.yaml:83 |  / public / - / stable | resource:server-info（index.ts:33）<br>Runner: 缺/不适用 | getServerInfo:266 | Human保留/基础设施；Agent不适用 |
| `getDeploymentFeatures`<br>`GET /api/v1/features`<br>OPENAPI.yaml:115 | human,agent / human_or_agent_session / work:read / stable | resource:server-features（index.ts:34）<br>Runner: 缺/不适用 | getFeatures:270 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `getAgentCapabilityManifest`<br>`GET /api/v1/agent-capabilities`<br>OPENAPI.yaml:148 | agent / agent_session / - / stable | resource:agent-capabilities（index.ts:35）<br>Runner: 缺/不适用 | getAgentCapabilities:274 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `getInstallStatus`<br>`GET /api/v1/install-status`<br>OPENAPI.yaml:174 |  / public / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `resetInstall`<br>`POST /api/v1/test/reset-install`<br>OPENAPI.yaml:186 |  / public / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `installWorkspace`<br>`POST /api/v1/auth/install`<br>OPENAPI.yaml:201 |  / bootstrap / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `login`<br>`POST /api/v1/auth/login`<br>OPENAPI.yaml:225 |  / public / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `logout`<br>`POST /api/v1/auth/logout`<br>OPENAPI.yaml:248 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `getCurrentActor`<br>`GET /api/v1/auth/me`<br>OPENAPI.yaml:272 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `getWorkspace`<br>`GET /api/v1/workspace`<br>OPENAPI.yaml:287 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `updateWorkspace`<br>`PATCH /api/v1/workspace`<br>OPENAPI.yaml:302 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listTeams`<br>`GET /api/v1/teams`<br>OPENAPI.yaml:328 | human,agent / human_or_agent_session / work:read / stable | tool:list_teams（index.ts:210）<br>Runner: 缺/不适用 | listTeams:297 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `createTeam`<br>`POST /api/v1/teams`<br>OPENAPI.yaml:343 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `updateTeam`<br>`PATCH /api/v1/teams/{id}`<br>OPENAPI.yaml:368 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `deleteTeam`<br>`DELETE /api/v1/teams/{id}`<br>OPENAPI.yaml:393 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listWorkflowStates`<br>`GET /api/v1/teams/{id}/states`<br>OPENAPI.yaml:419 | human,agent / human_or_agent_session / work:read / stable | tool:list_workflow_states（index.ts:211）<br>Runner: 缺/不适用 | listWorkflowStates:298 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `createWorkflowState`<br>`POST /api/v1/teams/{id}/states`<br>OPENAPI.yaml:435 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `updateWorkflowState`<br>`PATCH /api/v1/teams/{id}/states/{stateId}`<br>OPENAPI.yaml:465 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listProjects`<br>`GET /api/v1/projects`<br>OPENAPI.yaml:491 | human,agent / human_or_agent_session / work:read / stable | tool:resolve_identifier（index.ts:208）<br>tool:prepare_project_import（index.ts:209）<br>tool:list_projects（index.ts:212）<br>Runner: workmesh_list_projects | listProjects:299 | MCP与Runner均有静态入口；目标全链未在本轮运行 |
| `createProject`<br>`POST /api/v1/projects`<br>OPENAPI.yaml:506 | human,agent / human_or_agent_session / work:write / stable | tool:apply_project_import（index.ts:215）<br>tool:create_project（index.ts:216）<br>Runner: workmesh_create_project | createProject:301 | C协调Team访问可用；E虽manifest/Runner广告仍可能被teamAccess拒绝，M0核资格 |
| `getProject`<br>`GET /api/v1/projects/{id}`<br>OPENAPI.yaml:532 | human,agent / human_or_agent_session / work:read / stable | tool:get_project（index.ts:213）<br>Runner: workmesh_get_project | getProject:300 | MCP与Runner均有静态入口；目标全链未在本轮运行 |
| `updateProject`<br>`PATCH /api/v1/projects/{id}`<br>OPENAPI.yaml:547 | human,agent / human_or_agent_session / work:write / stable | tool:update_project（index.ts:217）<br>Runner: workmesh_update_project | updateProject:302 | C协调Team访问可用；E虽manifest/Runner广告仍可能被teamAccess拒绝，M0核资格 |
| `deleteProject`<br>`DELETE /api/v1/projects/{id}`<br>OPENAPI.yaml:572 | human,agent / human_or_agent_session / work:write / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | 声明含Agent但Coordination领域拒绝破坏动作；不可按manifest宣称可用 |
| `listHumanActors`<br>`GET /api/v1/actors/humans`<br>OPENAPI.yaml:597 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listWorkItems`<br>`GET /api/v1/work-items`<br>OPENAPI.yaml:613 | human,agent / human_or_agent_session / work:read / stable | tool:list_claimable_work_items（index.ts:207）<br>tool:list_work_items（index.ts:47）<br>Runner: workmesh_list_work_items | listWorkItems:381 | MCP与Runner均有静态入口；目标全链未在本轮运行 |
| `createWorkItem`<br>`POST /api/v1/work-items`<br>OPENAPI.yaml:646 | human,agent / human_or_agent_session / work:write / stable | tool:create_work_item（index.ts:218）<br>Runner: workmesh_create_work_item | createWorkItem:313 | C协调Team访问可用；E虽manifest/Runner广告仍可能被teamAccess拒绝，M0核资格 |
| `getWorkItem`<br>`GET /api/v1/work-items/{id}`<br>OPENAPI.yaml:672 | human,agent / human_or_agent_session / work:read / stable | resource:work-item（index.ts:37）<br>tool:get_work_item（index.ts:68）<br>Runner: workmesh_get_work_item | getWorkItem:380 | MCP与Runner均有静态入口；目标全链未在本轮运行 |
| `updateWorkItem`<br>`PATCH /api/v1/work-items/{id}`<br>OPENAPI.yaml:687 | human,agent / human_or_agent_session / work:write / stable | tool:update_work_item（index.ts:219）<br>Runner: workmesh_update_work_item | updateWorkItem:314 | MCP与Runner均有静态入口；目标全链未在本轮运行 |
| `deleteWorkItem`<br>`DELETE /api/v1/work-items/{id}`<br>OPENAPI.yaml:712 | human,agent / human_or_agent_session / work:write / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | 声明含Agent但Coordination领域拒绝破坏动作；不可按manifest宣称可用 |
| `listWorkItemComments`<br>`GET /api/v1/work-items/{id}/comments`<br>OPENAPI.yaml:738 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `createComment`<br>`POST /api/v1/work-items/{id}/comments`<br>OPENAPI.yaml:754 | human,agent / human_or_agent_session / comment:write / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | 声明含Agent但handler硬Human-only；M0披露修正，Agent写需另裁定 |
| `updateComment`<br>`PATCH /api/v1/comments/{id}`<br>OPENAPI.yaml:780 | human,agent / human_or_agent_session / comment:write / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | 声明含Agent但handler硬Human-only；M0披露修正，Agent写需另裁定 |
| `listSavedViews`<br>`GET /api/v1/views`<br>OPENAPI.yaml:806 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `createSavedView`<br>`POST /api/v1/views`<br>OPENAPI.yaml:821 | human,agent / human_or_agent_session / work:write / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `listEvents`<br>`GET /api/v1/events`<br>OPENAPI.yaml:845 | human,agent / human_or_agent_session / work:read / stable | tool:list_events（index.ts:52）<br>Runner: 缺/不适用 | listEvents:394 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `streamEvents`<br>`GET /api/v1/events/stream`<br>OPENAPI.yaml:867 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | streamEvents:406 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `listAgents`<br>`GET /api/v1/agents`<br>OPENAPI.yaml:890 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `registerAgent`<br>`POST /api/v1/agents/register`<br>OPENAPI.yaml:908 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `getAgent`<br>`GET /api/v1/agents/{id}`<br>OPENAPI.yaml:931 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `updateAgent`<br>`PATCH /api/v1/agents/{id}`<br>OPENAPI.yaml:946 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `approveAgentTeamAccess`<br>`PUT /api/v1/agents/{id}/team-access/{teamId}`<br>OPENAPI.yaml:970 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `revokeAgentTeamAccess`<br>`DELETE /api/v1/agents/{id}/team-access/{teamId}`<br>OPENAPI.yaml:997 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `createAgentWebhookEndpoint`<br>`POST /api/v1/agents/{id}/webhook-endpoints`<br>OPENAPI.yaml:1015 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `rotateAgentWebhookSecret`<br>`POST /api/v1/agents/{id}/webhook-endpoints/{endpointId}/rotate-secret`<br>OPENAPI.yaml:1017 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `claimWorkItem`<br>`POST /api/v1/work-items/{id}/claim`<br>OPENAPI.yaml:1027 | agent / coordination_connection / work:read, work:write / stable | tool:claim_work_item（index.ts:225）<br>Runner: 缺/不适用 | claimWorkItem:387 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `delegateAndStartAgentSession`<br>`POST /api/v1/work-items/{id}/agent-session`<br>OPENAPI.yaml:1055 | human,agent / human_or_coordination_connection / agent:delegate / stable | tool:delegate_work_item（index.ts:263）<br>Runner: 缺/不适用 | delegateAndStart:528 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `getDelegation`<br>`GET /api/v1/delegations/{id}`<br>OPENAPI.yaml:1085 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `revokeDelegation`<br>`POST /api/v1/delegations/{id}/revoke`<br>OPENAPI.yaml:1101 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listAgentSessions`<br>`GET /api/v1/agent-sessions`<br>OPENAPI.yaml:1124 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `getAgentSession`<br>`GET /api/v1/agent-sessions/{id}`<br>OPENAPI.yaml:1161 | human,agent / human_or_agent_session / work:read / stable | resource:agent-session（index.ts:36）<br>Runner: workmesh_get_session | getSession:341 | MCP与Runner均有静态入口；目标全链未在本轮运行 |
| `exchangeAgentSessionToken`<br>`POST /api/v1/agent-sessions/{id}/token/exchange`<br>OPENAPI.yaml:1179 | agent / installation_target / work:write / stable | 缺/不适用<br>Runner: 缺/不适用 | exchangeSessionToken:324 | 运行协议内部；由认证适配器实现，不作模型通用工具 |
| `refreshAgentSessionToken`<br>`POST /api/v1/agent-sessions/{id}/token/refresh`<br>OPENAPI.yaml:1207 | agent / installation_target / work:write / stable | 缺/不适用<br>Runner: 缺/不适用 | refreshSessionToken:330 | 运行协议内部；由认证适配器实现，不作模型通用工具 |
| `transitionAgentSessionState`<br>`POST /api/v1/agent-sessions/{id}/state`<br>OPENAPI.yaml:1227 | human,agent / human_or_agent_session / work:write / stable | tool:transition_agent_session_state（index.ts:301）<br>Runner: 缺/不适用 | transitionState:533 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `acknowledgeAgentSession`<br>`POST /api/v1/agent-sessions/{id}/ack`<br>OPENAPI.yaml:1236 | human,agent / human_or_agent_session / work:write / stable | tool:ack_agent_session（index.ts:300）<br>Runner: 缺/不适用 | acknowledge:532 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `heartbeatAgentSession`<br>`POST /api/v1/agent-sessions/{id}/heartbeat`<br>OPENAPI.yaml:1259 | human,agent / human_or_agent_session / work:write / stable | tool:heartbeat（index.ts:302）<br>Runner: 缺/不适用 | heartbeat:534 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `promptAgentSession`<br>`POST /api/v1/agent-sessions/{id}/prompt`<br>OPENAPI.yaml:1281 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listAgentActivities`<br>`GET /api/v1/agent-sessions/{id}/activities`<br>OPENAPI.yaml:1304 | human,agent / human_or_agent_session / work:read / stable | resource:session-activity（index.ts:40）<br>tool:list_session_activities（index.ts:63）<br>Runner: 缺/不适用 | getActivities:344 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `appendAgentActivity`<br>`POST /api/v1/agent-sessions/{id}/activities`<br>OPENAPI.yaml:1316 | human,agent / human_or_agent_session / work:write / stable | tool:append_activity（index.ts:303）<br>tool:send_message（index.ts:305）<br>tool:ask（index.ts:306）<br>Runner: workmesh_append_activity | appendActivity:536 | MCP与Runner均有静态入口；目标全链未在本轮运行 |
| `getAgentPlan`<br>`GET /api/v1/agent-sessions/{id}/plan`<br>OPENAPI.yaml:1338 | human,agent / human_or_agent_session / work:read / stable | resource:session-plan（index.ts:39）<br>Runner: 缺/不适用 | getPlan:343 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `publishAgentPlan`<br>`PUT /api/v1/agent-sessions/{id}/plan`<br>OPENAPI.yaml:1353 | human,agent / human_or_agent_session / plan:write / stable | tool:publish_plan（index.ts:304）<br>Runner: workmesh_publish_plan | publishPlan:539 | MCP与Runner均有静态入口；目标全链未在本轮运行 |
| `listAgentPlanVersions`<br>`GET /api/v1/agent-sessions/{id}/plans`<br>OPENAPI.yaml:1376 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `getAgentSessionContext`<br>`GET /api/v1/agent-sessions/{id}/context`<br>OPENAPI.yaml:1392 | human,agent / human_or_agent_session / work:read / stable | resource:session-context（index.ts:38）<br>Runner: 缺/不适用 | getSessionContext:342 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `signalAgentSession`<br>`POST /api/v1/agent-sessions/{id}/signals`<br>OPENAPI.yaml:1408 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `acknowledgeAgentSessionStop`<br>`POST /api/v1/agent-sessions/{id}/stop-ack`<br>OPENAPI.yaml:1432 | human,agent / human_or_agent_session / work:write / stable | 缺/不适用<br>Runner: 缺/不适用 | stopAcknowledgement:541 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `completeAgentSession`<br>`POST /api/v1/agent-sessions/{id}/complete`<br>OPENAPI.yaml:1456 | human,agent / human_or_agent_session / work:write / stable | tool:complete_session（index.ts:309）<br>Runner: workmesh_complete_session（完成意图，经settle原子提交） | complete:542 | MCP与Runner均有静态入口；目标全链未在本轮运行 |
| `failAgentSession`<br>`POST /api/v1/agent-sessions/{id}/fail`<br>OPENAPI.yaml:1480 | human,agent / human_or_agent_session / work:write / stable | tool:fail_session（index.ts:310）<br>Runner: 缺/不适用 | fail:543 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `retryAgentSession`<br>`POST /api/v1/agent-sessions/{id}/retry`<br>OPENAPI.yaml:1504 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | retrySession:544 | Human保留/基础设施；Agent不适用 |
| `listArtifacts`<br>`GET /api/v1/artifacts`<br>OPENAPI.yaml:1531 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `publishArtifact`<br>`POST /api/v1/artifacts`<br>OPENAPI.yaml:1556 | human,agent / human_or_agent_session / artifact:write / stable | tool:publish_artifact（index.ts:308）<br>Runner: workmesh_publish_artifact | publishArtifact:545 | MCP与Runner均有静态入口；目标全链未在本轮运行 |
| `listApprovals`<br>`GET /api/v1/approvals`<br>OPENAPI.yaml:1577 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `requestApproval`<br>`POST /api/v1/approvals`<br>OPENAPI.yaml:1607 | human,agent / human_or_agent_session / work:write / stable | tool:request_approval（index.ts:307）<br>Runner: workmesh_request_approval | requestApproval:546 | MCP与Runner均有静态入口；目标全链未在本轮运行 |
| `getApproval`<br>`GET /api/v1/approvals/{id}`<br>OPENAPI.yaml:1629 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `decideApproval`<br>`POST /api/v1/approvals/{id}/decide`<br>OPENAPI.yaml:1645 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `consumeApproval`<br>`POST /api/v1/approvals/{id}/consume`<br>OPENAPI.yaml:1668 | human,agent / human_or_agent_session / work:write / stable | 缺/不适用<br>Runner: 缺/不适用 | consumeApproval:547 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `getWorkRoom`<br>`GET /api/v1/rooms`<br>OPENAPI.yaml:1689 | human,agent / human_or_agent_session / work:read / stable | tool:get_work_room（index.ts:80）<br>Runner: 缺/不适用 | getRoom:345 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `getWorkRoomTimeline`<br>`GET /api/v1/rooms/{id}/timeline`<br>OPENAPI.yaml:1692 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | getRoomTimeline:346 | Human保留/基础设施；Agent不适用 |
| `postWorkRoomMessage`<br>`POST /api/v1/rooms/{id}/messages`<br>OPENAPI.yaml:1695 | human,agent / human_or_agent_session / work:write / stable | tool:post_work_room_message（index.ts:283）<br>Runner: 缺/不适用 | postRoomMessage:347 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `resolveWorkRoomMessage`<br>`POST /api/v1/messages/{id}/resolve`<br>OPENAPI.yaml:1698 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listHumanAttention`<br>`GET /api/v1/human-attention`<br>OPENAPI.yaml:1701 | human,agent / human_or_agent_session / work:read / stable | tool:list_human_attention（index.ts:83）<br>Runner: 缺/不适用 | listHumanAttention:350 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `getHumanAttention`<br>`GET /api/v1/human-attention/{id}`<br>OPENAPI.yaml:1704 | human,agent / human_or_agent_session / work:read / stable | tool:get_human_attention（index.ts:108）<br>Runner: 缺/不适用 | getHumanAttention:351 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `listRecoveryItems`<br>`GET /api/v1/recovery-items`<br>OPENAPI.yaml:1707 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `getRecoveryItem`<br>`GET /api/v1/recovery-items/{id}`<br>OPENAPI.yaml:1710 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `listControlCenter`<br>`GET /api/v1/control-center`<br>OPENAPI.yaml:1713 | human,agent / human_or_agent_session / work:read / stable | tool:get_control_center（index.ts:112）<br>Runner: 缺/不适用 | getControlCenter:352 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `getProjectControlCenter`<br>`GET /api/v1/projects/{projectId}/control-center`<br>OPENAPI.yaml:1716 | human,agent / human_or_agent_session / work:read / stable | tool:get_project_control_center（index.ts:116）<br>Runner: 缺/不适用 | getProjectControlCenter:353 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `explainAgentSession`<br>`GET /api/v1/agent-sessions/{sessionId}/explanation`<br>OPENAPI.yaml:1719 | human,agent / human_or_agent_session / work:read / stable | tool:explain_agent_session（index.ts:120）<br>Runner: 缺/不适用 | explainAgentSession:354 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `getWorkItemExecutionSummary`<br>`GET /api/v1/work-items/{workItemId}/execution-summary`<br>OPENAPI.yaml:1722 | human,agent / human_or_agent_session / work:read / stable | tool:get_work_item_execution_summary（index.ts:134）<br>Runner: 缺/不适用 | getWorkItemExecutionSummary:355 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `previewAgentSessionControl`<br>`POST /api/v1/agent-sessions/{sessionId}/control-preview`<br>OPENAPI.yaml:1725 | human,agent / human_or_agent_session / work:read / stable | tool:preview_agent_session_control（index.ts:135）<br>Runner: 缺/不适用 | previewAgentSessionControl:356 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `listInbox`<br>`GET /api/v1/inbox`<br>OPENAPI.yaml:1728 | human,agent / human_or_agent_session / work:read / stable | tool:list_inbox_items（index.ts:81）<br>Runner: 缺/不适用 | listInbox:348 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `listCollaborationQueueCounts`<br>`GET /api/v1/collaboration/queue-counts`<br>OPENAPI.yaml:1736 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `getInboxItem`<br>`GET /api/v1/inbox/{id}`<br>OPENAPI.yaml:1749 | human,agent / human_or_agent_session / work:read / stable | tool:get_inbox_item（index.ts:82）<br>Runner: 缺/不适用 | getInboxItem:349 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `claimInboxItem`<br>`POST /api/v1/inbox/{id}/claim`<br>OPENAPI.yaml:1751 | agent / agent_session / work:read / stable | tool:claim_inbox_item（index.ts:284）<br>Runner: 缺/不适用 | claimInboxItem:357 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `acknowledgeInboxItem`<br>`POST /api/v1/inbox/{id}/acknowledge`<br>OPENAPI.yaml:1753 | agent / agent_session / work:read / stable | tool:acknowledge_inbox_item（index.ts:285）<br>Runner: 缺/不适用 | acknowledgeInboxItem:358 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `replyInboxItem`<br>`POST /api/v1/inbox/{id}/reply`<br>OPENAPI.yaml:1755 | human,agent / human_or_agent_session / work:write / stable | tool:reply_inbox_item（index.ts:286）<br>Runner: 缺/不适用 | replyInboxItem:359 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `listLeases`<br>`GET /api/v1/leases`<br>OPENAPI.yaml:1757 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: workmesh_list_leases | 未见具名封装；实施需核SDK/补齐 | Runner有入口；MCP缺入口 |
| `acquireLease`<br>`POST /api/v1/leases`<br>OPENAPI.yaml:1758 | human,agent / human_or_agent_session / work:write / stable | tool:acquire_lease（index.ts:295）<br>Runner: workmesh_acquire_lease | acquireLease:365 | MCP与Runner均有静态入口；目标全链未在本轮运行 |
| `heartbeatLease`<br>`POST /api/v1/leases/{id}/heartbeat`<br>OPENAPI.yaml:1760 | human,agent / human_or_agent_session / work:write / stable | 缺/不适用<br>Runner: 缺/不适用 | mutateLease:366（按action参数） | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `renewLease`<br>`POST /api/v1/leases/{id}/renew`<br>OPENAPI.yaml:1762 | human,agent / human_or_agent_session / work:write / stable | 缺/不适用<br>Runner: 缺/不适用 | mutateLease:366（按action参数） | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `releaseLease`<br>`POST /api/v1/leases/{id}/release`<br>OPENAPI.yaml:1764 | human,agent / human_or_agent_session / work:write / stable | 缺/不适用<br>Runner: workmesh_release_lease | mutateLease:366（按action参数） | Runner有入口；MCP缺入口 |
| `forceReleaseLease`<br>`POST /api/v1/leases/{id}/force-release`<br>OPENAPI.yaml:1766 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | mutateLease:366（按action参数） | Human保留/基础设施；Agent不适用 |
| `listHandoffs`<br>`GET /api/v1/handoffs`<br>OPENAPI.yaml:1768 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `offerHandoff`<br>`POST /api/v1/handoffs`<br>OPENAPI.yaml:1769 | human,agent / human_or_agent_session / work:write / stable | tool:offer_handoff（index.ts:296）<br>Runner: workmesh_offer_handoff | offerHandoff:367 | MCP与Runner均有静态入口；目标全链未在本轮运行 |
| `inspectExactTargetHandoff`<br>`GET /api/v1/handoffs/{id}/inspect`<br>OPENAPI.yaml:1771 | agent / installation_target / work:read / stable | tool:inspect_pending_handoff（index.ts:297）<br>Runner: 缺/不适用 | inspectPendingHandoff:368 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `requestHandoff`<br>`POST /api/v1/handoffs/{id}/request`<br>OPENAPI.yaml:1773 | human,agent / human_or_agent_session / work:write / stable | tool:request_handoff（index.ts:298）<br>Runner: 缺/不适用 | requestHandoff:372 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `acceptHandoff`<br>`POST /api/v1/handoffs/{id}/accept`<br>OPENAPI.yaml:1775 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `rejectHandoff`<br>`POST /api/v1/handoffs/{id}/reject`<br>OPENAPI.yaml:1777 | agent / installation_target / work:write / stable | tool:reject_handoff（index.ts:299）<br>Runner: 缺/不适用 | rejectHandoff:375 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `cancelHandoff`<br>`POST /api/v1/handoffs/{id}/cancel`<br>OPENAPI.yaml:1779 | human,agent / human_or_agent_session / work:write / stable | 缺/不适用<br>Runner: 缺/不适用 | cancelHandoff:373 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `completeHandoff`<br>`POST /api/v1/handoffs/{id}/complete`<br>OPENAPI.yaml:1781 | human,agent / human_or_agent_session / work:write / stable | 缺/不适用<br>Runner: 缺/不适用 | completeHandoff:374 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `createWorkItemDecision`<br>`POST /api/v1/work-items/{id}/decisions`<br>OPENAPI.yaml:1783 | human,agent / human_or_agent_session / work:write / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `createProjectDecision`<br>`POST /api/v1/projects/{id}/decisions`<br>OPENAPI.yaml:1785 | human,agent / human_or_agent_session / work:write / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `createSessionDecision`<br>`POST /api/v1/agent-sessions/{id}/decisions`<br>OPENAPI.yaml:1787 | human,agent / human_or_agent_session / work:write / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `getDecision`<br>`GET /api/v1/decisions/{id}`<br>OPENAPI.yaml:1789 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `finalizeDecision`<br>`POST /api/v1/decisions/{id}/finalize`<br>OPENAPI.yaml:1791 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `supersedeDecision`<br>`POST /api/v1/decisions/{id}/supersede`<br>OPENAPI.yaml:1793 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `reverseDecision`<br>`POST /api/v1/decisions/{id}/reverse`<br>OPENAPI.yaml:1795 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `commentOnPlanStep`<br>`POST /api/v1/agent-sessions/{id}/plan/comments`<br>OPENAPI.yaml:1797 | human,agent / human_or_agent_session / work:write / stable | tool:comment_plan_step（index.ts:287）<br>Runner: 缺/不适用 | commentPlanStep:360 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `proposePlanAssignment`<br>`POST /api/v1/agent-sessions/{id}/assignment-proposals`<br>OPENAPI.yaml:1799 | human,agent / human_or_agent_session / work:write / stable | tool:propose_plan_step_assignment（index.ts:288）<br>Runner: 缺/不适用 | proposeAssignment:361 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `createChildAgentSession`<br>`POST /api/v1/agent-sessions/{id}/children`<br>OPENAPI.yaml:1801 | human,agent / human_or_agent_session / work:write / stable | tool:create_child_session（index.ts:289）<br>Runner: 缺/不适用 | createChildSession:362 | M2承接父作用域Runner创建与子启动；M1父完成gate，稳定Plan/预算/三方能力/并发验收；不是F新增 |
| `appendContextDelta`<br>`POST /api/v1/agent-sessions/{id}/context-deltas`<br>OPENAPI.yaml:1803 | human,agent / human_or_agent_session / work:write / stable | tool:append_context_delta（index.ts:290）<br>Runner: 缺/不适用 | appendContextDelta:363 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `createReviewDelegation`<br>`POST /api/v1/agent-sessions/{id}/review-delegations`<br>OPENAPI.yaml:1805 | human,agent / human_or_agent_session / work:write / stable | tool:create_review_delegation（index.ts:294）<br>Runner: 缺/不适用 | createReviewDelegation:364 | M2承接reviewer创建、Room结果与完成；无plan:write；M3追加PR证据链；数量/预算与普通child实现差异见矩阵 |
| `getWorkspaceGuidance`<br>`GET /api/v1/workspaces/{id}/guidance`<br>OPENAPI.yaml:1814 | human,agent / human_or_agent_session / work:read / stable | resource:workspace-guidance（index.ts:41）<br>Runner: 缺/不适用 | getGuidance:526 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `publishWorkspaceGuidance`<br>`PUT /api/v1/workspaces/{id}/guidance`<br>OPENAPI.yaml:1818 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listWorkspaceGuidanceHistory`<br>`GET /api/v1/workspaces/{id}/guidance/history`<br>OPENAPI.yaml:1820 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `diffWorkspaceGuidance`<br>`GET /api/v1/workspaces/{id}/guidance/diff`<br>OPENAPI.yaml:1822 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `archiveWorkspaceGuidance`<br>`POST /api/v1/workspaces/{id}/guidance/archive`<br>OPENAPI.yaml:1824 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `rollbackWorkspaceGuidance`<br>`POST /api/v1/workspaces/{id}/guidance/rollback`<br>OPENAPI.yaml:1826 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `getTeamGuidance`<br>`GET /api/v1/teams/{id}/guidance`<br>OPENAPI.yaml:1835 | human,agent / human_or_agent_session / work:read / stable | resource:team-guidance（index.ts:42）<br>Runner: 缺/不适用 | getGuidance:526 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `publishTeamGuidance`<br>`PUT /api/v1/teams/{id}/guidance`<br>OPENAPI.yaml:1839 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listTeamGuidanceHistory`<br>`GET /api/v1/teams/{id}/guidance/history`<br>OPENAPI.yaml:1841 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `diffTeamGuidance`<br>`GET /api/v1/teams/{id}/guidance/diff`<br>OPENAPI.yaml:1843 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `archiveTeamGuidance`<br>`POST /api/v1/teams/{id}/guidance/archive`<br>OPENAPI.yaml:1845 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `rollbackTeamGuidance`<br>`POST /api/v1/teams/{id}/guidance/rollback`<br>OPENAPI.yaml:1847 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `getProjectGuidance`<br>`GET /api/v1/projects/{id}/guidance`<br>OPENAPI.yaml:1856 | human,agent / human_or_agent_session / work:read / stable | resource:project-guidance（index.ts:43）<br>Runner: 缺/不适用 | getGuidance:526 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `publishProjectGuidance`<br>`PUT /api/v1/projects/{id}/guidance`<br>OPENAPI.yaml:1860 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listProjectGuidanceHistory`<br>`GET /api/v1/projects/{id}/guidance/history`<br>OPENAPI.yaml:1862 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `diffProjectGuidance`<br>`GET /api/v1/projects/{id}/guidance/diff`<br>OPENAPI.yaml:1864 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `archiveProjectGuidance`<br>`POST /api/v1/projects/{id}/guidance/archive`<br>OPENAPI.yaml:1866 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `rollbackProjectGuidance`<br>`POST /api/v1/projects/{id}/guidance/rollback`<br>OPENAPI.yaml:1868 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `createProviderConnection`<br>`POST /api/v1/provider-connections`<br>OPENAPI.yaml:1871 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `receiveGitHubWebhook`<br>`POST /api/v1/provider-webhooks/{connectionId}/github`<br>OPENAPI.yaml:1874 | service / provider_signature / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listRepositories`<br>`GET /api/v1/repositories`<br>OPENAPI.yaml:1876 | human,agent / human_or_agent_session / repo:read / stable | 缺/不适用<br>Runner: 缺/不适用 | listRepositories:550 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `connectRepository`<br>`POST /api/v1/repositories`<br>OPENAPI.yaml:1878 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `getRepositoryContext`<br>`GET /api/v1/repositories/{id}/context`<br>OPENAPI.yaml:1880 | human,agent / human_or_agent_session / repo:read / stable | resource:repository-context（index.ts:45）<br>Runner: 缺/不适用 | getRepositoryContext:551 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `pinRepositoryContext`<br>`POST /api/v1/repositories/{id}/context`<br>OPENAPI.yaml:1882 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `requestProviderAction`<br>`POST /api/v1/provider-actions`<br>OPENAPI.yaml:1885 | human,agent / human_or_agent_session / repo:write_branch / stable | tool:create_repository_branch（index.ts:271）<br>tool:create_repository_commit（index.ts:272）<br>tool:open_pull_request（index.ts:273）<br>Runner: 缺/不适用 | requestProviderAction:552 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `publishDeliveryArtifact`<br>`POST /api/v1/delivery-artifacts`<br>OPENAPI.yaml:1888 | human,agent / human_or_agent_session / work:write / stable | tool:publish_delivery_artifact（index.ts:274）<br>Runner: 缺/不适用 | publishDeliveryArtifact:553 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `requestArtifactUpload`<br>`POST /api/v1/artifact-upload-intents`<br>OPENAPI.yaml:1891 | human,agent / human_or_agent_session / artifact:write / stable | tool:request_artifact_upload（index.ts:275）<br>Runner: 缺/不适用 | requestArtifactUpload:554 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `getArtifactUploadStatus`<br>`GET /api/v1/artifact-upload-intents/{id}`<br>OPENAPI.yaml:1894 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `finalizeArtifactUpload`<br>`POST /api/v1/artifact-upload-intents/{id}/finalize`<br>OPENAPI.yaml:1897 | human,agent / human_or_agent_session / artifact:write / stable | tool:finalize_artifact_upload（index.ts:276）<br>Runner: 缺/不适用 | finalizeArtifactUpload:555 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `cancelArtifactUpload`<br>`POST /api/v1/artifact-upload-intents/{id}/cancel`<br>OPENAPI.yaml:1900 | human,agent / human_or_agent_session / artifact:write / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `listWorkItemArtifacts`<br>`GET /api/v1/work-items/{id}/artifacts`<br>OPENAPI.yaml:1903 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `downloadVerifiedArtifact`<br>`GET /api/v1/artifact-upload-intents/{id}/download`<br>OPENAPI.yaml:1906 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | getArtifactDownload:556 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `publishStructuredReview`<br>`POST /api/v1/pull-requests/{id}/reviews`<br>OPENAPI.yaml:1909 | human,agent / human_or_agent_session / artifact:write / stable | tool:publish_structured_review（index.ts:277）<br>Runner: 缺/不适用 | publishStructuredReview:557 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `requestPullRequestMerge`<br>`POST /api/v1/pull-requests/{id}/merge`<br>OPENAPI.yaml:1912 | human,agent / human_or_agent_session / repo:merge / stable | tool:merge_pull_request（index.ts:278）<br>Runner: 缺/不适用 | requestMerge:558 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `retryPullRequestCheck`<br>`POST /api/v1/pull-requests/{id}/checks/{checkId}/retry`<br>OPENAPI.yaml:1915 | human,agent / human_or_agent_session / ci:run / stable | tool:retry_ci_check（index.ts:279）<br>Runner: 缺/不适用 | retryCiCheck:559 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `getProjectDelivery`<br>`GET /api/v1/projects/{id}/delivery`<br>OPENAPI.yaml:1917 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | getProjectDelivery:560 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `listProjectMilestones`<br>`GET /api/v1/projects/{id}/milestones`<br>OPENAPI.yaml:1919 | human,agent / human_or_agent_session / work:read / stable | tool:list_project_milestones（index.ts:69）<br>Runner: 缺/不适用 | listProjectMilestones:315 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `createProjectMilestone`<br>`POST /api/v1/projects/{id}/milestones`<br>OPENAPI.yaml:1920 | human,agent / human_or_agent_session / work:write / stable | tool:create_milestone（index.ts:220）<br>Runner: 缺/不适用 | createMilestone:317 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `getMilestone`<br>`GET /api/v1/milestones/{id}`<br>OPENAPI.yaml:1922 | human,agent / human_or_agent_session / work:read / stable | tool:get_milestone（index.ts:70）<br>Runner: 缺/不适用 | getMilestone:316 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `updateMilestone`<br>`PATCH /api/v1/milestones/{id}`<br>OPENAPI.yaml:1923 | human,agent / human_or_agent_session / work:write / stable | tool:update_milestone（index.ts:221）<br>Runner: 缺/不适用 | updateMilestone:318 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `deleteMilestone`<br>`DELETE /api/v1/milestones/{id}`<br>OPENAPI.yaml:1924 | human,agent / human_or_agent_session / work:write / stable | tool:delete_milestone（index.ts:222）<br>Runner: 缺/不适用 | deleteMilestone:319 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `listDocuments`<br>`GET /api/v1/documents`<br>OPENAPI.yaml:1926 | human,agent / human_or_agent_session / work:read / stable | tool:list_documents（index.ts:71）<br>Runner: workmesh_list_documents | listDocuments:303 | MCP与Runner均有静态入口；目标全链未在本轮运行 |
| `createDocument`<br>`POST /api/v1/documents`<br>OPENAPI.yaml:1927 | human,agent / human_or_agent_session / work:write / stable | tool:create_document（index.ts:267）<br>Runner: workmesh_create_document | createDocument:304 | MCP与Runner均有静态入口；目标全链未在本轮运行 |
| `getDocument`<br>`GET /api/v1/documents/{id}`<br>OPENAPI.yaml:1929 | human,agent / human_or_agent_session / work:read / stable | tool:get_document（index.ts:72）<br>Runner: workmesh_get_document | getDocument:305 | MCP与Runner均有静态入口；目标全链未在本轮运行 |
| `updateDocument`<br>`PATCH /api/v1/documents/{id}`<br>OPENAPI.yaml:1930 | human,agent / human_or_agent_session / work:write / stable | tool:update_document（index.ts:268）<br>Runner: workmesh_update_document | updateDocument:306 | MCP与Runner均有静态入口；目标全链未在本轮运行 |
| `listDocumentHistory`<br>`GET /api/v1/documents/{id}/history`<br>OPENAPI.yaml:1932 | human,agent / human_or_agent_session / work:read / stable | tool:list_document_history（index.ts:73）<br>Runner: 缺/不适用 | listDocumentHistory:307 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `getDocumentRevision`<br>`GET /api/v1/documents/{id}/revisions/{revisionId}`<br>OPENAPI.yaml:1934 | human,agent / human_or_agent_session / work:read / stable | resource:document-revision（index.ts:44）<br>tool:get_document_revision（index.ts:74）<br>Runner: 缺/不适用 | getDocumentRevision:308 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `diffDocumentRevisions`<br>`GET /api/v1/documents/{id}/diff`<br>OPENAPI.yaml:1936 | human,agent / human_or_agent_session / work:read / stable | tool:diff_document_revisions（index.ts:75）<br>Runner: 缺/不适用 | diffDocumentRevisions:309 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `exportDocumentMarkdown`<br>`GET /api/v1/documents/{id}/export`<br>OPENAPI.yaml:1938 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `archiveDocument`<br>`POST /api/v1/documents/{id}/archive`<br>OPENAPI.yaml:1940 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | archiveDocument:310 | Human保留/基础设施；Agent不适用 |
| `unarchiveDocument`<br>`POST /api/v1/documents/{id}/unarchive`<br>OPENAPI.yaml:1942 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | unarchiveDocument:311 | Human保留/基础设施；Agent不适用 |
| `restoreDocumentRevision`<br>`POST /api/v1/documents/{id}/restore`<br>OPENAPI.yaml:1944 | human,agent / human_or_agent_session / work:write / stable | tool:restore_document_revision（index.ts:269）<br>Runner: 缺/不适用 | restoreDocumentRevision:312 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `listWorkItemRelations`<br>`GET /api/v1/work-items/{id}/relations`<br>OPENAPI.yaml:1946 | human,agent / human_or_agent_session / work:read / stable | tool:list_work_item_relations（index.ts:76）<br>Runner: 缺/不适用 | listWorkItemRelations:320 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `createWorkItemRelation`<br>`POST /api/v1/work-items/{id}/relations`<br>OPENAPI.yaml:1947 | human,agent / human_or_agent_session / work:write / stable | tool:add_work_item_relation（index.ts:223）<br>Runner: workmesh_create_work_item_relation | createWorkItemRelation:321 | MCP与Runner均有静态入口；目标全链未在本轮运行 |
| `deleteWorkItemRelation`<br>`DELETE /api/v1/work-items/{id}/relations/{relationId}`<br>OPENAPI.yaml:1949 | human,agent / human_or_agent_session / work:write / stable | tool:remove_work_item_relation（index.ts:224）<br>Runner: 缺/不适用 | deleteWorkItemRelation:322 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `createProjectUpdateDraft`<br>`POST /api/v1/projects/{id}/updates`<br>OPENAPI.yaml:1951 | human,agent / human_or_agent_session / work:write / stable | tool:draft_project_update（index.ts:280）<br>Runner: 缺/不适用 | draftProjectUpdate:561 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `publishProjectUpdate`<br>`POST /api/v1/projects/{id}/updates/{updateId}/publish`<br>OPENAPI.yaml:1953 | human / human_session / - / stable | tool:publish_project_update（index.ts:281）<br>Runner: 缺/不适用 | publishProjectUpdate:562 | Human保留/基础设施；Agent不适用 |
| `createProjectDependency`<br>`POST /api/v1/projects/{id}/dependencies`<br>OPENAPI.yaml:1955 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `suggestWorkItemCompletion`<br>`POST /api/v1/projects/{id}/completion-suggestions`<br>OPENAPI.yaml:1957 | human,agent / human_or_agent_session / work:write / stable | 缺/不适用<br>Runner: 缺/不适用 | suggestCompletion:563 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `decideCompletionSuggestion`<br>`POST /api/v1/completion-suggestions/{id}/decision`<br>OPENAPI.yaml:1959 | human / human_session / - / stable | tool:decide_completion_suggestion（index.ts:282）<br>Runner: 缺/不适用 | decideCompletionSuggestion:564 | Human保留/基础设施；Agent不适用 |
| `listCycles`<br>`GET /api/v1/cycles`<br>OPENAPI.yaml:1961 | human,agent / human_or_agent_session / work:read / beta (WORKMESH_BETA_PLANNING) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `createCycle`<br>`POST /api/v1/cycles`<br>OPENAPI.yaml:1962 | human / human_session / - / beta (WORKMESH_BETA_PLANNING) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `generateCycles`<br>`POST /api/v1/cycles/generate`<br>OPENAPI.yaml:1964 | human / human_session / - / beta (WORKMESH_BETA_PLANNING) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `carryOverCycleWork`<br>`POST /api/v1/cycles/{id}/carry-over`<br>OPENAPI.yaml:1966 | human / human_session / - / beta (WORKMESH_BETA_PLANNING) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `setWorkItemCycle`<br>`PATCH /api/v1/work-items/{id}/cycle`<br>OPENAPI.yaml:1968 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listInitiatives`<br>`GET /api/v1/initiatives`<br>OPENAPI.yaml:1970 | human,agent / human_or_agent_session / work:read / beta (WORKMESH_BETA_PLANNING) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `createInitiative`<br>`POST /api/v1/initiatives`<br>OPENAPI.yaml:1971 | human / human_session / - / beta (WORKMESH_BETA_PLANNING) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `getInitiativeRollup`<br>`GET /api/v1/initiatives/{id}/rollup`<br>OPENAPI.yaml:1973 | human,agent / human_or_agent_session / work:read / beta (WORKMESH_BETA_PLANNING) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | M4后端读取缺口：membership过滤无Agent Session scope分支；先修live scope再补入口，未修标Agent不支持 |
| `listAdvancedViews`<br>`GET /api/v1/advanced-views`<br>OPENAPI.yaml:1975 | human,agent / human_or_agent_session / work:read / beta (WORKMESH_BETA_PLANNING) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `createAdvancedView`<br>`POST /api/v1/advanced-views`<br>OPENAPI.yaml:1976 | human / human_session / - / beta (WORKMESH_BETA_PLANNING) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `evaluateAdvancedView`<br>`GET /api/v1/advanced-views/{id}/results`<br>OPENAPI.yaml:1978 | human,agent / human_or_agent_session / work:read / beta (WORKMESH_BETA_PLANNING) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `getProjectHealthHistory`<br>`GET /api/v1/projects/{id}/health`<br>OPENAPI.yaml:1980 | human,agent / human_or_agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `createProjectHealthUpdate`<br>`POST /api/v1/projects/{id}/health`<br>OPENAPI.yaml:1981 | human,agent / human_or_agent_session / work:write / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `listAutomationRules`<br>`GET /api/v1/automation-rules`<br>OPENAPI.yaml:1983 | human,agent / human_or_agent_session / work:read / experimental (WORKMESH_EXPERIMENTAL_AUTOMATION) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `createAutomationRule`<br>`POST /api/v1/automation-rules`<br>OPENAPI.yaml:1984 | human / human_session / - / experimental (WORKMESH_EXPERIMENTAL_AUTOMATION) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `createAutomationRuleVersion`<br>`POST /api/v1/automation-rules/{id}/versions`<br>OPENAPI.yaml:1986 | human / human_session / - / experimental (WORKMESH_EXPERIMENTAL_AUTOMATION) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `dryRunAutomationRule`<br>`POST /api/v1/automation-rules/{id}/dry-run`<br>OPENAPI.yaml:1988 | human / human_session / - / experimental (WORKMESH_EXPERIMENTAL_AUTOMATION) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `triggerAutomationRule`<br>`POST /api/v1/automation-rules/{id}/trigger`<br>OPENAPI.yaml:1990 | human / human_session / - / experimental (WORKMESH_EXPERIMENTAL_AUTOMATION) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `setAutomationRuleState`<br>`POST /api/v1/automation-rules/{id}/state`<br>OPENAPI.yaml:1992 | human / human_session / - / experimental (WORKMESH_EXPERIMENTAL_AUTOMATION) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listAutomationRuns`<br>`GET /api/v1/automation-runs`<br>OPENAPI.yaml:1994 | human,agent / human_or_agent_session / work:read / experimental (WORKMESH_EXPERIMENTAL_AUTOMATION) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `getAutomationRun`<br>`GET /api/v1/automation-runs/{runId}`<br>OPENAPI.yaml:1996 | human,agent / human_or_agent_session / work:read / experimental (WORKMESH_EXPERIMENTAL_AUTOMATION) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `listLoops`<br>`GET /api/v1/loops`<br>OPENAPI.yaml:1998 | human,agent / human_or_agent_session / work:read / experimental (WORKMESH_EXPERIMENTAL_AGENT_LOOPS) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `createLoop`<br>`POST /api/v1/loops`<br>OPENAPI.yaml:1999 | human / human_session / - / experimental (WORKMESH_EXPERIMENTAL_AGENT_LOOPS) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `runLoopNow`<br>`POST /api/v1/loops/{id}/run`<br>OPENAPI.yaml:2001 | human,agent / human_or_agent_session / automation:manage / experimental (WORKMESH_EXPERIMENTAL_AGENT_LOOPS) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `setLoopState`<br>`POST /api/v1/loops/{id}/state`<br>OPENAPI.yaml:2003 | human / human_session / - / experimental (WORKMESH_EXPERIMENTAL_AGENT_LOOPS) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `recordUsage`<br>`POST /api/v1/usage-records`<br>OPENAPI.yaml:2005 | human,agent / human_or_agent_session / work:read / beta (WORKMESH_BETA_COSTS) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `getUsageSummary`<br>`GET /api/v1/usage-summary`<br>OPENAPI.yaml:2007 | human,agent / human_or_agent_session / work:read / beta (WORKMESH_BETA_COSTS) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `setBudgetPolicy`<br>`POST /api/v1/budget-policies`<br>OPENAPI.yaml:2009 | human / human_session / - / beta (WORKMESH_BETA_COSTS) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listNotifications`<br>`GET /api/v1/notifications`<br>OPENAPI.yaml:2011 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `createNotification`<br>`POST /api/v1/notifications`<br>OPENAPI.yaml:2012 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `getNotificationPreferences`<br>`GET /api/v1/notification-preferences`<br>OPENAPI.yaml:2014 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `updateNotificationPreferences`<br>`PUT /api/v1/notification-preferences`<br>OPENAPI.yaml:2015 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listTemplates`<br>`GET /api/v1/templates`<br>OPENAPI.yaml:2017 | human,agent / human_or_agent_session / work:read / beta (WORKMESH_BETA_TEMPLATES) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `createTemplate`<br>`POST /api/v1/templates`<br>OPENAPI.yaml:2018 | human / human_session / - / beta (WORKMESH_BETA_TEMPLATES) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `createTemplateVersion`<br>`POST /api/v1/templates/{id}/versions`<br>OPENAPI.yaml:2020 | human / human_session / - / beta (WORKMESH_BETA_TEMPLATES) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `setTemplateState`<br>`POST /api/v1/templates/{id}/state`<br>OPENAPI.yaml:2022 | human / human_session / - / beta (WORKMESH_BETA_TEMPLATES) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `exportTemplates`<br>`GET /api/v1/templates/export`<br>OPENAPI.yaml:2024 | human / human_session / - / beta (WORKMESH_BETA_TEMPLATES) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `importTemplatesAsDrafts`<br>`POST /api/v1/templates/import`<br>OPENAPI.yaml:2026 | human / human_session / - / beta (WORKMESH_BETA_TEMPLATES) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `configureA2ABinding`<br>`POST /api/v1/a2a-bindings`<br>OPENAPI.yaml:2028 | human / human_session / - / experimental (WORKMESH_EXPERIMENTAL_A2A) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `acceptA2ATask`<br>`POST /api/v1/a2a-bindings/{id}/tasks`<br>OPENAPI.yaml:2030 | human / human_session / - / experimental (WORKMESH_EXPERIMENTAL_A2A) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `streamA2ATaskEvents`<br>`GET /api/v1/a2a-bindings/{id}/tasks/{taskId}/events`<br>OPENAPI.yaml:2032 | human,agent / human_or_agent_session / work:read / experimental (WORKMESH_EXPERIMENTAL_A2A) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Agent可见REST声明；缺MCP入口（须核领域限制） |
| `getWorkMeshAgentWellKnown`<br>`GET /.well-known/workmesh-agent`<br>OPENAPI.yaml:2034 |  / public / - / beta (WORKMESH_BETA_COORDINATION_MCP) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listAgentConnections`<br>`GET /api/v1/agent-connections`<br>OPENAPI.yaml:2036 | human / human_session / - / beta (WORKMESH_BETA_COORDINATION_MCP) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `createAgentConnection`<br>`POST /api/v1/agent-connections`<br>OPENAPI.yaml:2037 | human / human_session / - / beta (WORKMESH_BETA_COORDINATION_MCP) | 缺/不适用<br>Runner: 缺/不适用 | createAgentConnection:283 | Human保留/基础设施；Agent不适用 |
| `redeemAgentConnection`<br>`POST /api/v1/agent-connections/redeem`<br>OPENAPI.yaml:2039 |  / public / - / beta (WORKMESH_BETA_COORDINATION_MCP) | 缺/不适用<br>Runner: 缺/不适用 | redeemAgentConnection:284 | Human保留/基础设施；Agent不适用 |
| `getCurrentAgentConnectionIdentity`<br>`GET /api/v1/agent-connections/current-identity`<br>OPENAPI.yaml:2041 | agent / coordination_connection / - / beta (WORKMESH_BETA_COORDINATION_MCP) | tool:verify_connection（index.ts:145）<br>tool:get_current_identity（index.ts:199）<br>tool:get_workmesh_context（index.ts:206）<br>Runner: 缺/不适用 | getCurrentAgentConnectionIdentity:278 | MCP有入口；Runner无同operation适配/或有意留在接入层 |
| `getAgentConnection`<br>`GET /api/v1/agent-connections/{id}`<br>OPENAPI.yaml:2044 | human / human_session / - / beta (WORKMESH_BETA_COORDINATION_MCP) | 缺/不适用<br>Runner: 缺/不适用 | getAgentConnection:285 | Human保留/基础设施；Agent不适用 |
| `patchAgentConnection`<br>`PATCH /api/v1/agent-connections/{id}`<br>OPENAPI.yaml:2045 | human / human_session / - / beta (WORKMESH_BETA_COORDINATION_MCP) | 缺/不适用<br>Runner: 缺/不适用 | patchAgentConnection:286 | Human保留/基础设施；Agent不适用 |
| `revokeAgentConnection`<br>`DELETE /api/v1/agent-connections/{id}`<br>OPENAPI.yaml:2046 | human / human_session / - / beta (WORKMESH_BETA_COORDINATION_MCP) | 缺/不适用<br>Runner: 缺/不适用 | revokeAgentConnection:287 | Human保留/基础设施；Agent不适用 |
| `rotateAgentConnection`<br>`POST /api/v1/agent-connections/{id}/rotate`<br>OPENAPI.yaml:2049 | human / human_session / - / beta (WORKMESH_BETA_COORDINATION_MCP) | 缺/不适用<br>Runner: 缺/不适用 | rotateAgentConnection:288 | Human保留/基础设施；Agent不适用 |
| `confirmAgentConnectionRotation`<br>`POST /api/v1/agent-connections/{id}/rotate-confirm`<br>OPENAPI.yaml:2052 | human / human_session / - / beta (WORKMESH_BETA_COORDINATION_MCP) | 缺/不适用<br>Runner: 缺/不适用 | confirmAgentConnectionRotation:289 | Human保留/基础设施；Agent不适用 |
| `getApprovalAutonomyPolicy`<br>`GET /api/v1/approval-autonomy-policy`<br>OPENAPI.yaml:2054 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | getApprovalAutonomyPolicy:290 | Human保留/基础设施；Agent不适用 |
| `updateApprovalAutonomyPolicy`<br>`PUT /api/v1/approval-autonomy-policy`<br>OPENAPI.yaml:2055 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | updateApprovalAutonomyPolicy:291 | Human保留/基础设施；Agent不适用 |
| `getBrowserPushConfig`<br>`GET /api/v1/browser-push/config`<br>OPENAPI.yaml:2057 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listBrowserPushSubscriptions`<br>`GET /api/v1/browser-push/subscriptions`<br>OPENAPI.yaml:2059 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `createBrowserPushSubscription`<br>`POST /api/v1/browser-push/subscriptions`<br>OPENAPI.yaml:2060 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `revokeBrowserPushSubscription`<br>`DELETE /api/v1/browser-push/subscriptions/{id}`<br>OPENAPI.yaml:2062 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listAgentEnrollmentPolicies`<br>`GET /api/v1/agent-enrollment-policies`<br>OPENAPI.yaml:2064 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | listAgentEnrollmentPolicies:292 | Human保留/基础设施；Agent不适用 |
| `createAgentEnrollmentPolicy`<br>`POST /api/v1/agent-enrollment-policies`<br>OPENAPI.yaml:2065 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | createAgentEnrollmentPolicy:293 | Human保留/基础设施；Agent不适用 |
| `revokeAgentEnrollmentPolicy`<br>`DELETE /api/v1/agent-enrollment-policies/{id}`<br>OPENAPI.yaml:2067 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | revokeAgentEnrollmentPolicy:294 | Human保留/基础设施；Agent不适用 |
| `redeemAgentEnrollment`<br>`POST /api/v1/agent-enrollments/redeem`<br>OPENAPI.yaml:2069 |  / public / - / stable | 缺/不适用<br>Runner: 缺/不适用 | redeemAgentEnrollment:295 | Human保留/基础设施；Agent不适用 |
| `listWorkbenchRunnerAssignments`<br>`GET /api/v1/workbench/runner/assignments`<br>OPENAPI.yaml:2077 | agent / installation_target / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | 运行协议内部；由认证适配器实现，不作模型通用工具 |
| `listAgentWorkbenchTurns`<br>`GET /api/v1/agent-sessions/{id}/workbench-turns`<br>OPENAPI.yaml:2087 | agent / agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | 运行协议内部；由认证适配器实现，不作模型通用工具 |
| `claimWorkbenchTurn`<br>`POST /api/v1/workbench/turns/{id}/claim`<br>OPENAPI.yaml:2098 | agent / agent_session / work:write / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | 运行协议内部；由认证适配器实现，不作模型通用工具 |
| `getWorkbenchAttemptCredential`<br>`GET /api/v1/workbench/runner-attempts/{id}/credential`<br>OPENAPI.yaml:2109 | agent / agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | 运行协议内部；由认证适配器实现，不作模型通用工具 |
| `startWorkbenchAttempt`<br>`POST /api/v1/workbench/runner-attempts/{id}/start`<br>OPENAPI.yaml:2120 | agent / agent_session / work:write / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | 运行协议内部；由认证适配器实现，不作模型通用工具 |
| `getWorkbenchAttemptStatus`<br>`GET /api/v1/workbench/runner-attempts/{id}/status`<br>OPENAPI.yaml:2131 | agent / agent_session / work:read / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | 运行协议内部；由认证适配器实现，不作模型通用工具 |
| `settleWorkbenchAttempt`<br>`POST /api/v1/workbench/runner-attempts/{id}/settle`<br>OPENAPI.yaml:2141 | agent / agent_session / work:write / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | 运行协议内部；由认证适配器实现，不作模型通用工具 |
| `listWorkbenchConversations`<br>`GET /api/v1/workbench/conversations`<br>OPENAPI.yaml:2152 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `createWorkbenchConversation`<br>`POST /api/v1/workbench/conversations`<br>OPENAPI.yaml:2161 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `getWorkbenchConversation`<br>`GET /api/v1/workbench/conversations/{id}`<br>OPENAPI.yaml:2172 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `archiveWorkbenchConversation`<br>`POST /api/v1/workbench/conversations/{id}/archive`<br>OPENAPI.yaml:2182 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listWorkbenchMessages`<br>`GET /api/v1/workbench/conversations/{id}/messages`<br>OPENAPI.yaml:2192 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listWorkbenchTurns`<br>`GET /api/v1/workbench/conversations/{id}/turns`<br>OPENAPI.yaml:2202 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `queueWorkbenchTurn`<br>`POST /api/v1/workbench/conversations/{id}/turns`<br>OPENAPI.yaml:2211 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `stopWorkbenchTurn`<br>`POST /api/v1/workbench/conversations/{id}/turns/{turnId}/stop`<br>OPENAPI.yaml:2222 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `steerWorkbenchTurn`<br>`POST /api/v1/workbench/conversations/{id}/turns/{turnId}/steer`<br>OPENAPI.yaml:2233 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `followupWorkbenchTurn`<br>`POST /api/v1/workbench/conversations/{id}/turns/{turnId}/followup`<br>OPENAPI.yaml:2244 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `updateWorkbenchConversationContextPins`<br>`PATCH /api/v1/workbench/conversations/{id}/context-pins`<br>OPENAPI.yaml:2255 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `getConfigurationReadiness`<br>`GET /api/v1/workbench/configuration-readiness`<br>OPENAPI.yaml:2266 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listWorkbenchLlmConnections`<br>`GET /api/v1/workbench/llm-connections`<br>OPENAPI.yaml:2292 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `createWorkbenchLlmConnection`<br>`POST /api/v1/workbench/llm-connections`<br>OPENAPI.yaml:2301 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `getWorkbenchLlmConnection`<br>`GET /api/v1/workbench/llm-connections/{id}`<br>OPENAPI.yaml:2312 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `updateWorkbenchLlmConnection`<br>`PATCH /api/v1/workbench/llm-connections/{id}`<br>OPENAPI.yaml:2321 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `revokeWorkbenchLlmConnection`<br>`DELETE /api/v1/workbench/llm-connections/{id}`<br>OPENAPI.yaml:2331 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `upsertWorkbenchLlmModel`<br>`POST /api/v1/workbench/llm-connections/{id}/models`<br>OPENAPI.yaml:2341 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `getRetentionStatus`<br>`GET /api/v1/admin/retention/status`<br>OPENAPI.yaml:2352 | human / human_session / - / stable | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `getNotificationChannelConfig`<br>`GET /api/v1/notification-channel-targets/config`<br>OPENAPI.yaml:2368 | human / human_session / - / experimental (WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listNotificationChannelTargets`<br>`GET /api/v1/notification-channel-targets`<br>OPENAPI.yaml:2384 | human / human_session / - / experimental (WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `createNotificationChannelTarget`<br>`POST /api/v1/notification-channel-targets`<br>OPENAPI.yaml:2395 | human / human_session / - / experimental (WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `updateNotificationChannelTarget`<br>`PATCH /api/v1/notification-channel-targets/{id}`<br>OPENAPI.yaml:2419 | human / human_session / - / experimental (WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `revokeNotificationChannelTarget`<br>`DELETE /api/v1/notification-channel-targets/{id}`<br>OPENAPI.yaml:2444 | human / human_session / - / experimental (WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `listChannelNotificationDeliveries`<br>`GET /api/v1/channel-notification-deliveries`<br>OPENAPI.yaml:2464 | human / human_session / - / experimental (WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |
| `reconcileChannelNotificationDelivery`<br>`POST /api/v1/channel-notification-deliveries/{id}/reconcile`<br>OPENAPI.yaml:2476 | human / human_session / - / experimental (WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS) | 缺/不适用<br>Runner: 缺/不适用 | 未见具名封装；实施需核SDK/补齐 | Human保留/基础设施；Agent不适用 |

## 逐操作参数、DTO与返回出处

以下保留OpenAPI中参数的名称/位置/必需性及schema引用，返回HTTP状态和schema引用；内联定义标明回读位置，不据泛型unknown声称DTO强类型覆盖。

### `listModelPresets`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/ModelPresetCatalog"}；403: {"$ref":"#/components/schemas/Error"}

### `live`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/Health"}

### `ready`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/Health"}；503: API is draining or a required dependency is unavailable.

### `health`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: #/components/responses/Health

### `getServerInfo`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: {"type":"object","additionalProperties":false,"required":["serverVersion","restApiVersion","agentProtocolVersion","mcpVersion","a2aUpstreamVersion","preferredClientProfileVersion","supportedClientProfileVersions","conformanceSuiteVersion","schemaBaseline","buildSha"],"properties":{"serverVersion":{"const":"1.0.0"},"restApiVersion":{"const":"1.0"},"agentProtocolVersion":{"const":"1.0"},"mcpVersion":{"const":"1.0.0"},"a2aUpstreamVersion":{"const":"0.3"},"preferredClientProfileVersion":{"const":"1.0"},"supportedClientProfileVersions":{"type":"array","minItems":1,"maxItems":1,"items":{"const":"1.0"}},"conformanceSuiteVersion":{"const":"1.0"},"schemaBaseline":{"const":1},"buildSha":{"type":"string","minLength":1,"maxLength":128}}}

### `getDeploymentFeatures`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: {"type":"object","additionalProperties":false,"required":["features"],"properties":{"features":{"type":"array","minItems":10,"maxItems":10,"items":{"type":"object","additionalProperties":false,"required":["key","tier","enabled"],"properties":{"key":{"type":"string","enum":["WORKMESH_BETA_PLANNING","WORKMESH_BETA_TEMPLATES","WORKMESH_BETA_COSTS","WORKMESH_BETA_GITEA","WORKMESH_BETA_OPERATIONS_UI","WORKMESH_EXPERIMENTAL_AUTOMATION","WORKMESH_EXPERIMENTAL_AGENT_LOOPS","WORKMESH_EXPERIMENTAL_A2A","WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS","WORKMESH_EXPERIMENTAL_MULTI_RUNTIME","WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS"]},"tier":{"type":"string","enum":["beta","experimental"]},"enabled":{"type":"boolean"}}}}}}；401: #/components/responses/Unauthorized

### `getAgentCapabilityManifest`

参数：header:WorkMesh-Client-Profile（可选） {"type":"string","enum":["1.0"]}

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/AgentCapabilityManifest"}；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；403: #/components/responses/Forbidden；409: #/components/responses/Conflict

### `getInstallStatus`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: #/components/responses/InstallationStatus

### `resetInstall`

参数：#/components/parameters/IdempotencyKey

正文：无requestBody。

返回：200: {"type":"object","additionalProperties":false,"required":["ok","reset"],"properties":{"ok":{"type":"boolean","enum":[true]},"reset":{"type":"boolean","enum":[true]}}}；404: #/components/responses/NotFound

### `installWorkspace`

参数：#/components/parameters/IdempotencyKey

正文：#/components/requestBodies/InstallInput

返回：200: #/components/responses/Session；400: #/components/responses/BadRequest；401: #/components/responses/BootstrapAuthFailed；409: #/components/responses/Conflict；429: #/components/responses/AuthRateLimited；503: #/components/responses/AuthRateLimitUnavailable

### `login`

参数：#/components/parameters/IdempotencyKey

正文：#/components/requestBodies/LoginInput

返回：200: #/components/responses/Session；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；409: #/components/responses/Conflict；429: #/components/responses/AuthRateLimited；503: #/components/responses/AuthRateLimitUnavailable

### `logout`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CsrfToken

正文：无requestBody。

返回：200: #/components/responses/Ok；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；403: #/components/responses/Forbidden；409: #/components/responses/Conflict

### `getCurrentActor`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: #/components/responses/AuthMe；401: #/components/responses/Unauthorized

### `getWorkspace`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: #/components/responses/Workspace；401: #/components/responses/Unauthorized；404: #/components/responses/NotFound

### `updateWorkspace`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CsrfToken；#/components/parameters/IfMatch

正文：#/components/requestBodies/WorkspacePatch

返回：200: #/components/responses/Command；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；403: #/components/responses/Forbidden；404: #/components/responses/NotFound；409: #/components/responses/Conflict

### `listTeams`

参数：#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/Teams；401: #/components/responses/Unauthorized

### `createTeam`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CsrfToken

正文：#/components/requestBodies/TeamInput

返回：200: #/components/responses/Command；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；403: #/components/responses/Forbidden；409: #/components/responses/Conflict

### `updateTeam`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CsrfToken；#/components/parameters/IfMatch

正文：#/components/requestBodies/TeamPatch

返回：200: #/components/responses/Command；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；403: #/components/responses/Forbidden；404: #/components/responses/NotFound；409: #/components/responses/Conflict

### `deleteTeam`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CsrfToken；#/components/parameters/IfMatch

正文：无requestBody。

返回：200: #/components/responses/Command；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；403: #/components/responses/Forbidden；404: #/components/responses/NotFound；409: #/components/responses/Conflict

### `listWorkflowStates`

参数：#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/WorkflowStates；401: #/components/responses/Unauthorized；404: #/components/responses/NotFound

### `createWorkflowState`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CsrfToken

正文：#/components/requestBodies/WorkflowStateInput

返回：200: #/components/responses/Command；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；403: #/components/responses/Forbidden；404: #/components/responses/NotFound；409: #/components/responses/Conflict

### `updateWorkflowState`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CsrfToken；#/components/parameters/IfMatch

正文：#/components/requestBodies/WorkflowStatePatch

返回：200: #/components/responses/Command；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；403: #/components/responses/Forbidden；404: #/components/responses/NotFound；409: #/components/responses/Conflict

### `listProjects`

参数：#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/Projects；401: #/components/responses/Unauthorized

### `createProject`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CsrfToken

正文：#/components/requestBodies/ProjectInput

返回：200: #/components/responses/Command；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；403: #/components/responses/Forbidden；404: #/components/responses/NotFound；409: #/components/responses/Conflict

### `getProject`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: #/components/responses/Project；401: #/components/responses/Unauthorized；404: #/components/responses/NotFound

### `updateProject`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CsrfToken；#/components/parameters/IfMatch

正文：#/components/requestBodies/ProjectPatch

返回：200: #/components/responses/Command；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；403: #/components/responses/Forbidden；404: #/components/responses/NotFound；409: #/components/responses/Conflict

### `deleteProject`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CsrfToken；#/components/parameters/IfMatch

正文：无requestBody。

返回：200: #/components/responses/Command；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；403: #/components/responses/Forbidden；404: #/components/responses/NotFound；409: #/components/responses/Conflict

### `listHumanActors`

参数：#/components/parameters/Cursor；#/components/parameters/Limit；query:teamId（可选） {"type":"string","format":"uuid"}

正文：无requestBody。

返回：200: #/components/responses/HumanActors；401: #/components/responses/Unauthorized

### `listWorkItems`

参数：#/components/parameters/Cursor；#/components/parameters/Limit；#/components/parameters/TeamIdQuery；#/components/parameters/StatusIdQuery；#/components/parameters/ProjectIdQuery；#/components/parameters/MilestoneIdQuery；#/components/parameters/PriorityQuery；#/components/parameters/StatusCategoryQuery；#/components/parameters/ResponsibleHumanActorIdQuery；#/components/parameters/OwnerIdQuery；#/components/parameters/MineQuery；#/components/parameters/LabelQuery；#/components/parameters/SearchQuery；query:claimable（可选） {"type":"boolean","default":false}

正文：无requestBody。

返回：200: #/components/responses/WorkItems；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized

### `createWorkItem`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CsrfToken

正文：#/components/requestBodies/WorkItemInput

返回：200: #/components/responses/Command；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；403: #/components/responses/Forbidden；404: #/components/responses/NotFound；409: #/components/responses/Conflict

### `getWorkItem`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: #/components/responses/WorkItem；401: #/components/responses/Unauthorized；404: #/components/responses/NotFound

### `updateWorkItem`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CsrfToken；#/components/parameters/IfMatch

正文：#/components/requestBodies/WorkItemPatch

返回：200: #/components/responses/Command；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；403: #/components/responses/Forbidden；404: #/components/responses/NotFound；409: #/components/responses/Conflict

### `deleteWorkItem`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CsrfToken；#/components/parameters/IfMatch

正文：无requestBody。

返回：200: #/components/responses/Command；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；403: #/components/responses/Forbidden；404: #/components/responses/NotFound；409: #/components/responses/Conflict

### `listWorkItemComments`

参数：#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/Comments；401: #/components/responses/Unauthorized；404: #/components/responses/NotFound

### `createComment`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CsrfToken

正文：#/components/requestBodies/CommentInput

返回：200: #/components/responses/Command；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；403: #/components/responses/Forbidden；404: #/components/responses/NotFound；409: #/components/responses/Conflict

### `updateComment`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CsrfToken；#/components/parameters/IfMatch

正文：#/components/requestBodies/CommentPatch

返回：200: #/components/responses/Command；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；403: #/components/responses/Forbidden；404: #/components/responses/NotFound；409: #/components/responses/Conflict

### `listSavedViews`

参数：#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/SavedViews；401: #/components/responses/Unauthorized

### `createSavedView`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CsrfToken

正文：#/components/requestBodies/SavedViewInput

返回：200: #/components/responses/Command；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；403: #/components/responses/Forbidden；409: #/components/responses/Conflict

### `listEvents`

参数：#/components/parameters/CursorQuery；#/components/parameters/EventLimit

正文：无requestBody。

返回：200: #/components/responses/Events；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；409: #/components/responses/CursorExpired

### `streamEvents`

参数：#/components/parameters/CursorQuery；#/components/parameters/LastEventId

正文：无requestBody。

返回：200: #/components/responses/EventStream；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；409: #/components/responses/CursorExpired；503: #/components/responses/RealtimeCapacityExceeded

### `listAgents`

参数：#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/Agents；401: #/components/responses/Unauthorized

### `registerAgent`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CorrelationId

正文：#/components/requestBodies/AgentRegistrationInput

返回：201: #/components/responses/Agent；400: #/components/responses/BadRequest；409: #/components/responses/Conflict

### `getAgent`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/Agent；404: #/components/responses/NotFound

### `updateAgent`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch；#/components/parameters/CorrelationId

正文：#/components/requestBodies/AgentPatch

返回：200: #/components/responses/Agent；400: #/components/responses/BadRequest；409: #/components/responses/Conflict

### `approveAgentTeamAccess`

参数：#/components/parameters/Id；#/components/parameters/TeamId；#/components/parameters/IdempotencyKey；#/components/parameters/CorrelationId

正文：#/components/requestBodies/AgentTeamAccessInput

返回：200: #/components/responses/AgentTeamAccess；400: #/components/responses/BadRequest；403: #/components/responses/Forbidden；404: #/components/responses/NotFound；409: #/components/responses/Conflict

### `revokeAgentTeamAccess`

参数：#/components/parameters/Id；#/components/parameters/TeamId；#/components/parameters/IdempotencyKey；#/components/parameters/CorrelationId

正文：无requestBody。

返回：200: #/components/responses/AgentTeamAccess；403: #/components/responses/Forbidden；404: #/components/responses/NotFound；409: #/components/responses/Conflict

### `createAgentWebhookEndpoint`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/CorrelationId

正文：{"type":"object","required":["url"],"properties":{"url":{"type":"string","format":"uri"}}}

返回：200: #/components/responses/Json；403: #/components/responses/Forbidden；409: #/components/responses/Conflict

### `rotateAgentWebhookSecret`

参数：#/components/parameters/Id；path:endpointId（必需） {"type":"string","format":"uuid"}；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch；#/components/parameters/CorrelationId

正文：无requestBody。

返回：200: #/components/responses/Json；403: #/components/responses/Forbidden；409: #/components/responses/Conflict

### `claimWorkItem`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch；#/components/parameters/CorrelationId

正文：#/components/requestBodies/ClaimWorkItemInput

返回：200: #/components/responses/ClaimWorkItem；400: #/components/responses/BadRequest；401: #/components/responses/Unauthorized；403: #/components/responses/Forbidden；409: #/components/responses/AgentConcurrencyLimit

### `delegateAndStartAgentSession`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch；#/components/parameters/CorrelationId

正文：#/components/requestBodies/DelegateAndStartAgentSessionInput

返回：200: #/components/responses/DelegateAndStartAgentSession；400: #/components/responses/BadRequest；403: #/components/responses/Forbidden；409: #/components/responses/AgentConcurrencyLimit

### `getDelegation`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/Delegation；404: #/components/responses/NotFound

### `revokeDelegation`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch；#/components/parameters/CorrelationId

正文：#/components/requestBodies/ReasonInput

返回：200: #/components/responses/Delegation；409: #/components/responses/Conflict

### `listAgentSessions`

参数：#/components/parameters/Cursor；#/components/parameters/Limit；query:teamId（可选） {"type":"string","format":"uuid"}；query:workItemId（可选） {"type":"string","format":"uuid"}；query:agentId（可选） {"type":"string","format":"uuid"}；query:principalHumanActorId（可选） {"type":"string","format":"uuid"}；query:state（可选） {"$ref":"#/components/schemas/AgentSessionState"}

正文：无requestBody。

返回：200: #/components/responses/AgentSessions

### `getAgentSession`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/AgentSession；404: #/components/responses/NotFound

### `exchangeAgentSessionToken`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CorrelationId

正文：#/components/requestBodies/ExchangeAgentSessionTokenInput

返回：200: #/components/responses/AgentSessionToken；401: #/components/responses/Unauthorized；409: #/components/responses/Conflict；429: #/components/responses/AuthRateLimited；503: #/components/responses/AuthRateLimitUnavailable

### `refreshAgentSessionToken`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/CorrelationId

正文：#/components/requestBodies/RefreshAgentSessionTokenInput

返回：200: #/components/responses/AgentSessionToken；401: #/components/responses/Unauthorized；409: #/components/responses/Conflict；429: #/components/responses/AuthRateLimited；503: #/components/responses/AuthRateLimitUnavailable

### `transitionAgentSessionState`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch；#/components/parameters/CorrelationId

正文：{"type":"object","required":["state","reason"],"properties":{"state":{"$ref":"#/components/schemas/AgentSessionState"},"reason":{"type":"string","minLength":1,"maxLength":2000}}}

返回：200: #/components/responses/AgentSession；403: #/components/responses/Forbidden；409: #/components/responses/Conflict

### `acknowledgeAgentSession`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/CorrelationId

正文：#/components/requestBodies/AcknowledgeAgentSessionInput

返回：200: #/components/responses/AgentSession；409: #/components/responses/Conflict

### `heartbeatAgentSession`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/CorrelationId

正文：#/components/requestBodies/HeartbeatInput

返回：200: #/components/responses/AgentSession；409: #/components/responses/Conflict

### `promptAgentSession`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/CorrelationId

正文：#/components/requestBodies/PromptAgentSessionInput

返回：200: #/components/responses/AgentSession；409: #/components/responses/Conflict

### `listAgentActivities`

参数：#/components/parameters/Id；#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/AgentActivities

### `appendAgentActivity`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/CorrelationId

正文：#/components/requestBodies/AppendActivityInput

返回：201: #/components/responses/AgentActivity；409: #/components/responses/Conflict

### `getAgentPlan`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/PlanVersion；404: #/components/responses/NotFound

### `publishAgentPlan`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch；#/components/parameters/CorrelationId

正文：#/components/requestBodies/PublishPlanInput

返回：200: #/components/responses/PlanVersion；409: #/components/responses/Conflict

### `listAgentPlanVersions`

参数：#/components/parameters/Id；#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/PlanVersions；404: #/components/responses/NotFound

### `getAgentSessionContext`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/SessionContext；404: #/components/responses/NotFound

### `signalAgentSession`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch；#/components/parameters/CorrelationId

正文：#/components/requestBodies/SignalAgentSessionInput

返回：200: #/components/responses/AgentSession；409: #/components/responses/Conflict

### `acknowledgeAgentSessionStop`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch；#/components/parameters/CorrelationId

正文：#/components/requestBodies/StopAcknowledgementInput

返回：200: #/components/responses/AgentSession；409: #/components/responses/Conflict

### `completeAgentSession`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch；#/components/parameters/CorrelationId

正文：#/components/requestBodies/CompleteAgentSessionInput

返回：200: #/components/responses/AgentSession；409: #/components/responses/Conflict

### `failAgentSession`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch；#/components/parameters/CorrelationId

正文：#/components/requestBodies/FailAgentSessionInput

返回：200: #/components/responses/AgentSession；409: #/components/responses/Conflict

### `retryAgentSession`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch；#/components/parameters/CorrelationId

正文：#/components/requestBodies/RetryAgentSessionInput

返回：201: #/components/responses/AgentSession；400: #/components/responses/BadRequest；403: #/components/responses/Forbidden；409: #/components/responses/AgentConcurrencyLimit

### `listArtifacts`

参数：#/components/parameters/Cursor；#/components/parameters/Limit；query:sessionId（可选） {"type":"string","format":"uuid"}；query:workItemId（可选） {"type":"string","format":"uuid"}

正文：无requestBody。

返回：200: #/components/responses/Artifacts

### `publishArtifact`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CorrelationId

正文：#/components/requestBodies/ArtifactInput

返回：201: #/components/responses/Artifact；409: #/components/responses/Conflict

### `listApprovals`

参数：#/components/parameters/Cursor；#/components/parameters/Limit；query:status（可选） {"$ref":"#/components/schemas/ApprovalStatus"}；query:sessionId（可选） {"type":"string","format":"uuid"}；query:recipientActorId（可选） {"type":"string","format":"uuid"}

正文：无requestBody。

返回：200: #/components/responses/Approvals

### `requestApproval`

参数：#/components/parameters/IdempotencyKey；#/components/parameters/CorrelationId

正文：#/components/requestBodies/RequestApprovalInput

返回：201: #/components/responses/Approval；409: #/components/responses/Conflict

### `getApproval`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/Approval；404: #/components/responses/NotFound

### `decideApproval`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch；#/components/parameters/CorrelationId

正文：#/components/requestBodies/DecideApprovalInput

返回：200: #/components/responses/ApprovalDecision；409: #/components/responses/Conflict

### `consumeApproval`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch；#/components/parameters/CorrelationId

正文：#/components/requestBodies/ConsumeApprovalInput

返回：200: #/components/responses/ApprovalConsumption；400: #/components/responses/BadRequest；403: #/components/responses/Forbidden；409: #/components/responses/Conflict

### `getWorkRoom`

参数：query:workItemId（可选） {"type":"string","format":"uuid"}；query:projectId（可选） {"type":"string","format":"uuid"}；query:sessionId（可选） {"type":"string","format":"uuid"}

正文：无requestBody。

返回：200: #/components/responses/Json

### `getWorkRoomTimeline`

参数：#/components/parameters/Id；#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/PagedJson

### `postWorkRoomMessage`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/CorrelationId

正文：#/components/requestBodies/RoomMessageInput

返回：201: #/components/responses/Json；409: #/components/responses/Conflict

### `resolveWorkRoomMessage`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：{"type":"object","additionalProperties":false,"properties":{"reason":{"type":"string","minLength":1,"maxLength":10000}}}

返回：200: #/components/responses/Json

### `listHumanAttention`

参数：#/components/parameters/Cursor；#/components/parameters/Limit；query:kind（可选） {"$ref":"#/components/schemas/HumanAttentionKind"}；query:status（可选） {"$ref":"#/components/schemas/HumanAttentionStatus"}；query:view（可选） {"type":"string","enum":["active","history"],"default":"active"}；query:severity（可选） {"type":"string","enum":["info","low","medium","high","critical"]}；query:urgency（可选） {"type":"string","enum":["normal","soon","immediate"]}；query:audience（可选） {"type":"string","enum":["assigned_to_me","visible_to_me","workspace_administration"]}；query:requestedByActorId（可选） {"type":"string","format":"uuid"}；query:responsibleHumanActorId（可选） {"type":"string","format":"uuid"}；query:expiresBefore（可选） {"type":"string","format":"date-time"}；query:expiresAfter（可选） {"type":"string","format":"date-time"}；query:updatedAfter（可选） {"type":"string","format":"date-time"}；query:updatedBefore（可选） {"type":"string","format":"date-time"}；query:projectId（可选） {"type":"string","format":"uuid"}；query:workItemId（可选） {"type":"string","format":"uuid"}；query:sessionId（可选） {"type":"string","format":"uuid"}

正文：无requestBody。

返回：200: #/components/responses/HumanAttentionItems

### `getHumanAttention`

参数：path:id（必需） {"type":"string","pattern":"^v1:(decision|approval|inbox_item|agent_session|completion_suggestion):[0-9a-f-]{36}$"}

正文：无requestBody。

返回：200: #/components/responses/HumanAttentionItem；404: #/components/responses/NotFound

### `listRecoveryItems`

参数：#/components/parameters/Cursor；#/components/parameters/Limit100；query:lifecycle（可选） {"type":"string","enum":["active","resolved"]}；query:condition（可选） {"$ref":"#/components/schemas/RecoveryCondition"}；query:severity（可选） {"type":"string","enum":["info","low","medium","high","critical"]}；query:projectId（可选） {"type":"string","format":"uuid"}；query:workItemId（可选） {"type":"string","format":"uuid"}；query:sessionId（可选） {"type":"string","format":"uuid"}

正文：无requestBody。

返回：200: #/components/responses/RecoveryItems

### `getRecoveryItem`

参数：path:id（必需） {"type":"string","pattern":"^v1:[a-z_]+:[0-9a-f-]{36}$"}

正文：无requestBody。

返回：200: #/components/responses/RecoveryItem；404: #/components/responses/NotFound

### `listControlCenter`

参数：#/components/parameters/Cursor；#/components/parameters/Limit100；query:collection（可选） {"$ref":"#/components/schemas/ControlCenterCollection"}；query:responsibleHumanActorId（可选） {"type":"string","format":"uuid"}；query:agentActorId（可选） {"type":"string","format":"uuid"}；query:risk（可选） {"type":"string","enum":["at_risk"]}；query:workItemState（可选） {"type":"string","enum":["backlog","planned","started","completed","canceled"]}；query:timeWindow（可选） {"type":"string","enum":["24h","7d","30d"]}

正文：无requestBody。

返回：200: #/components/responses/ControlCenter

### `getProjectControlCenter`

参数：path:projectId（必需） {"type":"string","format":"uuid"}；#/components/parameters/Cursor；#/components/parameters/Limit100；query:collection（可选） {"$ref":"#/components/schemas/ControlCenterCollection"}；query:responsibleHumanActorId（可选） {"type":"string","format":"uuid"}；query:agentActorId（可选） {"type":"string","format":"uuid"}；query:risk（可选） {"type":"string","enum":["at_risk"]}；query:workItemState（可选） {"type":"string","enum":["backlog","planned","started","completed","canceled"]}；query:timeWindow（可选） {"type":"string","enum":["24h","7d","30d"]}

正文：无requestBody。

返回：200: #/components/responses/ControlCenter；404: #/components/responses/NotFound

### `explainAgentSession`

参数：path:sessionId（必需） {"type":"string","format":"uuid"}；#/components/parameters/RunSequenceCursor；#/components/parameters/Limit100；query:phase（可选） {"type":"string","enum":["intake","investigation","planning","implementation","validation","human_input","recovery","completion"]}；query:planStepId（可选） {"type":"string","format":"uuid"}；query:actorId（可选） {"type":"string","format":"uuid"}；query:actionType（可选） {"type":"string","enum":["acknowledgement","read","write","tool","state_transition","plan","message","approval","decision","evidence","validation","handoff","heartbeat","other"]}；query:risk（可选） {"type":"string","enum":["low","medium","high","critical"]}；query:evidence（可选） {"type":"string","enum":["present","missing"]}；query:failure（可选） {"type":"string","enum":["true"]}；query:attention（可选） {"type":"string","enum":["true"]}；query:timeWindow（可选） {"type":"string","enum":["24h","7d","30d"]}

正文：无requestBody。

返回：200: #/components/responses/RunExplanation；404: #/components/responses/NotFound

### `getWorkItemExecutionSummary`

参数：path:workItemId（必需） {"type":"string","format":"uuid"}

正文：无requestBody。

返回：200: #/components/responses/WorkItemExecutionSummary；404: #/components/responses/NotFound

### `previewAgentSessionControl`

参数：path:sessionId（必需） {"type":"string","format":"uuid"}

正文：{"type":"object","additionalProperties":false,"required":["action"],"properties":{"action":{"$ref":"#/components/schemas/AgentSessionControlAction"},"stopMode":{"$ref":"#/components/schemas/AgentSessionStopMode"},"steeringScope":{"$ref":"#/components/schemas/AgentSessionSteeringScope"}}}

返回：200: #/components/responses/ActionPreview；404: #/components/responses/NotFound

### `listInbox`

参数：#/components/parameters/Cursor；#/components/parameters/Limit；query:status（可选） {"type":"string","enum":["open","resolved"],"default":"open"}；query:scope（可选） {"type":"string","enum":["mine","agent_observability"],"default":"mine"}

正文：无requestBody。

返回：200: #/components/responses/InboxItems

### `listCollaborationQueueCounts`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/CollaborationQueueCounts"}；403: #/components/responses/Forbidden

### `getInboxItem`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/InboxItem；404: #/components/responses/NotFound

### `claimInboxItem`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/CorrelationId

正文：{"type":"object","additionalProperties":false}

返回：200: #/components/responses/InboxItem；404: #/components/responses/NotFound；409: #/components/responses/Conflict

### `acknowledgeInboxItem`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/CorrelationId

正文：{"type":"object","additionalProperties":false}

返回：200: #/components/responses/InboxItem；404: #/components/responses/NotFound

### `replyInboxItem`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/CorrelationId；#/components/parameters/IfMatch

正文：{"$ref":"#/components/schemas/InboxReplyInput"}

返回：200: #/components/responses/InboxReply；404: #/components/responses/NotFound；409: #/components/responses/Conflict

### `listLeases`

参数：#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/PagedJson

### `acquireLease`

参数：#/components/parameters/IdempotencyKey

正文：#/components/requestBodies/AcquireLeaseInput

返回：200: #/components/responses/Json；409: #/components/responses/Conflict

### `heartbeatLease`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：无requestBody。

返回：200: #/components/responses/Json

### `renewLease`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：无requestBody。

返回：200: #/components/responses/Json；409: #/components/responses/Conflict

### `releaseLease`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：无requestBody。

返回：200: #/components/responses/Json；409: #/components/responses/Conflict

### `forceReleaseLease`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：无requestBody。

返回：200: #/components/responses/Json；403: #/components/responses/Forbidden；409: #/components/responses/Conflict

### `listHandoffs`

参数：#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/PagedJson

### `offerHandoff`

参数：#/components/parameters/IdempotencyKey

正文：#/components/requestBodies/HandoffInput

返回：200: #/components/responses/Json

### `inspectExactTargetHandoff`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/Json；403: #/components/responses/Forbidden；404: #/components/responses/NotFound；429: #/components/responses/AuthRateLimited；503: #/components/responses/AuthRateLimitUnavailable

### `requestHandoff`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：无requestBody。

返回：200: #/components/responses/Json；409: #/components/responses/Conflict

### `acceptHandoff`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：#/components/requestBodies/HandoffAcceptInput

返回：200: #/components/responses/Json；409: #/components/responses/AgentConcurrencyLimit

### `rejectHandoff`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：#/components/requestBodies/HandoffRejectInput

返回：200: #/components/responses/Json；403: #/components/responses/Forbidden；409: #/components/responses/Conflict；429: #/components/responses/AuthRateLimited；503: #/components/responses/AuthRateLimitUnavailable

### `cancelHandoff`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：无requestBody。

返回：200: #/components/responses/Json；409: #/components/responses/Conflict

### `completeHandoff`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：无requestBody。

返回：200: #/components/responses/Json；409: #/components/responses/Conflict

### `createWorkItemDecision`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：#/components/requestBodies/DecisionInput

返回：200: #/components/responses/Json

### `createProjectDecision`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：#/components/requestBodies/DecisionInput

返回：200: #/components/responses/Json

### `createSessionDecision`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：#/components/requestBodies/DecisionInput

返回：200: #/components/responses/Json

### `getDecision`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/Json

### `finalizeDecision`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：无requestBody。

返回：200: #/components/responses/Json

### `supersedeDecision`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：无requestBody。

返回：200: #/components/responses/Json

### `reverseDecision`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：无requestBody。

返回：200: #/components/responses/Json

### `commentOnPlanStep`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：无requestBody。

返回：200: #/components/responses/Json

### `proposePlanAssignment`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：无requestBody。

返回：200: #/components/responses/Json

### `createChildAgentSession`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：#/components/requestBodies/ChildSessionInput

返回：200: #/components/responses/Json；409: #/components/responses/AgentConcurrencyLimit

### `appendContextDelta`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：#/components/requestBodies/ContextDeltaInput

返回：200: #/components/responses/Json；403: #/components/responses/Forbidden

### `createReviewDelegation`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：#/components/requestBodies/ReviewDelegationInput

返回：200: #/components/responses/Json；409: #/components/responses/AgentConcurrencyLimit

### `getWorkspaceGuidance`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/Guidance

### `publishWorkspaceGuidance`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/GuidanceIfMatch

正文：#/components/requestBodies/PublishGuidanceInput

返回：200: #/components/responses/Guidance

### `listWorkspaceGuidanceHistory`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/GuidanceHistory

### `diffWorkspaceGuidance`

参数：#/components/parameters/Id；#/components/parameters/FromGuidanceRevisionId；#/components/parameters/ToGuidanceRevisionId

正文：无requestBody。

返回：200: #/components/responses/GuidanceDiff

### `archiveWorkspaceGuidance`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：#/components/requestBodies/ArchiveGuidanceInput

返回：200: #/components/responses/Guidance

### `rollbackWorkspaceGuidance`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：#/components/requestBodies/RollbackGuidanceInput

返回：200: #/components/responses/Guidance

### `getTeamGuidance`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/Guidance

### `publishTeamGuidance`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/GuidanceIfMatch

正文：#/components/requestBodies/PublishGuidanceInput

返回：200: #/components/responses/Guidance

### `listTeamGuidanceHistory`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/GuidanceHistory

### `diffTeamGuidance`

参数：#/components/parameters/Id；#/components/parameters/FromGuidanceRevisionId；#/components/parameters/ToGuidanceRevisionId

正文：无requestBody。

返回：200: #/components/responses/GuidanceDiff

### `archiveTeamGuidance`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：#/components/requestBodies/ArchiveGuidanceInput

返回：200: #/components/responses/Guidance

### `rollbackTeamGuidance`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：#/components/requestBodies/RollbackGuidanceInput

返回：200: #/components/responses/Guidance

### `getProjectGuidance`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/Guidance

### `publishProjectGuidance`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/GuidanceIfMatch

正文：#/components/requestBodies/PublishGuidanceInput

返回：200: #/components/responses/Guidance

### `listProjectGuidanceHistory`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/GuidanceHistory

### `diffProjectGuidance`

参数：#/components/parameters/Id；#/components/parameters/FromGuidanceRevisionId；#/components/parameters/ToGuidanceRevisionId

正文：无requestBody。

返回：200: #/components/responses/GuidanceDiff

### `archiveProjectGuidance`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：#/components/requestBodies/ArchiveGuidanceInput

返回：200: #/components/responses/Guidance

### `rollbackProjectGuidance`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：#/components/requestBodies/RollbackGuidanceInput

返回：200: #/components/responses/Guidance

### `createProviderConnection`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/ProviderConnectionInput"}

返回：200: #/components/responses/Json；403: #/components/responses/ForbiddenOrFeatureDisabled

### `receiveGitHubWebhook`

参数：path:connectionId（必需） {"type":"string","format":"uuid"}；header:X-GitHub-Delivery（必需） {"type":"string","maxLength":200}；header:X-GitHub-Event（必需） {"type":"string","maxLength":100}；header:X-Hub-Signature-256（必需） {"type":"string","pattern":"^sha256=[a-f0-9]{64}$"}

正文：{"type":"object","additionalProperties":true}

返回：200: #/components/responses/Json；202: #/components/responses/Json；403: #/components/responses/ProviderSignatureInvalid；409: #/components/responses/Conflict

### `listRepositories`

参数：#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/PagedJson；403: #/components/responses/ForbiddenOrFeatureDisabled

### `connectRepository`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/RepositoryInput"}

返回：200: #/components/responses/Json；403: #/components/responses/ForbiddenOrFeatureDisabled

### `getRepositoryContext`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/Json；403: #/components/responses/ForbiddenOrFeatureDisabled；404: #/components/responses/NotFound

### `pinRepositoryContext`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/RepositoryContextInput"}

返回：200: #/components/responses/Json；403: #/components/responses/ForbiddenOrFeatureDisabled

### `requestProviderAction`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/ProviderActionInput"}

返回：200: #/components/responses/Json；403: #/components/responses/ForbiddenOrFeatureDisabled；409: #/components/responses/Conflict

### `publishDeliveryArtifact`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/DeliveryArtifactInput"}

返回：200: #/components/responses/Json

### `requestArtifactUpload`

参数：#/components/parameters/IdempotencyKey

正文：{"oneOf":[{"$ref":"#/components/schemas/ArtifactUploadIntentInput"},{"$ref":"#/components/schemas/HumanArtifactUploadIntentInput"}]}

返回：200: #/components/responses/Json

### `getArtifactUploadStatus`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/ArtifactUploadIntentStatus"}；403: #/components/responses/ForbiddenOrFeatureDisabled

### `finalizeArtifactUpload`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：无requestBody。

返回：200: #/components/responses/Json；400: #/components/responses/BadRequest

### `cancelArtifactUpload`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：无requestBody。

返回：200: #/components/responses/Json；409: #/components/responses/Conflict

### `listWorkItemArtifacts`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/Json；403: #/components/responses/ForbiddenOrFeatureDisabled

### `downloadVerifiedArtifact`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/Json

### `publishStructuredReview`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/StructuredReviewInput"}

返回：200: #/components/responses/Json；403: #/components/responses/ForbiddenOrFeatureDisabled；409: #/components/responses/Conflict

### `requestPullRequestMerge`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/MergeIntentInput"}

返回：200: #/components/responses/Json；403: #/components/responses/ForbiddenOrFeatureDisabled；409: #/components/responses/Conflict

### `retryPullRequestCheck`

参数：#/components/parameters/Id；path:checkId（必需） {"type":"string","maxLength":500}；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/CiRetryInput"}

返回：200: #/components/responses/Json；403: #/components/responses/ForbiddenOrFeatureDisabled；409: #/components/responses/Conflict

### `getProjectDelivery`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/Json；403: #/components/responses/ForbiddenOrFeatureDisabled

### `listProjectMilestones`

参数：#/components/parameters/Id；#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/Milestones

### `createProjectMilestone`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/MilestoneInput"}

返回：200: #/components/responses/Milestone

### `getMilestone`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/Milestone

### `updateMilestone`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：{"$ref":"#/components/schemas/MilestonePatch"}

返回：200: #/components/responses/Milestone；409: #/components/responses/Conflict

### `deleteMilestone`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：无requestBody。

返回：200: #/components/responses/Command；409: #/components/responses/Conflict

### `listDocuments`

参数：query:ownerType（必需） {"type":"string","enum":["project","work_item"]}；query:ownerId（必需） {"$ref":"#/components/schemas/Id"}

正文：无requestBody。

返回：200: #/components/responses/Json

### `createDocument`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/CreateDocumentInput"}

返回：200: #/components/responses/Json；409: #/components/responses/Conflict

### `getDocument`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/Json

### `updateDocument`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：{"$ref":"#/components/schemas/UpdateDocumentInput"}

返回：200: #/components/responses/Json；409: #/components/responses/Conflict

### `listDocumentHistory`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: #/components/responses/Json

### `getDocumentRevision`

参数：#/components/parameters/Id；path:revisionId（必需） {"$ref":"#/components/schemas/Id"}

正文：无requestBody。

返回：200: #/components/responses/Json

### `diffDocumentRevisions`

参数：#/components/parameters/Id；query:fromRevisionId（必需） {"$ref":"#/components/schemas/Id"}；query:toRevisionId（必需） {"$ref":"#/components/schemas/Id"}

正文：无requestBody。

返回：200: #/components/responses/Json

### `exportDocumentMarkdown`

参数：#/components/parameters/Id；query:revisionId（可选） {"$ref":"#/components/schemas/Id"}

正文：无requestBody。

返回：200: {"type":"string"}

### `archiveDocument`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：{"$ref":"#/components/schemas/DocumentArchiveInput"}

返回：200: #/components/responses/Json；409: #/components/responses/Conflict

### `unarchiveDocument`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：{"$ref":"#/components/schemas/DocumentArchiveInput"}

返回：200: #/components/responses/Json；409: #/components/responses/Conflict

### `restoreDocumentRevision`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：{"$ref":"#/components/schemas/RestoreDocumentRevisionInput"}

返回：200: #/components/responses/Json；409: #/components/responses/Conflict

### `listWorkItemRelations`

参数：#/components/parameters/Id；#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/WorkItemRelations

### `createWorkItemRelation`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/WorkItemRelationInput"}

返回：200: #/components/responses/WorkItemRelation；409: #/components/responses/Conflict

### `deleteWorkItemRelation`

参数：#/components/parameters/Id；path:relationId（必需） {"type":"string","format":"uuid"}；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：无requestBody。

返回：200: #/components/responses/Command；409: #/components/responses/Conflict

### `createProjectUpdateDraft`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/ProjectUpdateInput"}

返回：200: #/components/responses/Json

### `publishProjectUpdate`

参数：#/components/parameters/Id；path:updateId（必需） {"type":"string","format":"uuid"}；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：{"type":"object","additionalProperties":false}

返回：200: #/components/responses/Json；403: #/components/responses/Forbidden；409: #/components/responses/Conflict

### `createProjectDependency`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/ProjectDependencyInput"}

返回：200: #/components/responses/Json；409: #/components/responses/Conflict

### `suggestWorkItemCompletion`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/CompletionSuggestionInput"}

返回：200: #/components/responses/Json

### `decideCompletionSuggestion`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：{"$ref":"#/components/schemas/CompletionSuggestionDecisionInput"}

返回：200: #/components/responses/Json；403: #/components/responses/Forbidden；409: #/components/responses/Conflict

### `listCycles`

参数：#/components/parameters/Cursor；#/components/parameters/Limit；query:teamId（可选） {"type":"string","format":"uuid"}；query:state（可选） {"type":"string","enum":["current","upcoming","history"]}

正文：无requestBody。

返回：200: #/components/responses/PagedJson；403: #/components/responses/FeatureDisabled

### `createCycle`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/CycleInput"}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled

### `generateCycles`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/CycleGenerationInput"}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled

### `carryOverCycleWork`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：{"type":"object","required":["targetCycleId"],"properties":{"targetCycleId":{"type":"string","format":"uuid"},"workItemIds":{"type":"array","items":{"type":"string","format":"uuid"}}}}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled；409: #/components/responses/Conflict

### `setWorkItemCycle`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：{"type":"object","required":["cycleId"],"properties":{"cycleId":{"type":["string","null"],"format":"uuid"}}}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled；409: #/components/responses/Conflict

### `listInitiatives`

参数：#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/PagedJson；403: #/components/responses/FeatureDisabled

### `createInitiative`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/InitiativeInput"}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled

### `getInitiativeRollup`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/InitiativeRollup"}；403: #/components/responses/FeatureDisabled

### `listAdvancedViews`

参数：#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/PagedJson；403: #/components/responses/FeatureDisabled

### `createAdvancedView`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/AdvancedViewInput"}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled

### `evaluateAdvancedView`

参数：#/components/parameters/Id；#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/PagedJson；403: #/components/responses/FeatureDisabled

### `getProjectHealthHistory`

参数：#/components/parameters/Id；#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/PagedJson；403: #/components/responses/FeatureDisabled

### `createProjectHealthUpdate`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：{"$ref":"#/components/schemas/ProjectHealthInput"}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled；409: #/components/responses/Conflict

### `listAutomationRules`

参数：#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/PagedJson；403: #/components/responses/FeatureDisabled

### `createAutomationRule`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/AutomationRuleInput"}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled

### `createAutomationRuleVersion`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：{"$ref":"#/components/schemas/AutomationRuleVersionInput"}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled；409: #/components/responses/Conflict

### `dryRunAutomationRule`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/AutomationOccurrenceInput"}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled

### `triggerAutomationRule`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/AutomationOccurrenceInput"}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled

### `setAutomationRuleState`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：{"type":"object","required":["state"],"properties":{"state":{"type":"string","enum":["active","paused","disabled"]}}}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled；409: #/components/responses/Conflict

### `listAutomationRuns`

参数：#/components/parameters/Cursor；#/components/parameters/Limit；query:ruleId（可选） {"type":"string","format":"uuid"}；query:loopId（可选） {"type":"string","format":"uuid"}

正文：无requestBody。

返回：200: #/components/responses/PagedJson；403: #/components/responses/FeatureDisabled

### `getAutomationRun`

参数：path:runId（必需） {"type":"string","format":"uuid"}

正文：无requestBody。

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled

### `listLoops`

参数：#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/PagedJson；403: #/components/responses/FeatureDisabled

### `createLoop`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/LoopInput"}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled

### `runLoopNow`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：{"type":"object","required":["occurrenceKey"],"properties":{"occurrenceKey":{"type":"string"},"scheduledFor":{"$ref":"#/components/schemas/Timestamp"}}}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled；409: #/components/responses/AgentConcurrencyLimit

### `setLoopState`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：{"type":"object","required":["state"],"properties":{"state":{"type":"string","enum":["active","paused","disabled"]}}}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled；409: #/components/responses/Conflict

### `recordUsage`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/UsageInput"}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled

### `getUsageSummary`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled

### `setBudgetPolicy`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/BudgetPolicyInput"}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled

### `listNotifications`

参数：#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/PagedJson

### `createNotification`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/NotificationInput"}

返回：200: #/components/responses/Json

### `getNotificationPreferences`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: #/components/responses/Json

### `updateNotificationPreferences`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/NotificationPreferencesInput"}

返回：200: #/components/responses/Json

### `listTemplates`

参数：#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/PagedJson；403: #/components/responses/FeatureDisabled

### `createTemplate`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/TemplateInput"}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled

### `createTemplateVersion`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：{"$ref":"#/components/schemas/TemplateVersionInput"}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled；409: #/components/responses/Conflict

### `setTemplateState`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey；#/components/parameters/IfMatch

正文：{"$ref":"#/components/schemas/TemplateStateInput"}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled；409: #/components/responses/Conflict

### `exportTemplates`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled

### `importTemplatesAsDrafts`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/TemplateImportInput"}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled

### `configureA2ABinding`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/A2ABindingInput"}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled

### `acceptA2ATask`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/A2ATaskInput"}

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled；409: #/components/responses/AgentConcurrencyLimit

### `streamA2ATaskEvents`

参数：#/components/parameters/Id；path:taskId（必需） {"type":"string","minLength":1,"maxLength":500}；query:after（可选） {"type":"string","pattern":"^[0-9]{1,19}$","default":"0"}

正文：无requestBody。

返回：200: #/components/responses/Json；403: #/components/responses/FeatureDisabled

### `getWorkMeshAgentWellKnown`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/AgentWellKnownResponse"}

### `listAgentConnections`

参数：#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/AgentConnections；403: #/components/responses/Forbidden

### `createAgentConnection`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/AgentConnectionCreateInput"}

返回：201: {"$ref":"#/components/schemas/AgentConnectionCreateResponse"}；400: #/components/responses/ValidationError；403: #/components/responses/Forbidden；409: #/components/responses/Conflict

### `redeemAgentConnection`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/AgentConnectionRedeemInput"}

返回：200: {"$ref":"#/components/schemas/AgentConnectionRedeemResponse"}；400: #/components/responses/ValidationError；404: #/components/responses/NotFound；409: {"$ref":"#/components/schemas/Error"}；410: {"$ref":"#/components/schemas/Error"}；423: {"$ref":"#/components/schemas/Error"}；429: #/components/responses/AuthRateLimited；503: #/components/responses/AuthRateLimitUnavailable

### `getCurrentAgentConnectionIdentity`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/AgentConnectionCurrentIdentity"}；401: #/components/responses/Unauthorized

### `getAgentConnection`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/AgentConnectionResponse"}；404: #/components/responses/NotFound

### `patchAgentConnection`

参数：#/components/parameters/IfMatch；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/AgentConnectionPatchInput"}

返回：200: {"$ref":"#/components/schemas/AgentConnectionResponse"}；400: #/components/responses/ValidationError；403: #/components/responses/Forbidden；404: #/components/responses/NotFound；409: #/components/responses/RevisionConflict；412: #/components/responses/IfMatchRequired；422: {"$ref":"#/components/schemas/Error"}

### `revokeAgentConnection`

参数：#/components/parameters/IfMatch；#/components/parameters/IdempotencyKey

正文：无requestBody。

返回：204: Connection revoked；404: #/components/responses/NotFound；409: #/components/responses/RevisionConflict；412: #/components/responses/IfMatchRequired

### `rotateAgentConnection`

参数：#/components/parameters/IfMatch；#/components/parameters/IdempotencyKey

正文：无requestBody。

返回：201: {"$ref":"#/components/schemas/AgentConnectionRotateResponse"}；404: #/components/responses/NotFound；409: #/components/responses/RevisionConflict；412: #/components/responses/IfMatchRequired

### `confirmAgentConnectionRotation`

参数：#/components/parameters/IfMatch；#/components/parameters/IdempotencyKey

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/AgentConnectionResponse"}；404: #/components/responses/NotFound；409: #/components/responses/RevisionConflict；412: #/components/responses/IfMatchRequired；422: {"$ref":"#/components/schemas/Error"}

### `getApprovalAutonomyPolicy`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/ApprovalAutonomyPolicy"}

### `updateApprovalAutonomyPolicy`

参数：#/components/parameters/IfMatch；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/ApprovalAutonomyPolicyInput"}

返回：200: {"$ref":"#/components/schemas/ApprovalAutonomyPolicy"}；403: #/components/responses/Forbidden；409: #/components/responses/RevisionConflict；412: #/components/responses/IfMatchRequired

### `getBrowserPushConfig`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/BrowserPushConfig"}

### `listBrowserPushSubscriptions`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: #/components/responses/PagedJson

### `createBrowserPushSubscription`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/BrowserPushSubscriptionInput"}

返回：201: {"$ref":"#/components/schemas/BrowserPushSubscription"}

### `revokeBrowserPushSubscription`

参数：#/components/parameters/Id；#/components/parameters/IfMatch；#/components/parameters/IdempotencyKey

正文：无requestBody。

返回：204: Subscription revoked；409: #/components/responses/RevisionConflict

### `listAgentEnrollmentPolicies`

参数：#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/PagedJson

### `createAgentEnrollmentPolicy`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/AgentEnrollmentPolicyCreateInput"}

返回：201: {"$ref":"#/components/schemas/AgentEnrollmentPolicyCreateResponse"}

### `revokeAgentEnrollmentPolicy`

参数：#/components/parameters/Id；#/components/parameters/IfMatch；#/components/parameters/IdempotencyKey

正文：无requestBody。

返回：204: Enrollment policy revoked；409: #/components/responses/RevisionConflict

### `redeemAgentEnrollment`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/AgentEnrollmentRedeemInput"}

返回：200: {"$ref":"#/components/schemas/AgentConnectionRedeemResponse"}；409: #/components/responses/Conflict；429: #/components/responses/AuthRateLimited；503: #/components/responses/AuthRateLimitUnavailable

### `listWorkbenchRunnerAssignments`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: {"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"sessionId":{"type":"string","format":"uuid"},"state":{"type":"string","enum":["queued","acknowledged","executing"]}}}}}}

### `listAgentWorkbenchTurns`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: {"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"turnId":{"type":"string","format":"uuid"},"conversationId":{"type":"string","format":"uuid"}}}}}}

### `claimWorkbenchTurn`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：无requestBody。

返回：200: {"type":"object","properties":{"runnerAttemptId":{"type":"string","format":"uuid"},"turnId":{"type":"string","format":"uuid"}}}

### `getWorkbenchAttemptCredential`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/WorkbenchRunnerCredential"}

### `startWorkbenchAttempt`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：{"type":"object","required":["fenceToken"],"properties":{"fenceToken":{"type":"string","minLength":16,"maxLength":128}}}

返回：200: Attempt running

### `getWorkbenchAttemptStatus`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: Current attempt

### `settleWorkbenchAttempt`

参数：#/components/parameters/Id；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/WorkbenchRunnerSettleInput"}

返回：200: Attempt

### `listWorkbenchConversations`

参数：#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/PagedJson

### `createWorkbenchConversation`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/WorkbenchConversationCreateInput"}

返回：201: {"$ref":"#/components/schemas/WorkbenchConversation"}

### `getWorkbenchConversation`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/WorkbenchConversation"}

### `archiveWorkbenchConversation`

参数：#/components/parameters/Id；#/components/parameters/IfMatch；#/components/parameters/IdempotencyKey

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/WorkbenchConversation"}；409: #/components/responses/RevisionConflict

### `listWorkbenchMessages`

参数：#/components/parameters/Id；#/components/parameters/Limit；query:before（可选） {"type":"integer","minimum":1}

正文：无requestBody。

返回：200: {"type":"object","properties":{"items":{"type":"array","items":{"$ref":"#/components/schemas/WorkbenchMessage"}},"nextBefore":{"type":"integer","nullable":true}}}

### `listWorkbenchTurns`

参数：#/components/parameters/Id；#/components/parameters/Limit；query:before（可选） {"type":"integer","minimum":1}

正文：无requestBody。

返回：200: {"type":"object","properties":{"items":{"type":"array","items":{"$ref":"#/components/schemas/WorkbenchTurn"}},"nextBefore":{"type":"integer","nullable":true}}}

### `queueWorkbenchTurn`

参数：#/components/parameters/Id；#/components/parameters/IfMatch；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/WorkbenchTurnCreateInput"}

返回：201: {"$ref":"#/components/schemas/WorkbenchTurnAdmission"}；409: #/components/responses/RevisionConflict

### `stopWorkbenchTurn`

参数：#/components/parameters/Id；path:turnId（必需） {"type":"string","format":"uuid"}；#/components/parameters/IfMatch；#/components/parameters/IdempotencyKey

正文：{"type":"object","required":["reason"],"properties":{"reason":{"type":"string","maxLength":2000},"stopMode":{"type":"string","enum":["graceful","immediate"]}}}

返回：200: {"type":"object","properties":{"turn":{"$ref":"#/components/schemas/WorkbenchTurn"},"conversationRevision":{"type":"integer"}}}；409: #/components/responses/RevisionConflict

### `steerWorkbenchTurn`

参数：#/components/parameters/Id；path:turnId（必需） {"type":"string","format":"uuid"}；#/components/parameters/IfMatch；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/WorkbenchTurnSteerInput"}

返回：201: {"type":"object","properties":{"message":{"$ref":"#/components/schemas/WorkbenchMessage"},"conversationRevision":{"type":"integer"}}}；409: #/components/responses/RevisionConflict

### `followupWorkbenchTurn`

参数：#/components/parameters/Id；path:turnId（必需） {"type":"string","format":"uuid"}；#/components/parameters/IfMatch；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/WorkbenchTurnFollowupInput"}

返回：201: {"$ref":"#/components/schemas/WorkbenchTurnAdmission"}；409: #/components/responses/RevisionConflict

### `updateWorkbenchConversationContextPins`

参数：#/components/parameters/Id；#/components/parameters/IfMatch；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/WorkbenchConversationContextPinsUpdateInput"}

返回：200: {"$ref":"#/components/schemas/WorkbenchConversation"}；409: #/components/responses/RevisionConflict

### `getConfigurationReadiness`

参数：query:teamId（必需） {"type":"string","format":"uuid"}；query:workKind（必需） {"type":"string","enum":["repository","non_repository"]}；query:projectId（可选） {"type":"string","format":"uuid"}；query:workItemId（可选） {"type":"string","format":"uuid"}

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/ConfigurationReadiness"}；400: {"$ref":"#/components/schemas/Error"}；401: {"$ref":"#/components/schemas/Error"}；403: {"$ref":"#/components/schemas/Error"}；404: {"$ref":"#/components/schemas/Error"}；500: {"$ref":"#/components/schemas/Error"}

### `listWorkbenchLlmConnections`

参数：#/components/parameters/Cursor；#/components/parameters/Limit

正文：无requestBody。

返回：200: #/components/responses/PagedJson

### `createWorkbenchLlmConnection`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/WorkbenchLlmConnectionCreateInput"}

返回：201: {"$ref":"#/components/schemas/WorkbenchLlmConnection"}

### `getWorkbenchLlmConnection`

参数：#/components/parameters/Id

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/WorkbenchLlmConnectionDetail"}

### `updateWorkbenchLlmConnection`

参数：#/components/parameters/Id；#/components/parameters/IfMatch；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/WorkbenchLlmConnectionPatchInput"}

返回：200: {"$ref":"#/components/schemas/WorkbenchLlmConnection"}；409: #/components/responses/RevisionConflict

### `revokeWorkbenchLlmConnection`

参数：#/components/parameters/Id；#/components/parameters/IfMatch；#/components/parameters/IdempotencyKey

正文：无requestBody。

返回：204: Connection revoked and stored secret destroyed；409: #/components/responses/RevisionConflict

### `upsertWorkbenchLlmModel`

参数：#/components/parameters/Id；#/components/parameters/IfMatch；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/WorkbenchLlmModelInput"}

返回：201: {"$ref":"#/components/schemas/WorkbenchLlmModel"}

### `getRetentionStatus`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/RetentionStatus"}；403: #/components/responses/Forbidden

### `getNotificationChannelConfig`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/NotificationChannelConfig"}

### `listNotificationChannelTargets`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: #/components/responses/PagedJson

### `createNotificationChannelTarget`

参数：#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/NotificationChannelTargetInput"}

返回：201: {"$ref":"#/components/schemas/NotificationChannelTarget"}

### `updateNotificationChannelTarget`

参数：#/components/parameters/Id；#/components/parameters/IfMatch；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/NotificationChannelTargetUpdate"}

返回：200: {"$ref":"#/components/schemas/NotificationChannelTarget"}

### `revokeNotificationChannelTarget`

参数：#/components/parameters/Id；#/components/parameters/IfMatch；#/components/parameters/IdempotencyKey

正文：无requestBody。

返回：200: {"$ref":"#/components/schemas/NotificationChannelTarget"}

### `listChannelNotificationDeliveries`

参数：无显式参数；检查路径级参数和认证头。

正文：无requestBody。

返回：200: #/components/responses/PagedJson

### `reconcileChannelNotificationDelivery`

参数：#/components/parameters/Id；#/components/parameters/IfMatch；#/components/parameters/IdempotencyKey

正文：{"$ref":"#/components/schemas/ChannelNotificationReconcile"}

返回：200: #/components/responses/Json
