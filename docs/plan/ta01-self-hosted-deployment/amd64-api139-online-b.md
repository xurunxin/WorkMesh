# API139 已批 B 在线调试执行记录

## 当前授权与边界

用户于北京时间 2026-10-20 16:13 对 Chief 具体问题选择“执行在线调试（推荐）”，22:03 要求继续推进。本轮完整规格和反馈确认：另批最多一台 API VM，按[已入库 B 方案](amd64-api139-next-gate.md)执行在线 GDB。没有提供该问题卡 ID，不补造。本次批准覆盖历史“B 待批”限制，只适用于这一台；上一新 A 的许可和 95 成员原件保持已消耗／保全状态。

原 CI562／`9c8bbff749c1d2a52a3e6489dcec02d2d7c859af` 企业候选、Node、QEMU、guest 镜像和设备保持。guest 为 4 CPU／4 GiB／40 GiB，专用外层为 4 CPU／6 GiB，memory+swap 总上限为 6 GiB，无新设备、宿主挂载、published ports、privileged、凭据或全局配置变化。整台仍最多 9000 秒。

唯一新增预算是在线调试总上限 900 秒，含前置身份／摘要核准、附加、等待故障、取栈、detach 和退出，从调试工作者创建起连续计时。首次 SIGSEGV 后取栈与退出还须在 60 秒内完成，两者取更早截止，不逐阶段重置。包装在同一预算内提前预留退出时间；目标完成或其他原停止条件出现就结束等待。原安装 1800 秒、健康 180 秒、首次身份 HTTP 90 秒、产品业务 30 秒、匿名 core 512 MiB／handler 90 秒均保持。

## 包装与校准

本次独有目录为 `.tmp/ta01-online-b-once/`，保留旧树、A 目录、远端及原件。先只读核现有账本、进程和容器，未发现同次 B 执行，再创建独有准备容器。准备 owner 为 `5b9a4837-fd9b-4913-9d98-e420ec9f4f85`，完整 ID 为 `4ad5b0c253e65c5062b2b3ba4d2e7e082e0cfdb41bdf7cdceb0bc40ca7ee68ab`。准备前宿主 MemAvailable 为 6,826,068 KiB，通过 6 GiB 容量前置；启动前仍须另核。

新包装复用原 API 身份选择和同钟记录。在准确 API Node 启动后并行准备 GDB，不等待附加来推迟原请求；若到原调用位置仍未附加并继续目标，就登记迟附加并停，不补发请求。PID／startTicks／可执行文件身份核准，Node 摘要须匹配 `638c77326270093b1251a5e72b4335c94c74856a210460341c73d6f3da647328`；不登记重启 PID、不重试附加。

GDB 使用固定版本的 MI2，关闭参数值、entry values、自动脚本、网络符号和共享库自动加载。仅首个 SIGSEGV 的故障线程查询 0～11 帧，不查其他线程、locals、寄存器、JS／JIT 或任意内存。帧位置须匹配准确 Node 文件映射和已核公开 ELF 非零 STT_FUNC 范围；仅投影既有允许前缀的符号，最多 40 个。遇到公开 Node 之外的调用者即停止投影。

GDB stdout／stderr 合计捕获上限为 64 KiB，仅在本机内存中过滤；只留安全阶段、身份、符号、分类、字节数和摘要。缺 EOF 就不冒称已收完整输出。不持久化或导出原文、core、内存、秘密或 guest 磁盘。原匿名 core handler 仅保留有界安全 ELF 投影，取消后置 GDB，无自动回退到第二次调试。

