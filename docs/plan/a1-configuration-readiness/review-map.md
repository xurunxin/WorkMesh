# A1 计划归档与独审映射

本文件是计划的审查索引，不改写平台 savedplan。精确中文正文见 [完整计划](../a1-configuration-readiness.md)，来源、currentID、版本空值与内容哈希见 [来源记录](source.json)。当前规格全文见 [当前规格](current-spec.md)，平台工具实读见 [读回记录](platform-readback.json)。

授权边界：本轮只允许 docs/plan 下的计划文档前置提交；产品实现、契约修改、路由生成和功能测试尚未执行。待规划独审及 Chief 再次确认实施。没有新增平台计划版本，不循环另存；历史文件均保留。

## 方案与契约映射

| 要求 | 精确计划中的位置与实施入口 | 独审应核对的断言 |
|---|---|---|
| API 与严格 DTO | 文件改动：OPENAPI.yaml、configuration-readiness-contracts.ts、index.ts；GET /api/v1/workbench/configuration-readiness，getConfigurationReadiness | 必填 teamId/workKind；projectId/workItemId 为上下文；Human-only；无写端点、Idempotency-Key 或 If-Match 要求 |
| 路由策略与生成 | route-policy-bindings.ts、route-policy.ts 的 humanOnlyOperations；generate-route-policy-artifacts.mts；pnpm generate:route-policy 与 pnpm check:route-policy | index.ts 路由清单、operation binding、Fastify installRoutePolicyInventory 登记一致；矩阵和 OpenAPI 策略扩展由生成器产生，不手改矩阵；保留 audit.denial |
| 三态与适用性 | checks.model/agent/repository/runner；applicability、state、reasonCode | 适用项 state=ready/blocked/unknown；仓库不适用为 applicability=not_applicable、state=null；not_applicable 不是第四种就绪状态；不将 unknown 聚合成 blocked |
| 模型不泄露存在性 | loadConfigurationReadiness；workbench-conversations.ts 的 authorizeModel 条件 | 同 workspace、active connection 与 enabled model；personal 仅本人、team 仅所选 Team、workspace 按现行可见性；隐藏模型与未配置返回同一 unmet，不披露存在、名称、数量或 ID |
| Agent 配置 | agent/routes.ts 的 active definition、agent_team_access 未撤销条件 | 可见 active 定义才 ready；不把活跃定义解释为可执行 Session/Delegation 或在线连接 |
| 当前仓库上下文 | repository_contexts、repositories、provider_connections；指定资源限定匹配范围 | WorkItem 直接及所属 Project 上下文；Project 只匹配自身；不允许其他项目满足；无资源参数才所选 Team 的 Project；provider/repository active、base branch 非空、既有 feature 限制 |
| 资源边界 | 查询参数及最终 SELECT | 两个资源参数必须一致；跨 Team/workspace、不存在、删除或不可见统一 NOT_FOUND；非仓库工作也验证所传资源 |
| 撤权再读 | live-read-authorization.ts 的 liveHumanTeamReadPredicate；buildApp 的 afterAuthorizeRequest | 返回事实的同一 SQL 重验会话、Actor、Team；鉴权后撤销 membership/会话仍不能返回旧事实；模型/Agent 撤权后下一次读收敛；并行 Team 查询不串投影；Cache-Control=no-store |
| Runner unknown | 常量投影；不读取 assignment、Attempt、Session heartbeat | 空闲、缺 assignment、旧心跳或有执行 Session 均 unknown；不新增注册表、活性事实或迁移 |
| 零领域写入与安全审计例外 | server.ts 既有错误处理、authz/authorize.ts 的 recordAuthorizationDenial | 成功、重复、参数错误及查询故障无数据库写入；鉴权拒绝只允许现有 authorization_denials；状态、Session、receipt、event、outbox、配置、工作台行内容与数量不变；不调用 mutate/appendEvent/外部服务 |
| 不形成激活许可 | 背景与目标、CONTEXT.md、AGENT_PROTOCOL.md、ADR 0074 | workKind 只作用查询，不持久化；无总体可运行许可；委派、激活及执行仍走既有命令授权与状态校验 |
| 交付门禁 | 验证与交付 | 全量必需检查、精确提交证据、独立复核与 Chief 确认；当前尚未产品实现或运行功能验收 |

## 原测试清单逐条映射

来源为 docs/reviews/r1/test-coverage.json 的本卡 originalTests；以下 caseName 保留源字符串，目标文件均待创建，结果均为未运行。第六项按用户答复保留 authorization_denials 安全审计例外；历史原文不被覆盖。

