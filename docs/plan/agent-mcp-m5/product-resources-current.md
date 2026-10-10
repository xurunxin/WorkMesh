# M5 本人资源组成与收尾

本页只记录当前 M5 工作树及本人 `m5-5dbe32e19a` 资源，不盘点或清理其他任务。主工作树和 `.tmp/m5-runtime` 恢复根保留。其他任务、共享 cache/store、镜像、卷、历史拒绝 G1D0C3 及其父目录不在操作范围。

Chief 提供的两次采样显示本工作树逻辑增长 4,495,903,196 B。没有该区间逐文件原始基线，不能把全部增长归因到某一种产物，也不能据此计算物理占用或净释放。本人只读采样原件为 [目录组成](product-resource-current.json) 和 [文件身份](product-resource-file-identities.json)。前一遍全工作树遍历包含 pnpm junction 指向的重复名称，因此全树合计不能当独立文件或物理空间；以下恢复根的文件身份统计另列。

| 本人路径/分类 | 采样逻辑字节 | 用途与保留依据 |
| --- | ---: | --- |
| `.tmp/m5-runtime/joint-evidence` | 9,927,864,017 | 每次实际 OpenCode 私有运行的隔离清单、模型工具实收、SQLite/config/cache 和退出原件；大部分 EXE 名称共享同一文件身份 |
| `.tmp/m5-runtime/review-opencode` | 3,964,675,135 | 安装/隔离/原生启动历史首败与恢复输入；本次未批量删除 |
| `.tmp/m5-runtime/evidence` | 1,107,299,004 | 早期实际消费者运行与诊断原件；不因最新成功抹掉原失败 |
| `.tmp/m5-runtime/sources` | 156,311,253 | 110 份命令起止源码指纹清单；不是 110 份完整源码正文。原 Git blob 与 Windows 运行 bytes 分列 |
| `.tmp/m5-runtime/checks` | 15,215,390 | 244 个已完成命令脱敏 stdout/stderr，绑定实际退出与时间 |
| `.tmp/m5-runtime/private-check-output` | 9,100,857 | 126 个原输出；运行中的命令仍消费，凭据风险使其不能直接进公共 ZIP |
| `.tmp/m5-runtime/evidence-bundle.zip` | 20,436,056 | 上一次保全的生成中间文件；对应已提交内容寻址 ZIP 的原字节仍保留，不反复复制同版本归档 |
| `.tmp/m5-runtime/e2e-current` | 4,986,542 | 本轮 E2E 的运行输出/私有认证状态，后者不进公开证据 |
| `.tmp/m5-runtime/playwright` | 4,984,149 | 较早 E2E 原件；与本轮结果分别解释 |

恢复根当时有 3,876 个名称，逻辑合计 16,103,049,467 B；按 `(device,inode)` 去重后文件长度合计 1,010,786,787 B。后者仍不是磁盘分配大小。72 个 212,567,080 B 的原生 EXE 名称属于同一文件身份，文件系统报告共 75 个链接（含安装原件等其他名称），`fsutil hardlink list` 已实读。独立 DLL、SQLite、构建缓存、日志和 ZIP 没有一律认作可删除；尚无每个 DLL 的内容/恢复引用对照，继续保留。

已完成个人子流程收尾：原生程序准确 SHA256 `e13e57a7f6b7abddec887e0b2d912d22484077c50dff5bed4f3199bcf63b6088` 的本人 canonical 链接保存在 `runtime-by-sha/`。前景脚本 [product-retire-runtime-links.ps1](product-retire-runtime-links.ps1) 逐目标核本人退出/监听关闭/用户配置无变回执、绝对路径、无 reparse 祖先、相同文件身份和实际进程引用为零；先登记元数据，再非递归删除该派生链接名称。审计原件 [audit](product-runtime-links-audit.json) 的初版汇总为 null，保留这一脚本计数缺口；修复 OrderedDictionary 汇总后 [retire](product-runtime-links-retire.json) 实际退出 0，50/50 个链接名称已删，逻辑名称长度合计 10,628,354,000 B，物理净释放为 null。没有 Force、目录递归、绕拒绝或切换删除工具。

防重复机制已接入真实原生进程的 `close()`：只有本人进程全部退出、listener 关闭之后，才保全单一内容寻址原生文件和逐运行元数据、撤销本次派生 EXE 名称；运行中的服务不碰。命令指纹清单同样按准确完成 JSON bytes 的 SHA256 建本人不可变 hardlink，原 label 路径与内容均保持；不同内容继续独立保全。命令 label 已存在则拒绝重写，避免覆盖首败。模型/领域原件仍单独保存，不把不同运行时间的结果合并成同一次通过。这是本人前景生命周期管理，没有新增后台清理计划。

首次盘点时联合验收和 Worker/recovery 回归仍在运行，现已逐项取得本轮实际退出。随后实际 CIM 未发现该 workspace 的 Node/OpenCode 活动服务，脱敏 ZIP 逐 member 校验完成，再按原 owner 精确三个 ID 停止 Postgres/Redis/store，命令实际退出 0，after 全部 Running=false，见 [收尾回执](product-cleanup.json)。容器/卷/数据库/桶/镜像/网络/恢复目录全部保留；没有递归目录删除。旧中断命令的缺 PID/exit 原件仍是 unknown，不能从当前已退出倒填历史退出，见 [命令退出](product-owned-command-exits.json) 和 [活动状态](product-owned-process-liveness.json)。

收尾期间另一次只读恢复根采样见 [分类后采样](product-resource-after.json)：当时逻辑6,055,222,786 B、去重文件长度1,164,706,708 B；24个EXE名称5,101,609,920 B只对应212,567,080 B同一文件身份，91个DLL长度合计581,844,536 B、JSON234,126,567 B、node46,632,960 B、DB29,593,600 B。该采样仍有运行中新产物，不能与首采样相减冒物理释放或完整区间根因。

相同生成 ZIP 的本人中间名称已改用已核同 hash 的 canonical hardlink，原公共ZIP和所有 member 原bytes保持，见 [ZIP复用回执](product-bundle-alias-retention.json)。后续打包机制使用唯一新临时文件、固定容器元数据和按公共bytes hash复用member，避免重写旧immutable hardlink或反复保存同源快照；每个sourcePath的原hash/时间仍单独列。最小保留范围是原始首败/输出、源码起止清单、脱敏 ZIP、实际模型/DB/进程回执、恢复数据库/目录，以及现有 canonical 原生文件。尚未核实的历史诊断链接、DLL 和共享构建缓存没有纳入本次回收。
