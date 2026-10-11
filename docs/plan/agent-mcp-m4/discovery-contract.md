# M4 discovery 生成与资格待审合同

本合同补正正式审查的 High(blocking)，不改变后端授权范围。原审全文见 [reviewer-feedback](input/discovery-review/reviewer-feedback.md)，原候选 `4e144f35759525a8a377acc73ba2f2dbfe02ab67` 保留可达。当前产品生成器/产物未变、产品验证未运行；blocking仍待正式复审关闭。

## 源码与生成责任

`scripts/generate-agent-discovery.py` 目前读 M0/M1 operation-decisions 与 M2/M3 product-discovery-decisions，按 operationId/bindingId覆盖；底部 `registered` 仅 M2/M3 union，会过滤 `route-policy.ts` 的新M4 mcpOperationIds。`scripts/generate-route-policy-artifacts.mts` 只负责 OpenAPI策略扩展与 `docs/route-policy-matrix.md`，不生成 agentDiscoveryRules/bindings。完整14项来源、函数全文和基线在 [来源清单](input/discovery-review/source-manifest.json) 与 [baseline](input/discovery-review/discovery-baseline.json)，不凭工具前缀推完整输出。

未来实现明确修改 discovery 生成器：在 M0–M3 后加载本批 [product-discovery-decisions.json](product-discovery-decisions.json)，合并其 rules/bindings，并将 M4 `registeredBindingIds` 纳入原注册集合。沿 operationId/bindingId键稳定合成，不改变旧条目的字段、顺序或身份变体；四项规则是唯一已决定替换的旧规则。保留旧138 bindings及137 policy mappings，对新bindings验证实际注册和已存在OpenAPI操作；缺注册、未知operation、同批重复/冲突标识或未完成activationGate，拒绝生成，不先写部分派生结果。不从callback返回的sessionId推身份。

M0–M3冻结输入原字节/hash保持，新增事实只写M4。旧注册集合原union来自139个历史ID，并非本轮runtime实测；不从其中数量证明全部工具可用。未来使用 `apps/mcp/src/discovery.ts` 的 `installDiscovery` 对registerTool/registerResource的真实捕获，以完整read-write inventory填本批registeredBindingIds，另保read-only inventory及mode/credential/feature配置、源码指纹和原输出。它不靠公开tools/list推注册全集，因为该列表已经过资格过滤。

注册捕获采用既有Vitest夹具机制：在 `optional-domains.fixture.ts` 创建真实server前，对公开 `McpServer.prototype.registerTool/registerResource` 临时spy并调用原实现，仅成功返回时记录准确server/name；`installDiscovery`原钩子仍真实执行，finally恢复spy。suite按既有单进程串行边界，隔离其他server，不改产品discovery.ts、不读MCP私有registry、不造mock成功注册。capture只观察构建注册，可在首次生成前取得；target调用及资格回归在生成后进行。

当前受控文件沿 M3 `source/rules/bindings/registeredBindingIds` 形状列出拟规则和绑定，但 `registeredBindingIds=[]`、registrationEvidence为未运行，拟新增集合另列plannedRegistrationAdditions；不是可启用的产品输入。正式复审、后端合同及真实注册验证通过后，执行者用实际证据填充注册集合、更新activationGate状态，才运行未来修订的生成器。规划辅助脚本只写本目录，不能调用该产品生成器或改derived结果。

## 四读取的完整新资格

四项 Agent 规则均删除 `humanAuthorityMatches`、`legacyMembershipQueryVisible`，而不是仅删 `queryDifferences`。共同读取谓词逐项复用主线 `listInitiatives`：

| fact | allowed | reason |
| --- | --- | --- |
| credentialMode | human_session、agent_session、coordination_connection | CREDENTIAL_MODE_MISMATCH |
| sessionKind | execution、coordination | ROLE_REQUIRED |
| role | executor、reviewer、researcher、coordinator、triager | ROLE_REQUIRED |
| state | acknowledged、planning、executing、awaiting_input、awaiting_approval、blocked | SESSION_STATE_DENIED |
| liveAuthority | true | AUTHORITY_REVOKED |
| capabilitiesAllPresent | true，三方work:read交集 | CAPABILITY_DENIED |
| featureEnabled | true，按各操作原feature | FEATURE_DISABLED |

