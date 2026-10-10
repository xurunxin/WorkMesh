# 2026-10-11 WorkMesh 已合入工作树清理报告

本轮完整回收 **1 个**已实际合入、无可见活动/恢复引用且所有成果可恢复的旧工作树：#53 `01a11e5e-9e0c-704b-a590-3fee492f4f6a`。正式 `git worktree remove` 退出码 **0**，目录和登记已不存在，本地分支仍保留。其他候选按逐目录决定保留。本轮没有删除远端分支、标签、审计记录、Docker 资源、共享 store、镜像、业务数据或他人服务，也没有改产品代码。

## 实际来源和范围

- 实机：DarkFlame，`6DOlLniZ0sqBYGHeIhRMq`；Windows，`tds status` 实读 daemon running、PID 34940、版本 0.1.61。本轮未升级或管理 tds。
- 根：`C:\Users\xurx\.tds\workspaces`。本轮只扫描已确认 origin 为 `https://github.com/xurunxin/WorkMesh.git` 的 26 个直接构建子目录；不跟随 reparse/junction。主仓库、注册在根外的 G1 临时 worktree 只核登记/HEAD/存在性，未递归扫描或删除。
- 当前清理构建：`01a126be-7aba-7b1d-a57a-f58317f89a67`，分支 `tds/conv-01a126be-7aba-7b1d-a57a-f58317f89a67`。
- 真实远端 main：`87f88b89297c5c1e346f7ef99118c410f4b4a905`。执行前独立调用 `ls-remote origin refs/heads/main`，工具时钟范围 **2026-10-10 17:05:55–17:05:57 UTC**；原输入/返回见 [remote-main-execution.json](remote-main-execution.json)，完整原调用见 [original-tool-receipts.json](original-tool-receipts.json)。没有拿共享 FETCH_HEAD 或旧 origin/main 冒实时 main。
- #52 真正 main 内 19 份历史清理报告/清单/原拒绝证据已完整读取，逐文件绑定 Git blob、Git 字节/哈希与 Windows 字节/哈希，见 [historical-sources.json](historical-sources.json)。历史缺逐项回执、缺 reflog 和旧 FETCH_HEAD 证明限制不补造。
- 使用本卡 Todos＋仓库留痕；本轮没有真实 WorkMesh MCP 控制面工具，不伪称创建 WorkMesh Project/WorkItem 或远端活动记录。执行用户本卡已经授权的本机运维，不新建 todo、不重新 withPlan、不设定时任务。

## 唯一实际移除目标

| 项目 | 实测与证明 |
|---|---|
| Todo | #53 `c2myb8a18ksdT50jkJnb8`；当前 phase done 仅作旁证 |
| 精确目标 | `C:\Users\xurx\.tds\workspaces\01a11e5e-9e0c-704b-a590-3fee492f4f6a` |
| 类型、分支 | registered linked worktree；`tds/conv-01a11e5e-9e0c-704b-a590-3fee492f4f6a` |
| HEAD | `f5a665407f0ff3e6dab84932bcb7d49d56468e42` |
| 合入证明 | 对精确 remote main SHA 的 `git merge-base --is-ancestor` 退出 0；源 commit 下每个路径的 blob 原字节完整读取 |
| 文件保全 | 2,502 个成果文件完整逐 path 映射；402 个 identity，2,100 个明确 LF→CRLF 变换，0 个未映射。另一个 `.git` 为本地登记指针，完整内容/长度/哈希单列 |
| 目录逻辑长度 | **151,693,775 B**（约 144.67 MiB）；包括登记指针 |
| 工作区检查 | status、untracked、ignored 为空；末次完整扫描 2,503 文件、0 链接、0 嵌套 Git、0 扫描错误；全部祖先无 reparse point |
| 引用检查 | 删除前刷新全板、#58 与 #5 当前可读对话，未引用目标；Win32_Process 非自命令行引用 0；2,502 个成果文件逐值哈希重核并独占只读打开成功 |
| 先行提交 | **`dacefe0effa38924edc6bc6897d912476d3457a1`**，预检及保全来源提交/推送成功后才执行；见 [preflight-push-receipt.json](preflight-push-receipt.json) |
| 实际操作 | `git worktree remove <上述精确目标>`，从本清理构建执行，无 `--force`、无属性/ACL 修改、无替代删除 |
| 文件操作起止 | **2026-10-10T17:06:34.3731307Z–17:06:35.3679031Z**（北京时间 2026-10-11 01:06:34–01:06:35） |
| 原输出、exit、结果 | Git 原输出为空；exit 0；路径不存在、登记消失、本地分支仍在 |

