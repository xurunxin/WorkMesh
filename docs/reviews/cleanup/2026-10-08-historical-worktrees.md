# WorkMesh 历史 worktree 与测试资源清理记录

首版报告时间字段：2026-10-08 17:32（Asia/Shanghai；来源未独立核验，非操作时间）
机器：DarkFlame（`6DOlLniZ0sqBYGHeIhRMq`），Windows，`tds 0.1.60`  
工作区根目录：`C:\Users\xurx\.tds\workspaces`  
项目：WorkMesh（`DzkLDn6UW-IbfoTJzN9Ro`）  
最新读取主线：`main` / `1078bbcd527550bfabee73093b7ffd0032d3fd24`

## 清理结论

- 只完整回收了已完成的 #2 P1 linked worktree。其 HEAD `735578d8d0733e04cae5640cedfaf0c6181391c7` 可从本轮新读取的主线到达，`git merge-base --is-ancestor` 退出码为 0；Todo 与会话记录均为已完成。清理前 `git status --porcelain --untracked-files=all` 为空；ignored 内容仅为 `node_modules`、`dist`、`.next`、`.turbo` 等可重建依赖和构建缓存。
- #3 R1、#10 D0、#11 D1a、#18 G1 虽均已完成且各自 HEAD 都在最新主线历史中，但目录内仍有尚未逐项与主线证据对照的 ignored 测试截图、报告、诊断日志或归档材料，本轮保留目录并记录原因。未以 `done` 状态单独作为删除依据。
- #3 与 #11 的 Playwright `test-results/.auth/admin.json` 是已完成构建留下的测试认证状态文件，各 1,625 字节；仅删除这两个确切文件，未读取、记录或归档其内容。截图和报告仍保留。
- 按候选会话 ID 前缀查询 Docker 容器、卷和网络均无匹配项。未删 Docker 镜像，因为无法证明现有镜像属于某一候选任务而非共享缓存；共享服务、卷和网络均未触碰。
- #5、#8、#15、#17 和 #21 当前/恢复工作区均仍存在。未删成功合并的远端分支。未清理主仓库、外部临时 worktree、tds 用户目录或本轮清理构建。

## 逐项清单

| Todo | 分支 HEAD | 绝对路径 | 清理前核验 | 结果 |
|---|---|---|---|---|
| #2 P1 `qJKk_SAxN29AdBHERBl7u` | `735578d8d0733e04cae5640cedfaf0c6181391c7` | `C:\Users\xurx\.tds\workspaces\01a115d0-83ff-7ee7-ba2e-eb7d5b10bdfe` | `done`；完成会话；主线祖先；Git 未跟踪/修改项 0；忽略项 51 个，均为依赖/构建缓存；清理前文件大小枚举 `942282752` 字节 | 已清理：正式 `git worktree remove` 注销登记；确认无剩余文件后，移除 1,918 个指向本目录内部的 junction 和 958 个空目录；最终路径和登记均不存在，分支保留 |
| #10 D0 `MPhtZiff23B33m9i2equq` | `768bbd82fcc52a873168b39a8382d2f14c928abc` | `C:\Users\xurx\.tds\workspaces\01a115d0-87b0-78cd-921d-750713cdde51` | `done`；主线祖先；Git 未跟踪/修改项 0；`.tmp` 有 2,661 个文件、`250939918` 字节 | 保留；未逐项证明采集日志和诊断材料均已持久化 |
| #18 G1 `Tws50k02Pi52R-RJEXP_N` | `c7a1af7d7b2e125368b29975867b4d392690fc38` | `C:\Users\xurx\.tds\workspaces\01a116f7-1027-7c75-90df-32ebc5488752` | `done`；PR200 合入记录；主线祖先；Git 未跟踪/修改项 0；`.tmp` 有 10,452 个文件、`348722219` 字节；另有 5 个干净且主线可达的嵌套 linked worktree | 保留；忽略目录含证据归档、日志和校验脚本，未逐项对照主线；嵌套 worktree 跟随父目录保留。授权根目录外的 `C:\Users\xurx\AppData\Local\Temp\workmesh-g1-verify-36c7709` 也保留 |
| #3 R1 `q_1zKPuGsG-2ZRUwOwQx4` | `550dead055689154359a3406dfce4f0c91c1dad3` | `C:\Users\xurx\.tds\workspaces\01a116f8-8172-7082-8d61-867bd9f0b749` | `done`；完成会话；主线祖先；Git 未跟踪/修改项 0；Playwright 报告 `612374` 字节，截图结果原计 `134400` 字节 | 保留报告和截图；删除 `.auth/admin.json`（1,625 字节，退出码 0）；其余输出未逐一对照主线 |
| #11 D1a `IJQA_DfxU0hF5e8L5Xb3v` | `7ce4ef2d9e5b7ad2f3b693383f58f311e5a1684f` | `C:\Users\xurx\.tds\workspaces\01a1187a-f4ff-735d-814f-a7b26f8cfdc5` | `done`；PR204 合入记录；主线祖先；Git 未跟踪/修改项 0；`.tmp` 有 2,195 个文件、`142252299` 字节；Playwright 报告 `2224000` 字节、截图结果原计 `2692168` 字节 | 保留日志、归档、截图和报告；删除 `.auth/admin.json`（1,625 字节，退出码 0）；其余输出未逐一对照主线 |

五个候选提交相对本轮抓取的 `FETCH_HEAD=1078bbcd527550bfabee73093b7ffd0032d3fd24` 的祖先检查均为真。平台任务 phase 与会话结尾记录作为构建活动状态依据；对保留项不依赖 `done` 单独授权删除。

## 操作与空间记录

