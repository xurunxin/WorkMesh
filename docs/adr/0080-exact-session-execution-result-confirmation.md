# 精确 Session 原动作结果只读确认

## Status

Proposed。本轮为方案修订，未产品实施，须平台另一 Agent 完整独审两项 blocking 并由 Chief confirm。旧候选在 docs/plan/agent-mcp-m1/history 保全，旧错误证明不再作为当前合同。

以上描述冻结规划阶段。该方案已由平台另一 Agent 独审并获 Chief 实施确认；当前实现和真实检查见 [M1 产品报告](../plan/agent-mcp-m1/product-report.md)。产品成果仍待独审/Required CI/main 门禁，未以规划通过冒产品验收。

## Context

停止/完成原请求已提交而响应丢失时，普通终态 E 不允许重新写或普通读取。用户已选准确归属只读确认。现行 resolveCoordinationIdentity 会写 usage、创建/续 C Session，不能用于纯查询；现行 refreshAgentToken 能让另一 Connection 为同 Session 取得 Token，幂等回执只有 actor/operation/key/body，没有原提交凭据来源，因此“曾有历史Token”不能证明原动作。

## Decision

提出 GET /api/v1/agent-sessions/{id}/execution-result，operationId=getAgentSessionExecutionResult，新 human_or_installation_target policy；query 必须 action=complete|stop_ack、operationKey。完整 DTO、schema名称、strict参数、错误与字段约束在 [安全合同](../plan/agent-mcp-m1/security-contract.md)。

安装/Connection身份在普通 resolveCoordinationIdentity 之前用只读受限解析；普通E拒绝。一个REPEATABLE READ READ ONLY授权快照先核live credential/Agent/principal/Team grant/目标Delegation/resource scope；Connection另核准确Connection/coordinator Delegation。再读取原回执 workspace/actor/key/operation/session、实际来源、原revision/sequence与准确Stop摘要。只返回状态/current与原revision/原结果引用/清理摘要，不泄露Token或其他对象。

原来源由实际提交请求 actor.credentialHash 定位唯一 E Token，经既有锁顺序重读其安装来源，在 direct complete外层和stopAck原事务与response/状态/event/outbox同commit保存。安装创建时正向标native或connection且不可变；来源快照绑定原Session、Token、installation、Connection及既有账本actor。任意历史Token不作证明，Connection轮换可用同Connection当前live凭据，native只能原installation。旧null/unproven失败关闭，不查询补写、不猜回填。

原Token被refresh删除不丢已提交证明；当前撤权仍拒绝。C2先refresh、C1后提交的反例和双nativeinstall反例必须另一来源拒绝且有可读正对照。新来源写失败整次原动作回滚。

query成功与失败均不签Token、续Session、更新usage、写receipt/Activity/domain event/outbox；保留ADR0028既有独立authorization_denials拒绝审计例外。既有终态E门禁不放宽、无有限终态重放。Pi内层finishSessionInTransaction没有独立completion回执，仍用ADR0068外层settle恢复，不假认内部key。

## Alternatives

有限终态重放已由用户取消；任意历史Token关联证明被独审反例否定。

## Consequences

历史不唯一来源不能给Agent确认；合法Human保持原历史读取。无证明的Agent隐藏拒绝；已证明来源但回执过期仅不可确认，绝不等于未提交。只读投影与合法等待恢复的新事实分别验收。

## Migration

新增原安装来源与原回执来源字段，nullable旧数据、不对可删除凭据建级联FK、两种过期key占位路径清空旧来源。最小DDL和滚动/旧schema兼容/锁序/失败回滚在 [迁移合同](../plan/agent-mcp-m1/migration-contract.md)、[DDL提案](../plan/agent-mcp-m1/schema-proposal.sql)，本轮不运行迁移。

## Spec changes

新增REST/Zod/policy/SDK/MCP受限确认入口和来源证据持久化。等待结算/自动续Turn另由 [ADR0081](0081-pi-execution-wait-continuation.md) 定义。合同→生成policy/manifest→SDK/MCP/Runner→真实conformance一致，未独审和confirm前不实施。
