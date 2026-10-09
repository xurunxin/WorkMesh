## 上下文与假设

M0统一“已注册、可发现、部署支持、具名适配、当前资格、目标授权”的含义。现有 `createAgentCapabilityManifest` 仅计算 feature 与能力交集；`createWorkMeshMcpServer`、`getWorkMeshContext` 和 `createWorkMeshTools` 各自维护工具选择，造成 Human-only 工具、E规划写操作和复合导入误广告。

复用现行领域门禁，不授予E协调角色。采用 `GET /api/v1/agent-capabilities?discovery=qualified` 显式请求增强披露；省略参数保持旧响应结构，旧字段保持原含义。增强披露只判断已知前提，目标范围、批准、Lease和revision仍由调用时裁决。

本批不实现Web UI、F/TA新域及后续批次的终态确认、Stop清理适配、子Session、精确action查询和rollup修复；这些缺口必须明确披露。

## 文件与实现变更

- **`docs/plan/agent-mcp-m0/`**：建立 `README.md`、`implementation.md`、`spec.md`、`operation-decisions.json`、`operation-index.md`、`sources.md`、`verification.md`、`review.md`。绑定完整任务正文及#53来源；逐operation记录分类、C/E/H资格、注册与发现、具名SDK/Runner实现、条件、源码出处、测试和后续归属。以实际OpenAPI全集校验无遗漏，不硬编码操作总数。复用既有Todos＋仓库双轨例外。
- **新增发现契约ADR**：在 `docs/adr/` 使用未占用编号，主题为工具发现与恢复契约，承接ADR0012、0042、0067。将协商字段、隐藏工具兼容、错误恢复及身份规则写为提案；上述文件先交同模型/high独审，blocking/high闭合并由Chief确认后进入产品实现。
- **`packages/contracts/src/agent-discovery.ts`（新增）**：建立共享发现元数据，按operation及binding变体声明允许的凭据、Session kind、角色、状态、能力、组成命令与未实现项。输出 `eligible`、`blocked`、`requires_target_check` 和机器可读原因；禁止把第三种状态解释为授权成功。
- **`packages/contracts/src/route-policy.ts`**：将 `createComment/updateComment` 对齐既有Human-only handler。保留其他领域授权规则；补充复合与变体绑定，使导入包含Project、Milestone、WorkItem、relation及前置读取，provider工具按route与domain的联合要求披露，Loop按实际admission条件披露。
- **`packages/contracts/src/index.ts`**：保留旧manifest schema，新增增强响应schema及派生函数；复用 `createAgentCapabilityManifest` 的基础投影。统一角色、撤权、状态、revision、幂等冲突及游标错误的恢复说明，权限拒绝不建议自动刷新后重试。
- **`apps/api/src/client-profile.ts`**：在 `registerClientProfileRoutes` 校验协商参数，读取精确Session的kind、Delegation role/scope和live能力交集，生成增强披露。状态资格复用 `sessionActiveForOperation`；不放宽queued上下文读取或terminal manifest门禁。
- **`apps/mcp/src/index.ts`**：用共享元数据过滤发现结果，借助SDK公开request handler分离 `tools/list` 与兼容调用。旧名称和输入schema保留在兼容表；Human-only旧调用返回结构化 `FORBIDDEN`，不进入领域命令。只读模式不列写工具。为现有resource增加等价只读tool入口，复用同一SDK方法，保留原URI；工具描述绑定准确输入、返回及分页合同。沿用 `tool/errorToolResult/currentRevision`，保全上游错误及trace。
- **`apps/mcp/src/http.ts`、`stdio.ts`**：统一发现准备及凭据模式检查。错误或混合凭据失败关闭，不回退到另一身份；每请求独立绑定Connection和exact Session，不共享执行Token。
- **`apps/mcp/src/coordination-product.ts`**：`getWorkMeshContext.allowedOperations` 使用增强资格结果，并披露缺失前提和后续入口。复用 `collectPages`、规范化及 `importKey`；保持导入的hash恢复语义、逐命令部分提交和重放窗口，明确同内容再次导入的现有限制。
- **`packages/agent-sdk/src/index.ts`**：增加增强发现请求及响应校验，复用 `stableIdempotencyKey`、请求重试和 `WorkMeshSdkError`。明确调用前持久化显式key；传输重试及重连沿用同key/body，新动作使用新key，改正文不能复用旧身份。拒绝、Stop和冲突不自动刷新或重写。
- **`apps/agent-runner/src/workmesh-tools.ts`、`run-session.ts`**：`createWorkMeshTools` 取增强manifest，只呈现已实现且满足角色、状态和能力条件的工具，移除E无法通过 `teamAccess` 的规划写广告。保留 `operationKey` 和完成intent机制；`RunnerApiError` 保全message/details/correlationId，取消任意 `401` 自动刷新，只按已知凭据到期进行请求前刷新，拒绝后不重发。
- **合同与客户端文档**：更新 `OPENAPI.yaml`、`AGENT_PROTOCOL.md`、`docs/AGENT_COLLABORATION_CLIENT_PROFILE.md`、`docs/agent-integration.md`，公告协商、兼容及恢复行为；重新生成 `docs/route-policy-matrix.md`。无数据库迁移或新领域事件。
- **测试与运行入口**：扩展指定contracts、MCP、SDK、Runner测试及API权限集成测试；新增 `packages/conformance/src/mcp-coverage.conformance.test.ts`。调整conformance配置、`package.json`、锁文件及根集成入口，确保真实链被必需检查执行，缺夹具直接失败；现有内存conformance继续作为独立检查。