- #2 执行：`git worktree remove <精确绝对路径>`，未用 `--force`。命令超过工具单次等待窗口，后续进程已结束，但工具没有返回该子进程退出码；机器清单将其记为 `null`，不伪报为 0。之后确认登记已注销、目录内文件数为 0，并逐个非递归移除内部 junction/空目录；该后续 PowerShell 命令退出码为 0。
- #2 最终路径不存在，`git worktree list --porcelain` 无 #2 登记且无 `prunable` 项；`tds/conv-01a115d0-83ff-7ee7-ba2e-eb7d5b10bdfe` 本地分支仍保留。
- 清理前 C 盘可用空间 `360104419328` 字节；最后观测 `360879202304` 字节，净增加 `774782976` 字节。期间其他任务的 Docker 服务仍活动，故此数值是卷级净变化，不将其冒称为 #2 的精确物理释放量。递归文件大小枚举仅作清理前工作区清单参考。
- Docker 仅按五个候选会话 ID 前缀查询容器/卷/网络，结果均为空；没有运行 Docker 删除命令，也未执行 prune。无明确任务归属的镜像保留。
- 未运行产品测试；本任务是本机资源运维。最终核验包括路径不存在、worktree 列表健康、保护目录仍在、P1 分支仍在、Docker 候选筛选为空及 `git status`。

## 保留与排除项

- #5、#8、#15、#17 的 phase 为 `building`，工作区分别为 `01a11ac2-a0a9-7ef6-bd48-3bb37c21a301`、`01a11ac2-7634-752e-8d81-764c9776f801`、`01a1187a-f0f0-76d8-8f5b-b954ee399cdc`、`01a11890-f4de-7106-b64d-e1b2c0d4608e`；均未删除。
- #21 当前构建 `C:\Users\xurx\.tds\workspaces\01a11a93-c093-7565-9084-724b6bedcade` 与恢复首面 checkpoint `C:\Users\xurx\.tds\workspaces\01a1195f-55ab-7ee9-8baf-c115978d3aec`（`d2e1a656df73f5afd7d91060c2f7e4b4fd1ebcf5`）均保留。
- 共享 WorkMesh 容器/网络/卷、无法归属单任务的镜像、主仓库、外部临时路径、本轮构建目录、tds 安装/配置/用户目录和工作区根目录均未清理。

机器可核对数据见同目录 `historical-worktrees-2026-10-08.json`。本轮没有产品代码、API、事件或数据库变更；无规格偏离。

## 2026-10-08 审阅反馈后的审计修订（仅只读核对）

本节修订先前续核记录中过度确定的结论。没有重新删除、恢复或改写任何 WorkMesh 工作目录、克隆、缓存、认证状态、Docker 资源或证据文件。时间只记录工具时钟观测，不把报告提交时间推作资源操作时间。

### 时间来源与可复核边界

- 旧文中的“18:10”记录时间撤回。机器清单旧字段 `followupCleanup.recordedAt=2026-10-08T09:56:54.0993686Z`（北京时间 17:56:54）；该字段来源无法独立核实，原值保存在 `timeSources`。本次修订报告记录时刻采用工具时钟 `2026-10-08T10:26:13Z`（北京时间 18:26:13），仅表示本次报告修订时间。
- 前一版报告提交元数据为 `2026-10-08T18:05:04+08:00`，仅能证明提交时间，不能证明任何删除操作时间。删除操作实际时间、结束核验时间及前一版报告完成时间均未知；不以提交时间倒推。
- 本次纠正审计的工具时钟开始读数为 `2026-10-08T10:17:10Z`（北京时间 18:17:10）；首次详细清单采样读数为 `10:19:43Z`。精确扫描完成时间及本次结束核验时间未单独采样，记为未知。
- 旧的活动 Todo 状态是前次执行时的读取快照，本次只作文件/ Git 只读核对，没有重新读取平台活动任务或进程引用。当前引用状态未知，不据此授权任何删除。

### 删除证据的限制

原始执行记录位于 `C:\Users\xurx\.tds\codex-home\sessions\2026\10\08\rollout-2026-10-08T17-15-17-01a11acb-aa1d-7c20-9f0a-069bb121f67b.jsonl`（以下为 1 起始物理行号）。第 838/841 行，调用 ID `call_e95fbe2db386479f82ec0c6a72a42479`，是 Git blob 比较命令及其输出：D0 999、D1a 452、G1 555，共 2,006 个匹配候选；这是比较计数，不是删除回执。第 865/867 行，调用 ID `call_672d8a0fd0b34811bcc926014e24d880`，输入包含对匹配项执行 `Remove-Item` 的循环，但返回只有包装器完成信息和终端警告，没有删除计数或逐文件输出；因此 Git 批次实际删除总数无法由该返回独立确认。第 948/951 行，调用 ID `call_b697c362ad5b4a36a97c84632f8bf0a5`，是 ZIP 成员比较及删除调用；返回声称 `Planned=262`、`Removed=262`、`Bytes=77782835`、嵌套命令 `exit_code=0`，同时出现清理回执写入相关 PowerShell 属性错误。该返回支持聚合执行陈述，不提供逐文件持久映射。故此前 2,268 的总数只能视为旧清理报告的汇总陈述；没有可持久化的逐文件路径→blob/member 回执，逐项保全**不可独立复核**。不补造回执，也不重跑删除。

前次记录中关于删除前活动引用、逐项解析绝对路径和 junction/链接安全检查的说明，属于当时的执行陈述；没有可独立读取的逐项记录，无法在本次审计重建验证。#2 和五个 G1 嵌套 worktree 的正式移除记录及退出码仍见下方机器清单，但机器清单本身不弥补批量文件映射缺失。

### 独立浅克隆与逐项恢复依据

在 G1 父工作区 `.tmp` 下发现并核实独立浅克隆：

`C:\Users\xurx\.tds\workspaces\01a116f7-1027-7c75-90df-32ebc5488752\.tmp\g1-shallow-layout`

