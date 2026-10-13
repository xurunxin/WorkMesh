## 上下文

接入失败需要同时告诉客户端可执行的恢复步骤，以及需要人工完成的一件事。沿用 `registerAgentConnectionRoutes`、`authIdempotentTransaction`、`AuthRateLimiter` 和既有 MCP 错误机制，补齐错误元数据及实际客户端消费。

本轮只交付方案与来源，停在 review，不编码、不合入。#61 退役和 #62 接入文档已入准确 main `abf6813a439feab4b17b0602cc9295216634586e`；B1/B2 成果也已纳入。正式方案独审通过且 Chief 随后单独放行，才允许产品实施和修订。既有产品 head `24666130705719094a7c0bd27d769a04909da117` 属于方案独审前实施，尚未验收。开工时重新核对准确主线与输入差异，保留共享缓存锁，不以共享 `FETCH_HEAD` 代替主线。

WebUI 退役、TA 功能和外部分发不在本卡范围。

## 默认约定

- 字段放在 `error.next_action`、`error.human_action`；均为非空中文字符串。无需人工介入时，`human_action` 固定为“无需人工操作”。
- `error.supported_clients` 表示部署支持的类型，与 discovery 的 `supportedClients` 共用来源；不表示配对绑定或 enrollment policy 允许的类型。
- 保留错误码、HTTP 状态、凭据窗口、服务端重放及 attempts 规则。通用错误契约兼容旧形状，接入专用契约要求双指令。
- 指令只描述动作，不包含配对码、令牌、请求正文或其他连接的身份。不增加自动恢复、自动换类型、自动改 pending 或自动换 key。
- Coordination REST 与 MCP 均使用 `X-WorkMesh-Installation-Token`。执行 Session 使用 Session Bearer；token exchange/refresh 的安装用途另使用 Installation Bearer，按现行用途分别鉴权。
- 接口或功能变更须在同次交付中更新接入文档、参考和示例。使用 `leter/zh-tech-writing` 的 `SKILL.md`、`references/manual-structure.md` 和 `references/typography.md`。已读取仓库固定上游提交 `ffda9353768dece8aabd26ccb3a4978025e9437c`，并核对 MIT 许可。接续时核对 #62 保存的技能来源，记录实际使用的提交和文件哈希，不声称已全局安装。

## 文件改动与边界

