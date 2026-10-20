# API139 新 A 同钟首败执行记录

## 结果

本次已批唯一新 A 已结束：全窗 2430.22 秒、QEMU0、QMP SHUTDOWN，未到 9000 秒期限。首次 `auth/install` 实际尝试一次，8261 ms 返回 HTTP 200；目标完成后沿原收尾流程关闭同台 guest。没有追加 VM、B、MCP 业务窗口或矩阵。

9 条同钟记录完整，但本样本未见首败标记、core 回执、API 重启或 die139。它不能判断旧故障发生在请求前后，也不能证明 API139／MCP139 已修复。P1-2 继续未闭，当前回到裁定关口，不送成果审或合入。

安全原件共 95 个成员，见[运行索引](../../reviews/ta01-product/amd64-api139-clock-a.json)和[原字节 ZIP](../../reviews/ta01-product/amd64-api139-clock-a.zip)。ZIP SHA-256 为 `a13f2861ebbf180c2b40b5994948cf2e671db7c6635b322962ae03733d2e9a8f`。原件包含准确命令、批准、输入摘要、六份原助手的实际 Git blob 绑定、诊断包装运行字节、同钟记录、外层资源、终态和收尾证明，不含私有 core、内存、秘密、原 GDB 原文或 guest 磁盘。

## 授权与输入

用户在原卡 `q-PiHASaTSNU-05WBsiC5me` 于北京时间 2026-10-20 13:03 选择“新 A：同钟首败单台（推荐）”。时间和卡 ID 来源于本轮接续反馈，原准备记录未提供它们时没有补造。本次执行依据是 `02ae2085a6bbc891ab116b7a6ba4e41751a734e2` 下的[方案 A](amd64-api139-next-gate.md)。这是新增一台的授权；旧 6 GiB 单台许可已消耗。B 在线 GDB、MCP 窗口、矩阵、CI、成果审和合入均不在本次范围。

原企业候选保持 CI562／`9c8bbff749c1d2a52a3e6489dcec02d2d7c859af`，manifest SHA-256 为 `c34733df5e9d45ac6fddbc504a45540779e252071d55fe22eb9bfbee2744028b`。本次重新核对已有 31 个分发成员、原 ZIP、六份原助手和 guest 镜像，不下载替代候选。产品、Node、QEMU、内核及设备保持原版本。

外层仍为 4 CPU／6 GiB，memory+swap 总上限为 6 GiB；guest 为原 4 vCPU／4 GiB／40 GiB。全窗最多 9000 秒，安装 1800 秒、健康 180 秒、首次身份 HTTP 90 秒、业务 30 秒分别保持。匿名 core 上限 512 MiB、handler 90 秒、后置 GDB 最多 60 秒保持，不采用 B 的在线附加方式。

## 诊断包装

包装以新的 `.tmp/ta01-clock-a-once/` 隔离，旧目录、原件和远端均保留。六份原助手逐字保存；只在独立诊断副本中添加同钟记录。运行指纹分别标明原产品源码和诊断包装，不能把新 handler 的字节冒称原 handler。

handler 在入口捕获 guest monotonic 和 boot ID。准确 owner／captureId／PID／startTicks／可执行文件身份核准后，先原子写入首败安全标记，再读取 core 或启动 GDB。首败标记不允许覆盖。core 仍为无 swap guest 内匿名 memfd，finally 关闭；没有原 core、私有内存、原 GDB 会话或磁盘导出。

原测试代理仅为固定 `auth-install` 路由记录请求序号及接收、转发意图、request-sent、上游 headers／完成和客户端完成边界。AST 注入保留原请求 method、path、body 和 headers；不记录这些字段内容。客户端保留原一次调用、90 秒期限和原字节；新增调用意图／返回边界。原同步开始回执改在调用后补交，避免为投递观测而推迟请求；该回执的投递时间不充当请求发生时间。