逐文件 Git 对象、Windows 原字节双哈希和明确重建规则见 [preservation-53.json](preservation-53.json)。CRLF 变换由逐文件原值比较验证；不是只存归一化 hash。二进制和其它原字节相同项按 identity 恢复；没有未处理 BOM/二进制差异。Git 行政指针不当作产品成果归档。

完整删除工具输入/返回见 [execution-tool-receipt.json](execution-tool-receipt.json)，内部原命令、实际起止、exit 和逐目标结果见 [execution-53.json](execution-53.json)。真实调用 ID `call_47eafc1226ca4383a586cebce37d1059`；源 JSONL 第 **200/204** 行为完整派发/返回原件。派发 `17:06:28.307Z`、返回 `17:06:35.505Z` 与实际 Git 操作时间分列，不把它们混用。

本轮删除调用 1 次、成功 1 次、失败 0 次、自动审批拒绝 0 次、空删除批次 0 次、独立 clone 删除 0 次。历史拒绝没有重新派发。13 组本轮主要核验/提交/移除/盘点等待/归属补核/事后检查实际工具调用及完整原行保全于 original-tool-receipts.json，均有对应返回。

## 空间实测

| 采样 | C 盘可用空间（B） |
|---|---:|
| 初次安全预检 | 307,982,520,320 |
| 删除紧邻前采样 | 306,329,088,000 |
| 删除紧邻后采样 | 306,486,734,848 |
| 操作窗口卷级净变化 | **+157,646,848** |

卷级变化约 150.34 MiB，不能当作此次工作树的精确物理净释放。#58 同时运行、证据持续写入，NTFS 分配单位、hardlink/共享块和其它写入均会影响读数。**可归因物理净释放未知**；151,693,775 B 只表示移除目标操作前的普通文件逻辑长度。预检到执行间的空间下降也保留实测值，不解释成清理损失。

## 保留决定和后续条件

全部 26 个已确认本项目构建的精确路径、branch、HEAD、status/untracked/ignored、普通文件逻辑大小、链接目标、嵌套 Git 与扫描错误见 `inventory.json.gz`；逐目录决定见 [decisions.json](decisions.json)，完整预检快照见 [preflight.md](preflight.md)。`compressed-index.json` 保存 5 份 gzip 与原 JSON 的双 SHA-256；均已验证无损解压、JSON 解析和先行提交 blob 原字节一致。没有遍历链接目标来计算共享 store 大小。

| 近期候选 | 逻辑大小（B，不跟随链接） | 结果及缺口 |
|---|---:|---|
| #54 M0 | 2,466,235,470 | 保留；1,925 个链接，ignored `.tmp`/日志/构建/验收输出未做完整逐 path 保全 |
| #55 M1 | 2,742,944,421 | 保留；1,945 个链接，ignored 缓存和测试输出未做完整逐 path 保全 |
| #56 M2 | 3,374,923,543 | 保留；1,945 个链接，ignored 缓存和测试输出未做完整逐 path 保全 |
| #57 M3 | 4,534,246,620 | 保留；1,947 个链接，ignored `.tmp`/日志/缓存/验收输出未做完整逐 path 保全 |

这四批合计 **13,118,350,054 B 逻辑长度**，不是可承诺释放量。下一步须先补准确 run/附件/原件来源及 Windows 字节映射，并证明依赖链接与共享 store 的安全边界，再按实时 main/活动引用重新评估整棵工作树。此次没有改为逐文件删除 tracked 检出副本或拆批删除子目录。

以下保护继续有效：

