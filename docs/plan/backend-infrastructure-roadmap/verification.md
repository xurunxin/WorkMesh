# 路线图交付验证

## 范围与准确来源

本轮只新增 `docs/plan/backend-infrastructure-roadmap/` 的 Markdown 文件。业务代码、配置、协议行为、API、事件、数据库迁移、CI 执行逻辑及 ADR 状态没有变化。其他卡没有更新或启动构建。

准确产品基线为 `104f7afb8e89859549aa16af7a3114e90dea7f9b`，真实 `refs/heads/main` 与开工 HEAD 一致。平台共享 Git 缓存的锁拒绝保持，未触碰锁。来源原件、字段完整性、哈希与缺口见 [sources.md](sources.md)；新提交由实际提交回执提供，不预写未来 SHA。

## 环境及本机检查

本机为 Windows，PowerShell，Python 3.11.15。默认 PATH 的 Node 为 v25.4.0，未找到 pnpm；这只是环境发现，未拿默认工具执行项目检查。

检查显式使用已提交的官方 Node 归档提取的 Node 22.19.0。归档路径为 `docs/reviews/cleanup/2026-10-11-worktrees/continuation/node-v22.19.0-win-x64.zip`，SHA-256 为 `ea3fad0e67a991d8477d8c01344b56e69c676ccb733f065b22436994b1253f86`。工具运行目录为本任务新建的 `D:/Cache/TEMP/workmesh-ta00-nf20n0st/`，没有修改全局版本。

本任务局部 npm 安装 pnpm 9.15.4；分类 YAML 用仓库现有 `scripts/ci-bootstrap/package-lock.json` 安装，只含锁定 yaml 2.9.0，启用 `--ignore-scripts`。没有安装全部 workspace，没有创建容器、数据库、卷、镜像或后台服务。

| 命令／步骤 | 实际结果与适用边界 |
| --- | --- |
| 真实 main 查询、逐卡 todos、相关 conversation、CI #502 读回 | 已执行；62 个 Spec 完整，16 个 Saved plan 截断；本卡完整计划从当前对话恢复；不声称取得旧 #32 方案尾部 |
| `pnpm check:integration-docs` | exit 0；4 个技能原件、80 个相对链接、35 个 REST 引用、11 个 MCP 名称及 Human 示例语法通过。只检查原接入手册范围，不代新增路线目录验收 |
| `node --test scripts/ci-policy.test.mjs` | exit 0；21 项通过，0 失败、0 跳过。核现有分类与 Required CI 拒绝缺结果/错误跳过；工具输出在聊天返回被截短，统计为实际执行输出，不伪造完整日志 |
| 来源字节／目标／链接／依赖专项核验 | 已执行；首轮拒绝遗漏的验证页链接。最终复核结果在下方实际回执记录，不把首败标通过 |
| `git diff --cached --check` | 首轮拒绝两份工具原文的行尾空格；改为可逆归档后通过，原解码正文不变 |
| `classifyChanges` 对实际提交路径分类 | 按下方实际回执记录；保持既有策略，不新增 prose 豁免，不以 P0/P1 审查范围代替 CI |

## 首败与修订

生成覆盖矩阵前，文件存在性断言拒绝 `packages/git-provider/src/mutation-http.ts`，该文件实际上只有同名测试。已删除错误路径引用，改为真实 `packages/git-provider/src/index.ts`；首次生成失败没有产生矩阵文件。一次脚本文本构造在 JavaScript 解析前被拒绝，随后修正引号，未执行写入。

空白检查拒绝 `sources/todos/16.md` 三处空格行和 `56.md` 一处行尾空格。两份工具返回改为 JSON 行数组的可逆归档，UTF-8 解码正文逐字匹配原工具字符串；正文哈希、文件哈希和 blob 分别记录。其余 60 份文本及 25 份历史 Git 原件保持各自归档规则，没有 trim 原文字节或补截断尾部。

链接核验在验证页尚未形成时，准确拒绝 `README.md → verification.md`。完整交付后另核链接、源码路径、每卡专项测试/DoD、目标条目与依赖图；该拒绝不是产品功能测试失败，也不代最终通过。

