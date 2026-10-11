## 上下文

M4 补齐 Planning、Template、Automation、Agent Loops、Costs、A2A 的既有 Agent 操作。复用现行角色、feature、Session、Delegation、Team grant、scope 和批准门禁，形成可发现、可调用、可追踪、可恢复的闭环。

M0 已明确将 `getInitiativeRollup`、`getAutomationRun`、`getUsageSummary`、`streamA2ATaskEvents` 的 Human membership 查询差异留给 M4。先完成安全合同和后端测试，再开放对应适配及发现资格。

## 假设与边界

使用本卡独立本机测试部署启用六域，逐域验证关闭负例；保留生产配置。复用本机既有 OpenCode、Pi、loopback 受控模型和 fake provider，不新增安装、登录或外部账号连接。

Web UI、F/TA 新域、Human 管理权限、真实外发、公共签名 Skill 发行及其他系统发行验收均不在本批范围。

## 文件与变更

- **`docs/plan/agent-mcp-m4/`**：保存平台计划全文、完整中文规格快照、冻结 M4 原文、来源元数据、实施方案、逐操作安全与消费者矩阵、九类场景及不适用理由。本轮仅写入并提交规划文件，不实现产品、不启动测试部署；四项读取投影及 Runner 边界作为待审设计，逐项引用现行合同证明不扩大授权。绑定准确 Git blob 与运行字节，消费 M5 当前报告、恢复合同和已合清理规则；历史报告仅引用。文档及下述 ADR 先交另一 Agent 正式独审，blocking/high 闭合后实施产品。
- **`docs/adr/0086-optional-agent-domain-read-projections.md`**：定义四项最小授权投影。Initiative 仅聚合与 `listInitiatives` 相同的授权项目；run、usage、A2A task 限准确当前 Session。保留 Human 读取及 A2A 既有 delivery 去重语义，明确授权拒绝与合法空结果的区别。
- **`OPENAPI.yaml`、`packages/contracts/src/optional-domain-contracts.ts`、`packages/contracts/src/index.ts`**：补齐所选读取和有限写的输入、返回及分页 Zod 合同，明确 usage 过滤参数和 A2A 有界页。保持现有路径、字段和错误包；金额使用十进制字符串，currency 分桶，unknown 不转为零。
- **`apps/api/src/operations/read-projections.ts`、`apps/api/src/operations/routes.ts`**：将四项读取实现为应用层投影，路由只负责解析与调用。复用 `liveSessionReadPredicate`、`principalTeamAuthorityPredicate` 和 `rollupInitiative`，授权与返回事实在同一查询快照核验；失权返回拒绝，跨 scope 隐藏目标。保留 Initiative 的可见项目上限、COSTS 开关与 Human 行为。Usage 仅汇总本人准确 Session；run 仅返回本人 run/effects。A2A 复用 `mapStreamEvent`，每次最多扫描现有有界页，空映射页仍推进扫描游标，delivery 写入重新受实时授权及去重约束。
- **`docs/plan/agent-mcp-m4/product-discovery-decisions.json`、`scripts/generate-agent-discovery.py`**：沿 M3 的 `rules/bindings/registeredBindingIds` 格式建立 M4 受控增量，按 operationId/bindingId 在 M0–M3 后合成，注册集合纳入 M4；历史输入不改。注册证据取自 `installDiscovery` 捕获的实际工具/资源注册，保留原 bindings 和映射，缺注册或未知操作即拒生成。新增工具绑定为当前 E/C 的 `current_session`，`targetParameter=null`、不要求 installation bridge；GET 支持两种 mode，写仅 read-write，已有 health/completion 身份变体保留。
- **`packages/contracts/src/route-policy.ts`、`agent-discovery.ts`、生成的 `agent-discovery-rules.ts`**：四投影后端合同通过后，既移除对应 `DOMAIN_QUERY_NOT_AGENT_ALIGNED`，也通过 M4 增量替换四项 `humanAuthorityMatches/legacyMembershipQueryVisible` 旧谓词。共同门禁沿 `listInitiatives` 的 credentialMode/sessionKind/role/state、liveAuthority、capabilitiesAllPresent、featureEnabled，能力为 work:read；rollup 目标用 `initiativeLinkedProjectScope`，run 沿 `listAutomationRuns` 的 `routeResolvedScope/automationRunSessionMatches`，usage 用 `usageSessionMatches/usageAgentMatches/usageProjectMatches` 及显式过滤必须匹配本人 Session 的 `usageFiltersMatchCurrentSession`，A2A 用 active 绑定的 `a2aBindingActive` 和准确当前 task Session 的 `a2aTaskSessionMatches`。目标事实未知保持 `requires_target_check`，调用由 REST 实时重核；复用 `deriveOperationEligibility/projectAdapterDiscovery`，分别生成 discovery 与 route-policy 工件，不手写派生表。
- **`packages/agent-sdk/src/index.ts`**：增加具名 typed 方法，覆盖 cycles、Initiatives/rollup、普通 saved views、advanced views/results、rules/runs、Loops、usage、Template pin 和 A2A 页；复用 `pagedPath`、`request`、`validateResponse`。有限写固定逻辑调用的 key/body、`occurrenceKey`、`scheduledFor`、`dedupeKey`；权限拒绝不刷新绕过。
- **`apps/mcp/src/index.ts`**：注册对应读取工具及现行允许的 `create_saved_view`、`run_loop_now`、`record_usage`，复用 `tool` 错误和 structuredContent 格式。写工具仅在读写模式注册。Advanced View 创建和规则/Loop/Template 管理保持 Human-only；Template 只返回当前执行 pin 的版本；A2A 使用 `get_a2a_task_events` 单页工具，游标独立于普通事件与集合分页。
- **`apps/agent-runner/src/workmesh-tools.ts`、内嵌 `SKILL.md` 及 `workbench-skill-manifest.ts`**：补齐同一操作集合，复用 `createWorkMeshTools`、`makeTool`、`operationKey`。GET 不追加 Activity；分页保留完整数据与游标，超出消费上限明确报错。`recordUsage` 使用命令自身事实，不因 Activity 包装额外要求 `work:write`。沿用 health/completion 提案与批准边界，不扩普通工具自动重放白名单。
- **`packages/contracts/src/agent-discovery.test.ts`、对应 SDK/MCP/Runner 单元测试及 `apps/api/integration/stage4-operations.integration.test.ts`**：覆盖 DTO、参数、错误、授权投影及 Human 回归。新增发现回归逐项验证 feature 关闭、非法 Session 状态、缺 capability、合法身份但目标待核；四投影不再含旧 Human 查询谓词，pendingChecks 必须列出各自精确目标条件。对照基线保留全部旧 bindings、operation 映射和身份变体，真实 MCP 注册及 read-only/read-write 投影与 M4 增量一致；原 ACK/heartbeat/Stop 恢复不回退。复用现有真实 Session 凭据和 stage4 夹具。
- **`packages/conformance/src/optional-domains.conformance.test.ts`、`optional-domains.fixture.ts`**：复用 `createMcpCoverageFixture`、`createPlanningCollaborationFixture` 和现有客户端驱动，建立真实 REST→SDK→MCP→Pi/OpenCode→数据库事实验证。
- **conformance integration/build 配置、根 `vitest.config.ts`、`scripts/ci-policy.mjs` 及测试**：将新套件接入 Required CI 的真实集成入口、从普通 unit 排除，并将跨包夹具从生产构建排除；增加逐套件移除负例，保留失败传播和证据上传。

