# Runner 普通工具的有界传输重放

## Status

Proposed。M5 方案独审已认可此合同；产品实现与运行结果另行验收。仅 Todos 与仓库记录。

## Context

`makeTool` 调用一次 `RunnerApi.request`，现有普通请求只发送一次 HTTP。外层 `replayableSettle` 属于专用结算恢复，不能证明普通工具响应丢失后的恢复。丢响应可能发生在事务提交后，换 key 或重新调用工具会重复业务意图或活动。

## Decision

只对 `createDocument`、`publishAgentPlan`、`postWorkRoomMessage` 的准确写路由在一次 request 内最多重放一次。首次刷新后固定 method、URL、序列化 body、key、If-Match、E Token、到期时间及 headers。总预算三十秒，单 HTTP 最长十五秒，状态查询与第二次请求共用剩余预算和工具／shutdown signal。

可重试 cause code 仅为 `UND_ERR_SOCKET`、`ECONNRESET`、`EPIPE`、`UND_ERR_CONNECT_TIMEOUT`、`UND_ERR_HEADERS_TIMEOUT`、`UND_ERR_BODY_TIMEOUT`、`ETIMEDOUT`，以及本请求自身超时的 TimeoutError。外部取消、单纯 TypeError、DNS／TLS／参数错误、HTTP 拒绝（含 5xx）和 JSON 解码错误不重发。

第二次发送前以原 E 读取原 Attempt status，要求 Attempt／Turn running、Delegation active、Session planning／executing，并重核 lifecycle、Token 到期和预算；不 refresh、不换身份。状态查询不写 Activity；重试不重新进入 makeTool。Plan 本就省略 started Activity，其余操作保留一次 started 和一次最终 succeeded／failed。

第二次失败仍保留首次传输 cause 和 unreconciled 标记，后续明确拒绝也不能证明首次未提交。生命周期以此禁止自动等待／完成。现有外层 settle、Stop finally、终态权限和服务端 live 授权不变；provider intent、签名传输、GET 和控制请求不进入本机制。

## Alternatives

排除全局重试、代理代发和重新进入工具，避免未知外部副作用及重复 Activity。

## Consequences

成功只能来自原请求的有效回执。状态准入查询不能代替服务端授权，也不增加普通 E 写的 Attempt fence。真实 Pi 单 toolCall 的两个原 HTTP、一次业务 effect、模型实收及失败残留必须另存运行证据。

## Migration

无数据库迁移、公开 API 参数、事件、权限或新凭据变更。仅更新 Runner 消费者。

## Spec changes

冻结 M5 与旧历史报告保持原字节。M5 安全／消费者／九类矩阵消费本合同；产品报告分列真实客户端、协议夹具和未测支持画像。