源码绑定页最初取 Status 附近多行，误带 ADR 原目录的相对链接，链接检查准确拒绝。现只取实际 Status 文本，来源文件及 blob 保持可查。逐卡 PR 索引也通过真实合并差异复核，纠正按相邻编号拟列的临时映射，具体回执见 [merge-map.md](sources/history/merge-map.md)。

首次推送 `18d92416fb8a` 仍含新加入复核脚本说明页的一处末尾空行，空白检查已经明确返回该错误。该推送不记检查通过；已修正生成说明页的文件终止 LF，并重新登记其文件哈希。最终候选另核完整范围空白和 Required CI，不以这次推送冒验收完成。

首次推送后，来源生成器曾把推进后的本分支 HEAD 当作基线重新生成源码绑定页，该未提交中间产物被发现后纠正。生成器现固定使用原真实 main 的不可变 SHA，并独立核远端 ref 是否变化；当前分支 HEAD 与 main 不再混用。最终归档与源码绑定均核原 main，不把该中间文件冒主线来源。

## 文风及接入文档适用性

本轮读取固定 zh-tech-writing 主文件、manual-structure、typography 和来源清单。固定上游 commit 为 `ffda9353768dece8aabd26ccb3a4978025e9437c`，仅使用仓库可读副本，不作全局或团队安装。

读者是审核路线及接续派工的 Human 和 Agent。原创文档逐项核套话、客套、对比/递进句、设问、宣传形容词、黑话、破折号、翻译句式、模糊限定、感叹号/emoji、过度加粗与标题。核中英文/数字空格、全角标点、引号、单位、缩写和层级。`autocorrect` 不可用，按技能手检。工具正文、代码标识符和历史原件保留原语言及措辞，不冒中文润色后的原件。

| 接入文件组 | 本次不改的具体依据 |
| --- | --- |
| `docs/integration/README.md`、快速上手与 REST/MCP 说明 | 没有新增服务入口、调用参数、凭据模式、返回值或 MCP 工具；路线入口仅用于方案审阅 |
| `docs/integration/reference.md`、配置与安装说明 | 默认值、feature、镜像、CLI、发行/安装能力和运行环境要求均没有变化 |
| 恢复说明及可运行示例 | 未增加恢复行为，也未改 SDK/连接器消费；真实示例运行不为未来提案提供通过证据，因此本轮未重跑 |
| `OPENAPI.yaml`、`AGENT_PROTOCOL.md`、`SCHEMA.sql`、Accepted ADR | 没有领域/协议/持久化/安全决策变化；新增分歧留在各责任卡的 Proposed ADR 关口 |

后续任一卡改接口或功能时，上述依据失效，必须同次更新相关接入说明、配置、参考及真实示例。

## 必需检查和审查停止点

本轮提交路径均为既有策略识别的 Markdown。实际分类和远端 Required CI 单独记录，原候选 CI #502 不代本卡。根 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:conformance` 在本轮没有执行；只有现行分类计划允许跳过时才记计划跳过，不能写产品回归全绿。未来产品卡仍必须执行全部适用检查与真实验收。

