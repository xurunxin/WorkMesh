# 接入文档同步维护

## 何时更新

接口或功能变更与接入文档在同次交付完成。任务开始时确定影响面，交付时记录更新路径、实际验证和未测范围。默认关闭、新增权限和未实现字段必须明确说明。历史审查、失败和来源原件保持原字节。

| 变更 | 同次维护的位置 |
| --- | --- |
| REST 路径、DTO、security、错误 | `OPENAPI.yaml`、共享合同、REST 说明、参考和示例 |
| 配对、安装凭据、Session、恢复 | `AGENT_PROTOCOL.md`、REST/MCP/恢复说明、SDK 与连接器消费示例 |
| MCP 名称、schema、发现和 mode | MCP 说明、参考、发现合同与真实调用记录 |
| feature、功能状态、默认值 | 手册边界、配置表、环境样例与对应功能说明 |
| 服务地址、镜像、CLI 命令 | README、部署文档、配置及快速上手 |

入口在 [docs/integration/README.md](integration/README.md)。领域规则继续由现行协议、OpenAPI、Schema 和 Accepted ADR 决定；文档改动不授权修改 API 功能。#7 的 API＋最小 SDK/MCP/CLI 交付须继续更新本手册，B3 字段在实际实现前保持“未实现”。

## 每次交付的步骤

1. 读取[固定写作技能](skills/zh-tech-writing/README.md)的主文件和适用参考。确认读者要完成的操作，按技能的句子、结构和排版规则写作。
2. 对照实际路由、Zod、SDK、连接器与 MCP 注册核参数。示例保存为可运行文件，秘密从受保护存储注入。
3. 逐条检查技能的 AI 腔清单。已有 `autocorrect` 时执行 `autocorrect --fix <文档>`；缺失时手检，不更改全局环境。手检引号、省略号、破折号、单位、标点和中英文空格。
4. 执行 `pnpm check:integration-docs`，检查本手册相对链接、参考端点、Skill 副本哈希和示例语法。按实际改动运行接入示例及相关合同/集成测试。
5. 记录准确源码提交或待提交文件 SHA、命令、环境、结果、首败、未测和资源收尾。履行仓库所需 lint/typecheck/test/integration/conformance，不能把静态检查当实际请求通过。
6. 交付说明写明文档路径。若判断无需更新某篇，解释它与本次行为无关的具体依据。独立审查和最新适用 Required CI 通过后，沿正常审查与合入流程交付。

后续任务的检查项须覆盖变动后的用户可见说明、示例和参考。用户验收项只写需要人工判断的结果；自动测试结果写入验证记录。库版本或写作技能更新须另行核来源与许可，不能静默跟随上游 main。

## 自动检查的范围

CI 的 `changes` job 在分类前运行 `node scripts/check-integration-docs.mjs`。即使只改 Markdown，也执行链接、固定来源、参考端点及示例语法检查。其失败会阻断 Required CI。未知路径仍遵守既有全量分类，未扩大 prose 豁免。

此检查不会判断中文语义、授权正确性或例子实际可用。它不要求形式关键词，也不证明“改了文档”就保持行为一致。真实接入验收入口为 `pnpm verify:integration-examples`：只对独有 test 数据库运行，启动真实 API/MCP，运行随文示例并验证配对、签名和拒绝。该命令是按需本地验收；现有 Required API/Pi conformance 保持独立，不假装自动运行了新示例。

验收要求锁定 Node 22.19.0、pnpm 9.15.4 和可用 Docker。先按部署方的镜像来源策略准备 `postgres:16.9-alpine` 与 `redis:7.4.5-alpine`；脚本只借用已有镜像，不自动拉取。它创建独有容器与卷，结束后核归属并收尾。

`--required-checks` 另需 `rustfs/rustfs:1.0.0`，初始化本任务的 artifact bucket，再串行运行仓库五项必需检查。`--integration-checks` 只运行 integration 与 conformance，适用于修正测试夹具后的复验。两项选项只用于开发验收，不使用生产数据库。

根 integration 默认跳过恢复 opt-in 套件。用 `--recovery-checks` 创建独有 source/target test 库，显式开启原恢复测试，并复用本任务 PostgreSQL 容器内的工具。跳过与通过分开记录；CLI 命令退出成功不能证明其中的 opt-in 套件已执行。

## 协作记录

本任务沿平台 #62 与仓库记录交接，验证日志位于 `docs/reviews/api-mcp-docs/`。当前工具集没有 WorkMesh 的 Project/WorkItem/Activity 写工具，不虚构远端领域记录。后续具备 WorkMesh 控制面工具时，按 AGENTS.md 的双轨要求记录对应工作项全文与活动，并指向同一仓库文件。