它有独立 `.git` 目录，HEAD 为 `002c1d61a7fc5d529b2d480f4c48716971c4236d`，`--is-shallow-repository` 为 `true`，没有登记在父仓库 `git worktree list` 中。该路径位于 G1 构建 `.tmp` 内，只能支持路径归属关联；克隆来源和当前活动引用未能核实。其 Git porcelain 显示 143 个 tracked 删除，父 G1 根的干净状态不包含这个嵌套克隆。

逐项检查显示，143 个删除路径在克隆 HEAD 对象库和当前本地 main 对象树中均有 blob；其中 140 个 blob 与 main 当前 blob ID 相同，另 3 个路径 blob 不同。逐路径相对名及两侧 blob ID 已写入 JSON。没有恢复这些路径；克隆因有未提交删除且活动引用未知而整体保留。

四个候选**父 linked worktree**（#3/#10/#11/#18）本次读取时各自登记存在，且各自 `git status --porcelain=v1 --untracked-files=all` 为 0 行。该结果只描述四个父根，不覆盖上面的独立克隆。#5/#8/#15/#17/#21 五个受保护当前目录及 #21 旧 checkpoint 路径本次存在性检查均为真；不代表重新验证了它们的运行状态。

### `.tmp` 文件清单与分类

本次扫描三个 `.tmp` 根，按普通文件、不跟随链接枚举；这三个根中没有符号链接文件或 `node_modules` 文件。当前找到 4,892 个文件、359,739,034 字节：#10 D0 为 1,649 个 / 196,832,784 B；#18 G1 为 1,747 个 / 66,773,555 B（含浅克隆当前存在的 1,464 个 / 16,891,322 B；克隆以外 283 个 / 49,882,233 B）；#11 D1a 为 1,496 个 / 96,132,695 B。

旧汇总为 4,919 个，较本次扫描多 27 个。由于没有前次逐文件清单，无法识别这 27 个路径，也无法确定差异原因或发生时间。JSON 的 `remainingTmpInventory` 含本次全部当前文件绝对路径、字节数、逐项比较分类和精确 main blob 路径；浅克隆当前文件在 `independentClone.currentTrackedFiles`，缺失的 143 个 tracked 文件在 `trackedDeletedPaths`。没有用摘要或文件名推断覆盖。

原字节对比未匹配不等于文件唯一。在该次清单采样时，普通文件按 Git blob 与 CRLF→LF 归一化进行比较，共发现 1,446 个仅归一化后匹配 main 的文件；当时其余项逐文件标为“用途/映射未判明”，并列出所缺 manifest、归档成员映射或 owner 决定，不称为唯一。后续 D0 阶段已补六份日志映射；本次 D1a 阶段又补出 1,406 个与主线脱敏 ZIP 成员逐字节相同的文件。当前剩余具体文件及所缺证据见新机器清单 `d1a-trace-zip-mapping-2026-10-08.json` 和 `remainingTmpInventory`，不再将已映射项统一列作未知。

### 保留的可重建缓存与其他材料

四个候选根共盘点出 133 个忽略的 `.next`、`.turbo`、`dist` 目录，合计 2,355 个文件、1,337,637,407 B；全部保留，本次没有清理。#10 有 1 个 `.next`、18 个 `.turbo`、12 个 `dist`；#11 相同；#18 有 1 个 `.next`、18 个 `.turbo`、18 个 `dist`。#3 有 17 个 `.turbo` 和 17 个 `dist`。精确路径、逐目录文件数和大小在 JSON `generatedCachesRetained` 中。依赖目录 `node_modules` 未纳入该缓存枚举。

D0 的采集日志、D1a 的 trace/patch、G1 的 HTML/Playwright 输出及其他未映射文件均保留；逐项绝对路径和缺少的证明输入已列在 JSON。无法判断它们是否可重建或是否为必要验收材料时，不以 raw-byte 不匹配作为删除依据。R1 截图/报告此前也因缺少逐项归档映射而保留；“唯一”未得到独立证明。

### 本次结论

这次修订仅补充审计。现有证据支持 #2 与五个 G1 嵌套 worktree 已移除、四个候选父 worktree 登记仍在、上述五个受保护当前 workspace 与 #21 checkpoint 路径仍存在；独立浅克隆另有 143 个 tracked 删除，不能用父目录 clean status 概括。此前批量文件的逐项保全和删除前运行引用无法独立复核，缓存、剩余测试材料和独立浅克隆均保留。没有新增空间释放，也没有运行产品测试或 Docker 清理。

机器可核对的逐文件清单、blob 对照、目录大小、状态及时间来源见同目录 [`historical-worktrees-2026-10-08.json`](historical-worktrees-2026-10-08.json) 的 `followupCleanup.reviewerFollowupAudit`。

## 2026-10-08 已合入构建缓存回收阶段

本阶段按用户追加指示，只清理 #3 R1、#10 D0、#11 D1a、#18 G1 四个已合入父 worktree 内，经逐项确认的可重建忽略缓存；不删除父目录、独立 clone、未知测试材料或任何活动/恢复工作区。执行前重新读取全板 Todo：#5、#15、#17、#21 与本清理 #52 为 `building`，#8 为 `done`；#8 仍按原保护要求保留。另行复读 `building` 列表确认持续运行的任务，没有等待团队整体空闲或中断正常构建。机器读取为 DarkFlame（`6DOlLniZ0sqBYGHeIhRMq`），`tds status` 显示 daemon running、pid `59452`、v`0.1.60`。

### 逐路径复核和执行