| 原测试 ID | 原 caseName（完整） | 测试文件 | 计划断言 | 当前结果 |
|---|---|---|---|---|
| todo-8-T1 | #8 原验收1：四项检查各自的 happy path | apps/api/integration/configuration-readiness.integration.test.ts | 四项正常结果；empty/active/disabled/revoked；模型 active+enabled、可见 active Agent、仓库 ready、Runner unknown | 未创建、未运行 |
| todo-8-T2 | #8 原验收2：跨 Team 与他人个人模型**不泄露存在性** | apps/api/integration/configuration-readiness.integration.test.ts | personal/Team/workspace 隔离，隐藏配置与不存在一致，不披露名称、数量或 ID | 未创建、未运行 |
| todo-8-T3 | #8 原验收3：**无 assignment 的空闲 Runner 不得被报成离线**（`unknown`） | apps/api/integration/configuration-readiness.integration.test.ts | 无 assignment、有旧 heartbeat、有执行 Session 均 unknown | 未创建、未运行 |
| todo-8-T4 | #8 原验收4：模型 disabled → `blocked`；模型属于他人 → 对该调用者 `blocked` 且不泄露 | apps/api/integration/configuration-readiness.integration.test.ts | disabled 或 revoked/无 enabled model 为 blocked；他人 personal 不可见且返回统一 unmet | 未创建、未运行 |
| todo-8-T5 | #8 原验收5：非仓库工作 → `not_applicable` 而非 `blocked` | apps/api/integration/configuration-readiness.integration.test.ts | 显式 non_repository 为 not_applicable/null；repository 指定资源时其他项目不能使其 ready | 未创建、未运行 |
| todo-8-T6 | #8 原验收6：断言**无状态/事件/outbox/receipt 写入**（不是「事务计数为 0」） | apps/api/integration/configuration-readiness.integration.test.ts | 请求前后业务表实际行内容与数量不变；重复/并行/参数错误/数据库故障无写入；鉴权拒绝仅既有 authorization_denials | 未创建、未运行 |
| todo-8-T7 | #8 原验收7：路由策略矩阵用生成器重生成，不手改 | apps/api/integration/configuration-readiness.integration.test.ts | Human-only 路由登记、清单与生成矩阵一致；generate:route-policy 后 check:route-policy 成功 | 未创建、未运行 |

## 九类适用性与 DoD 去向

沿用 R1 的九类适用性；不适用不等于通过。纯 Query 没有领域事务失败协议，但数据库查询故障仍归原验收6验证零副作用；重复 GET 与撤权并发同样有明确断言。

| 类别 | 适用性 | 源用例名或不适用原因 | 测试文件 | 当前结果 |
|---|---|---|---|---|
| happy path | 适用 | R1-8-1 visible active模型+enabled model、active Agent及仓库上下文正确；Runner恒unknown | apps/api/integration/configuration-readiness.integration.test.ts | 未创建、未运行 |
| unauthorized actor | 适用 | R1-8-2 跨workspace/Team及personal模型不可见，不泄漏存在性 | apps/api/integration/configuration-readiness.integration.test.ts | 未创建、未运行 |
| invalid state transition | 不适用 | 纯Query没有领域状态转换或写入协议。 | 不适用 | 不适用，未冒称通过 |
| duplicate idempotency key | 不适用 | GET无幂等键；重复读断言零副作用。 | 不适用 | 不适用，未冒称通过 |
| stale revision | 不适用 | GET没有If-Match或可修订就绪记录。 | 不适用 | 不适用，未冒称通过 |
| transaction failure | 不适用 | 零DB写入；查询失败另断言无Session/receipt/event/outbox。 | 不适用 | 不适用，未冒称通过 |
| webhook/job replay | 不适用 | 不消费job或写投递意图。 | 不适用 | 不适用，未冒称通过 |
| concurrent request | 适用 | R1-8-8 两个Team并行查询不串投影；撤权后下一次读按实时授权收敛 | apps/api/integration/configuration-readiness.integration.test.ts | 未创建、未运行 |
| server restart/outbox recovery | 不适用 | 只读投影无outbox/checkpoint；断线重读不创建副作用。 | 不适用 | 不适用，未冒称通过 |

原 DoD 原文：

> ## DoD
> 投影可用 + 全部作用域与三态断言通过 + 零 schema 变更 + 全量检查全绿。

该 DoD 的当前状态为待实施验收；本轮归档完整不等于投影可用、测试通过或 Chief 放行。

实施验收同时要求定向用例、全部作用域与撤权再读、三态/适用性、零 schema 变更、全量必需检查成功，并由独审及 Chief 确认。证据、实际运行数量与已知限制由计划指定 docs/reviews/a1 路径在获准实施后填写。本轮不新增该实施证据目录、不预填通过。

## 本轮文档核验边界

精确快照与当前平台注入正文逐字节一致，平台工具已返回的 Saved plan 前缀也必须匹配。snapshot 的 SHA-256 只覆盖正文 UTF-8 字节，不含外围 plan 标记或归档元数据；version 为 null，currentID 由 conversation 实读。source.json 单独记录本轮完整 Spec 哈希，历史源 SHA 保留原义。

提交前检查 source.json 的文件字节数/哈希、七条原用例及九类完整性、git diff --check、暂存与提交路径全部位于 docs/plan。产品检查未运行，不将文档静态检查冒称 feature DoD。交付实际 commit ID，不在归档文件内循环写入包含自身的提交 ID。
