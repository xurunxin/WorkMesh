# 后端化方案审查材料

## 阅读顺序

本次只交付方案文档。WebUI、API、worker、镜像和 CI 实现保持当前源码。
正式方案独审通过后，Chief 单独放行产品实施。本卡保持在审查关口，不合并、不标记 Done。

| 材料 | 用途 |
|---|---|
| [完整实施方案](../backend-only.md) | 本轮平台注入的完整方案，供正式独审 |
| [最新方案原文](sources/plan-4L0f8ekmDAa144DUqvFlx.md) | `doc:4L0f8ekmDAa144DUqvFlx` 的完整保存副本 |
| [先前方案原文](sources/plan-eeEM_cmzdO-i7EqTiz7XF.md) | `doc:eeEM_cmzdO-i7EqTiz7XF` 的历史保存副本 |
| [当前完整规格](sources/spec.md) | 本轮实际读取的 #61 规格，含仅文档执行授权 |
| [原问题答复](sources/user-decisions.md) | 两项原始问答，逐字保留 |
| [测试影响与验收](test-impact.md) | 浏览器断言去向、镜像与通知安全验收 |
| [路径与服务影响](path-impact.md) | 已核查的依赖和产品实施改动入口 |
| [逐卡影响与去向](followup-impact.md) | 平台最新规格与仓库历史路线图的衔接 |
| [来源清单](source-manifest.json) | 来源 ID、正文 SHA-256、文件 SHA-256 和 Git blob |
| [检查与资源回执](verification.md) | 本轮实际执行、未执行项目及资源归属 |

## 来源边界

方案全文来自平台注入的保存副本。原文保留排版和标点，未按写作规范改写。
历史副本与最新副本分别保存，不覆盖历史。平台没有返回方案版本字段，也没有返回上游正文哈希。
清单中的正文 SHA-256 由本次保全的 UTF-8 文本计算，不能当成平台提供的哈希。

`todos` 返回的当前完整规格在 `Saved plan:` 之前结束；后面的方案被截断。
[原始返回](sources/todos-response.txt)保留了截断标记。
[会话原始返回](sources/conversation-response.json)的 `text` 字段提供问答全文和方案链接，不提供方案全文。
#7 的规格完整，附带方案截断；29 个后续卡的当前规格完整。逐卡文件保留实际返回内容。

正文采用 UTF-8，无 BOM。原文文件在正文后加一个 LF，便于仓库保存。
清单分别记录正文和文件的哈希，明确区分末尾 LF。Git blob 在暂存和提交后另行复核。
会话返回以 JSON 保存，解码 `text` 后可还原原始空格和换行，避免原缩进空行触发仓库空白检查。
清单不包含自身哈希，避免自引用；清单自身由交接的提交 SHA 固定。

## 代码与主线

本轮源码检查基于 `f2591a3bebeca9640b0d828ac3ad07fb5daf8e3c`。
共享缓存的 Git 工具在准备读取远端主线时，被现存 `index.lock` 阻塞。
[原始失败](sources/main-read.txt)如实保留。没有删除锁，也没有将本地 `origin/main` 当成最新远端主线。
这不妨碍本轮文档交付；产品实施前仍须独立读取 `refs/heads/main` 并绑定准确 SHA。

## 中文写作

新写说明使用 [zh-tech-writing](https://github.com/leter/zh-tech-writing/blob/ffda9353768dece8aabd26ccb3a4978025e9437c/skills/zh-tech-writing/SKILL.md)。
本轮读取主规范、`references/manual-structure.md` 和 `references/typography.md`。
固定来源提交和三个文件的原始字节哈希见 [writing-skill.json](sources/writing-skill.json)。
未全局安装技能。本机没有 `autocorrect`，本轮按规范手检新写中文。原方案、规格和问答逐字保全。

## 交接

本次交付通过当前会话分支完成。审查者可在变更审查中点击 Markdown 文件的预览按钮。
后续顺序保持 #61 → #62 → #7 → #20。#62 编写完整接入文档；#7 先停方案确认，产品实现等待 #61 和 #62。
新接口或功能交付须同次更新接入说明、配置和示例。新增功能和文档站不在本轮范围内。
