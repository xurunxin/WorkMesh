## 背景与目标

新增配置就绪投影，固定返回模型、Agent、仓库、Runner 四项检查。模型与 Agent 描述可见配置，Runner 恒为 `unknown`；查询结果不参与委派、激活或执行授权。

开工前重新读取最新 `main`、本卡及前置任务状态，核对输入哈希和差异；在当前会话分支同步已合入增量。按本批约定，用 Todos 与仓库记录计划、证据和进度。

## 已确认约定与实施假设

- 查询必须传入 `teamId` 和 `workKind=repository|non_repository`；允许附带 `projectId`、`workItemId`。工作意图仅影响此次查询，不持久化。
- 指定资源时检查对应仓库上下文；未指定资源时检查所选 Team 是否存在已配置仓库及 base branch 的 Project。
- 成功、重复、参数错误和数据库查询故障均不写数据库；鉴权拒绝仅允许既有 `authorization_denials` 审计。
- 接口沿用工作台 Human-only、stable 路由模式，不新增功能开关。四项结果独立，不提供总体“可运行”布尔值。
- A2 页面、Runner 活性事实、迁移和执行授权变更均不在范围内。

## 文件改动

- **`OPENAPI.yaml`**：先声明 `GET /api/v1/workbench/configuration-readiness`，operationId 为 `getConfigurationReadiness`。明确查询参数、响应和结构化错误；无写入对应端点、幂等键或 revision 要求。

- **`packages/contracts/src/configuration-readiness-contracts.ts`**：新增严格 Zod 查询与响应契约。响应使用固定 `checks.model/agent/repository/runner`；每项含 `applicability`、`state`、`reasonCode`。适用项的 `state` 为 `ready|blocked|unknown`；仓库不适用时使用 `applicability=not_applicable`、`state=null`，避免引入第四种就绪状态。缺失配置只返回统一 unmet 原因，不返回隐藏资源的名称、数量或标识。

- **`packages/contracts/src/index.ts`**：导出新契约，加入既有 REST 路由清单。**`packages/contracts/src/route-policy-bindings.ts`** 加入操作绑定；**`packages/contracts/src/route-policy.ts`** 将该操作纳入 `humanOnlyOperations`，保留现有拒绝审计策略。

- **`apps/api/src/configuration-readiness.ts`**：新增 `loadConfigurationReadiness` 与 `registerConfigurationReadinessRoutes`，handler 仅负责解析、调用和响应。查询使用参数化单条 SQL，以可见 Team 为根，复用 `liveHumanTeamReadPredicate`，在返回事实的同一语句中重验 Human 会话、Actor 和当前 Team 权限；响应设置 `Cache-Control: no-store`。
  - 模型复用 `workbench-conversations.ts` 的 `authorizeModel` 条件：同 workspace、连接 active、模型 enabled；personal 仅本人、team 仅所选 Team、workspace 按既有可见性。
  - Agent 复用 `agent/routes.ts` 的 active definition 与未撤销 `agent_team_access` 条件；不以 Session、Delegation 或连接在线状态代替配置。
  - 仓库通过 `repository_contexts` 关联 `repositories`、`provider_connections` 和未删除的资源，要求同 workspace/Team、仓库与 provider active、base branch 非空，并遵守既有 provider 功能限制。WorkItem 检查直接上下文及其所属 Project 上下文；Project 查询只匹配该 Project。无资源参数时只检查 Team 的 Project 上下文。
  - 两个资源参数同时出现时必须一致；不存在、已删除、不可见或不属于所选 Team 的资源统一返回 `NOT_FOUND`。非仓库工作仍校验所传资源范围，再返回 `not_applicable`。数据库故障返回错误，不伪装成 `blocked` 或 `unknown`。
  - Runner 直接投影为 `unknown`，不读取 assignment、Attempt 或 Session heartbeat；不调用 `mutate`、`appendEvent` 或外部服务。