| 文件 | 实施内容 |
|---|---|
| `packages/contracts/src/agent-connection-errors.ts`（新增） | 建立接入错误恢复目录及部署支持 client 常量；`readSafeAgentConnectionError` 按错误码、安全原因及目录逐字核对双指令与列表。分别定义输入修正、绑定不匹配、凭据失效、重放拒绝、权限拒绝、限流和服务故障的指令；未知故障使用停止并报告安全追踪 ID 的兜底。 |
| `packages/contracts/src/index.ts` | 导出目录与类型，扩展 `errorResponseSchema`，新增接入专用错误 schema；补齐接入链已实际返回但枚举缺失的错误码。恢复字段独立校验，不因旧服务器缺字段而丢失原错误。 |
| `OPENAPI.yaml` | 声明双指令与 `supported_clients`，将配对兑换、enrollment 兑换及当前身份验证的失败响应接入专用契约，覆盖校验、权限、幂等、限流及服务故障。 |
| `apps/api/src/agent-connections.ts` | discovery 复用支持类型常量；保留 `AGENT_CONNECTION_CLIENT_TYPE_MISMATCH`，用安全的 `details.reason` 区分 slug、client type 和 enrollment policy 不匹配。slug 优先诊断；列表明确不能修复 slug 绑定，也不能绕过 policy。原 attempts 更新与锁定路径保持。 |
| `apps/api/src/agent-connection-errors.ts`（新增） | 统一构造接入错误响应，根据错误码与安全原因附加目录指令。校验详情只保留字段路径和安全原因，不回显提交值；保持已有错误追踪信息。 |
| `apps/api/src/server.ts` | 在既有 `setErrorHandler` 的接入失败分支调用统一构造器，覆盖前置拒绝、Zod、DomainError、429、503 和内部故障。原限流准入、失败退避触发条件、状态码及响应头保持。 |
| `packages/agent-sdk/src/index.ts` | 为 `WorkMeshSdkError` 增加可选的类型化 `recovery` 数据；`toSdkError`（含 cursor 分支）使用目录校验器保留合法新增字段，丢弃目录外文字、原因错配、控制串和不符的类型列表。原错误及旧形状继续保留。继续保留 `details`、`correlationId` 和 retry 元数据，不改变重试预算或身份刷新规则。 |
| `apps/mcp/src/index.ts` | `tool` 在输出边界再次按 code、details.reason 和目录校验 SDK 的恢复数据，再传入文本内容和 `structuredContent.error`；即使调用者直接构造 SDK 异常，也拒绝自由文字和控制串。保留现有 `safeNextAction`、`currentRevision`、发现及授权行为；接入恢复采用新增指令，不重做 MCP 恢复机制。 |
| `apps/connector/src/protocol.ts` | `verifyPairing` 解析统一错误，并为 429/503 读取 `Retry-After`。在协议层新增纯解析函数：只接纳非负整数秒或规范 GMT HTTP-date，转换为非负安全整数毫秒；禁止控制字符及溢出。日期按接收时钟计算，过期日期归零；非法或缺失时保留未知，不回显原头。`bootstrapMcp` 保留工具失败中的安全恢复数据，避免 catch 折叠成裸错误。异常旧响应继续使用本地安全兜底。 |
| `apps/connector/src/errors.ts` | `ConnectorError` 保存经校验的恢复字段和可选 `retryAfterMs`；仅接纳目录中的指令、已知 client 枚举和安全追踪信息，不携带服务端自由文本或正文。 |
| `apps/connector/src/cli.ts` | `formatConnectionError` 分别展示客户端动作、人工动作、支持类型和等待秒数（毫秒向上取整），复用现有输出脱敏器。429/503 没有有效时长时明确显示“等待时长不可用，请停止重试并联系部署管理员”，不自动安排请求。保留失败退出码和旧配置；类型修正须遵守冻结 pending 的请求身份，不能根据列表直接改写它。 |
| `AGENT_PROTOCOL.md`、`docs/agent-integration.md`、`docs/integration/README.md`、`rest.md`、`mcp.md`、`reference.md`、`troubleshooting.md` 与 `packages/conformance/examples/integration-agent.ts`、`packages/conformance/examples/verify-integration.ts` | 以 #62 已合入手册为底座，同次更新上述相关章节和实际示例；部署和配置沿用现行规则，不因展示恢复字段新增开关。面向接入开发者与 Agent 客户端，写清恢复字段位置、SDK `recovery`、MCP 错误内容和 CLI 输出。用实际响应说明原请求身份重放、slug 与类型区别、Retry-After 和人工动作边界。按指定技能写短句、主动语态及操作步骤；逐条自检文风和排版。只描述已实现能力，示例使用占位或测试身份，沿用纯后端流程。 |
| 测试文件 | 扩展 `packages/contracts/src/stage5-contracts.test.ts`、`packages/agent-sdk/src/index.test.ts`、`apps/mcp/src/index.test.ts`、`apps/connector/src/connect.test.ts`、`apps/connector/integration/cli.test.ts` 及下述 API 集成文件，统一验证新增字段实收、旧形状兼容和安全拒绝。 |
| `docs/plan/b3-connection-error-recovery.md`、`docs/reviews/b3/` | 保留旧方案、当前完整规格及准确来源，另存活动方案和逐条差异。`active-test-mapping.json` 记录全部原验收和九类覆盖去向，活动修订全部标为未运行；历史 `test-mapping.json` 与运行原件继续保留，不能当活动方案通过；`documentation-source.json` 记录技能仓库、准确提交、读取文件路径和 SHA-256，以及 #62 文档入口。实施交付再补真实结果、文档与接口核验记录和清理回执。保留原 R1 规格及历史证据，不回填通过。 |

`apps/api/src/auth-rate-limit/limiter.ts`、`inventory.ts` 与数据库结构不改，无迁移、新事件或新 job。运行 `pnpm generate:route-policy` 更新生成产物，提交实际产生的差异。

## 验证与交付

以下为待实施的验收要求，完整文件与用例名另见 `docs/reviews/b3/active-test-mapping.json`。既有 head 的历史运行不代表本活动方案通过。A 为 `apps/api/integration/auth-rate-limit.integration.test.ts`，S 为 `apps/api/integration/stage5-agent-connections.integration.test.ts`。