- 在 `2026-10-08T10:46:05Z` 预检的 133 个精确目录分别属于 #3（34 项）、#10（31 项）、#11（31 项）、#18（37 项）；类型为 `.turbo`、`dist`、`.next`。预检共枚举 2,355 个文件、1,337,637,407 字节。
- 每个实际删除前都重新检查绝对路径仍在指定 Todo 构建根下且位于 `C:\Users\xurx\.tds\workspaces`，解析路径与给定路径相同，路径链和目录内部没有 reparse/junction，Git 跟踪项数为 0、`git check-ignore` 命中忽略规则，并且没有命令行引用该精确路径或候选父根的进程。任一条失败则不执行；成功项用 PowerShell `Remove-Item -LiteralPath <精确路径> -Recurse -ErrorAction Stop` 单独移除并立即记录退出码与移除后存在性。
- 共成功移除 133/133 项，实际逐目录枚举为 2,355 个文件、1,337,637,407 字节；每项退出码 0、移除后路径不存在。按 Todo 统计：#3 为 34 项 / 5,918,718 字节，#10 为 31 项 / 218,398,716 字节，#11 为 31 项 / 225,070,619 字节，#18 为 37 项 / 888,249,354 字节。详细绝对路径、逐项预检数据、命令、退出码、进程引用数与结果保存在机器清单 `followupCleanup.generatedCacheCleanup`。
- 初次边界校验把这些同级构建目录误当作当前会话仓库的子目录，因此 10 次校验提前失败；这些尝试没有执行删除，退出码与删除结果记为空，并保存在机器清单 `nonMutatingValidatorAttempts`。之后改为按 workspaces 父目录校验，并在所有成功删除前再次完成整套复核。
- C 盘未在本阶段开始前采样可用空间，因此不报卷级净释放量。1,337,637,407 字节是逐项目录删除时枚举的文件长度合计，不等同于 NTFS 实际物理释放；本轮的卷级空间观测受其他构建活动影响，不作本轮归因。

### 清理后状态与保留项

- 最终核对 133 个目标路径均不存在；四个父 linked worktree 均仍存在、Git 登记仍在、各自 `git status --porcelain --untracked-files=all` 为 0 项，HEAD 分别仍是 #3 `550dead055689154359a3406dfce4f0c91c1dad3`、#10 `768bbd82fcc52a873168b39a8382d2f14c928abc`、#11 `7ce4ef2d9e5b7ad2f3b693383f58f311e5a1684f`、#18 `c7a1af7d7b2e125368b29975867b4d392690fc38`。Git worktree 列表有 20 项、无 `prunable` 项。
- #5、#8、#15、#17、#21 的当前/恢复路径及 #21 的旧 checkpoint `d2e1a656df73f5afd7d91060c2f7e4b4fd1ebcf5` 均复核存在；只做了路径存在检查，没有读取或变更其内容。四个父 worktree 内其余未映射材料和独立浅克隆 `C:\Users\xurx\.tds\workspaces\01a116f7-1027-7c75-90df-32ebc5488752\.tmp\g1-shallow-layout` 继续保留；其 143 个 tracked 删除项、25 个未映射剩余文件以及来源/活动引用缺口沿用上一节限制，父目录干净状态不覆盖该 clone。
- 本阶段未清 Docker 资源、未删除父 worktree 或分支、未打包未知材料，也未运行产品测试。旧历史阶段中逐项保全不可独立复核的限制继续有效；本轮缓存清理不表示整项历史资源清理全部完成。

机器可核对的本阶段完整清单与核验值见同目录 `historical-worktrees-2026-10-08.json` 的 `followupCleanup.generatedCacheCleanup`。本阶段采样时间用 UTC；预检与删除前复核时间逐项保存，报告结束时刻以工具时钟读取 `2026-10-08T10:57:57Z` 记载。

## 2026-10-08 后续材料核对与保留决定

本阶段先刷新平台 Todo 列表，并将 WorkMesh `main` 更新至 `96e724858e692d262107c34db50b40c3ae7c122c`。读取时 #52 清理任务为 `building`；#5、#15 为 `building`，#17 为 `review`，#21 为 `implement_reviewing`，#9 为 `confirm`，#8 为 `done`。按用户指示，即使 #8 已完成仍保护其旧 dirty 材料；#5/#8/#9/#15/#17/#21 的当前与恢复目录均未作为候选。新增 #9 工作区 `C:\Users\xurx\.tds\workspaces\01a11b27-cfac-7ea4-a461-8eef51b750fe` 纳入保护清单。此次读取后没有对这些目录执行路径扫描、内容读取或删除。平台 Todo 刷新与机器列表读取的精确采样时刻未保存；本节结尾工具时钟读数为 `2026-10-08T11:21:50Z`，不将其倒推为 Todo 读取时刻。

### 已映射的 CRLF 副本

- #10 `.tmp` 中六份 D0 `upstream` 日志均有逐文件原始 SHA-256、字节数、D0 `upstream-scope-verification.json` 中对应命令/成功退出码/原始日志哈希，以及仅将 CRLF 转为 LF 后匹配的最新 main 路径与 Git blob ID。逐项值见 `docs/reviews/cleanup/.duplicate-evidence-stage-2026-10-08.json`。原始会话记录显示：删除前预检在第 2473/2477 行（调用 `call_649a530f1c5b4b88a33389796d5a9663`，`11:14:54.422Z`–`11:14:59.372Z`）；删除调用的输入/返回在第 2496/2498 行（调用 `call_5b40b1d9ba8a4b399bf78894b63e9bd9`，`11:15:45.689Z`/`11:15:45.796Z`）。返回原因为 `rejected: blocked by policy`：PowerShell 未启动、退出码 `null`、目标仍在，且没有换方式重试。清单中当前 `pathSafetyPreflight` 字段是在拒绝后才补存：第 2523/2526 行（调用 `call_96b6e92abbc94fe9a1cc1b1930395500`，`11:16:44.681Z`–`11:16:48.674Z`）；它只反映拒绝后的复核，不冒充拒绝前状态或之后的删除授权。原始记录路径和字段时序详见机器清单。
- #18 `.tmp\g1-vitest-config-original`（752 字节）仅在 CRLF→LF 后匹配 `vitest.integration.config.ts`；原始 SHA-256 为 `ca9031eca23a729d89184c49246b8f1891c784382293cc91ac7ad25b58b3ccfe`，19 对 CRLF，未见独立 LF 或孤立 CR。文件名与内容不足以判定它是临时备份还是 G1 验证基线输入，因此保留。
- 未为日志、配置或其他证据新建归档。D0 六份日志已有主线原文可恢复；其余失败/验收材料尚未逐项确认必要性、已有归档成员或安全脱敏方法。未将认证状态、trace 或未知材料打包进仓库。

