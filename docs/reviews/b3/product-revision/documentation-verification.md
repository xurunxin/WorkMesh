# 本轮文档核验

## 来源与更新

读取仓库固定 `zh-tech-writing` 的 SKILL.md、manual-structure.md 和 typography.md。
准确提交为 `ffda9353768dece8aabd26ccb3a4978025e9437c`，原文件哈希继续由固定来源和文档检查核验。
逐条自检文风与排版；autocorrect 缺失，手检空格、标点、引号、省略号和破折号，未全局安装。

同次更新协议、接入入口、MCP 说明、字段参考与错误恢复手册。
SDK/MCP 两层目录校验和 CLI 429/503 等待示例均按实际实现描述。
REST 请求地址、鉴权、成功 DTO、配置开关和部署没有变化，REST 快速上手、配置和部署章节无需改动。
OpenAPI 的既有恢复字段和响应头保持；此次严格消费校验及 CLI 内部等待元数据不改变 API DTO。

## 实际验证

本轮随文 `verify-integration.ts` 已在独有真实 API/MCP 和测试库运行成功。
真实 REST 恢复、SDK recovery、MCP 工具错误和安全示例输出均核验；监听、API 与数据库连接关闭。
目录外文字、控制串、原因和列表错配由 SDK/MCP 两层独立用例验证。
实际 CLI 已覆盖 429/503 的整数秒、GMT 日期、非法及缺失头，并核 pending 原字节和单次请求。
手册中的“等待时长：7 秒”与真实 CLI 输出一致，不包含真实秘密，不要求 WebUI。

完整当前回归、首败、skip 和远端 CI 以本轮交接记录为准；不以静态检查代替真实请求。
