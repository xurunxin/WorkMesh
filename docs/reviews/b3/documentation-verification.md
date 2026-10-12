# B3 接入文档核验

## 读者与文档入口

文档面向 API 接入开发者和 Agent 客户端维护者。读完后，读者能识别接入拒绝，保留原请求身份，并把人工动作直接转述给管理员。

产品入口为 [接入说明](../../integration/README.md)。恢复说明见 [排障](../../integration/troubleshooting.md)、[REST 接入](../../integration/rest.md)、[MCP 接入](../../integration/mcp.md)和[接口参考](../../integration/reference.md)。协议说明与旧接入入口同步链接到这套文档。

## 实际验证

`pnpm check:integration-docs` 已通过。检查涵盖技能来源的 4 个文件、72 条本地链接、35 个 REST 引用、11 个 MCP 工具引用和示例语法。最终原件见 `runtime-originals.zip` 中的 `.tmp/b3-docs-final.log`；此前检查原件也保留。

`pnpm verify:integration-examples -- --required-checks` 中的真实示例已通过。使用独有 PostgreSQL、Redis 和回环监听端口，未调用外部 provider。`local-required-4/examples.log` 记录了以下结果：

- REST 身份拒绝符合接入专用 schema，具有双指令。
- SDK 的 `WorkMeshSdkError.recovery` 实际保留服务端指令。
- MCP `verify_connection` 的文本与结构化错误实际收到同一指令。
- 可运行示例只输出本地恢复目录中核验过的文字，不输出错误正文或提交的凭据。
- 原配对重放、签名 Skill 下载、凭据用途拒绝和 TLS 接入继续成立。
- 示例结束后关闭本人监听器、API 和数据库连接池。

`packages/contracts/src/stage5-contracts.test.ts` 从实际排障文档读取 JSON 示例，验证专用 schema、错误原因和目录中的指令。该套件还验证 OpenAPI 的专用失败响应和限流响应头。全仓单元、最终集成和构建均已通过。具体记录见 `verification-results.json`，远端 CI 仍另核，不由文档格式检查代替。

## 内容核对

恢复字段位于 REST 的 `error` 对象，SDK 中为异常的 `recovery`。MCP 保留既有 `safeNextAction`，同时传递新增恢复字段。普通业务拒绝沿用原 MCP 恢复规则；HTTP 传输边界的拒绝仍遵守原协议，文档没有承诺工具错误正文。

部署支持列表与 discovery 共用来源。slug 不匹配的指令明确说明列表不能修复绑定。enrollment 指令说明部署支持不等于 policy 授权。类型修正不会自动改写 pending、正文或 key。

文档保留了 attempts、Retry-After、凭据用途和重放规则。示例使用占位身份或独有测试身份。恢复示例不包含真实 Token、配对码、Cookie 或其他连接的身份。文档没有 WebUI 操作或浏览器验收要求。

## 写作与来源

按仓库固定副本读取 `leter/zh-tech-writing` 的 `SKILL.md`、`references/manual-structure.md` 和 `references/typography.md`。准确上游提交与原件 SHA-256 见 [documentation-source.json](documentation-source.json)，MIT 许可保留在仓库中。这里只使用可读副本，没有全局安装技能或工具。

本机缺少 `autocorrect`，按技能要求手检空格和标点。逐条核对了开场与结尾套话、客套话、对比与递进句式、硬凑排比、设问自答、宣传词、黑话、解释破折号、翻译腔、含糊措辞、感叹号和过密标题。新增文字未命中这些写法。

手检还涵盖短句、主动语态、段落主题、中英文及数字空格、全角标点、引号、省略号和破折号。协议中的既有代码占位符和历史说明保留原意，本卡未重写整份协议。更新接入说明、参考和示例的要求已写入现行文档维护规则。