### 浅克隆复核及独立审查候选

对精确路径 `C:\Users\xurx\.tds\workspaces\01a116f7-1027-7c75-90df-32ebc5488752\.tmp\g1-shallow-layout` 重新读取 Git 状态：独立浅克隆，HEAD `002c1d61a7fc5d529b2d480f4c48716971c4236d`，`--is-shallow-repository=true`。祖先方向是 clone HEAD → main：`git merge-base --is-ancestor 002c1d61a7fc5d529b2d480f4c48716971c4236d 96e724858e692d262107c34db50b40c3ae7c122c` 退出码 0；反向命令退出码 1；`git rev-list --left-right --count 96e724...002c1d6` 为 `26 0`。仅发现该构建分支及同值远端跟踪分支，没有本地独有提交；1,607 个 HEAD tracked 路径中，工作区状态恰为 143 个 tracked 删除、无修改、无未跟踪、无 ignored。文件映射显示 143 个删除路径均能从 clone HEAD blob 恢复，并均存在于 main 对象树（140 个 blob 相同、3 个不同）；clone 当前 1,464 个 tracked 文件可从其 HEAD 恢复，现存机器清单记录其中 1,439 个 CRLF→LF 可映射到 main、25 个未映射。由于工作区状态只含 143 个删除项，其余 1,464 个文件都与 clone HEAD 一致；25 个没有映射到当前 main 的文件仍由 clone HEAD 保全，不是独有源证据。旧清单保存了 143 条删除路径及两侧 blob，不曾恢复这些删除。此次测得克隆文件字节数为 33,477,910；未测卷级配对空间变化。

G1 的 `g1-shallow-read.mjs` 将此目录设为隔离布局测试 cwd，main 中也有归档浅克隆验证记录；这是已知的独立测试用途。原始回执第 2548 行记载一次历史采样 `reparsePoints=0`、`processReferences=0`；本轮 `11:37:40Z` 当前命令行引用查询也为 0，路径解析与链接检查为 0。该查询不覆盖平台内部构建引用或之后的 fixture 用途，因此这些引用仍需在实际回收前重读。基于用途与剩余引用缺口，克隆按用户要求保留为独立审查候选，不以父 worktree 的干净状态覆盖其删除，也不执行去重或删除。精确路径、当前 Git 状态、143 条路径/对象映射仍在机器清单 `followupCleanup.reviewerFollowupAudit.independentClone`。

### 其他剩余材料与阶段结果

三个 `.tmp` 根的清单仍逐文件列有绝对路径、字节数、原字节/CRLF→LF 的 main blob 比较结果、分类和该文件缺少的具体输入。它们分别有 1,649（#10）、283（#18，排除独立克隆）和 1,496（#11）个普通文件。D1a 主线 `docs/reviews/d1a/artifact-manifest.json` 声明的主线脱敏 trace ZIP 经逐字节核验后，三处解包 trace 目录中 1,406 个文件、45,315,262 字节与 ZIP 成员完全相同；每项本地 SHA-256、成员路径/大小/SHA-256、ZIP 的 main blob `02c663b7dbdd3c39c891adb99a6908b33bef4ccd` 和 ZIP SHA-256 均见 `d1a-trace-zip-mapping-2026-10-08.json`。例如 `d1a-stage0-trace-env07-2\0-trace.network`（1,501 字节）与成员 `0-trace.network` 逐字节相同。此映射把这些文件列为**完成最新任务/构建引用与逐路径安全复核后**可回收候选；本轮未删除它们。

D1a `.tmp` 总清单有 1,496 项；扣除上述 1,406 个精确映射后，余 90 项、50,817,433 字节，且对这些 90 项与 ZIP 再比对后没有额外的逐字节命中。机器映射 JSON 为每项保留路径、大小、SHA-256、已有 ZIP 同名成员信息、分类与 `neededInput`。其中 15 项位于三个解包目录但未与 ZIP 成员逐字节相同；4 个资源名在 `trace-redaction-report.json` 中逐项映射到脱敏后成员（8 份本地拷贝），报告还记录 ZIP CRC 已验证且剩余敏感字段/原始敏感值计数均为 0。其余 7 个 trace/network 文件虽有同名脱敏成员，仍缺逐文件脱敏变换映射，暂保留。其余 75 项在三个解包目录之外，按机器清单列明的具体冻结 manifest、归档成员或 owner 决定缺口保留。当前 `11:39:04Z` 对 1,406 个映射文件重新校验路径、字节数、SHA-256，全部一致且沿途无 reparse point；`11:40:26Z` 对父构建根的本地命令行引用查询为 0。该快照不替代删除当刻的引用和路径复核，也不覆盖平台内部构建引用。

同批 Todo 刷新及紧邻工具时钟 `11:36:44Z` 显示 #5/#15/#17/#52 为 `building`、#9 为 `confirm`、#21 为 `review`；#11 为 `done`，#8 为 `done` 但仍按指示保护旧 dirty 材料。活动任务均未被中断，#9 及其余活跃/恢复工作区没有作为本轮清理对象。

本阶段没有执行成功的文件删除、归档或 Docker 操作，新增释放量为 0 字节；D0 删除调用的自动审批拒绝已如实记录，没有绕行。四个父 linked worktree 均保留；未映射的 D0/D1a/G1 文件和独立浅克隆均保留。旧批 2,268 项的逐项保全不可独立复核限制不变，133 项缓存清理回执不变。由于仍有需独审的克隆回收依据和无法判定的具体材料，本报告只提交本阶段的审计结果，不表示整体清理完成。

## 2026-10-08 D1a 精确归档副本回收阶段

