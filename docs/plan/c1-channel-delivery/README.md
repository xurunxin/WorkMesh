# C1 计划独审交接

本目录是当前平台 savedplan 的文档前置交付。实施计划没有改写，没有调用 `edit_plan` 或重新保存平台计划。只新增本目录的审查材料；主线增量已在原会话分支正常快进整合。提交后等待 confirm，由 Chief 安排另一执行者独审，门禁通过后再确认产品实现。

## 完整计划与来源

- [完整中文计划阅读副本](savedplan-Ry2L3-U5lGSRc8EpsaLs6.md)：保留全文，方便直接预览。仅为满足仓库空白检查移除行末空格，并添加文件末尾 LF。
- [精确正文快照](savedplan-Ry2L3-U5lGSRc8EpsaLs6.json)：`body` 保留平台完整保存副本中的所有正文字符和内部空白；按 UTF-8 解码即可恢复精确正文。正文不含 `<plan>` 容器及边界换行。当前 ID 为 `Ry2L3-U5lGSRc8EpsaLs6`，正文 SHA-256 为 `959cb493a06ad8b17d313d419b75cc9e46ed9bdf8697e8c7e18718a31a62367b`，正文为 7780 字节。
- [完整当前任务正文](source-spec.md)与[来源元数据](source-metadata.json)：保存卡片更新、用户问题卡、计划 ID、正文摘要、工作树及 Git blob 摘要和主线整合来源。
- [平台工具实际读回](platform-readbacks.json)：`todos` 返回完整任务正文，但截断了 Saved plan 尾部；`conversation` 确认当前 plan ID。完整正文来源是本轮用户消息明确提供的“平台 saved copy”，其 3478 字符可见前缀已与 `todos` 逐字匹配。未提供的计划 `version`、创建时间为 `null`；conversation 的消息时间只作为记录时间，不当作平台版本。

上述读取不是事务快照；工具返回的进行中 phase 是 `planning`，不冒称工具已读回 `confirm`。本轮结束后停在计划确认门禁，不启动产品编码。元数据不记录自身哈希，不为记录本目录而循环生成新的平台计划。

## 审查边界

用户已选择 Human 仅管理自己的目标、只通知被指派 Human：Inbox 按明确 Human recipient，其余来源按既有明确负责 Human，Project 级来源按明确 lead；没有合法明确收件人不投递。不按 Team 查询可见性广播，不新增管理员代管，不从渠道地址推导点击者身份。

独审须核对完整计划中的既有路径复用：`notification_deliveries` 为唯一发送队列；`claimNotifications` / `deliverNotification` 保留 `claim_fence`、`effectKey`、reclaim 与逐目标退避。发送前重读目标、当前授权和最小内容；未知发送结果持久记录并提供显式对账；两 worker 竞争、旧 fence、各提交/发送/ack/checkpoint 崩溃边界必须有恢复证据。

target 本人授权、revision、幂等、secret reference 与脱敏，Query 零投递写入，noRedis 明确不支持且不静默降级，空库及升级双测，均属于后续产品验收。C2 使用本项目标管理，不再建 CRUD。本目录存在或文档校验成功不代表这些断言已实现。

本批只使用 Todos 编排与仓库记录，不声称同步真实 WorkMesh 控制面。官方协议核实和适配器仍归 C2；本轮没有真实渠道外发或仓库外发布授权，fake 验证不能代称真实消息成功。

## 历史与完整测试矩阵

[原测试与九类矩阵全文](source-test-coverage.json)从冻结的 [test-coverage.json](../../reviews/r1/test-coverage.json)提取本卡完整对象，包含八项原测试、一项原 DoD 和九类适用矩阵，保留原断言、caseName、owner、状态及原要求去向。全部产品功能测试均未在本轮执行，未填通过。

历史仓库规格 [activation-task-specs/15.md](../activation-task-specs/15.md)、[execution-inputs.json](../../reviews/r1/execution-inputs.json)、[任务依赖索引](../activation-task-specs/index.json)保持不变；当前更新后的卡片全文另存本目录。历史来源 SHA、源状态和待同步说明保留生成时含义，不改成当前全文摘要。当前读取只明确返回一个计划 ID，不据此断言没有更早的计划。

## 本轮验证与后续门禁

[文档校验记录](verification.json)检查正文摘要、可见前缀、原矩阵完整性、来源引用、UTF-8、工作树/Git blob 字节以及修改范围。没有执行产品 lint/typecheck/test、integration、E2E 或迁移；API、领域事件和数据库结构均未改动。产品验收仍须执行完整计划里的检查，并保留实际失败、跳过和恢复证据。

审查者可在 change review 中打开完整计划 Markdown 的 preview，或直接读取精确 JSON 正文。后续顺序为：完整快照提交 → 另一执行者独审 → Chief 确认 → 才允许产品实现。