生产者自查不等于正式独立审查。当前没有可调用的正式独审工具，本轮准备完整可审候选；由用户使用消息框左侧“AI 审核”发起 P0/P1 复核，指南为 [AI review](https://todos.dev/docs/ai-review)。未完成独审、最新本卡 Required CI 或用户关口裁定时，不报告本卡已合入或整条路线已完成。

## 资源与未测

任务资源限于局部工具、只读来源处理脚本和本工作树 bootstrap YAML 依赖。共享 Node 归档、pnpm store、既有镜像、历史工作树及所有受拒目标保持。收尾前核归属、普通目录与无活动引用；只收尾本轮新建对象，不全局 prune 或绕过删除拒绝。

实际清理调用在派发前被自动策略拒绝，返回 `blocked by policy`，不是操作系统删除失败。目标为 `D:/Cache/TEMP/workmesh-ta00-nf20n0st/` 和本工作树 `scripts/ci-bootstrap/node_modules/`；原始调用包含准确路径、Resolve-Path 一致性、reparse/活动消费者门和同一 PowerShell 的 Remove-Item。调用未执行，后续只读核两目标仍存在；没有拆批、改属性、改 ACL、换工具或重试删除。实际错误中的命令展示自身截断，除该原因外不推断隐藏拒绝理由。两目标保留，不能报告资源已清空。

+**受拒原始请求**（仅供查阅，禁止作为重试指令）：

```json
{
  "cmd": "$taskRoot = 'D:\\Cache\\TEMP\\workmesh-ta00-nf20n0st'; $taskYamlPath = 'C:\\Users\\xurx\\.tds\\workspaces\\01a134af-ce5c-749a-8ffe-f0d0c8313860\\scripts\\ci-bootstrap\\node_modules'; $resolvedTask = (Resolve-Path -LiteralPath $taskRoot -ErrorAction Stop).Path; $resolvedYaml = (Resolve-Path -LiteralPath $taskYamlPath -ErrorAction Stop).Path; if ($resolvedTask -ne $taskRoot -or $resolvedYaml -ne $taskYamlPath) { throw 'OWNER_PATH_MISMATCH' }; foreach ($taskObject in @($taskRoot,$taskYamlPath)) { if ((Get-Item -LiteralPath $taskObject -ErrorAction Stop).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'REPARSE_REFUSED' } }; $activeConsumers = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('node.exe','python.exe') -and ($_.CommandLine -like '*workmesh-ta00-nf20n0st*' -or $_.CommandLine -like '*scripts/ci-bootstrap/node_modules*') }); if ($activeConsumers.Count -ne 0) { throw 'ACTIVE_CONSUMER_REFUSED' }; Remove-Item -LiteralPath $taskRoot -Recurse -Force -ErrorAction Stop; Remove-Item -LiteralPath $taskYamlPath -Recurse -Force -ErrorAction Stop; [pscustomobject]@{ TaskToolsAbsent = -not (Test-Path -LiteralPath $taskRoot); BootstrapDependencyAbsent = -not (Test-Path -LiteralPath $taskYamlPath); SharedNodeArchiveRetained = Test-Path -LiteralPath docs/reviews/cleanup/2026-10-11-worktrees/continuation/node-v22.19.0-win-x64.zip } | ConvertTo-Json -Compress",
  "max_output_tokens": 900,
  "yield_time_ms": 10000
}
```

可见错误：`exec_command failed: CreateProcess`，策略返回 `Rejected`、`blocked by policy`，命令展示中含 `…821 chars truncated…`。完整可见工具块保留在本卡对话；缺失的展示中段与未给出的策略原因保持未知，不用原请求补造实际返回。

未运行任何新增 F/TA 产品链、设备/企业/外部 provider 组合、真实模型付费探测、通知发送或发布。没有新凭据、设备权限、真实外发和生产变更。后续卡的未测条件在路线与验收责任文件逐项保留。

## 最终实际回执

提交前的专项核验、分类、本卡 CI 和资源收尾按实际结果追加于此，不用预计结果填充。

本机专项核验已通过：62 份当前来源逐字匹配实际工具返回；25 份历史原件与主线 Git blob 字节一致；27 张保留卡、99 个目标条目、281 个唯一 API 操作均有索引。90 条实施/最终验收依赖无环；没有 UI、可选扩展或 TA 反向阻塞 M 批次的边。最终 655 个原创导航和源码绑定相对链接及其锚点通过。所有 105 个 Markdown 文件的工作树字节与实际 index 字节一致，提交后又核与实际 HEAD blob 一致。

实际分类为 `docs`，packages/testPackages 均为空，八个产品检查类别均为 false。五项根产品检查本轮按该分类不执行，不写通过。CI 的 changes、文档预检和 Required CI 仍需本候选实际成功。

可复现只读专项脚本见 [document-checks.md](sources/history/document-checks.md)。它核实际归档哈希、原件 blob、操作总集、测试条目、依赖和链接；施工时与原工具字符串的逐字匹配另已执行。最后新增的验证导航也随最终核验覆盖，链接数量以后次实际回执为准。

草稿 [PR #226](https://github.com/xurunxin/WorkMesh/pull/226) 已建立，候选 `9160ad16b75651186ecd8c7baa54eacd12322b44` 的 [CI #504](https://github.com/xurunxin/WorkMesh/actions/runs/38386304316) 已实际 completed/success：changes 与 Required CI 成功，八项产品检查按 docs 计划跳过，跳过不计产品通过。后续仅追加验证与受拒资源记录；该记录提交的最新 CI 仍另核，#504 不冒新 HEAD 通过。正式独审未执行，没有 ready、合并或下一卡构建。
