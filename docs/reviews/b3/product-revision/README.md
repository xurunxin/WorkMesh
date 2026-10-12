# B3 产品修订交接

## 授权与范围

正式方案复审接受 `ad185621359282fae6a874939ef72d9424dc3864` 的活动方案和验收设计。
Chief 随后单独放行产品修订，完整当前规格见 [current-spec.md](current-spec.md)。
本次依据、准确主线及读取原件见 [inputs.json](inputs.json)和 [authorization-read.json](authorization-read.json)。
13:12 只批准方案准备，先审前实施的历史偏差不追认为事前批准。

SDK 和 MCP 分别在解析、输出边界核对本地恢复目录。
类型不匹配要求合法原因，双指令和部署支持列表须逐字匹配。
非法新增字段丢弃，原错误、safeNextAction、revision、重试预算和凭据规则保持。

CLI 从真实 429/503 读取 Retry-After，只接纳非负整数秒或规范 GMT HTTP-date。
异常保存安全毫秒数，终端展示向上取整的秒数。
头非法或缺失时明确停止重试，不回显原头，不新增自动重试，不修改 pending。

## 验证与文档

首次定向运行 270 个用例通过、1 个新增断言失败。
失败源于 JSON 序列化省略了 undefined 原因，而测试要求该字段存在。
已修正测试预期，首败日志保留，后续完整回归结果另记。

本机真实 CLI 的 4 个用例通过。
429 与 503 各覆盖整数秒、HTTP-date、非法及缺失头，逐次核单次请求、pending 原字节和无配置提交。
新监听服务、测试目录和系统秘密均按既有 owner 机制收尾。

全仓 lint、typecheck、test、build、文档和 CI 策略、路由策略、agent smoke、conformance 均通过。
完整后端集成通过，DB 81、API 320、真实 MCP conformance 96、worker 147 个用例通过。
API、worker 与默认 recovery 的跳过项单列，未当作通过。实际结果见 [verification-results.json](verification-results.json)。
源码运行字节见 [source-files.json](source-files.json)，baseline 不冒充修复提交。
[归档清单](archive-manifest.json)登记 513 份本轮原件及逐文件哈希；[收尾回执](cleanup.json)核本轮 6 个 Docker 对象及测试目录不存在。
原日志保留不删。最终准确产品 head 与 Required CI 在 PR 中核准；未完成项不记为通过。

恢复手册、MCP 说明、字段参考、协议及旧接入入口同步解释目录拒绝和等待时长。
地址、鉴权、配置开关和成功流程没有变化，无需改 REST 快速上手或部署配置。
现有可运行 Agent 示例经过同一 SDK/MCP 校验器，继续用于真实恢复实测。
中文使用固定 `zh-tech-writing` 副本及两份参考，未安装全局工具。

## 审查与保全

AGENTS、贡献说明和现行文档维护规则同步 P0/P1 审查范围。
只按具体影响检查和推进 P0/P1；P2 不报、不返工、不阻断。
旧 blocking/high 不自动升级，必需 CI 与真实验收要求保持。

旧方案、五份来源、三个 ZIP、13 条修订及历史首败保持原字节。
8 个策略拒绝目标与历史 195目标不重试删除、拆批或权限修改。
只收尾本次明确归属的新资源，保留共享 store、业务数据和当前待审工作树。

本卡按正常 PR 流程供成果复审，不自行合入或标为 Done。
