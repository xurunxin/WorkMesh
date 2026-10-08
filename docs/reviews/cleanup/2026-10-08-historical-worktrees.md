# WorkMesh 历史 worktree 与测试资源清理记录

记录时间：2026-10-08 17:32（Asia/Shanghai）  
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

## 2026-10-08 续核与增量回收（Chief反馈后）

记录时间：2026-10-08 18:10（Asia/Shanghai）。执行前重读活动 Todo：#5/#8/#15/#17 为 `building`，#21 为 `review`；#3/#10/#11/#18 为 `done`；本清理 Todo #52 为 `building`。DarkFlame 在线，tds 0.1.60。`origin/main` 实读为 `1078bbcd527550bfabee73093b7ffd0032d3fd24`；本轮没有清理远端或本地分支。

### 对照方法与差异

逐个读取候选 `.tmp` 原始文件字节，按 Git `blob <size>\0<bytes>` 计算 object ID，与 main 的实际 `git ls-tree` blob ID 比较；再把候选文件与 main 的 D0/D1a/G1/R1 压缩证据逐成员解压并逐字节比较。只在对象 ID 或压缩成员原始 bytes 一致时删除重复副本。这个比较不把 CRLF 工作树字节误当成 Git blob，也不以 manifest 内的摘要字段单独证明覆盖。引用的主线映射：D0 基线 `manifest.json`、`historical-assets.json`、`final-evidence-audit.json`；R1 `ci381/evidence-index.json` 与 `execution-logs/raw-checks-index.json`；D1a `artifact-manifest.json`、`ci385-raw-evidence/raw-evidence-index.json`；G1 `raw-evidence-compatibility.json`、`raw-evidence-index.json`。压缩成员实际比对范围见机器清单。

| Todo | 清理前待比对文件 | 与 main Git blob 原字节一致 | 与 main ZIP 成员逐字节一致 | 本轮仍保留的差异 |
|---|---:|---:|---:|---|
| #10 D0 `.tmp` | 2,657 / 250,934,755 B | 999 / 54,016,759 B，已删 | 9 / 85,212 B，已删 | 1,649 个文件 / 196,832,784 B；包括 `d0-capture-2.log` 至 `d0-capture-6.log`、诊断和失败日志，未能与主线证据建立逐字节映射 |
| #11 D1a `.tmp` | 1,988 / 124,224,234 B | 452 / 27,704,246 B，已删 | 40 / 387,293 B，已删 | 1,496 个文件 / 96,132,695 B；包括 `d1a-stage0-trace-env07-2\0-trace.trace`、`d1a-trace-07\0-trace.trace`、`d1a-trace-07-round2\0-trace.trace`、`pr-origin-main-diff.patch` 及未映射浏览器输出 |
| #18 G1 `.tmp`（已先移除5个嵌套 worktree） | 2,542 / 192,673,878 B | 555 / 32,003,405 B，已删 | 213 / 77,310,330 B，已删 | 1,774 个文件 / 83,360,143 B；剩余 `g1-list/root-mixed/html-report/index.html`、Playwright 报告/trace 和未映射 output 保留；已归档完的 `g1-original-freeze` 空目录以非递归方式移除 |
| #3 R1 `apps/web` 测试产物 | 报告 612,374 B；截图 132,730 B；`.last-run.json` 45 B | 截图无 main blob 精确匹配 | 与 R1 `raw.redacted.zip`、`readable-source.redacted.zip`、`trace.redacted.zip`、`raw-checks.zip` 共 176 个成员逐字节比较，0 匹配 | 唯一 screenshot 与 HTML 报告保留；缺少精确归档映射，不能以同名或相近用途替代 |

D0 另有两个 956 B 的 recovery JSON 文件与 main blob 原字节一致后删除。D1a 的 `d1a-bound-d0-40a51b`（100/100 文件、1,622,317 B）及 `d1a-d0-replay`（100/100、1,622,293 B）逐文件与 main 报告映射相同后删除；`trace-sanitized-rebuilt.zip`（14,776,952 B）与 main ZIP blob 相同后删除。两个空 diff-check 日志与 main 空日志 blob 相同后删除。上述项目均在机器清单列出精确目标路径与证据。

### 已执行操作

- #18 的五个嵌套 linked worktree 按注册顺序用 `git worktree remove <精确绝对路径>` 正式移除，没有 `--force`。五个 HEAD 均为 main 祖先、工作树修改/未跟踪/ignored 项均为 0、无活动进程引用；每条命令退出码 0，移除后路径与登记都不存在。合计枚举文件 `156,035,333` B。父 G1 worktree仍保留。
- #3 R1 的 `apps/web/.next`（731,301,061 B）、`dist`（1,174,940 B）、`.turbo`（29,316 B）为忽略的可重建输出，无链接项、无已跟踪文件、无运行进程引用；分别以受控绝对路径 `Remove-Item -LiteralPath -Recurse` 清理，PowerShell 命令返回成功且路径不存在。R1 主 worktree因唯一 screenshot/report 未删。
- 清除 #10 两个、#11 四个、#18 八个旧 Playwright `.auth/admin.json` 临时状态，共 22,762 B；未读取或归档文件内容。#3/#11 主 `test-results/.auth/admin.json` 的各 1,625 B 清理在上一记录中已完成。
- 按实际 Git blob 内容去重批量删除 #10/#11/#18 `.tmp` 内共 2,006 个文件（113,724,410 B）；按压缩归档成员原始 bytes 去重又删除 262 个文件（77,782,835 B）。需要披露：这两次批处理的执行包装没有返回逐文件操作回执；因此机器清单记录了候选绝对作用域、比较规则、计数、字节、索引/归档来源，但没有完整逐文件路径数组。不能把它描述成逐文件收据完整；所有删除内容当时均与 main 的实际 Git blob 或 ZIP 成员完整字节相同，原证据仍可从对应持久来源读取。
- 本轮所有可量化枚举删除共 `1,098,094,131` B。C 盘可用空间本轮开始 `360,395,075,584` B，结束观测 `361,195,458,560` B，净增加 `800,382,976` B；期间其它任务和 Docker 服务仍活动，因此只报告观测净变化，不冒称精确物理释放。

### 结束核验与保留原因

#3/#10/#11/#18 四个父 worktree 仍存在、Git 登记存在、`git status --porcelain --untracked-files=all` 均为空；#18 五个嵌套 worktree 登记均消失，当前没有 `prunable` 条目。#5/#8/#15/#17/#21 当前目录与 #21 的旧 checkpoint 路径均仍存在。候选根 worktree未全部删除：D0/D1a/G1仍有数量可列、但未映射到持久 Git blob/ZIP 的材料；R1留有未归档唯一截图和报告。后续若要删除这些父目录，需要先取得逐文件逻辑映射或对这些精确材料的处置结论；本轮不据 `done` 状态推定它们可删。

Docker 未新增清理；本轮未运行 `docker prune`，未触碰共享服务/镜像/卷/网络，也未运行产品测试。项目主线未改动；报告与清单仅在本清理构建分支。

机器可核对后续差异、嵌套 worktree 退出码、缓存与认证状态清理、最终核验及限制见同目录 `historical-worktrees-2026-10-08.json` 的 `followupCleanup` 字段。
