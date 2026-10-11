# 15:05 全清裁定后的实际回收与重建规则

生成时间：2026-10-11T09:20:31.359883+00:00。本轮在原会话分支接续执行；旧 `1266d651cc9760b20a6a83aba5ce3a0a7d7e2b78` 独审仅覆盖上一轮。新增预检和保全提交为 `b7e9f24554e4b6031c035f66f6db299a725ad7c6`，推送原件见 [preflight-push-receipt.json](preflight-push-receipt.json)，远端回读及52项 Git/Windows 字节绑定见 [preflight-binding.json](preflight-binding.json)。所有新增现场删除均在该推送和绑定完成后发生。

用户15:05原话：“可以完全清理，后续待开始项目，重新拉取代码重新建立环境开始，这次建立环境注意尽可能复用共享部分内容，减少空间的重复占用”。本次不再仅因待开始、待审、checkpoint 或未来恢复而保留完整旧环境；先保存必要独有成果，再收尾准确旧现场。清理不等于接受、取消或完成未验收业务。

用户17:06要求本轮结束后暂停后续推进，随后要求实际提交成果便于换机部署。远端获取、必要保全入口、当地工具/store选择、依赖准备和源码容器部署步骤见 [handoff.md](handoff.md)，跨机器只读计划见 [new-machine-plan.py](new-machine-plan.py)。本机绝对路径和可移植用法、已验证与未验证范围分列；本轮不配置新机器或迁移秘密。完成本轮独审及准确最新RequiredCI后的条件合入后，停止推进，等待用户换机接入并明确恢复。

实际完整回收 **14 个旧工作树，34,591,611,044 B（34.591611 GB）目标逻辑长度**。工作树 19→5。实际失败/停止目标 0 个。原第三轮已删的 `01a12766` 及更早成功清单不重复执行或计入本轮释放。

本人精确测试容器完成收尾 6 个；逐容器及其独占卷结果见下表。共享镜像和原 store 保留。**物理净释放 `null`（未知）**；逻辑长度、身份去重长度及卷可用变化分别报告，不能相互代替。

## 原始来源和执行顺序

历史材料仅引用，不覆盖：[原报告](../../report.md)、[原机制](../../mechanism.md)、[continuation](../../continuation/report.md)、[followup](../../followup/report.md)、[第三轮](../report.md)。当前用户裁定写入 [cleanup-rules.json](../../cleanup-rules.json)，永久拒绝与九只读自设门分别登记。

1. [usage-opening.json.gz](usage-opening.json.gz) 使用已合只读入口刷新范围和组成；[audit-opening.json.gz](audit-opening.json.gz) 实读普通文件身份，不跟 junction/reparse；[activity-opening.json](activity-opening.json) 不保存进程命令正文或容器 Env。
2. [remote-opening.json](remote-opening.json) 与 [remote-preflight.json](remote-preflight.json) 独立调用真正远端 `refs/heads/main`。本次实际返回为 `6a06ce338f90bf16ce27e3cca1a76771eba42e6e`；历史 Chief 快照和共享 FETCH_HEAD 均不作判断来源。每个删除另有 `remote-before-<UUID>.json` 原返回及可得起止时间。
3. 先完成每个 `final-mapping-<UUID>.json.gz`、[unique-final-sanitized.zip](unique-final-sanitized.zip)、[execution-plan.json](execution-plan.json)，提交推送并核不可变 Git blob/运行字节。随后 [verify-target.py](verify-target.py) 刷新 head/status、源分支、活动/挂载、全部文件 SHA256/身份/mtime/属性和原链接字节。每目标 `verification-<UUID>.json` 是删除前实际门禁。
4. [execute-target.ps1](execute-target.ps1) 使用正式 `git worktree remove`。两个 dirty 旧树和含已保全嵌套夹具的旧第一#60，预检中明确声明初次 `--force`；它不用于任何原系统拒绝目标，也不是首败后换参数重试。Git 成功后仅按预先声明的 [residual-check.py](residual-check.py) 零普通文件证明，非递归删除准确链接本体与普通空目录。目标首败即停，不拆文件绕过拒绝。
5. 子进程原 exitCode 和 cmdlet normalizedOutcome/nativeExitCode=null 分列。没有原时间/退出码的历史记录如实缺失。`execution-<UUID>.json` 保存完整输入、输出、时间、链接/空目录操作和前后C卷值；收尾 [audit-after.json.gz](audit-after.json.gz) 再次核目录/登记不存在和保护父目录。

