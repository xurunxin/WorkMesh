# 平台成果独审：恢复与安装交接原始阻断

本轮修改前候选为 `6cf8b105a320e9f72eba4aef5d335de8ae344730`；工作树开始时干净。该候选可达历史完整保留。实际主线精确来源为 `69085317c88d84b702af727dc0ac7152589626d8`，不是可变 FETCH_HEAD。以下是用户注入的平台另一 Agent 审查结果；复现是审查者只读复现，不冒作本轮生产者已执行的测试。旧内部合同审查、首败及产品回执保持原义。

## 原审查全文

我会先核对候选 HEAD 和完整 diff，再重点检查身份投影、错误恢复、实际工具发现与真实集成测试接线。全程只读。

候选 HEAD 与说明中的提交一致，基线为 `69085317`。发现过滤和目标 Session 的凭据切换是关键路径，我正在对照领域门禁逐项检查，并核验测试是否覆盖合法恢复路径。

目前发现规则已覆盖实际 OpenAPI 全集，但仍需核对生成谓词与现行门禁是否一致。我也在检查通用资格读取是否会提前挡住 ACK 等恢复调用；这些问题需要结合调用入口判断。

只读复现确认了两个回归：直接 E 的同 key ACK 重放在 adapter 被拒绝；stale ACK 和 Stop 后诊断 heartbeat 会先被 qualified manifest 拒绝，无法到达原有 REST 门禁。安装凭据交接工具也出现了凭据投影错配，我会继续核对其兼容合同。

请先修复以下问题，再推进合入。

1. **High：直接 E 的 ACK 幂等重放被发现层阻断。**

   > `packages/contracts/src/agent-discovery-rules.ts:69`：`{"fact":"state","allowed":["queued","stale"],"reason":"SESSION_STATE_DENIED"}`

   ACK 已提交但响应丢失后，Session 为 `acknowledged`；客户端用相同 key/body 重放，MCP guard 直接返回 `FORBIDDEN`。只读复现确认请求未到达 `/ack`。现行 `sessionActiveForOperation` 特意允许 `acknowledged` 进入回执重放。请保留该条件入口，让服务端区分同 key 重放与新 ACK，并补直接 E 的丢响应重放及新 key 拒绝测试。(blocking)

2. **High：普通发现读取成为既有恢复、诊断工具的额外状态门禁。**

   > `apps/mcp/src/discovery.ts:92`：`const prepared = await prepare()`

   每次调用都先读取 qualified manifest，导致持有效自身 Token 的 stale E 无法调用已有 `ack_agent_session`；stopping/terminal E 也无法调用 `heartbeat`。前者工具描述明确支持 stale 恢复，后者现行 route/domain 明确允许诊断心跳。SDK 中的恢复例外没有覆盖 MCP 这一层。请为这些既有入口保留准确 Token 调用路径，由服务端重新校验 live 授权；补 MCP 层允许正例与撤权拒绝反例，无须放宽 manifest 或新增 M1 清理入口。(blocking)

3. **High：安装凭据交接工具被错误地按当前 Session 身份判定，合法路径完全不可达。**

   > `apps/mcp/src/discovery.ts:48`：`projectAdapterDiscovery({ kind: 'exact_session', qualification: manifest.discovery }, ...)`

   `inspect_pending_handoff`、`reject_handoff` 只声明 `installation_target` 变体，但实际投影始终使用 C/E manifest。因此即使 C 客户端配置了有效 installation Token，两工具仍返回 `CREDENTIAL_MODE_MISMATCH`，SDK 的安装 Bearer 请求根本不会执行；已只读复现。请按 binding 的实际凭据用途接通已有 null installation 身份分支，不用 C manifest 计算安装资格。补准确目标允许、错误目标拒绝及 E 无安装凭据拒绝测试，保持旧工具调用可用。(blocking)

## 本轮限定修正

ACK 的 `acknowledged` 是仅回执重放的条件入口；新 key 仍由原命令拒绝。调用仅对既有 ACK、heartbeat 使用既有 Token/明确刷新路径，不吞普通 manifest 拒绝、不增加终态读权限、不刷新重发受保护 401/403。安装交接每 binding 使用独立 null 安装身份和安装 Bearer，准确 target、live grant 与撤权仍由现行 REST 重校。

实际检查、源码字节、新首败和资源准备/收尾另记本轮回执；本文件不宣称修复、产品验收或平台独审已通过。