capabilities固定 `['work:read']`、variants沿原空集合、write=false。qualified discovery现行identity schema仅Agent E/C；Human REST合法读仍由原后端分支核，不把Human塞进Agent manifest来解决查询。`liveAuthority`由API真实资格提供，不能在测试中造true冒合法授权；最终投影仍用 [安全合同](safety-contract.md) 的精确凭据/principal/Session/Delegation/grant同SQL快照重核。

| operationId / feature | 目标谓词（均 allowed=true） | 正确pendingChecks与最终判定 |
| --- | --- | --- |
| getInitiativeRollup / WORKMESH_BETA_PLANNING | initiativeLinkedProjectScope，reason=NOT_FOUND | 与list一致准确project/item linked范围；合法身份但未读目标时pending该项，最终REST仅授权项目非零聚合；team-only C/projectless Loop E不借Team扩项目 |
| getAutomationRun / WORKMESH_EXPERIMENTAL_AUTOMATION | routeResolvedScope、automationRunSessionMatches，reason=NOT_FOUND | 与listAutomationRuns一样，准确run.session_id=currentSession；origin返回targetId不授读取，nullTeam不豁免 |
| getUsageSummary / WORKMESH_BETA_COSTS | usageSessionMatches、usageAgentMatches、usageProjectMatches、usageFiltersMatchCurrentSession，reason=RESOURCE_SCOPE_DENIED | 准确本人Session/Agent/绑定项目和显式filter一致，projectless显式projectId拒；无记录仍合法空，不能呈已知免费 |
| streamA2ATaskEvents / WORKMESH_EXPERIMENTAL_A2A | a2aBindingActive、a2aTaskSessionMatches，reason=NOT_FOUND | binding active/current workspace/task exact current Session及原pin协议；最终batch重核/deriveddelivery去重沿原安全合同 |

共同已知门禁失败必须blocked；共同合法但上述目标事实未知必须 `requires_target_check`、pendingChecks列各自目标facts，不能保持旧Human pending、笼统domain未知、提前eligible或凭发现直接输出正文。在后端新投影及准确正反测试通过前，产品仍保四项 `DOMAIN_QUERY_NOT_AGENT_ALIGNED`；实现后该阻断与四新rules一并切换。缺capability、feature=false或queued/stopping/终态在deriveOperationEligibility可判为blocked，无需目标查询。

## 工具bindings与消费者

16项拟新增tool bindings在受控增量逐项列出，operationIds与 [矩阵](operation-matrix.md) 的REST/SDK/MCP名称一一对应。统一 `execution='api'`、`coordination=false`、`identityBinding='explicit_identity_variants'`、variant=null，E/C各一条current_session、targetParameter=null、installationBridgeRequired=false。这是安装bridge不必要，不是绕过C feature；C仍需其现行准入和准确current Session，target资源ID不能被解释成另一个Session Token。

GET mode为read-only/read-write，create_saved_view/run_loop_now/record_usage仅read-write。recordUsage输入的sessionId必须当前本人，不是target桥接；runLoopNow新Session仅回执，不能刷新origin共享clienttoken。原3项health/completion的binding、精确执行E/显式target等身份变体原样复制，其他旧138绑定均原样保留，包括安装handoff、ACK/heartbeat/Stop专用恢复。Human管理保持原拒例，M4不改这些规则。

MCP复用 `projectAdapterDiscovery` 的真实registered集合与资格；Runner额外仅准确executing execution E，mode及target-pending不授管理权。注册证据、adapter发现、REST授权及模型实收分层验证，不用新增工具数量证明系统全功能。A2A的write=false是读取分类，底层既有派生delivery仍有写；不改变其work:read门禁。

## 未来验证及复审判据

未来先改合同/后端并过正反测试，再注册真实工具并保存注册证据、激活M4增量及改生成器；运行discovery→route-policy→RunnerSkill的独立生成链。暂存预期产物后重跑各生成器，比较两轮全文字节指纹，并对五个生成文件执行git diff --exit-code零差异。对照完整旧baseline逐条检查binding/映射/identityVariants保留；历史输入字节仍相同。未知operation、M4binding缺注册及历史条目丢失各有拒生成负例；这属于未来产品验证，当前未跑。

`packages/contracts/src/agent-discovery.test.ts` 和真实MCP回归覆盖feature关闭、queued/stopping/terminal、缺能力、合法target未知、read-only写不可见、E/C current_session及旧恢复。合法pending不是失败也不是通过授权：必须能发起真实REST target核验，允许非空及拒例都记录。当前无产品生成幂等、发现回归或RequiredCI通过证据，正式复审只审本次修订设计和来源。