## 验证与交付

- 在独有空测试库及登记过的服务中，证明非空 Initiative 授权聚合准确、同 Initiative 其他项目排除、先 list 后撤 Delegation/Team grant 必须拒绝；补 principal 撤权、Human、项目上限、多币种及 unknown 正反对照。
- 逐域执行冻结九类：正常分页与引用、越权/撤权、非法状态、同 key/body 与异体冲突、health 旧 revision、事务故障回滚、Worker/outbox 重放、no-overlap/预算竞争、重启与 Stop。验证 saved view owner、Template pin、跨 Session run/usage/A2A 拒绝；A2A 重放仅复用既有 delivery，普通 GET 零领域写入。纯 GET 的 revision/写回滚记录不适用理由。
- 先运行 `python -B scripts/generate-agent-discovery.py`，再运行 `pnpm generate:route-policy` 与 `pnpm generate:runner-skill`；暂存预期生成产物后重复生成，比较两次完整字节指纹，并以 `git diff --exit-code -- packages/contracts/src/agent-discovery-rules.ts packages/contracts/src/route-policy.ts OPENAPI.yaml docs/route-policy-matrix.md apps/agent-runner/src/workbench-skill-manifest.ts` 证明零差异。核 M0–M3 输入指纹不变、旧 bindings/mappings/identityVariants 全保留及 M4 注册未丢；运行 `pnpm --filter @workmesh/contracts exec vitest run src/agent-discovery.test.ts` 和真实 MCP 的关闭 feature／非法状态／合法目标待核回归。再运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e`、`pnpm ci:source`、`pnpm ci:test`、`pnpm ci:validate`、`pnpm check:route-policy`、`pnpm check:runner-skill`。直接运行 conformance 生产构建，验证新增夹具不会被缓存绿色掩盖。
- 实跑授权 C/E 查询规则和 Loop、允许手动运行、准确 run/effect/result 追踪、usage、Template pin、项目健康与 rollup，以及 A2A 有界恢复。分别保存协议夹具、真实客户端模型实收和数据库事实；记录准确命令、退出、runtime、数量、skip、首败和受测源码前后指纹，不借 M5 结果验新组合。
- 在受控目录保存逐操作支持报告、演示步骤和资源账本；分列逻辑长度、文件身份去重长度与物理释放。只收尾本人闲置且已保全、无活动及恢复引用的资源，继续保护 M5 恢复目录、旧只读对象及 G1/D0/C3 拒绝目标和父目录。正式成果独审、最新候选 Required CI、PR merged 与 actual Done/main 均齐后才记验收；仅 Todos＋仓库留痕。
