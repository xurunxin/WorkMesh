# 中文技术写作技能来源

## 固定版本

本仓库使用 [leter/zh-tech-writing](https://github.com/leter/zh-tech-writing/tree/ffda9353768dece8aabd26ccb3a4978025e9437c) 的提交 `ffda9353768dece8aabd26ccb3a4978025e9437c`。本任务于 2026-10-12 独立通过 GitHub raw HTTPS 获取完整文件，并核 SHA-256。哈希、字节数与 URL 在 [source.json](source.json) 中。

上游采用 [MIT 许可](upstream/LICENSE)。副本保留许可、版权和原文件字节。本地目录仅供仓库任务读取；没有全局安装、团队技能库变更或新 Agent 授权。

## 新机与后续任务

无需安装即可读取以下文件，并按其中步骤写作：

1. [SKILL.md](upstream/skills/zh-tech-writing/SKILL.md)：读者目标、句子、语气、结构、AI 腔自查与排版流程。
2. [manual-structure.md](upstream/skills/zh-tech-writing/references/manual-structure.md)：手册目录和文件名。
3. [typography.md](upstream/skills/zh-tech-writing/references/typography.md)：单位、数字、全角标点与缩写。

运行 `pnpm check:integration-docs` 核副本完整性。重新取源时只用 source.json 的固定 commit URL，并逐文件核哈希。副本异常须恢复准确来源，不能改哈希以掩盖变化。

## 本次应用

读者为接口开发者与 Agent 客户端作者，目标为完成登录、配对、身份核实和最小读取。手册分环境、REST、MCP、参考和恢复；文件名采用半角小写与连字符。文风和排版逐项自检在[验证记录](../../reviews/api-mcp-docs/verification.md)中。

本机未找到 `autocorrect`，按技能要求手检；不新装全局工具。上游原件中的示例和措辞保持不变，不纳入本次原创文档文风修改。
