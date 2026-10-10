## 上下文与假设

完成 M3 冻结范围：精确异步 action 确认、Git 交付、上传与证据查询、独立 reviewer、当前 head 审批及终态恢复，统一 REST／SDK／MCP／Runner 行为。

假设：Human 已完成 provider 连接与 context pin；目标 reviewer 来自已授权输入，沿 M2 受控交付。仅使用 Todos＋仓库记录。UI 重设计、F／TA 新域、真实外发发布和凭据连接不在范围内。

## 受控方案与实施关口

- **`docs/plan/agent-mcp-m3/`**：执行时先提交完整中文 spec、冻结 M3 原文、内容一致的 savedplan／implementation、安全合同、DTO／policy 提案、消费者兼容、逐操作矩阵和九类验证方案。保存冻结路线七份完整 Git 原件、M2 交付及相关源码；分别绑定 commit／blob 与工作树字节，保留原测试、DoD、适用理由和读取缺口。
- **`docs/adr/0083-exact-provider-action-query-and-review-repository-scope.md`**：提交 Proposed ADR，冻结精确查询及本次用户裁定的 reviewer 仓库读授权。规划工件完成后停 confirm，供平台另一 Agent 按既有模型／high 委托独审；blocking／high 闭合且 Chief confirm 后进入产品实施。保持已审历史原件。

## 合同与后端变更

- **`OPENAPI.yaml`、`packages/contracts/src/delivery-contracts.ts`、`index.ts`、`route-policy.ts`及生成的 bindings**：新增 `GET /api/v1/provider-actions/{id}`，`operationId=getProviderAction`。严格白名单 DTO 返回 action ID、kind、原 requester／Session／资源绑定、状态、目标、时间及安全结果引用；按 kind 投影 branch、commit、PR、merge、CI retry、context 结果。分别表达本地完成、已有 provider checkpoint 和外部效果未知；错误仅允许稳定 code，恢复信息只指向查询或人工对账。禁止返回 payload、文件内容、秘密、worker 身份及 provider 原始错误。补本批既有交付／上传响应 schema，保留原字段、数组和分页信封。
- **`packages/contracts/src/child-session-contracts.ts`、`apps/api/src/collaboration/routes.ts`**：为 `ReviewDelegationInput` 新增可选 `repositoryIds`，显式值必须为非空、无重复 UUID 清单。`createReview` 在现有 authority 锁内验证父 Delegation、目标 definition、Team grant 均具 `repo:read`，每个仓库属于父范围并有合法 context；再增加该读能力，并将子仓库范围缩减为明确清单。省略保持 M2 原合同。复用 `admitChildSession`、预算 reservation、稳定 Plan 绑定和 `provisionNewSessionDelivery`；不增加仓库写权或 `plan:write`。
- **`apps/api/src/delivery/provider-action-query.ts`、`delivery/routes.ts`**：实现并注册只读投影，复用 `liveSessionReadPredicate`、`liveHumanTeamReadPredicate` 和现有 repository context 规则，在同一授权快照内检查实时凭据、principal、Delegation、Team、仓库、资源与 provider feature。E 仅确认本人精确 Session 的原 action；Human context action 限原 requester，Agent action 的 Human 确认限当前合法 principal。不可见 action 统一 `NOT_FOUND`；普通终态 E 继续拒绝。查询不调用 provider，不创建 Token、receipt、活动、event 或 outbox。
- **`apps/api/src/delivery/routes.ts`**：交付读取加入可选精确 `pullRequestId` 过滤，保留默认响应；授权过滤在取数前完成，准确返回当前 head 的 checks、reviews、findings 和批准绑定，防止跨 scope 数据或列表截断被误认完整审查。上传 status／列表／download 在最终取数时重验实时授权；cancel 沿原合同，不新增 `If-Match`。复用 `assertAgentRepositoryWrite`、`prepareAgentPullRequestAccess`、`assertDeliveryTarget` 和 `assertMergeReady`。
- **`AGENT_PROTOCOL.md`、`docs/AGENT_COLLABORATION_CLIENT_PROFILE.md`、`docs/agent-runner.md`**：记录新查询、显式 reviewer 读权、上传传输责任及恢复步骤。零数据库迁移、零新增领域事件；复用现有 `provider_actions`、artifact links 和批准事实。

## 消费者变更及边界