本节记录上述“后续材料核对”阶段之后的独立操作；前节的“未执行成功删除”仅描述当时审计阶段，不覆盖此后本节实际执行。独立审阅已确认 D1a 映射可作为回收候选，要求删除前重新核对最新任务、构建引用、逐路径安全和哈希。本阶段只删除 #11 D1a 构建 `.tmp` 中已在最新 main 脱敏 ZIP 逐字节保全的普通文件，不删除三个目录、父 linked worktree、分支、浅克隆、剩余 90 项或任何受保护 workspace。

### 操作前刷新与逐项依据

- 用只读 `git fetch origin main` 更新项目主线后，`FETCH_HEAD` 为 `96e724858e692d262107c34db50b40c3ae7c122c`；同一主线 ZIP `docs/reviews/d1a/evidence/reverification-environment-07/e2e-failure-captures/trace-sanitized.zip` 的 Git blob 为 `02c663b7dbdd3c39c891adb99a6908b33bef4ccd`，SHA-256 为 `00fe3854f1cb7de42482d2b9cab730af697fb115629719f0850df7d43aaa9ca5`，大小 14,776,952 B。它是本次 1,406 个候选文件逐字节匹配的保全来源。
- #11 Todo（`IJQA_DfxU0hF5e8L5Xb3v`）刷新为 `done`。每批操作前刷新活动 Todo；执行期间 #5/#9/#15/#17/#21/#52 仍为活动项，均未暂停或中断。首个 10 项批次前读取了 Todo 和本机进程引用；随后在其余批次前及结束核验前查询活动构建对话，均未找到三个目标 trace 根的精确路径引用；本机进程命令行对三个根的查询也为 0。最后快照（`2026-10-08T12:01:08.8724587Z`）显示 #5 `building`、#9 `planning`、#15 `review`、#17 `building`、#21 `review`、#52 `building`；#8 虽为 `done` 仍按要求保护。
- 目标的完整绝对根路径为：
  - `C:\Users\xurx\.tds\workspaces\01a1187a-f4ff-735d-814f-a7b26f8cfdc5\.tmp\d1a-stage0-trace-env07-2`
  - `C:\Users\xurx\.tds\workspaces\01a1187a-f4ff-735d-814f-a7b26f8cfdc5\.tmp\d1a-trace-07`
  - `C:\Users\xurx\.tds\workspaces\01a1187a-f4ff-735d-814f-a7b26f8cfdc5\.tmp\d1a-trace-07-round2`
- 操作前整组核对时刻为 `2026-10-08T11:52:38.7922077Z`：1,406/1,406 个精确映射路径仍存在，大小与 SHA-256 全匹配（45,315,262 B）；解析路径都在指定 WorkMesh workspaces 内，路径链 0 个 reparse point，三个根的进程命令行引用为 0。C 盘当时可用 357,786,767,360 B。
- 每个文件操作前再次检查路径在其映射 sourceRoot 下、路径链无 reparse point、仍是同一普通文件、大小/SHA-256 仍等于归档成员，并能以独占只读方式打开。命令只作用于单个精确文件：`Remove-Item -LiteralPath <exact path> -ErrorAction Stop`，没有递归删除、`-Force`、通配或换 shell。

### 操作、回执与结束核验

- 1,406/1,406 个精确归档副本删除成功；每项 `Remove-Item` 退出码均为 0。删除文件原始枚举长度合计 45,315,262 B。每个文件的绝对路径、Todo #11/workspace 归属、resolved path、ZIP member path、SHA-256、操作结果、退出码和删除后存在性见 [`d1a-trace-cleanup-receipts-2026-10-08.json`](d1a-trace-cleanup-receipts-2026-10-08.json)；原始逐行回执和字段更正见同目录 `.jsonl` 与 `d1a-trace-cleanup-receipt-corrections-2026-10-08.json`。
- 首 10 项的原始回执把操作后写入的时间字段误标为 `preflightAtUtc`。没有将其冒充为操作前时间：原始 JSONL 保留不改，规范清单将这 10 项逐项预检/操作时间记为未知，提供实际可观察的时间界限和更正表；其余 1,396 项记录了逐项预检、操作、结果写入的精确 UTC 时间。每项实际操作结果均由路径消失和退出码 0 确认。
- 结束核验 `2026-10-08T11:59:23.5308402Z`：1,406 个映射路径全部不存在，回执 1,406 行、0 重复路径、0 异常；剩余 90 项（50,817,433 B）仍存在且逐项大小/SHA-256 与原清单相同。三个 trace 目录保留非精确匹配文件共 15 个，分别 7/7/1 个；其余未映射项及具体缺少的证据仍依原 mapping 清单保留。
- 四个候选父 worktree #3/#10/#11/#18 在 `2026-10-08T12:02:12.0928747Z` 仍存在、仍登记在 Git，`git worktree list --porcelain` 返回 20 项且 0 项 `prunable`；四个父目录 `git status --porcelain=v1 --untracked-files=all` 都是 0 行。该检查证明本次 `.tmp` 文件删除没有移除父 worktree；#2 的父目录仍按之前已完成阶段记录为不存在。浅克隆 `g1-shallow-layout` 仍保留，未逐文件去重或删除。
- #5/#8/#9/#15/#17/#21 及 #21 的旧 checkpoint workspace 本阶段均存在；没有读取或修改这些受保护目录。没有变更 Docker 容器/卷/网络/镜像，没有删除分支，也没有移除其他候选父 worktree。
- C 盘可用空间样本：操作前 357,786,767,360 B（11:52:38Z），操作后 357,656,641,536 B（11:58:28Z），结束复核 357,750,951,936 B（11:59:23Z）。并行构建期间卷级空间净差为减少 35,815,424 B，无法归因于本次删除；只报告可核验的文件枚举长度 45,315,262 B，不声称这就是物理或净释放空间。