监督线程至多每秒核一次首败标记。已观察到准确首败后，停止后续业务动作；在途安装 CLI 仅取消本次建立的进程组，登记取消和退出边界。Docker daemon 内已在途的 helper 或 HTTP 不能假称已召回。到原客户端调用位置时，若已见首败就跳过目标请求。首败或目标完成后，只收原预算内安全采集结果并关闭同台 VM；没有重新登记重启 PID、重试请求或第二台。

新增记录由固定字段、阶段、身份和结果白名单校验。每条至多 4 KiB，最多 31 条日志加一份首败标记；超限或投影失败即停止，不覆盖首败。宿主收件 UTC／elapsed 单独保留，不与 guest monotonic 相减。

## 启动与中断接续

新 A 使用独有准备容器，owner 为 `82762090-33f6-4ac5-811e-93a63d8f65e9`，完整容器 ID 为 `817f6b895c60168d2faf1a71d587accbfd47046d9251ed5eb623201b6b763ea5`。它没有宿主挂载、published ports、额外设备或 privileged。准备前宿主 MemAvailable 为 6,665,904 KiB，通过 6 GiB 容量前置。

Linux 容器内 7 项诊断包装替身检查全部通过，覆盖首败前跳过请求、身份隔离、记录上限、原请求字节保持、handler 标记先于 core 读取，以及进程组取消／原期限。它们不代表产品验收。早期包装生成曾有缩进／定位断言错误，Windows 测试曾因默认 GBK 解码失败；均在启动前修正，并在 Linux 全量复验。没有用 VM 调试包装。

启动前宿主 MemAvailable 为 6,398,172 KiB，再次通过容量前置。QEMU 已于 `2026-10-20T05:18:29.004023+00:00` 启动，容器内 PID 为 3099、startTicks 为 66092994。启动原件核二进制 SHA-256 `8a35ccba41582fc6c38b9df85fc9e35fa1d42f414d2d7d8090ee9b2f5e7c0854`，总窗口从本次控制器起算，不重置。

平台在外部执行期间形成 checkpoint `ee0ffd44bfe71fec7eb870595f50d94d207990b3`。接续时原宿主工具会话 79333 已不可查询，未发现本任务的宿主 `execute_once.py` 进程；没有据此重跑启动包装。只读核实专用外层内控制器 PID3086／startTicks66092605 仍在，源码摘要匹配启动账本，子 QEMU 仍是 PID3099／startTicks66092994。`2026-10-20T05:30:42.202936+00:00` 按同一外层 Linux monotonic 与进程 start ticks 核算原全窗约已过 736.91 秒、尚余 8263.09 秒；该值含 tick 量化，期限仍由原控制器执行。此时 guest 在系统准备阶段，没有最终或目标回执，尝试数当时未知。

之后平台形成 checkpoint `34c0c76dec7fa7825a1b7f08329c431a66c90751`。收到 14:10 核对反馈后，`2026-10-20T06:14:34.245973+00:00` 的实时读取确认：原 QEMU 和控制器均已退出，最终回执已存在，串口已到 poweroff。只收既有原件，没有恢复执行或重计预算。原宿主包装的 stdout／退出码没有留存，保持 `unknown-after-host-checkpoint`；不能拿 QEMU0 补成宿主 runner0。原 Linux 控制器自己的结果、QMP 事件和 guest 最终回执可核本次终态。

## 同钟边界与真实尝试

guest boot ID 为 `ca0bccbb-56ff-4d9c-a24f-283b49f07b08`，准确 API Node 为 PID7290／startTicks206841，captureId 为 `b49b483d36924f818c52b3a23ae86e42`。调用前已登记该 Node，目标完成后可执行文件 SHA-256 仍为 `638c77326270093b1251a5e72b4335c94c74856a210460341c73d6f3da647328`。没有重新登记重启 PID。

| 本次固定阶段 | 同一 guest monotonic（秒） |
| --- | ---: |
| 客户端调用意图 | 2345.227699483 |
| 代理收到固定目标路由 | 2346.414791883 |
| 代理转发意图 | 2346.472953283 |
| 代理 request-sent | 2346.563380583 |
| 上游响应 headers，HTTP 200 | 2353.276909283 |
| 上游响应读取完成 | 2353.310560583 |
| 代理客户端写入完成 | 2353.456496783 |
| 客户端调用返回，HTTP 200 | 2353.528984483 |