追加身份门禁先提交推送 `ea03a90785ab95cc1f59f597c0fed60060bd71b4`，原返回/远端回读见 [hardlink-push-receipt.json](hardlink-push-receipt.json)，源码/政策绑定见 [hardlink-source-binding.json](hardlink-source-binding.json)。M5的24份与M4的17份派生EXE共用公共native同一身份、开工nlink=44。后目标只扣已证明完整回收的本轮精确路径数；其它nlink漂移仍停，字节/属性/mtime/独占打开不放宽。此链接数变化不能记作native公共本体的物理释放。

## 必要独有成果与重建映射

[preservation-verification.json](preservation-verification.json) 是最终逐源解析结果；[gap-resolution.json](gap-resolution.json) 记录初始13个缺口的实际解决方式。每个路径记录 Windows 长度/SHA256、device/fileId/nlink/mtime/属性，以及准确 Git blob、已有 ZIP member、新脱敏 member 或已验证的锁/脚本/公共安装/CAS 重建输入。Git 对象与 Windows CRLF/BOM/二进制字节分别核，不把换行等价冒原字节相等。staged/index、dirty 独有代码、checkpoint 均有恢复来源。

最终新增 ZIP 仅保必要独有原件：26,189,270 B、1,330 个成员，全量 CRC、长度和 SHA256 已核；不复制整树、全依赖、native EXE 或秘密 DB。实际秘密值在私有环境读取后仅用于脱敏核验，不输出或归档；63项脱敏变换保哈希/结构来源。早期未发布 mapping/ZIP 与失败中间产物已经在当前证据目录内精确退役，见 [intermediate-publication-retirement.json](intermediate-publication-retirement.json) 和 [intermediate-finalizer-retirement.json](intermediate-finalizer-retirement.json)；初始 preservation-summary 不是最终删除门禁。

具体例外：D1a 两份 RAW ZIP 已全量核491成员/CRC，复用原已合脱敏 ZIP 和精确历史转换来源，不发布 RAW。#16旧 zod3.24.3 的52个普通文件实核现有共享 CAS 的准确内容地址。M5 stale PYC 与当前源码编译结果不相同，未冒可重建同字节；经 Python3.13格式、完整 marshal 和递归常量/秘密核验后，仅保其小型原件 member，不执行旧字节码。

既有 Git 中5个 ZIP 原字节不是有效 ZIP，catalog 记录 crcVerified=false，未用于任何成员映射：M0 contracts-typecheck-inputs、M1 integration-final-inputs/lint-final-inputs/wait-ddl-first-inputs，以及 followup/additional-g1-plan-2。这些历史原字节仍可由准确 Git blob 恢复；本轮不修历史、不声称其原 CRC 通过。其余810份有效已有 ZIP 的成员来源及新增 ZIP 均真实核 CRC。

一次活动安全门暂停原件完整保留，未派发Git删除：原命中pwsh PID34632与本轮并发只读查看时间重叠，原命令行未记录不倒填。消费者已退出后，另存新的完整预检/推送/源码绑定，才首次派发该目标的正式删除；见 [gate-resume-decision.json](gate-resume-decision.json)、[gate-resume-source-binding.json](gate-resume-source-binding.json)及两个execution原件。这不是重试原生删除失败或系统拒绝，原暂停回执没有被覆盖。

## 每个旧工作树的实际结果