- #58 当前 `01a1264e-bd35-76d4-b328-03e9b91301f3`、`.tmp/m5-runtime`、私有 OpenCode 目录/进程、`m5-5dbe32e19a` 容器/服务整体保护。没有发消息打断或操作其服务；进程快照仅保留 PID、父 PID、名称、可读性和 workspace 引用，完整命令行不入库以避免泄漏秘密。
- #5 review 当前/旧恢复目录；#21 当前与 `01a1195f-55ab-7ee9-8baf-c115978d3aec` 首面 checkpoint；原 #8/#9/#15/#16/#17 恢复输入；旧 #52 审计来源、本清理构建、主仓库和根外 G1 临时登记均保留。
- G1 精确被拒 clone `.tmp/g1-shallow-layout`、D0/C3 所有拒绝路径及其父目录；旧 38 node_modules、36 `.turbo`、2 typecheck cache；RAW、至少一份原 trace、74 项和四父未映射材料均保留。没有 Force、权限/属性变更、重试、换工具、rename/move 或父删绕过。
- 未映射准确 todo/build 历史用途的旧目录即使干净或 HEAD 主线可达也保留。其 WorkMesh repository 归属已确认，恢复用途缺口没有被 Done 替代。

核对时纠正了预检中一处旧恢复目录标签：`01a1187a-f0f1-74d9-a5e7-0022c903a6e6` 的 HEAD 为 #5 原方案独审 `b80593e…`，预检误标为 #11。已在 decisions.json 和 [decision-corrections.json](decision-corrections.json) 更正；先行提交中的原错误保留可追溯。该目录始终保护且未操作。补核时 main 没有未合入 #5 的 `docs/reviews/b1-b2`，该只读查询的缺失原错误没有当成功；归属依据为实际读取的 #5 元数据/原规划 head。

## 事后核验、验证和限制

[postflight.json](postflight.json) 记录 worktree 登记从 **28→27**、0 prunable、其它登记路径存在且 HEAD 可读；只有当前清理分支 HEAD 因先行提交正常变化。原候选本地分支保留。5,210 条历史/保护来源路径的存在性观察前后一致（差异 0），其中原来已缺失的历史删除路径仍标缺失，不算本轮成果或保护失败。见 protected-paths.json / protected-paths-after.json。这些检查不声称保留目录所有内容逐字节未变；活动任务可正常写入自身成果。

必要验证实际通过：JSON 解析、5 份 gzip 往返双哈希/已提交 blob 核对、HEAD 主线可达、逐文件字节与独占读取、末次 scoped 枚举、worktree 登记健康和保护路径存在性检查。先行提交前暂存 `git diff --cached --check` 退出 0；最终完整已提交范围的 diffcheck 回执由 `final-validation.json` 单列。没有运行 lint/typecheck/产品 unit/integration/E2E；本卡明确只要求必要证据及登记验证，没有产品变化。

执行报告/清单与原回执已提交并推送为 `57d600d24f68727659d3c439c9e8b693529335f5`，该完整 main→head `diff --check` 退出 0。最终交付字节索引首次采用“全部与 Git blob 一致”的断言，因 16 份 PowerShell JSON 的 CRLF 实际字节而失败；当时外层最后一个 diffcheck 退出 0 不能代表前序 Python/git add 成功。[first-final-validation-failure.json](first-final-validation-failure.json) 保全原失败和调用定位。修正后 [evidence-index.json](evidence-index.json) 对该提交 59 个交付文件分列 Git/Windows 原字节：43 个 identity、16 个可逆 LF→CRLF，全部实核通过；5 个 gzip 始终逐字节一致。此次修正只影响证据索引，未新增删除或改变原回收结果。最终验证回执/索引/首败补录经正常 turn-end 提交，避免为记录自身 head 循环改写。

只核可读全板、当前任务对话、Windows 进程命令行及文件独占读取，**未声称获得平台全局 build/recovery registry 或所有 OS handles**。无法充分确认恢复用途的目标保留；候选已由当前任务信息、原完成对话、精确文件与当前可见运行引用逐项确认。历史自动审批拒绝、原回执缺口、敏感 RAW 原件均不重写或重新归档入库。

文件变更仅在 `docs/reviews/cleanup/2026-10-11-worktrees/`：中文预检/结果报告、机器清单、原工具回执及本次只读核验脚本。**无数据库迁移、无 API/事件变更、无产品规格偏离**。核验覆盖限制及上述归属更正已明示。

阅读演示：在 change review 中打开本文件的预览按钮；检查 execution-53.json 的精确操作/exit/空间采样，再从 preservation-53.json 任一条 `sourceCommit:path` 取 blob、按 `reconstruction` 恢复并核 Windows SHA-256。大清单可用 Python 标准库 `json.loads(gzip.decompress(Path('inventory.json.gz').read_bytes()))` 读取；其它脚本是本次现场核验工件，不是自动清盘或定时任务。