另有一条 `clock-driver-started`，共 9 条；均连续编号、同一 boot，绑定后的身份一致，并逐条匹配宿主回执。包含宿主收件元数据后，每条最大 443 字节，未超 4 KiB／32 条预算。无投影／传输错误，待传队列为 0。原企业前缀执行到序号 8；最终准确尝试数为 1，不沿用中途“未知”，也没有第二次调用。

记录未出现 handler 首败标记；`nativeTrace.coreObserved=false` 仅说明目标完成时未见处理回执。准确 API 状态为 running、exitCode0、OOMKilled=false、RestartCount0，限定事件区间内 die／restart／oom 列表为空且未截断。这些都是本次有限观察，不能外推为历史 139 阴性或排除故障。

## 资源、收尾与核验

外层累计 memory.peak 为 5,932,802,048 字节，含准备、输入复制和本次 VM，不是纯 QEMU RSS。memory.events 的 max、oom、oom_kill、oom_group_kill 全为 0；外层 OOMKilled=false。QEMU 已先退出，准确 owner／ID 及无挂载／设备／端口边界再次核准后，才 stop／rm 外层。PID1 随收尾产生 exit137，另记为收尾事件，不写成产品139、QEMU 失败或 OOM。

`2026-10-20T06:15:01.568435+00:00` 已核容器 no such object，未移除其他资源。容器内原件已先取回；旧树、旧各次归档、缓存和受拒目标保持。已向 Chief 发送本次真实终态及收尾状态，不等回复来推进归档。

原六份助手与 CI562 的实际 Git blob 逐字核验；运行的五份诊断文件也分别与外层取回原字节匹配。95 成员 ZIP 的 CRC／成员集合／逐字摘要核验通过，保持 `-text`。普通 JSON 索引可能由本地 CRLF 入 Git 转为 LF，不能与 ZIP 内原件字节混用。提交后的实际 Git ZIP blob 另行核验，不拿工作树摘要冒作提交证明。

包装替身在 Linux 7 项全部通过。[本次资料核验](../../reviews/ta01-product/amd64-api139-clock-a-checks.json)核 95 成员、6 份来源 Git blob 和 5 份运行诊断原字节均通过，静态文档检查及变更空白检查通过。本机 Node v25.4.0 仅用于文档核验，不是产品运行时。没有重跑产品、五根检查、CI 或成果审，也不把替身、静态检查、HTTP200 或 sample-completed 写成三画像完整验收通过。

## 判读与交付边界

同一 boot／准确 Node／captureId 的 handler 启动若早于客户端调用意图，就能反驳该尚未发起的请求触发最早故障。handler 晚于代理边界只表明时间相容，不能证明该请求致因。迟登记、缺钟、无崩溃、超限或超时均不能关闭 P1。

本次没有可见故障，因而没有取得待比较的 handler 时间，也没有新的故障栈。旧 API139 的请求因果缺口仍在，现有材料仍不足以支持安全业务补丁、Node／QEMU 替换或其他保证变化。本次授权已消耗，不自动追加窗口；B 的在线附加与新调试预算仍待独立裁定，本回合不实施。

API139、旧 MCP139 与旧外层 4 GiB OOM 继续分别记录。P1-1 保持正式复审闭合，P1-2 未闭；最终准确 head 的适用 Required、三画像实测、正式 P0／P1 成果复审及 ready 门禁保持。PR229 继续 draft。

本次没有产品、迁移、REST／MCP／事件、安装配置或接入示例行为变更。`docs/integration/README.md` 和现有命令仍适用，不改写为能力已交付。中文文档按仓库固定 zh-tech-writing `ffda9353768dece8aabd26ccb3a4978025e9437c` 及 typography／manual-structure 手检，不安装全局工具。
