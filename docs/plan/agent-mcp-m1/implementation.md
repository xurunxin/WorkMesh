## 上下文与假设

补齐 Session、Plan/context、Approval、Lease、Recovery 的具名适配，完成正常执行和停止两条链。复用现有 `agentMutate`、`publishPlan`、`finishSessionInTransaction`、`stopAck`、`leaseAction` 和 `recoveryAuthorizationPredicate`，保留服务器状态、授权、批准及幂等门禁。

假设：新增查询复用现有 Session、安装凭据关联、幂等账本、事件和清理 Activity，零迁移、零新事件类型。Human 控制与批准决定保留；Web UI、F/TA 新域、外发和发布不在范围内。

## 受控方案与安全合同

- **`docs/plan/agent-mcp-m1/`**：建立 `README.md`、`spec.md`、`savedplan.md`、`implementation.md`、`security-contract.md`、`compatibility.md`、`operation-decisions.json`、`verification.md` 和来源快照/指纹。保存完整当前 spec、冻结 M1 正文及相关来源全文；逐操作列 REST/Zod、SDK、MCP、Runner、policy/feature、凭据、角色、状态、scope、参数、输出、兼容策略和九类 DoD。区分 Git blob、工作树字节、平台注入全文与工具截断；不可读版本元数据记 `null`，保留 M0 历史缺口。
- **`docs/adr/0080-exact-session-execution-result-confirmation.md`**：提出新增 `GET /api/v1/agent-sessions/{id}/execution-result`，`operationId=getAgentSessionExecutionResult`；查询必须携带 `action=complete|stop_ack` 和原 `operationKey`。返回准确 Session 状态/revision、原动作确认状态、原结果引用及清理概要；原结果绑定其提交时 revision，不以当前 Session 状态冒充该动作成功。回执缺失或保留期届满明确不可确认，错动作或错 Session 不返回他人结果。
- **身份合同**：采用专用 `human_or_installation_target` policy。C 凭据和原安装 Bearer 经无写入解析核验，原 Human 沿现行合法读取规则；普通 E Bearer 拒绝。重验 credential、Connection、Agent、principal、Team grant、Delegation 和精确资源 scope，并通过既有 `agent_session_tokens.installation_token_id` 证明目标归属；不凭 actor 相同或 C 活跃放行。查询不调用会续建 Session 的 `resolveCoordinationIdentity`，不更新使用时间、签 Token、写 receipt/event/outbox；拒绝审计沿既有独立账本。
- **方案门禁**：先提交上述受控文件及 ADR 提案，交平台另一 Agent 独审；blocking/high 闭合、Chief confirm 后才执行以下产品变更。不以内部检查代替独审。

## 产品变更

