# 原执行凭据的 MCP Stop 恢复发现

## Status

Proposed；本批已实施并有真实 OpenCode/REST 回归，待正式成果独审。不以本文件宣告 M5 验收。

## Context

原生客户端缓存初始 MCP 工具清单。既有 `stop_ack` 精确使用 client 原 E，不走普通 manifest 或 Token 刷新，REST 独立校验准确 Session、状态、实时授权和幂等回执。此前 executing 下的普通资格投影过滤掉它；Human 发出 Stop 后普通发现又被拒绝，真实 OpenCode 因缓存中没有工具而无法调用既有恢复入口。

## Decision

read-write MCP client 已持有原准确 E 时，tools/list 单列既有 stop_ack 为 `recoveryOnly`，资格为 `requires_target_check`，明确待核 original_execution_token/live_authority/session_stopping。普通发现返回 SESSION_NOT_ACTIVE 时，只返回该恢复描述符，其他普通工具仍不可见；普通调用照常失败。

无原 E、C/安装凭据或 read-only 模式不增加此描述符。UNAUTHENTICATED、SESSION_SCOPE_DENIED 等撤权错误不触发发现降级。发现不是授权：每次调用继续使用原 Token 与既有 REST 命令，不刷新、不放宽终态普通读写、不准失权者读旧 receipt。旧同 key 的专用 Stop 回执与新 key 拒绝仍遵守既有合同。

## Alternatives

排除让客户端持有 Human cookie、刷新已停止 E、暴露普通工具或绕过 REST 状态校验。删除真实客户端门禁不能解决缓存缺失。

## Consequences

tools/list 的恢复描述符可能在当前不能执行的状态出现；元数据和描述明确该限制。客户端可在 Stop 后调用既有恢复命令，成功必须由 REST/DB 事实证明。实际 OpenCode 测试覆盖普通写拒绝、原 E Stop_ACK、Lease 清理及进程退出；MCP 单元和真实集成另外覆盖 read-only/C、撤权与终态普通读取拒绝。

## Migration

没有数据库迁移、角色、能力、REST 参数或新事件。只改变 MCP 恢复命令的描述符发现方式。

## Spec changes

冻结规划与历史失败保持原件。当前交付报告将消费者发现修复、服务端权限收紧、真实客户端结果分别记录；原 Stop/幂等/实时撤权合同继续作为验收依据。