## 边界行为

发现后撤权或改变feature，API仍重新拒绝；不通过重新配对、刷新或换身份绕过。跨Team保持 `NOT_FOUND`，原因字段不包含隐藏资源存在性。

queued只提供现行握手、manifest和ACK前提；paused、stopping及terminal按真实门禁处理。manifest不可读取时保留原拒绝及最后有效发现说明，不新增终态Token读取权限。现有SDK Stop ACK入口保持可走，MCP/Runner尚缺的专用清理适配明确标为后续批次。

Human-only请求沿现有身份解析前拒绝；Coordination派生允许其既有Session事实，拒绝账本沿ADR0028。resource读取不增加receipt或业务outbox。错误包装和活动记录不得覆盖原命令错误。

## 验证与交付门禁

1. 使用仓库规定的Node/pnpm环境执行 `pnpm install --frozen-lockfile`；重核精确远端main及共享合同差异，只整合实际已落地主线。操作决策清单与解析后的OpenAPI全集双向集合一致，每个误广告项绑定服务端和适配证据。
2. 执行 `pnpm generate:route-policy`、`pnpm check:route-policy`、相关包定向测试，再执行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e`、`pnpm test:conformance`。内存conformance结果单列，不代替真实链。
3. 真实集成使用本任务独有API、MCP和数据库：预授权→安全兑换→initialize→tools/resources发现→verify/context/manifest→准确ID调用→故意越权→读取完整错误→继续允许读取。分别验证C只读、C读写、E，资源客户端及仅tool客户端；启动真实Pi Runner，使用本机假模型服务捕获模型实际收到的tools，不授权外部连接。
4. 将九类验收逐项绑定测试：正常发现；Human/E越权与撤权；状态/profile/凭据错配；丢响应、同key并发及异体冲突；旧revision；下游事务失败；初始化和resource重放；双客户端exact Session隔离；API/MCP重启、durable cursor和Stop。包含可读取正对照及数据库事实断言；新发现事务、新job明确不适用。
5. 记录受测head、Git blob与工作树换行映射、真实命令退出码、runtime、skip及首败。资源精确登记并在失败路径收尾，保全脱敏证据后仅清理确认归属且闲置的资源；已拒目标不重试或绕行。产品独审、最新候选PR RequiredCI及实际合入main证明齐备后验收，报告范围、文件、API变化、测试、演示步骤和剩余缺口。