下表 UUID 均以 `C:\Users\xurx\.tds\workspaces\` 为绝对父目录；每个目标另有对应 final-mapping、remote-before、verification、execution 原件。

| UUID | 预检逻辑 B | 实际结果 |
|---|---:|---|
| `01a116f8-8172-7082-8d61-867bd9f0b749` | 734,891,329 | 完整旧工作树已回收，登记与目录不存在 |
| `01a1187a-f0f0-76d8-8f5b-b954ee399cdc` | 797,621,388 | 完整旧工作树已回收，登记与目录不存在 |
| `01a1187a-f0f1-74d9-a5e7-0022c903a6e6` | 377,911,866 | 完整旧工作树已回收，登记与目录不存在 |
| `01a1187a-f0f2-7dd4-b77e-b9540ad44d9e` | 1,369,858,879 | 完整旧工作树已回收，登记与目录不存在 |
| `01a1187a-f4ff-735d-814f-a7b26f8cfdc5` | 837,685,153 | 完整旧工作树已回收，登记与目录不存在 |
| `01a1195f-55ab-7ee9-8baf-c115978d3aec` | 1,013,245,363 | 完整旧工作树已回收，登记与目录不存在 |
| `01a11a93-c093-7565-9084-724b6bedcade` | 937,848,587 | 完整旧工作树已回收，登记与目录不存在 |
| `01a11ac2-7634-752e-8d81-764c9776f801` | 793,048,437 | 完整旧工作树已回收，登记与目录不存在 |
| `01a11ac2-a0a9-7ef6-bd48-3bb37c21a301` | 1,610,079,999 | 完整旧工作树已回收，登记与目录不存在 |
| `01a11b27-cfac-7ea4-a461-8eef51b750fe` | 2,171,560,588 | 完整旧工作树已回收，登记与目录不存在 |
| `01a11b85-41f9-74f5-b456-7083d4d83e5e` | 1,155,604,546 | 完整旧工作树已回收，登记与目录不存在 |
| `01a1264e-bd35-76d4-b328-03e9b91301f3` | 10,981,754,589 | 完整旧工作树已回收，登记与目录不存在 |
| `01a126be-7aba-7b1d-a57a-f58317f89a67` | 2,997,673,676 | 完整旧工作树已回收，登记与目录不存在 |
| `01a127d4-e047-7e57-81c2-3d054851fc88` | 8,812,826,644 | 完整旧工作树已回收，登记与目录不存在 |

旧第一#60的九个 Git fixture readonly 对象合计696 B，见 [readonly-exception.json](readonly-exception.json)。原属性/身份与精确保全 member 已先核；实际清除 ReadOnly 位的方法和每路径前后属性均保在其 execution 回执。该自设门与 G1/D0/C3 的系统拒绝完全分列，没有改 ACL 或对拒绝目标调用删除。

## 清理前后占用

| 范围/指标 | 开工 B | 收尾 B |
|---|---:|---:|
| Git全登记数（含主仓库与既有外部Temp） | 21 | 7 |
| 本项目工作树逻辑 | 40,836,624,893 | 6,402,530,653 |
| 主仓库独立逻辑 | 6,460,728,286 | 6,573,725,600 |
| 二者逻辑合计 | 47,297,353,179 | 12,976,256,253 |
| 工作树普通文件身份去重长度 | 32,240,834,800 | 6,402,994,912 |
| 工作树＋主仓库跨目录身份去重长度 | 未采集，不倒填 | 12,976,720,512 |
| C卷可用空间 | 303,742,185,472 | 325,384,937,472 |

C卷可用差值为 21,642,752,000 B；同时存在其他项目/当前构建写入、shared hardlink、Docker卷虚拟存储等因素，不作可归因物理释放。主仓库增长包含平台推送新增 Git 对象，不属于被删除范围。收尾 X卷可用 41,472,643,072 B，无开工X基线，差值未知。身份去重长度也不是文件系统分配长度。

| 工作树组成 | 开工 B | 收尾 B |
|---|---:|---:|
| Git 管理/对象（主仓库单列） | 2,223 | 585 |
| 依赖与本地 virtual store（含特殊 runtime，需另核） | 10,645,512,900 | 2,037,543,610 |
| 文档与已提交证据检出副本 | 14,674,442,910 | 3,737,363,238 |
| 本机临时/验收材料（用途未判定） | 10,493,533,977 | 293,306,016 |
| 构建/缓存 | 4,605,973,582 | 225,057,699 |
| 源码与其他文件 | 417,159,301 | 109,259,505 |

采样并非同一时刻快照；报告/回执继续写入当前树，后续提交与Git对象增长会改变收尾值。原 JSON 的 startedAt/endedAt 才是对应测量时间。不同采样差值不替代逐目标实际回收长度。

## 所有剩余工作树及解除条件

| 完整 UUID | 收尾逻辑 B | 保留的准确原因与解除条件 |
|---|---:|---|
| `01a115d0-87b0-78cd-921d-750713cdde51` | 906,884,156 | D0：2026-10-08-historical-worktrees.md 原策略拒绝及父目录；真实系统策略拒绝，本轮禁止重试/父删/换法；须有对准确目标有效的新系统授权，独审或泛全清不能解除 |
| `01a116f7-1027-7c75-90df-32ebc5488752` | 797,188,602 | G1：同历史报告 G1 shallow clone 原策略拒绝及父目录；真实系统策略拒绝，本轮禁止重试/父删/换法；须有对准确目标有效的新系统授权，独审或泛全清不能解除 |
| `01a11890-f4de-7106-b64d-e1b2c0d4608e` | 1,043,076,163 | C3：同历史报告两个原策略拒绝及父目录；真实系统策略拒绝，本轮禁止重试/父删/换法；须有对准确目标有效的新系统授权，独审或泛全清不能解除 |
| `01a11acb-1a68-7fba-a359-7119603cde7d` | 151,321,543 | G1 审计 JSON 编辑原策略拒绝：remaining-materials-review-2026-10-08.json#/g1Clone/priorEditRejectionReceipt/target；真实系统策略拒绝，本轮禁止重试/父删/换法；须有对准确目标有效的新系统授权，独审或泛全清不能解除 |
| `01a129ad-6e0b-7f8f-bf12-5bbdf4b192b5` | 3,504,524,448 | 本轮当前构建与审计依据；本轮准确新head独审/RequiredCI及合入后，再刷新活动和引用作独立候选 |

四个原拒保护父目录逐文件身份/长度/属性、链接、head/status 对照 162,794 条普通文件均一致，差异零。主仓库、workspace根、其他项目、用户配置、原 pnpm store、公共工具和远端分支/标签均不是删除候选。既有外部 Temp/G1 验证登记仅核 Git登记，不遍历/清理。

当前验证形成的X卷专属环境另外列出，属于本轮构建，不能偷偷计入旧树回收：

| 精确 task virtual store | 逻辑 B | 文件身份去重 B | 条件 |
|---|---:|---:|---|
| `X:\packages\workmesh-task-virtual-stores\01a129ad-6e0b-7f8f-bf12-5bbdf4b192b5-proof-picocolors` | 678,810,327 | 662,356,244 | 本轮当前验证产生的专属环境；本轮合入后按精确 owner/现场引用独立收尾，非共享 CAS |
| `X:\packages\workmesh-task-virtual-stores\01a129ad-6e0b-7f8f-bf12-5bbdf4b192b5-proof-picocolors-isolated` | 6,774 | 6,774 | 本轮当前验证产生的专属环境；本轮合入后按精确 owner/现场引用独立收尾，非共享 CAS |
| `X:\packages\workmesh-task-virtual-stores\01a129ad-6e0b-7f8f-bf12-5bbdf4b192b5-proof-picocolors-copy-isolation` | 6,774 | 6,774 | 本轮当前验证产生的专属环境；本轮合入后按精确 owner/现场引用独立收尾，非共享 CAS |

首次单包试验误继承整个19-package workspace，已终止并保4294967295真实退出；609包下载数为0，当前入口/专属 virtual store 留在当前构建清单。源码和根锁未改；后续单包隔离试验已修，未把首次失败或当前新副本冒成旧环境释放。

## 容器、卷与共享镜像

| 原精确容器 ID / 名称 | 卷 | 实际结果 |
|---|---|---|
| `99230cd34b29c2b8aff7e5c03b470d277819932f1aa67a54eaa238bc6cd06003` / `/m4-01a127d4-4adc5e39-postgres` | `m4-01a127d4-4adc5e39-postgres-data` | 精确本人测试容器和独占卷已移除；共享镜像仍存在 |
| `a5deb4fe214fed6ba3ddd72621ac945cbd2bef5f03cdc4b56df1b47c7afb9cde` / `/m4-01a127d4-4adc5e39-redis` | `m4-01a127d4-4adc5e39-redis-data` | 精确本人测试容器和独占卷已移除；共享镜像仍存在 |
| `717183fb31c86217c9a060bfb6ee05286bef10ffa79dd6cdf917fba3b05342df` / `/m4-01a127d4-4adc5e39-objectstore` | `m4-01a127d4-4adc5e39-objectstore-data` | 精确本人测试容器和独占卷已移除；共享镜像仍存在 |
| `c012ede214cf08a989936d01fde107d923bb9fb94be1ae45f33a6cfcdbcf7737` / `/m5-5dbe32e19a-postgres` | `bcbf4cd3d2b8da53ed73d06c383921506f79e6657cba26a3c401c3b48d9b36d1` | 精确本人测试容器和独占卷已移除；共享镜像仍存在 |
| `47947951bc4edd333185c9ad651cbc09fdef502602e4d0635bdf9988b7a0d3a9` / `/m5-5dbe32e19a-redis` | `ba0c66ad4be59e54c277fce38b0493d11c8fbbf0d22102a17b7523681ea565b3` | 精确本人测试容器和独占卷已移除；共享镜像仍存在 |
| `23d2ad68bd312a452e11722554dfda530a18fe48cc7456d862a955379d18ed67` / `/m5-5dbe32e19a-store` | `937fc1480306d8675483cca16c4f601f0f5fb985ff5c652e786ebbe29502e920` | 精确本人测试容器和独占卷已移除；共享镜像仍存在 |

六目标来源为 main 可达 M4 execution/resources.json 和 M5 product-cleanup.json 的准确 immutable ID/名称/镜像/独占卷；[containers-plan.json](containers-plan.json) 含开工消费者和卷元数据，[containers-execution.json](containers-execution.json) 与逐容器回执含执行前重新核验、真实 docker exit、不存在后验和共享镜像存在后验。无 Force、prune 或镜像删除。

以下名称虽似本项目，未找到准确原 container ID→任务 owner/数据重建账本，或属于默认 compose 业务数据，不凭 stopped/名称删除。需给出精确 owner 和必要数据/独占消费者来源后，才能作为独立候选；不得全局清卷。

准确调查见 [remaining-container-ownership-complete.json](remaining-container-ownership-complete.json)：471份相关文本和原 raw-checks ZIP 全38成员/CRC。39个r1 ID共117处命中仅在C1/M1其它任务观察中；原R1环境/服务日志未绑定原创建ID、owner及卷的数据用途。另核平台最新R1构建聊天，未取得原创建ID账本，见 [remaining-container-platform-source.json](remaining-container-platform-source.json)；不把最新聊天无ID冒全部历史无原件。默认compose另由实际label定位 G:/S:/Projects/MetronX/WorkMesh，属于工作区外业务数据，不扩清理范围。

| 未能清理的精确 ID / 名称 | 当前状态 | 挂载卷 | 原因 |
|---|---|---|---|
| `8955a6225785bee60cd769ac3737635df6a8c6a53435ad6294d92435417fd52b` / `/r1ci381d-rustfs-test` | exited | `f770867c392a5c9f547d9781f6468167fc77efc1adc13170bafb503095a1095a` | 缺精确原ID/owner及数据重建来源 |
| `fdbfaf96fc4b7ae621bd07f221fbedd437526ba50f22683ef322d905baa0c376` / `/r1ci381d-redis-test` | exited | `68c0f38c05696ee92ceb212cefe48ca78c45c8932517688b6f537f32bcfac351` | 缺精确原ID/owner及数据重建来源 |
| `afb321d3ab8803113c81dd79dd99c4be7fcb9a94a05b88ba53b4ee9604b3a507` / `/r1ci381d-postgres-test` | exited | `a8bf316c3c4fca1c2e12400e69c3996c9415fc08994dc77cc6c76c4661573150` | 缺精确原ID/owner及数据重建来源 |
| `42c1f96772b6b91e9175cbd40fe394efcb9756bca2ff483a4620ea4d1d5afb39` / `/r1ci381c-rustfs-test` | exited | `342d89cbb3564124ca352833d650b52f31619f51b6d9d294b65263b229aa1716` | 缺精确原ID/owner及数据重建来源 |
| `16d965766d2c75a3b4e53b5cf0df183ccfb70388cf752d4d813a5bf03a8f21ca` / `/r1ci381c-redis-test` | exited | `4a942b1dfb1cb4bcae79dd58e78256921eeba10013abeece4165d57fb19c0d72` | 缺精确原ID/owner及数据重建来源 |
| `567c5c781c262f1cb2dc31b33a77cbc48b64b595cbbf822d3d0e45082ca844a0` / `/r1ci381c-postgres-test` | exited | `afed6e213676d965720231e4726fb47e2d972d5a7452e6d56f0cbae01acdd520` | 缺精确原ID/owner及数据重建来源 |
| `bb6b39f0959dc975ebba12692e3de8aadea191fdf0596d184ce7bc08fab9f027` / `/r1ci381b-rustfs-test` | exited | `4f77687d7f54232dcaf1d151b5749cc58801e66aad5114c9292641b699f09b8b` | 缺精确原ID/owner及数据重建来源 |
| `1244d5e4667d93ef394142c0bb18cb7a44eccdc7abc04a9278a7775c2df1f0dd` / `/r1ci381b-redis-test` | exited | `fbdbdba7f282c3297cf4fc460624918f9950f445523c9dc9532dbb1f48cb6acf` | 缺精确原ID/owner及数据重建来源 |
| `4d8e4c20dc847b9edeae08745328d208a6a6f7dac72e186c36f63ea2f3bbc434` / `/r1ci381b-postgres-test` | exited | `75374043fb5d0beaed4796b0383e790ddbd85b2a1dcb13ba18941664465aa062` | 缺精确原ID/owner及数据重建来源 |
| `959f0cabf5d696e3ce51871df90f1b568687eb9e0cc50c0a1e0f40896c37476b` / `/r1ci381-rustfs-test` | exited | `8a9a3216f152f74fd9397f5b5a8aa241e758ababa702d444da29756ef81d93f0` | 缺精确原ID/owner及数据重建来源 |
| `f3359d7c72a758eace150cb87c35e215a0b6f291061556f782caeeab39258a39` / `/r1ci381-redis-test` | exited | `1d9022d88403abeede36fa62e4fc748952545abd469507c2a102cb284fc7c502` | 缺精确原ID/owner及数据重建来源 |
| `4b9d5cc52acd838f691b711dadab09bc6aebb42ed567c67129308927044f3d01` / `/r1ci381-postgres-test` | exited | `b03bdf9537da969106adcbb11ef042d716952e328590d74fc6ded64efa45f07a` | 缺精确原ID/owner及数据重建来源 |
| `54f147c18124aa0e4664cb5d15e36244d7e2f32c020225b80ed48e86e8ff3d6e` / `/r1i-rustfs-test` | exited | `7be4b853490c99ab5711a5aaa46686a1c1d6d82d0eb10420a59470fdc1d8e463` | 缺精确原ID/owner及数据重建来源 |
| `ebf6f15a199ee0b9d88c92242124cf6e39cc411457525fb95f434340d81b20a9` / `/r1i-redis-test` | exited | `e6ffaf78e7ee3eb433441e388bf84b6ba5ddc2ec9f93f4b11aac3419638ced44` | 缺精确原ID/owner及数据重建来源 |
| `2709a753abebe3bc0fd4961a81a05f0051468cb03bb831abdb41d4f5cfae3f0d` / `/r1i-postgres-test` | exited | `a59e05003c711dfd50ffeb15af68d93bad99609ea0f2cac80b0217b749caa3d8` | 缺精确原ID/owner及数据重建来源 |
| `39acded25c5fc47bbc59704fa6a63e504cb5a9adb4329d1712e7d2009210fd5d` / `/r1h-rustfs-test` | exited | `673bfa5123bb2afc960d41f85ce00f167e37eac01a0f7eac33fae1a66e53280e` | 缺精确原ID/owner及数据重建来源 |
| `446d990bae3d184b8dc04c3faf0150834abb8f6c80a323c4fd2f5d3e8c86a76c` / `/r1h-redis-test` | exited | `9d701e8a11e0ebe98fdead08f5ce1f089498e6711a5092312f91fa996155edde` | 缺精确原ID/owner及数据重建来源 |
| `1aa94d42b532791bc4946c34e8c83d7c613c9fa8c4b8f071f2f05a94f82cf3d7` / `/r1h-postgres-test` | exited | `f20df4001f62f725ced45c2e9e419b358587d901315021045af324017cd3263a` | 缺精确原ID/owner及数据重建来源 |
| `885491d285b034daaa3f48e4f3f91c8a96f422f7f591b62a5f6a7ad93a824ba0` / `/r1g-rustfs-test` | exited | `09993bb32cf1075dffd534fa7063e3af4ecb3afeacc8dd4fe52baba6f1f8e72d` | 缺精确原ID/owner及数据重建来源 |
| `88d7597271c372a248f89d4bfe02e1cd796a5d65d34752d72661f2620efef724` / `/r1g-redis-test` | exited | `c52ef889217855fd7f8761cd0309bfd4ab38b42775609d473f2c9c7a60b23609` | 缺精确原ID/owner及数据重建来源 |
| `68ddd591771d178bc3052cadb356ffab1daf3cfeeff714cba60246251645d8b1` / `/r1g-postgres-test` | exited | `4fe6fea9c2ec4ccfd82ad6ee5898d69a551c11b89813a94f1644b48923e0b03e` | 缺精确原ID/owner及数据重建来源 |
| `accb377d0f75666bd9236f5e9f0fd773a6414c425c99dc17fe578ea63f4ec0a8` / `/r1f-rustfs-test` | exited | `d3b4404131765cf803310d94950cc9100b847626d46525d1cbe81a70dff9d0ec` | 缺精确原ID/owner及数据重建来源 |
| `95612d167478ff04dba11d79b7563eb6f7a7458440d9d56780898d3db34d309f` / `/r1f-redis-test` | exited | `21b8c4878fd214c829b3f61542f96a3a584d4a91b8440499ca0e7683b6405a04` | 缺精确原ID/owner及数据重建来源 |
| `666b8a945f4e3f073701b69d8409e87aa7d5fc4defd7e33a4d24a434f357f492` / `/r1f-postgres-test` | exited | `cd70f76e4f1f7f13e1eef288c3d0807e51c5b0c7cacb166a8e83a4e1ac46402e` | 缺精确原ID/owner及数据重建来源 |
| `6572b97faee7dbe4b1df1eee31623605ed21b589e66cae09421f796a76a73075` / `/r1e-rustfs-test` | exited | `ea82cd386491daa27ebb4058790490c0e039a004bf5dbd9ba289c0bebdbd1c13` | 缺精确原ID/owner及数据重建来源 |
| `d74db6d52c2161ed926ba031189ea8ef79ed212cf79752a172b28bbbd744d606` / `/r1e-redis-test` | exited | `77c58ced2109323d5f41ff5ad2fbea7d3c5b312d957ddd4a17fd6215142f070a` | 缺精确原ID/owner及数据重建来源 |
| `25a2355963559e11c9ec2a717e6b4d0148f5eb7fdc0d8e3a0a6c61b474f9b0f3` / `/r1e-postgres-test` | exited | `bc5c677e6113b07466b52d09492575a94d63e715fb08afa34f0d391d326a4efd` | 缺精确原ID/owner及数据重建来源 |
| `a31c79775de3b1ac268262fbd4e984bcdb38c3340cb73c66a7c0c1326c828bf1` / `/r1d-rustfs-test` | exited | `cfc46fe5c3236a749a6f0843eb139e6ec4cf3dba80fc0214aea1674f065df1d4` | 缺精确原ID/owner及数据重建来源 |
| `cef8749bbce413c24a9b13b712ec62de9f92f79df09601bf6191adcb29584289` / `/r1d-redis-test` | exited | `6716f0683a2576868f17a82381cc40e8cd39b82987aae98bc5e467283968a3fc` | 缺精确原ID/owner及数据重建来源 |
| `16bd2b3e98244acda74dfd797991b920a16dafece83caa4031dd91e232e35946` / `/r1d-postgres-test` | exited | `11c8798048b7ce265ef2b202399bd4ca419dab95ca6cba123e5e12231d18cce8` | 缺精确原ID/owner及数据重建来源 |
| `d89c37d3a22e8beca1b294dc16db0a69c01664c7f8b3693a422ca6c3b421105e` / `/r1c-rustfs-test` | exited | `be5dec1c35df7d217d82eb47800e68723079a8e56a0dcf51599ad76088ede9b2` | 缺精确原ID/owner及数据重建来源 |
| `1da14d685015528a2c539646ba1ff6a29839656d7e186cea8028c4e37b84b13e` / `/r1c-redis-test` | exited | `f30f2482c28c89f272040a5a885be06db5ce90c04b75ac321adff9d9eaa66457` | 缺精确原ID/owner及数据重建来源 |
| `a4173ad93c5a950bb76c9b0522bbc4d8487371ba651dbd52ce4cd0ab82dc64fa` / `/r1c-postgres-test` | exited | `caa502416c9618de3a27065bc1cbc941bc56e703851bd8aaf8a6d1c7ca493685` | 缺精确原ID/owner及数据重建来源 |
| `fb305d53eee075b81f091d76dd1ef6abb8678077459e6c22c0fff822908eca78` / `/r1b-rustfs-test` | exited | `a4c002be1b65451667e8eafd58444a8956c5a762100f96257b4c45949020d339` | 缺精确原ID/owner及数据重建来源 |
| `8be4c0b2f3b233e1c560c9f368564e420d0cb94df6e7008ed9408fb2464c75c1` / `/r1b-redis-test` | exited | `4bdfecdfa8e0df634374ad16a53dc4d490c5bde11a66cd0e411f70191db1ea25` | 缺精确原ID/owner及数据重建来源 |
| `3ac7b4978d975b63928f70b6c9365972ab309f1363b89e690f9af02b82198d3b` / `/r1b-postgres-test` | exited | `2ac6acc9a0ec6f1b206fc2b4e8f88e5c2873cd75fb5496ba1cfc07422aa9d9d4` | 缺精确原ID/owner及数据重建来源 |
| `a016713d06d3f11dfe2ee9533efd521946fb6077acceaf32d876a16206a17ac1` / `/r1-rustfs-test` | exited | `6c8ed813f725b6c2e0734b37180fae4c860f436ecea7cd4c7a477b5d547d966d` | 缺精确原ID/owner及数据重建来源 |
| `7a1f3fad0cc930f18dd57ce7c684a2265f0a06076fbb39782c1df8fcc3465366` / `/r1-redis-test` | exited | `dcd05ef161c656dcba47749e86e3ce617b25956bd666f89c5308b9e76382fbf3` | 缺精确原ID/owner及数据重建来源 |
| `557e9b8f1cabae46fbc219d4cabf1fed34955c23e1804fd5e021754226365fc2` / `/r1-postgres-test` | exited | `807a7975c0b8e97af56237b1d476de4d1adde7869ceb56dd78bd61edac79ecec` | 缺精确原ID/owner及数据重建来源 |
| `00f4596dc354a7096d54930f4786ca4e501f6d31371c317a95b36e289e9b5153` / `/workmesh-postgres-1` | exited | `workmesh_postgres-data` | 默认 compose 业务数据未授权 |
| `16feb81cf9d2a48d111dcfbda161e7a472616a9c0ac58a83d0a201cfb0e05fc0` / `/workmesh-redis-1` | exited | `workmesh_redis-data` | 默认 compose 业务数据未授权 |
| `34820cf2e25e8dff19d42892bd67609cc316df2a1173d5403a9d52817fe72eee` / `/workmesh-web-1` | exited |  | 默认 compose 业务数据未授权 |
| `a3b6f726f524d99b34f5b2b97b1d2356ef3692ffdcac5392b7eab44791e45b6c` / `/workmesh-api-1` | exited |  | 默认 compose 业务数据未授权 |
| `951afd926067ecb9835f623429abf4d0411874ffbce132da76e8046f0b0227c2` / `/workmesh-worker-1` | exited |  | 默认 compose 业务数据未授权 |
| `70078a3028a6e09537f0890446759fb739244e33c4f1b6b7adf885a5811ff296` / `/workmesh-migrate-1` | exited |  | 默认 compose 业务数据未授权 |
| `f8b614913c4efea2e944686c9b4c855cb5e61167d9bad0e7e6f35c150b9d473c` / `/workmesh-minio-init-1` | exited | `3e2ed69dee01abe2a6731a86c3f75528b513e86ab65440202518646c51194314` | 默认 compose 业务数据未授权 |
| `ed7ebe27231e729a3176572704a99846a8b180d1742f62002add5a11b12179cd` / `/workmesh-minio-1` | exited | `workmesh_minio-data` | 默认 compose 业务数据未授权 |

其他项目容器未调用删除；独立前后对照有 1 个名称/挂载/镜像或缺失变化、新增 12 个，详见 audit-after。活动消费者动态变化不归因本次清理。公共 native 安装字节/身份与 CAS 样本字节未变；native nlink 44→3 仅另列，不冒物理释放。

## 已落实的前景重建和防膨胀入口

[rebuild-rules.md](rebuild-rules.md) 给出开工、共享/隔离、准确重建及结束规则；[rebuild-environment.py](rebuild-environment.py) 提供 plan/install/thin/hydrate/finish-plan。plan 实核当前会话/remote、pnpm9.15.4已有可执行文件、X卷现有v3 CAS、锁hash和专属virtual store；install 使用 offline/frozen/ignore-scripts/copy，不下载或改公共配置。结束先保全，登记准确 workspace＋owner/锁绑定的私有virtual store，再前景收尾。没有 timer/daemon，也没有自动启动待办业务。

单包离线 copy 真实 exit=0、downloaded=0、锁不变、任务文件nlink=1/身份不同，实际改写任务副本未影响 CAS，见 [rebuild-verification-copy-isolation.json](rebuild-verification-copy-isolation.json)。此前 clone-or-copy 实测与 CAS 同身份 hardlink，原件保留并据此选择 copy。共享下载/CAS与公共工具/镜像已能复用；必要私有安装副本仍存在，未承诺所有包字节零复制。

大型历史证据薄检出入口要求已启用 extensions.worktreeConfig；本机目前未启用，安全门先停，未改平台主仓库配置。不能把文档建议冒成平台自动稀疏检出已生效；当前可用的是定位现有工具/store、前景离线安装、可变状态隔离及收尾登记。未重建完整后续业务环境或跑业务验收。

## 实际验证、失败与合入关口

本轮跑适当的保全解析、源码绑定、ZIP/Windows字节核验、逐目标盘点与操作后验、共享重建单包入口、Python/PowerShell语法和 git diff --check；没有把无关产品全套冒作本轮验证。最终检测原结果另在 final-verification.json 和 tool-receipts-ending.json.gz。

准备过程首败（Docker函数名遮蔽/可执行列表、历史无效ZIP断言、stale PYC编译不相等、初次保全解析漏放index分类）均在实际原调用中保留；只读耗时进程的终止和一次shell尾部命令掩盖前子进程状态明确区别，不倒填原exit。它们不是系统自动删除审批拒绝，也未作为成功门禁。修订后独立解析实际通过才进行预检推送与现场删除。

本轮新增成果仍须重新独审、blocking/high闭合及准确最终head自己的最新 RequiredCI。旧1266审查与CI不能证明本次新增删除/共享入口；本报告不宣称已合入。最终head与实时CI查询保在本轮回复/平台记录；合入后本轮工作树仅登记为未来独立候选，本轮不删除自身。

独审发现工具名规范化的索引缺口，修订 capture-tools.py 同时识别 wait/exec 与 functions.wait/functions.exec；旧 ending 原件不覆盖，追加 [tool-receipts-ending-supplement.json.gz](tool-receipts-ending-supplement.json.gz)，补齐cell66/cell125两个预检推送的原wait最终返回及全部原行。修订后实际解析见 [final-verification-review.json](final-verification-review.json)；新head须重新独审绑定与自己的最新RequiredCI。

规则实际触发分列：本轮开工只读盘点已执行，旧环境回收按逐目标原件实际执行；本轮自身尚未合入，合入后触发未发生，只登记为受保护的后续候选，见 current-lifecycle-registration.json。
本轮不改产品源码、数据库迁移、API或事件；交付和条件合入完成后暂停后续任务，等待换机并明确恢复，不自动追加下一轮。
