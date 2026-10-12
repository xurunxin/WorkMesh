# 接入错误恢复字段与客户端消费

Status

Accepted（活动方案于 17:25 正式复审接受，Chief 于 17:26 单独放行产品修订；最终成果验收仍待独审及必需 CI）

Context

13:12 仅批准方案文档准备。先前方案独审前实施的阶段偏差保持真实记录，不追认为事前批准。当前状态依据本次正式方案复审及随后单独放行，准确规格来源见 `docs/reviews/b3/product-revision/authorization-read.json`。

接入失败原来只提供错误码和通用提示。客户端需要知道可执行的恢复步骤，也需要能直接转述给管理员的一项人工动作。用户已选择 API 加最小 SDK、MCP 和 CLI 适配，项目继续作为纯后端服务交付。

本决定继承接入协议、稳定请求身份重放、连接器安全提交和现行 MCP 恢复合同。任务与证据使用 Todos 和仓库记录，不创建真实 WorkMesh 远端记录。

Decision

REST 接入错误在原 `error` 对象中增加非空的 `next_action` 和 `human_action`。无需人工介入时，后者为“无需人工操作”。通用错误契约保留旧形状兼容；接入专用契约要求双指令。

共享 contracts 定义静态恢复目录。服务端按错误码及安全原因构造指令，未知故障使用停止并报告错误码和追踪 ID 的兜底。输入校验只披露安全字段路径和原因，不回显提交值。

保留 `AGENT_CONNECTION_CLIENT_TYPE_MISMATCH`。`details.reason` 区分 slug 不匹配、类型不匹配及 enrollment policy 拒绝。同时不匹配时先报告 slug。该错误返回 `supported_clients`，与 discovery 共用来源。列表不能修复 slug 绑定，也不代表 policy 允许其中的类型。

SDK 按错误码、安全原因及目录校验并保留可选的 `recovery`，缺失或非法的新字段不覆盖原错误。MCP 输出前独立核对同一目录，再将合法字段传到文本和结构化错误，保留原 `safeNextAction`。CLI 只展示本地目录中核验过的指令、已知客户端类型及安全追踪信息，继续使用既有脱敏器。

CLI 安全解析 429/503 的 `Retry-After`，在异常中保留等待毫秒数，终端展示向上取整的秒数。非法或缺失时停止重试，不回显原头。

本决定不新增恢复授权。客户端继续保留原 pending、key、正文和上下文，不自动换类型、改写请求身份或刷新凭据。普通 MCP 业务拒绝沿用既有合同；HTTP 边界拒绝不伪装成工具结果。

Alternatives

已排除只返回字段而不适配消费者，以及拆分 endpointClass、改变来源预算、改动服务端重放和增加 WebUI 恢复流程。

Consequences

新客户端能分别读取客户端动作和人工动作。旧客户端继续读取原错误码、message、details 和 correlationId。连接器面对未知或恶意响应时保留安全兜底，不把服务端自由文本带到终端。

错误文案和部署列表由 contracts 共用，接口与功能交付时同步维护接入文档、参考和可运行示例。中文文档使用仓库固定的 `leter/zh-tech-writing` 副本，准确来源记录在证据中。

Migration

无数据库迁移、新事件或新 job。状态码、响应头、凭据窗口、attempts 和原响应重放保持。endpoint、subject-client 及失败退避按 operationId 隔离，IP 和 socket 预算共享；限流实现与清单不变。

Spec changes

同步 OpenAPI、contracts、API 错误响应、SDK、MCP、CLI 和接入文档。逐条测试映射及真实验证结果保存在 `docs/reviews/b3/`。最终完成需要准确提交的必需检查、正式独审、Chief 确认和实际主线落地证明。
