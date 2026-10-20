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

## 实际执行状态

启动前 MemAvailable 为 6,478,552 KiB，通过容量前置，31 个候选成员、guest 及原助手／新包装运行字节均已核。唯一 QEMU 于 `2026-10-20T14:25:49.982363+00:00` 实际启动，PID3173／startTicks69377091；准确 QEMU 二进制摘要仍为 `8a35ccba41582fc6c38b9df85fc9e35fa1d42f414d2d7d8090ee9b2f5e7c0854`。

外层控制器为 PID3160／startTicks69376751，外层 monotonic 起计 `693767.6904406`、截止 `702767.6904406`，全窗 9000 秒；QEMU 启动前的 3.23 秒准备也已计入，不因平台接续重置。准确身份、账本和原截止已告知 Chief。当前 guest 正启动，尚无调试启动或目标回执；真实最终尝试数尚未知。只观察这一台至原停止条件，终态再补实际调试、干预、退出、资源与收尾原件，不预写通过。

## 判读和后续

在线附加和停止会干预目标，本次 HTTP 结果不能代无调试产品验收。成功样本、无故障、公开 native 帧或时序先后均不关闭旧 API139／MCP139，不据此猜改业务、Node 或 QEMU。首败／目标完成／任一原期限或全窗到期先到即停；无第二台、MCP、矩阵或新预算。若有真实因果证据，再按原基础范围提出具体修复并验证。

P1-1 保持正式复审闭合，P1-2 分别未闭；原三画像验收、正式 P0／P1 复审、最终准确 head 最新适用 Required 和 ready 门禁保持，PR229 继续 draft，不合入或发布。没有迁移、API／MCP／事件、配置或接入示例行为变化，现有接入说明继续适用。

文档继续按仓库固定 zh-tech-writing `ffda9353768dece8aabd26ccb3a4978025e9437c` 及 typography／manual-structure 手检，不安装全局工具。