使用 GDB 官方 [MI 栈命令](https://sourceware.org/gdb/current/onlinedocs/gdb.html/GDB_002fMI-Stack-Manipulation.html)、[附加／detach](https://sourceware.org/gdb/current/onlinedocs/gdb.html/GDB_002fMI-Target-Manipulation.html)和[执行／interrupt](https://sourceware.org/gdb/current/onlinedocs/gdb.html/GDB_002fMI-Program-Execution.html)核命令语法。实际仍使用原锁定 GDB 15.1 包，不随文档当前版本升级运行时。

Linux 替身校准 7 项同钟／停止控制和 11 项在线包装全部通过；没有执行 GDB、Node、ptrace 或 VM 来校准。覆盖唯一附加、首信号／故障线程、公开帧过滤、64 KiB 合计上限、迟附加不发送、拒绝即停、无法 detach 停 VM，以及 900／60 秒不重置。首轮在线测试发现 MI stdout 附加拒绝未计入原只读 stderr 的分类，已修正并保留首败输出；没有据此改变权限。替身通过不代产品验收。

启动前另按官方[信号规则](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Signals.html)核实：`noprint` 隐含 `nostop`，因此 SIGSEGV 使用原 `stop print pass`，并在替身中断言。其他信号导致的停止也停业务驱动，不为了等待 SIGSEGV 继续运行。该修正发生在 VM 启动前，GDB 原文仍只在内存预算中过滤。

## 实际执行与连续预算

启动前 MemAvailable 为 6,478,552 KiB，通过容量前置，31 个候选成员、guest 及原助手／新包装运行字节均已核。唯一 QEMU 于 `2026-10-20T14:25:49.982363+00:00` 实际启动，PID3173／startTicks69377091；准确 QEMU 二进制摘要仍为 `8a35ccba41582fc6c38b9df85fc9e35fa1d42f414d2d7d8090ee9b2f5e7c0854`。

外层控制器为 PID3160／startTicks69376751，外层 monotonic 起计 `693767.6904406`、截止 `702767.6904406`，全窗 9000 秒；QEMU 启动前的 3.23 秒准备也已计入，不因平台接续重置。平台在 `70a099896a1193f58b5fd2fc26af4e3943c8d4b0` 保存中断 checkpoint；23:17 只读核实原 QEMU／控制器仍活，当时原预算剩余 5926.08 秒。随后只观察同台至终态，未调用启动包装或补跑。原宿主工具会话中断，宿主 launcher 退出码未知，不能用 QEMU0 填成 launcher0。

准确目标为 API 容器 `f42e934f11f0feea5f42dd1b51fe4d5c0501a4a510956354b46909b8fe78aaae` 内的 Node PID7665／startTicks278782，executable device61／inode525091／124181928 字节，摘要与批准输入相同。GDB 为 PID7831／startTicks280321，15.1-1ubuntu1~24.04.1，二进制 SHA256 为 `3832cc070ae1716e322105d3b39fb398695e5f031c9d39224cf227a8c2b889f6`。实际附加、继续和目标后 detach 均有安全回执。

下表均为同一 guest 的 monotonic 秒。调试预算从工作者创建算起，比 GDB 进程阶段标记更早，不能从附加或等待信号重新起计。表中附加／继续采用调试器自身回执，14 条同钟事件中相邻的阶段记录保留各自原值，不混作同一时间戳。

| 阶段 | 原值与含义 |
| --- | --- |
| 连续调试开始／固定截止 | `2794.392042177`／`3694.392042177`，总上限 900 秒 |
| GDB 进程阶段记录 | `2804.561823477`，不重计预算 |
| 附加／继续 | `2826.251436677`／`2826.842662877`，均早于原目标请求 |
| 客户端意图／代理发出 | `3138.257525877`／`3139.224913377`，时序不代请求致因 |
| 客户端完成 | `3148.536995477`，实际唯一一次 auth/install 为 10248 ms、HTTP200 |
| 开始 detach／GDB 完成 | `3150.038020277`／`3151.547561377`，连续消耗 357.1555404 秒 |

GDB 状态为 `stopped-at-original-boundary`，detach 确认、调试器退出后 TracerPid0 核验和 GDB exit0 均成立。未出现 SIGSEGV、首败、core 或目标重启，没有取得故障线程栈；真实首信号后的 60 秒路径没有被本次产品样本触发。在线调试确实附加并干预了目标，不能把本次 HTTP200 当无调试验收，不能拿 A／B 的耗时差作因果对照。

14 条同钟回执连续编号，绑定同一 bootId／captureId／目标身份；最大一条含宿主安全元数据为 531 字节，pending0，无投影或传输错误。`firstFailure=null` 只说明这个样本没有可见首败。GDB 捕获 stdout9452／stderr71 字节，合计9523，小于64KiB；原分类 `namespaceMismatch` 保留，ptraceRejected=false。`eofStreams=[]`，所以索引中的字节数与摘要只覆盖实际捕获部分，不能冒称完整 GDB 会话或可离线重建的原文。没有保存原 GDB 输出。

## 终态、收尾与安全原件

全窗实际为 **3229.89853529993 秒，QEMU exit0**，QMP SHUTDOWN 在宿主 elapsed3225.586548399995 秒，未到原截止。唯一目标完成后原 finish.sh 触发 guest poweroff，串口以 `reboot: Power down` 结束；没有外部 TERM 或额外 QMP quit。准确 API 状态为 Running／ExitCode0／OOMKilled=false／RestartCount0；事件集合为空且未截断，不能据此补旧样本因果。

外层 cgroup 累计内存峰值为 6215168000 字节，包含准备、复制、替身校准和 VM，不是 QEMU 纯 RSS。max／oom／oom_kill／oom_group_kill 均为0。本次没有旧外层 OOM，也没有本次 API139；历史 API139、MCP139 和 4 GiB 外层 OOM 继续分列。

原 QEMU 和控制器已退出后，按完整 ID／owner 核归属、资源与无挂载，取回安全原件，再定向 stop／rm。`2026-10-20T15:21:22.728321+00:00` 核容器 `no such object`，当前没有本次活动 VM；收尾容器 PID1 的 exit137 与 OOM=false 单独保留，不冒产品139或 QEMU 故障。Chief 已收到实时在途核验、真实终态和准确收尾结果。

[安全原件索引](../../reviews/ta01-product/amd64-api139-online-b.json)与[114 成员 ZIP](../../reviews/ta01-product/amd64-api139-online-b.zip)保存准确批准、三轮校准及首败、六个原 Git 源文件、七份实际运行输入、种子摘要、命令、同钟／目标／调试／资源和收尾回执，以及已有材料的一致性分析。ZIP 为1267341字节，SHA256 为 `e723acd7fd67971d70d30b282e75962ce878a7c080c794abcc1ad057fee7d29e`。没有 core、内存、秘密、原 GDB 输出或 guest 磁盘入库；运行后的私有材料不可假定仍能再次解析。Git 实际 blob 与普通 JSON 行尾另行核验，不用工作树摘要代提交原件。

## 判读和后续

本次唯一 B 许可已消耗，无第二台、MCP、矩阵或新预算。现有安全材料仍不足以指定因果修复，当前回证据裁定关口；不猜改业务、Node 或 QEMU，不用绿色矩阵补因果。若需新增执行、调试、运行时或保证变化，须先提交明确缺口及窄方案另行裁定，不能续用本次许可。

P1-1 保持正式复审闭合，P1-2 的 API139／MCP139 分别未闭；原三画像验收、正式 P0／P1 复审、最终准确 head 最新适用 Required 和 ready 门禁保持，PR229 继续 draft，不合入或发布。本轮只变更隔离的取证包装及报告，没有迁移、API／MCP／事件、安装配置或接入示例行为变化，因此现有接入说明与示例继续适用，无需改写为新增产品能力。本轮不运行产品门禁、CI或成果审，静态资料核验不能代替它们。

文档继续按仓库固定 zh-tech-writing `ffda9353768dece8aabd26ccb3a4978025e9437c` 及 typography／manual-structure 手检，不安装全局工具。

[静态核验记录](../../reviews/ta01-product/amd64-api139-online-b-checks.json)确认 ZIP CRC／114 成员逐字摘要、六份原 Git blob、七份实际运行输入和种子别名、Python AST 均匹配；`node scripts/check-integration-docs.mjs` 与 `git diff --check` 均退出0。宿主 Node v25.4.0 只用于静态文档检查，不冒锁定产品环境或五根检查通过。