- **`packages/agent-sdk/src/index.ts`、`apps/mcp/src/index.ts`**：补 typed `getProviderAction`、仓库／交付、upload status／cancel／download／Artifact 列表、completion suggestion 和 health 允许子集；现有方法保留兼容名称。两种 review 创建适配均透传 `repositoryIds`。直接 E 使用本人 Token；C 的目标 E 查询须显式指定 Session，沿 M0 局部 Token bridge，不根据返回 ID 猜身份。受保护拒绝不刷新、不重发；同一逻辑写保持 key/body，新动作使用新 key。
- **`scripts/generate-agent-discovery.py`、生成的 `packages/contracts/src/agent-discovery-rules.ts`及 `route-policy.ts` binding**：消费 M3 受控增量，保留 M0／M1／M2 冻结输入。逐项对齐角色、capability、provider feature、context permission 和目标检查；区分 branch／commit 的 `repo:write_branch`、openPR 的 `repo:open_pr`、merge 与 CI 权限。Human 批准、completion 裁决和项目 update 发布继续隐藏并拒绝缓存调用；health 的 Agent 发布保留现有精确 Human approval。
- **`apps/agent-runner/src/workmesh-tools.ts`、`run-session.ts`、新增 `delivery-transfer.ts`**：补当前 E 的 Git／证据／查询工具及 review 参数，复用 `makeTool`、`operationKey` 和 qualified manifest。签名上传／下载由受控传输模块消费，只访问配置的 artifact store，发送准确 required headers，不携带 WorkMesh Bearer、不接受模型提供的 URL、不跟随重定向；模型仅收到状态、证据引用和有界内容，签名凭据不进入提示或活动。精确 action 与审查结果不静默截断；GET 不写普通活动。
- **相关 SDK／MCP／contracts／Runner 单元测试文件**：同步校验输入、完整输出、发现与实际调用一致性。reviewer 必须在有效 E 授权下依次发布本人 Room `review_result`、当前 head 的 `code_review` delivery Artifact、structured review，然后完成；file upload、父代发和 structured review 均不能豁免双证据。

## 验证与交付

- 扩展 **`apps/api/integration/stage3-delivery.integration.test.ts`、`stage2-collaboration.integration.test.ts`、`apps/worker/integration/stage3-provider.integration.test.ts`及上传相关测试**；新增 **`packages/conformance/src/delivery-recovery.fixture.ts`、`delivery-recovery.conformance.test.ts`**。复用 fake provider、真实 API／MCP、M2 受控 child 交付及本机 HTTPS 假模型，完成 Native HTTP／MCP／Pi 三条链：准确 base/path → Lease → branch／commit／openPR 与逐 action 确认 → 当前 head 证据 → 独立 reviewer → 父确认 child completed → 精确批准 → Worker 发送重验 → action 终态 → 父完成。另验批准后的 CI retry；merge 不 deploy、不自动改变 Issue 状态。
- 九类验收逐条落盘：正常；越权／撤权；非法状态；同 key 重放与异体冲突；旧 revision／head；事务失败；webhook／job 重放；并发；重启／恢复／Stop。覆盖三方缺 `repo:read`、未指定／错仓库／跨 Team、旧 head、Blocking／High、未通过 checks、缺 reviewer 双证据及 required child 未完成。使用 PostgreSQL 实际锁等待和真实租期验证 fencing、Stop／撤权与发送 checkpoint 次序；未知外部效果只读对账，客户端不创建新 action 盲重发。
- 修改 **`packages/conformance/vitest.integration.config.ts`、根 `vitest.config.ts`、`scripts/ci-policy.mjs`及其测试**：将新真实套件加入 Required conformance，并从内存单元排除；补删除单套件、失败／skip 传播负例，保留现有 CI 接线。
- 执行 `pnpm check:route-policy`、`pnpm check:workmesh-skill`、`pnpm check:runner-skill`、`pnpm ci:test`、`pnpm ci:validate`，以及 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e`。Windows 使用 `pnpm.cmd`；源码变更涉及 lock manifest 时按既有流程更新并复验，禁止删除断言。
- 在 M3 目录保存受测源码前后指纹、准确命令／退出码／runtime／数量／skip／首败及资源准备恢复清理回执。先登记独有资源，保全脱敏证据后仅清本人闲置资源；审批拒绝立即停止该目标。真实 provider／存储分别报告支持、不支持、未测；新组合不借旧 UI 结果。独立成果审查、最新 PR Required CI、actual Done/main 齐全后验收，交付摘要、准确 head、受控路径与演示步骤。
