# API139 新 A 同钟首败执行记录

## 授权与输入

用户在本轮反馈中选择“新 A：同钟首败单台（推荐）”。本次执行依据是 `02ae2085a6bbc891ab116b7a6ba4e41751a734e2` 下的[方案 A](amd64-api139-next-gate.md)。这是新增一台的授权；旧 6 GiB 单台许可已消耗。B 在线 GDB、MCP 窗口、矩阵、CI、成果审和合入均不在本次范围。

原企业候选保持 CI562／`9c8bbff749c1d2a52a3e6489dcec02d2d7c859af`，manifest SHA-256 为 `c34733df5e9d45ac6fddbc504a45540779e252071d55fe22eb9bfbee2744028b`。本次重新核对已有 31 个分发成员、原 ZIP、六份原助手和 guest 镜像，不下载替代候选。产品、Node、QEMU、内核及设备保持原版本。

外层仍为 4 CPU／6 GiB，memory+swap 总上限为 6 GiB；guest 为原 4 vCPU／4 GiB／40 GiB。全窗最多 9000 秒，安装 1800 秒、健康 180 秒、首次身份 HTTP 90 秒、业务 30 秒分别保持。匿名 core 上限 512 MiB、handler 90 秒、后置 GDB 最多 60 秒保持，不采用 B 的在线附加方式。

## 诊断包装

包装以新的 `.tmp/ta01-clock-a-once/` 隔离，旧目录、原件和远端均保留。六份原助手逐字保存；只在独立诊断副本中添加同钟记录。运行指纹分别标明原产品源码和诊断包装，不能把新 handler 的字节冒称原 handler。

handler 在入口捕获 guest monotonic 和 boot ID。准确 owner／captureId／PID／startTicks／可执行文件身份核准后，先原子写入首败安全标记，再读取 core 或启动 GDB。首败标记不允许覆盖。core 仍为无 swap guest 内匿名 memfd，finally 关闭；没有原 core、私有内存、原 GDB 会话或磁盘导出。

原测试代理仅为固定 `auth-install` 路由记录请求序号及接收、转发意图、request-sent、上游 headers／完成和客户端完成边界。AST 注入保留原请求 method、path、body 和 headers；不记录这些字段内容。客户端保留原一次调用、90 秒期限和原字节；新增调用意图／返回边界。原同步开始回执改在调用后补交，避免为投递观测而推迟请求；该回执的投递时间不充当请求发生时间。

监督线程至多每秒核一次首败标记。已观察到准确首败后，停止后续业务动作；在途安装 CLI 仅取消本次建立的进程组，登记取消和退出边界。Docker daemon 内已在途的 helper 或 HTTP 不能假称已召回。到原客户端调用位置时，若已见首败就跳过目标请求。首败或目标完成后，只收原预算内安全采集结果并关闭同台 VM；没有重新登记重启 PID、重试请求或第二台。

新增记录由固定字段、阶段、身份和结果白名单校验。每条至多 4 KiB，最多 31 条日志加一份首败标记；超限或投影失败即停止，不覆盖首败。宿主收件 UTC／elapsed 单独保留，不与 guest monotonic 相减。

## 当前执行状态

新 A 已有独有准备容器，owner 为 `82762090-33f6-4ac5-811e-93a63d8f65e9`，完整容器 ID 为 `817f6b895c60168d2faf1a71d587accbfd47046d9251ed5eb623201b6b763ea5`。它没有宿主挂载、published ports、额外设备或 privileged。准备前宿主 MemAvailable 为 6,665,904 KiB，通过 6 GiB 容量前置；启动前还须实核。

Linux 容器内 7 项诊断包装替身检查全部通过，覆盖首败前跳过请求、身份隔离、记录上限、原请求字节保持、handler 标记先于 core 读取，以及进程组取消／原期限。它们不代表产品验收。早期包装生成曾有缩进／定位断言错误，Windows 测试曾因默认 GBK 解码失败；均在启动前修正，并在 Linux 全量复验。没有用 VM 调试包装。

启动前宿主 MemAvailable 为 6,398,172 KiB，再次通过容量前置。QEMU 已于 `2026-10-20T05:18:29.004023+00:00` 启动，容器内 PID 为 3099、startTicks 为 66092994。启动原件核二进制 SHA-256 `8a35ccba41582fc6c38b9df85fc9e35fa1d42f414d2d7d8090ee9b2f5e7c0854`，总窗口从本次控制器起算，不重置。

本节仍在执行，尚不填写终态或目标请求数。最终以独有账本、实际 `qemu-started.json`、回执及退出／收尾原件更新。

## 判读与交付边界

同一 boot／准确 Node／captureId 的 handler 启动若早于客户端调用意图，就能反驳该尚未发起的请求触发最早故障。handler 晚于代理边界只表明时间相容，不能证明该请求致因。迟登记、缺钟、无崩溃、超限或超时均不能关闭 P1。

API139、旧 MCP139 与旧外层 4 GiB OOM 继续分别记录。P1-1 保持正式复审闭合，P1-2 未闭；最终准确 head 的适用 Required、三画像实测、正式 P0／P1 成果复审及 ready 门禁保持。PR229 继续 draft。

本次没有产品、迁移、REST／MCP／事件、安装配置或接入示例行为变更。`docs/integration/README.md` 和现有命令仍适用，不改写为能力已交付。中文文档按仓库固定 zh-tech-writing `ffda9353768dece8aabd26ccb3a4978025e9437c` 及 typography／manual-structure 手检，不安装全局工具。