本阶段没有运行产品测试。历史批次 2,268 项逐文件保全不可独立复核的限制不变；133 个缓存回收原始回执也不改写。剩余 90 项、四个父 worktree、浅克隆、D0 拒绝项及未知材料仍需各自的归属/用途/活动引用依据。本次只完成已逐字节保全的 D1a 重复副本回收，**整体历史清理仍未完成**。

## 2026-10-08 剩余验收材料映射与 G1 浅克隆用途复核

本阶段只补充证据，不删除文件、克隆或父 worktree。记录机器为 DarkFlame（`6DOlLniZ0sqBYGHeIhRMq`）；只读 fetch 后 main 为 `96e724858e692d262107c34db50b40c3ae7c122c`。末次可读 Todo 快照：#52 `building`、#5 `implement_reviewing`、#9 `planning`、#15/#17 `building`、#21 `review`；#11/#18 `done`。#8 虽为 `done` 仍受保护。受保护当前/恢复路径及四个父候选目录再次检查均存在，未读写其内容。

### D1a 的 90 项剩余清单

末次逐路径重核 90/90 个文件仍存在，大小和 SHA-256 与原清单一致，合计 50,817,433 B。机器补充清单 `remaining-materials-review-2026-10-08.json` 引用原逐路径清单 `d1a-trace-zip-mapping-2026-10-08.json#remainingD1aTmpInventory`；后者逐项保留 90 个绝对路径、大小、SHA-256、同名 ZIP 候选与 `neededInput`。

- **8 份资源 JSON 副本**（4 个原名分别位于两个解包目录）已按当前 main 的 `trace-redaction-report.json` 逐项核对。每个本地资源与原始 ZIP 的对应成员字节相同，原始成员名到脱敏成员名的映射、源/目标大小及 SHA-256 都已落在机器清单。报告中的映射为：`0fc850b1775d3c97277a3def3ae5756cd44cf49f.json` → `a0eaa9aab07a906e34e1d14c1224957824da6afc.json`；`428d3ad4971b1acb104802eff03cfb3d45ef6306.json` → `2f350d735635dc137f0f2354c603e5c09ac856d3.json`；`b013c45627a222c7fa334f5ee3120f9cd7341c75.json` → `a0eaa9aab07a906e34e1d14c1224957824da6afc.json`；`bd8d6e80fe0bafec4eb1761ba8bcad1d3fcd55d0.json` → `8176e305fe436a5173990ad29d06e4893f7c57ba.json`。main 的脱敏报告 blob 为 `f06c182a55446c9c734176320efbc54c17d5d5e9`，SHA-256 为 `2dba2ed6cb6df230b0d7d092f94bc434059d0a579f34fb66e6b63b363c712d80`；报告标记 CRC 已验证、脱敏归档中敏感字段及捕获原值均为 0。两份 `.tmp` 原始 ZIP 副本也逐字节相同（各 14,795,293 B，SHA-256 `da1d1efca68c47db0c1e7de6c856294f3af2c03778e01556de2298484113a27e`，491 个成员、CRC 正常）；按现存脱敏逻辑在内存重建的结果 SHA 与 main 脱敏 ZIP 相同。原始 ZIP 可能含敏感值，仍留在原路径，未复制到仓库、未删除。
- **4 个 `.network` 文件**（两个来源各有相同字节副本）已用现存 `.tmp\sanitize-d1a-trace.py` 的脱敏逻辑及 main `trace-redaction-report.json` 中的资源重命名，在内存逐文件复算；四个结果均与 main 脱敏 ZIP 同名成员逐字节相等。来源 SHA-256 分别为 `1-trace.network` 的 `1b210fb6…`（569,068 B）与 `2-trace.network` 的 `78e4acab…`（166,758 B）；映射后 SHA-256 分别为 `e4735b4c…`、`919f88b0…`。脚本 SHA-256 为 `0e006dcca770f1b79cec36d62d83d853976751d6a3b9e0a70c959967e23595df`，脱敏报告 blob 为 `f06c182a55446c9c734176320efbc54c17d5d5e9`。这 4 个路径及 8 份资源 JSON 副本列为**条件回收候选**，须在实际删除前刷新任务/build 引用并做路径、链接和锁检查；本阶段没有删除。
- **3 个 `1-trace.trace` 文件**源内容彼此逐字节相同（各 1,022,701 B，SHA-256 `17761d45…`）。同样应用脱敏及重命名后，结果为 1,022,617 B、SHA-256 `1d215abb…`，与 main ZIP 中 1,022,635 B、SHA-256 `f3f6c0c7…` 的成员有 2 处语义差异，均在行 85、87 的 `snapshot/html/.../__playwright_value_` 字段；值未复制到报告。最小保留量为 1 份原始 trace 作为精确快照证据，另外 2 份字节完全相同的副本仅可在重核活动引用和路径安全后作为条件重复项回收。原始敏感 ZIP 不归档入仓库。
- **其他 75 项中，1 项已有历史 Git blob 保全证明**：`.tmp\d1a-git-evidence-audit.json`（316,012 B，SHA-256 `5c4f576f3386bafbfdfe7f85c5492740b17597ae116f1a902963e2ab85338442`）与 main 可达提交 `58d59ed85002da637aaeaa6bf98915d4a6ba918c` 的 `docs/reviews/d1a/evidence/git-blob-hashes.json` 完全相同，blob 为 `414dfe920c54f68ca1a2f246f1fcdd82e43767bb`；该提交是 `96e7248` 的祖先（`merge-base --is-ancestor` 退出码 0）。此单项列为条件回收候选。其余 **74 项**共 45,960,098 B，逐项核对了原清单路径/SHA、D1a `artifact-manifest.json`、`evidence/reverification-index.json`、`evidence/check-index.json`，并扫描 main `96e7248` 可达对象（8,133 条）及归档成员；没有发现逐字节 Git blob、CRLF 归一化或 ZIP 成员映射。机器清单现在逐路径记录观察到的用途、已查证来源和仍缺的确切证据：脚本需生产/调用记录及替代版本映射；Playwright 页面与截图需 run ID、用例/viewport 和验收附件索引；日志需命令、退出码及脱敏结论；patch 需 PR/base/head 与提交覆盖关系；索引/JSON 需冻结 manifest 和持久 blob/member 对照；剩余原始 ZIP 继续原地保留并需敏感数据处置依据。没有根据扩展名断言唯一或可重建，也没有把未知数据打包入 repo。

