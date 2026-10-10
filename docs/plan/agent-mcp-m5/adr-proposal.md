# Runner普通工具一次有界传输重放

## Status

Proposed规划提案，供_oY独审，三项blocking未正式闭合。不是已接受ADR或已存在产品功能；确认后实施首步写入docs/adr/0084-runner-tool-bounded-transport-replay.md。现有ADR与历史报告不改。

## Context

真实Pi的makeTool一次调用RunnerApi.request，后者发送一次fetch；原自动重放仅在executeTurn的replayableSettle。workmesh-tools.test手工重复execute相同callId只证明派生key稳定。M5要求真实普通工具丢响应后原请求身份恢复，需最小客户端修复，不能给代理重发或新的模型toolCall记通过。

## Decision

采用[安全合同](security-contract.md)中普通工具一次有界重放完整合同：createDocument/publishAgentPlan/postWorkRoomMessage三项内部白名单、准确传输cause、自有timeout、同序列化body/key/If-Match/E/headers、一回最多两业务HTTP、共同三十秒截止及工具/shutdown取消。只在RunnerApi.request内重放；makeTool活动不重入、GET无Activity。第二次前原E读原Attempt status并核lifecycle与预算；不refresh或换身份。首transport不确定性在第二次任何失败时沿cause保留，保持unreconciled。所有HTTP明确拒绝、JSON/DNS/TLS错误、provider意图、签名传输、控制入口、原settle和Stop finally不进入新机制。

## Alternatives

不采用全局重试、代理代重发或重进模型工具，避免外部写、控制请求和公开Activity重复。

## Consequences

只能把精确同请求的持久回执确认为成功，第二次拒绝不证明第一次未commit；失败保留原不确定性及残留，不能自动complete。原API事务live授权、idempotency/revision、终态与Stop边界保留。真实Pi须实收第二原回执、业务effect一次；R或mock结果不冒实际Runner。状态读取不是服务器普通写的新Attempt fence，原控制fence不扩权。

## Migration

零数据库迁移、零新外部凭据、零新权限。更新Runner消费者，现有后端接口、部署和Pi内嵌Skill发行门禁保持。版本/发行状态只按实际记录，不由本提案发布。

## Spec changes

不修改冻结M5或旧#53报告；本目录review-response、operation/consumer/acceptance矩阵消费此提案，给出可重试与不可重试断言、真实单toolCall两个HTTP、API/MCP重启层次和未测支持画像。实施后运行相应Runner/conformance消费者checks及全仓必需检查；当前均未运行。
