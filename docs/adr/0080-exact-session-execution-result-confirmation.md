# 精确 Session 执行结果只读确认

## Status

Proposed。仅提交 M1 文档提案，尚未产品实施、合同独审或验收。

## Context

现行 `sessionActiveForOperation` 在 complete 后、stopAck 后拒绝普通终态 E 请求，早于命令幂等账本。`resolveCoordinationIdentity` 会更新使用时间并创建/续期 C Session，不能承载要求无执行副作用的确认查询。ADR0068 的 settle 重放是既有专门例外，不能泛化。

## Decision

采用 [M1安全合同](../plan/agent-mcp-m1/security-contract.md) 的准确 `GET /api/v1/agent-sessions/{id}/execution-result`、operationId、strict DTO 和 `human_or_installation_target` policy。单独无写入身份解析，实时校验 principal、Connection、双 Delegation、Team grant、准确 Session/resource 与安装来源；原 Human 保持原合法读取。普通 E Bearer 拒绝。

原 key、operation、原 Agent actor 与原回执 Session/revision/sequence 精确绑定，仅返回状态、revision、原结果引用与对应 Stop 摘要。缺失或到期回执不可确认，不等于未提交；缺少历史身份关联拒绝，不猜同 actor 来源。保留原子 settle 自身回执重放，不制造内部 completion 回执。

成功和拒绝都不签 Token、不续 Session、不写 receipt/activity/领域 event/outbox；拒绝账本保持 ADR0028 独立审计。普通终态 E 门禁保持，查询不恢复执行。

## Alternatives

用户已排除有限终态 complete/stopAck 重放、普通终态 E 放行、借 Human cookie 和有写入副作用的 C 身份解析。

## Consequences

具有准确 live 确认身份且回执/归属仍保留的客户端能恢复丢响应；静态 E 无确认身份须由合法 Human 查询。历史 Token/回执清理后的不可确认如实披露，不增加持久化工作流或伪回执。Stop 清理由受控 Runner finally 使用既有 E Token及专用协议，不继续模型执行。

## Migration

零数据库迁移、零新领域事件；API/contracts/policy/SDK/MCP/Runner同步部署。旧 route、tool/resource 名称/schema、ACK/heartbeat 与 settle 兼容路径保留。

## Spec changes

确认读是新增最小合同，未实现；详见 M1 [操作映射](../plan/agent-mcp-m1/operation-index.md)、[兼容策略](../plan/agent-mcp-m1/compatibility.md)、[生命周期](../plan/agent-mcp-m1/lifecycle.md)和[验证](../plan/agent-mcp-m1/verification.md)。全部产品用例未运行，须另一 Agent 独审闭合、Chief confirm 后实施。