| 原要求 | 文件／新增用例名与断言 |
|---|---|
| 每条错误码有可执行指令 | A：`B3 接入错误逐码提供双恢复指令`。表驱动实际失败响应，验证专用 schema、动作语义及安全兜底；S：`B3 恢复信息不泄露凭据或其他连接身份`。 |
| operation 桶和失败退避隔离 | A：`B3 endpoint 桶按 operationId 隔离`、`B3 subject-client 桶按 operationId 隔离`、`B3 失败退避按 operationId 隔离`。分别耗尽一个维度，确认另一兑换操作可准入；成功只清理准确失败状态。 |
| IP/socket 共享 | A：`B3 client IP 桶同时限制两种兑换`、`B3 socket 桶同时限制两种兑换`。独立控制其余维度，跨两个实例并发验证共享预算。 |
| 四类输入与 attempts | A：`B3 wrong code 不消耗合法配对 attempts`、`B3 wrong slug 累计 attempts`、`B3 known wrong type 累计 attempts`、`B3 invalid enum 不增加 attempts`。另验证第八次后锁定，后续拒绝不继续增加。 |
| 429／store 故障 | A：`B3 429 保留 Retry-After 与恢复指令`、`B3 store 故障失败关闭且无兑换副作用`。验证提前拒绝、响应头及凭据、receipt、事件/outbox 无新增。 |
| 幂等与重启 | S：`B3 同 key 同体重放保持原响应`、`B3 同 key 异体拒绝且带恢复指令`、`B3 API 重启后准确重放仍成立`。比较成功响应字节和业务事实数量。 |
| 事务失败 | S：`B3 兑换写入失败完整回滚并保留安全指令`。沿用现有故障注入方式，核凭据、配对消费、事件/outbox 与回执回滚。 |
| 客户端实收 | SDK/MCP 用例：`B3 恢复字段完整传递且旧错误兼容`、`B3 目录外自由指令和控制串被拒绝且原错误保留`；MCP 另测直接构造 SDK 异常。连接器用例：`B3 CLI 展示双指令且不泄密`、`B3 实际 CLI 429 展示等待时长且不自动重试`、`B3 实际 CLI 503 展示等待时长且保留 pending`。协议单元覆盖整数秒、HTTP-date、过期日期、负值、超大值、控制串及缺失头。覆盖真实子进程输出、恶意字段拒绝、pending 保留、零新增自动恢复及既有重试行为。 |
| 接入文档随变更更新 | `packages/contracts/src/stage5-contracts.test.ts`：`B3 文档恢复示例符合接入错误契约`，读取实际文档示例并验证 schema。A、S 和客户端实收用例分别核对 REST 响应、SDK `recovery`、MCP 文本与结构化错误、CLI 输出。`docs/reviews/b3/documentation-verification.md` 记录最小示例执行、链接及命令检查、技能文风自查和排版检查；验证文档未把未实现或未测能力写成可用，未要求 WebUI 操作，未包含真实秘密。 |

固定时钟通过测试专用 `AuthRateLimitStore` 包装器注入：仅替换 Lua 的 `Redis TIME` 读取，校验替换位置唯一，剩余脚本仍由真实 Redis 原子执行。保留原生产脚本的并发、自然到期用例；Node 假时钟不作为 Redis 时钟证明。

九类覆盖映射中，正常路径、未授权、非法状态、重复 key、事务失败、并发和重启均有上述用例；stale revision 与 webhook/job replay 因本卡不新增相应机制而不适用，既有后端回归继续运行。

实现后使用独立测试数据库、Redis 命名空间和任务资源，执行：

- 定向 contracts、SDK、MCP、连接器单元测试，以及 A、S 集成套件。
- `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:integration`。
- `pnpm ci:test`、`pnpm ci:validate`、`pnpm check:route-policy`、`pnpm smoke:agents:ci`、`pnpm test:conformance`，以及连接器 `test:platform` 的适用系统矩阵。
- 执行实际文档中的最小接入及恢复示例，对照当前源码、OpenAPI 和共享契约记录结果。文档与接口更新在同一交付中验收，格式检查不代替示例可用性验证。
- 按指定技能逐条检查文风。已有 `autocorrect` 时执行 `autocorrect --fix <本卡修改的文档文件>`，随后检查 diff；命令缺失时记录缺失并手检空格和标点。两种情况下都手检引号、省略号和破折号，不安装全局工具。
- 按已合入 #61/#62 的实际 Required CI 核对获得放行后的最终准确 head，并核其保留的领域、权限、协议和恢复覆盖；不要求 WebUI、浏览器、截图或视觉验收。

复用共享工具、store 和镜像，隔离可写依赖与测试状态。保全脱敏证据后定向清理本人创建的容器、卷、进程及临时目录，保留待审工作树。完成须有真实检查结果、正式独审、Chief 确认及实际主线落地证明。