- **`apps/api/src/server.ts`**：注册新路由，复用现有身份认证、路由策略与结构化错误处理，不修改拒绝审计机制。

- **`docs/route-policy-matrix.md`**：仅通过 `pnpm generate:route-policy` 生成；同时生成 OpenAPI 策略扩展，不手改矩阵。

- **`packages/contracts/src/configuration-readiness-contracts.test.ts`**：验证必填参数、非法枚举、固定四项结构、Runner 恒 unknown，以及仓库适用性与状态的合法组合。

- **`apps/api/integration/configuration-readiness.integration.test.ts`**：复用 `buildApp`、`app.inject`、`applyMigrations` 和既有 Human/Agent 凭据夹具。按源 `test-coverage.json` 中原验收条目的完整 `caseName` 建例：

  | 用例 | 关键断言 |
  |---|---|
  | 原验收1 | 四项正常结果；empty、active、disabled、revoked 组合 |
  | 原验收2 | personal、Team、workspace 隔离；隐藏资源与不存在时响应一致 |
  | 原验收3 | 无 assignment、有旧 heartbeat、有执行 Session 时 Runner 均 unknown |
  | 原验收4 | disabled 模型及他人 personal 模型均 blocked，不泄露原因差异 |
  | 原验收5 | 非仓库工作 not_applicable；其他项目配置不能满足当前资源 |
  | 原验收6 | 重复、并行、失败 GET 无业务写入；鉴权失败仅增加拒绝审计 |
  | 原验收7 | 路由注册、策略和生成矩阵一致 |

  同时落实 `R1-8-1`、`R1-8-2`、`R1-8-8` 的完整用例名。利用 `afterAuthorizeRequest` 在鉴权后撤销 membership、会话及配置权限，证明最终 SELECT 不返回旧权限事实。请求前后比较业务表实际行内容与数量，覆盖 Session、receipt、event、outbox、配置和工作台状态；数据库故障定向注入后也作同样比较。

- **`CONTEXT.md`**：补充配置就绪是派生 View Model，不能成为运行许可。**`AGENT_PROTOCOL.md`** 补充查询与执行授权的边界。
- **`docs/adr/0074-workspace-configuration-readiness-check-and-first-run-surface.md`**：记录已确认的工作意图参数、当前资源范围、适用性表示和安全审计例外，不自行宣告验收通过。
- **`docs/plan/a1-configuration-readiness.md`**：保存获批计划并关联本卡。**`docs/reviews/a1/test-coverage.json`** 保存原测试、九类适用性及 DoD 映射；**`docs/reviews/a1/verification.md`** 与证据目录保存实际命令、结果、输入差异和提交绑定，保留 R1 历史快照。

## 验证与交付

1. 使用专用名称含 `test` 的数据库、`RUN_INTEGRATION=1`、显式 bootstrap 测试凭据及 CI 所需 Redis/S3 环境。先运行：
   ```text
   pnpm generate:route-policy
   pnpm check:route-policy
   pnpm --filter @workmesh/contracts exec vitest run src/configuration-readiness-contracts.test.ts
   pnpm --filter @workmesh/api exec vitest run --config ../../vitest.integration.config.ts integration/configuration-readiness.integration.test.ts
   ```
2. 运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`；integration 结束后再运行 `pnpm test:e2e`。执行 `pnpm ci:validate`、`git diff --check`，核对本提交 required CI；记录真实执行数量，不把 skip 或历史成功记为通过。
3. 对照实施基点确认 `SCHEMA.sql`、`packages/db/src/schema.ts` 和 migrations 无改动。演示同一 Human 查询仓库/非仓库意图、不同上下文及撤权后的即时变化，检查 Runner 始终 unknown。
4. 提交测试证据和完成报告，说明文件、接口、实际结果、演示步骤与限制；交由独立复核及 Chief 确认后交付 A2 消费。任一必需检查失败时不宣告完成。