- **`OPENAPI.yaml`、`packages/contracts/src/{execution-contracts.ts,index.ts,route-policy.ts}`**：先落实查询 DTO、认证和错误合同，补当前缺少的 typed 读取/Lease 响应合同。复用已有 Session/context、Approval、Recovery schema；保留分页 cursor、Plan 稳定 step ID 和 Lease `version`。读取不要求写幂等键；renew/release/complete/stopAck 保留准确 If-Match。
- **`apps/api/src/{server.ts,authz/authorize.ts,agent/routes.ts,agent/execution-result.ts}`**：新增受限身份解析和授权投影，路由只转换输入并调用查询 helper。用同次授权查询读取精确原操作，核账本 actor、operation、目标 Session 和原回执；清理摘要只取对应 Stop 事实。保留 `sessionActiveForOperation` 对普通终态 E 的拒绝，以及既有 ACK、诊断 heartbeat、settle 兼容行为。
- **`packages/agent-sdk/src/index.ts`**：补 `listSessions`、`listPlanVersions`、Approval/Lease/Recovery list/get、具名 `heartbeatLease/renewLease/releaseLease` 和 `getSessionExecutionResult`，响应经过共享 schema 校验，Lease 写复用 `mutateLease`。确认入口显式选择安装用途凭据，不刷新 E、不修改共享 Token。重试保留 key/body；改变正文或新动作使用新 key，401/403 不换身份重发。
- **`apps/mcp/src/{index.ts,discovery.ts}`**：补缺失工具，保留 M0 已有 Session/context/Plan 工具及 resource 名称/schema。`stop_ack` 只用已持有的准确 E Token，绕过普通 manifest 前置并保留只读模式拒绝；确认工具走受限安装身份分支，不先读取会产生身份副作用的 manifest。当前 HTTP MCP 每请求重建客户端，因此 C 停止后不能假定持有旧 E Token，也不能靠刷新完成 stopAck；该限制明确披露。
- **`apps/agent-runner/src/{workmesh-tools.ts,run-session.ts,execution-lifecycle.ts}`**：补精确自身 E 的读取、状态转换和 Lease 维护工具。Plan 与状态命令避免前置 Activity 消耗 revision；Lease heartbeat 不追加普通工具 Activity。生命周期独立持有原 E Token、稳定 cleanup key/body 和确认凭据：观察 Stop 后阻止新工具及 steering、等待模型退出，finally 清理本人资源，再以独立有界 signal 提交 `stopAck`。使用诊断 heartbeat 获取 stopping revision；禁止先刷新已停止 Token、禁止普通 release 代替 Stop。丢响应先确认原动作；旧 revision 冲突只在确认尚未提交后重新读取，不能盲重写。撤权、Token 过期、强杀或清理失败保留残留及待 Human 处理信息，不复活模型。
- **发现与指南生成文件**：修改 `scripts/generate-agent-discovery.py`，合成冻结 M0 输入与 M1 增量，更新 `agent-discovery.ts`、生成规则、route bindings/matrix；修改 `scripts/generate-route-policy-artifacts.mts` 支持新认证类型。同步 `AGENT_PROTOCOL.md`、现有客户端指南、Runner 内嵌 `SKILL.md` 和生成 pin，不修改 M0 原报告或公共签名发行物。
- **测试与 CI 文件**：扩展对应 contracts/SDK/MCP/Runner 单元、`stage1.integration.test.ts`、`stage2-collaboration.integration.test.ts`、`workbench-runner.integration.test.ts`；新增 `execution-recovery.conformance.test.ts` 及配套 fixture。更新 conformance integration include 和 `scripts/ci-policy.mjs`、`ci-policy.test.mjs`，逐项要求 M0/M1 套件存在，覆盖删除单套件负例；沿现有 Required `api-integration` 执行、失败传播和 always 证据上传。

## 验证与交付

九类验收逐场景绑定测试：正常执行/Stop；跨 Connection、Session、Team、撤权与自批拒绝；非法状态；同 key/body、异体及 heartbeat K1/K2/K1；旧 revision；事务回滚；webhook/outbox 重放；Lease/Plan/Stop 并发；API/MCP/Worker/Runner 重启恢复。纯查询没有新 command/job，其不适用理由单列，并逐表证明零业务写入。

真实 HTTP、MCP 和 Pi 分别完成执行与停止链。故意丢弃 complete/stopAck 已提交响应，证明原 E 重放及普通 GET 被拒、准确 C/安装确认成功、错误归属失败且没有新执行事实。Pi 核模型实际工具、停止后零新调用、持久 Turn/Session/Plan/Lease/清理事实；保留 ADR0068 原子 settle 及明确拒绝后的回退验证。

执行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e`、`pnpm check:route-policy`、`pnpm check:runner-skill`、`pnpm ci:validate` 和 `pnpm ci:test`；真实 M1 conformance 必须进入根集成入口，不能空套件或 skip 冒通过。

每轮登记独有服务、进程和路径，保存受测前后指纹、真实命令/退出/runtime/数量/skip、首败及脱敏原件后，仅清本人闲置资源；Windows 递归核绝对路径、链接与活动引用，审批拒绝即停目标。交付准确 head、受控文件入口和实际结果；产品验收还须独立成果审查、最新 PR Required CI 及实际 done/main 证明，未来测试保持未运行。
