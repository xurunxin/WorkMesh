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