### G1 独立浅克隆的用途与当前回收边界

目标为 `C:\Users\xurx\.tds\workspaces\01a116f7-1027-7c75-90df-32ebc5488752\.tmp\g1-shallow-layout`，父任务 #18 G1 已 `done`，父 worktree HEAD `c7a1af7d7b2e125368b29975867b4d392690fc38` 且 `git status` 为 0 项。该目录有独立 `.git`，是 shallow clone，不是父仓库的 linked worktree。静态检查同目录夹具 `.tmp\g1-shallow-read.mjs`（2,457 B，SHA-256 `ef4c368b093f293ccbc77cd4f31e86492a1188f5b091ac0e0642719c39b84294`）将该 clone 设为 cwd，临时复制三项已提交输入，再检查 shallow 状态、旧日志 blob 不可用及归档读取结果；本轮没有运行夹具。三项输入均在 G1 worktree 与 main 上具有相同 Git blob：

| 仓库路径 | 字节数 | 工作区 SHA-256 | main Git blob |
| --- | ---: | --- | --- |
| `scripts/verify-raw-evidence-archive.mjs` | 9,722 | `f6a8289a15ad68c52a3f254dfe804aaafe3039bdb33279d9def3ee3561fd4131` | `b32919f321b8d42913e7e476989f1c8f389327dd` |
| `docs/evidence/build-input-reachability.current/raw-evidence.zip` | 2,339,178 | `58b9cb552d7cf8ef80b8604d0c2633b8ac3d53ab4389295832b632706ef4584b` | `1875e8935dee1d406616f6d5e799d4acc739041a` |
| `docs/evidence/build-input-reachability.current/raw-evidence-index.json` | 140,663 | `cd05ecfe6ee4ccde8b2af72ebb378e130486b572ea2cb79a281a1fa4d9d60162` | `f5c477c404645a070d5ae7e9aafb6c744da8decb` |

当前 clone HEAD 仍为 `002c1d61a7fc5d529b2d480f4c48716971c4236d`；其 143 个 tracked 删除不构成独有源，已有审核记录表明 143 项可由 clone HEAD 恢复、其中 140 项 blob 与 main 相同、3 项不同；现存 1,464 个 tracked 文件也都可从 HEAD 恢复。本轮遵用户要求，不重做祖先方向核验，不恢复或逐文件去重。刷新后的可读活动 Todo 对话（#5/#9/#15/#17/#21 与 #52）没有命中该 clone/fixture 的精确路径；本机其他进程命令行引用为 0。绝对路径解析位于 WorkMesh workspaces 内，G1 根、`.tmp` 和 clone 本身均无 reparse point；clone 当前 143 项状态均为 tracked deletion，untracked/ignored 均为 0，只有一个本地 HEAD 分支。

现有证据已足以将该 clone 列为**下一阶段条件回收候选**：它属于已完成的 G1 #18 历史 shallow-layout 夹具；夹具及 3 项输入有静态来源/主线 blob 对照；143 个删除路径可由 clone HEAD 恢复，25 个未匹配当前 main 的文件也存在于 clone HEAD，没有发现额外未跟踪文件或 local-only 分支/提交。可读 Todo/chat 与本机进程命令行当前未见此精确路径引用。`openfiles /query /fo csv /v` 退出码 1、`handle.exe` 不存在、`.git/index.lock` 不存在及无独立全局 registry 查询均为检查边界，不再作为硬门禁，也不表示已枚举全局句柄；四个父 worktree 仍保留。本阶段不执行 clone 删除。

下一阶段若执行该候选，先刷新机器、Todo 与可读 build 引用；保存 clone 全部路径/大小/哈希及来源清单；再次解析绝对路径，确认严格位于指定 WorkMesh `.tmp\g1-shallow-layout`，逐段检查根目录、父项、clone 子树没有 root 误指向或 reparse/junction 跳转；对将删文件逐个做原生独占打开/锁状态和 ACL/删除权限检查。任一文件被占用、权限不足或路径/链接验证不通过，就保留相关项并记录原因；全部预检通过才用 PowerShell `Remove-Item -LiteralPath <已核验绝对路径> -Recurse -ErrorAction Stop`，不加 `-Force`。记录命令退出码、异常、每个残留路径和删除后根路径状态；失败不改用别的删除方式，不要求全部任务空闲，也不等待不存在的全局句柄接口。

### 本阶段结果及保留边界

本轮删除 0 个文件、未新建原始证据归档、Docker 未变更、未移除四个父 worktree、未移除浅克隆；新增可核释放量为 0 B，未运行产品测试。D1a 现有 13 个条件回收候选（8 资源副本、4 network 副本、1 个有历史 Git blob 保全的 audit JSON）和 2 个重复 trace 副本都须先重核引用/路径安全；3 个 trace 至少保留 1 份，另外 74 项按路径保留，两个原始 ZIP 原地保护。#5/#8/#9/#15/#17/#21 当前和恢复目录以及 #21 旧 checkpoint 继续保留；D0 六个已被策略拒绝的目标没有换方式重试。旧批 2,268 项逐项保全不可独立复核的限制、133 个缓存与 1,406 个精确副本的已审回执均不改写。四个父 worktree 仍留存；本报告不表示整项清理完成。

机器可核对补充清单：[`remaining-materials-review-2026-10-08.json`](remaining-materials-review-2026-10-08.json)。原 D1a 90 项路径清单：[`d1a-trace-zip-mapping-2026-10-08.json`](d1a-trace-zip-mapping-2026-10-08.json)。
