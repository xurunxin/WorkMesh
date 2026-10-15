# TA01 新会话接续记录

## 来源和旧树保全

用户于 2026-10-14 12:27 批准同卡新会话接续。本次交付分支为
`tds/conv-01a138ab-2566-7f87-9d06-5b16bebd86c2`。
[PR227](https://github.com/xurunxin/WorkMesh/pull/227) 只作恢复来源；合入沿本分支正常门禁。

开工用现有 GitHub 只读接口核实际主线及旧远端分支。主线为
`c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8`。旧远端分支、PR227 和旧本地树均为
`93e70603372966fe97d8c12364319c613cefb3c5`。共同祖先就是上述主线；整合没有冲突，
保留旧 Git 祖先和全部实现。平台 git 工具因共享缓存 index.lock 失败，本次没有删除锁。

旧树准确路径、Git 状态及日志哈希见 [旧树登记](../../reviews/ta01-product/resumption-old-tree.json)。
Git 未发现已跟踪改动或未跟踪文件。被忽略的顶层验证日志保存在
[原字节归档](../../reviews/ta01-product/resumption-old-ignored-logs.zip)。旧树、候选副本、
远端分支和其他项目保留，没有 reset、clean 或覆盖旧树。

[本次平台读取](sources/resumption-todo.json)逐行保留实际返回；返回在历史测试清单中自行
截断，不补造尾部。完整规格来自本次用户注入正文。Saved plan 字段仍未同步，23:41 的
本阶段记录例外继续适用。工具集没有 WorkMesh Project／WorkItem 写接口，沿 Todos 与仓库登记。

## 双架构失败原件

CI #521／run 38461233576 的双架构及 Required CI 均失败。分别下载 raw artifact，核
source-commit.txt、result 中脚本哈希和 Git blob。两份受测源码都是上述旧 HEAD，
tree 为 `91579a20247080608d5111a0670d6f71a21d9a1c`。

| 架构 | 原件和首败 |
| --- | --- |
| amd64 | [索引](../../reviews/ta01-product/ci521-amd64-installed-product-failure.json)、[ZIP](../../reviews/ta01-product/ci521-amd64-installed-product-failure.zip)；1,516.09 s，journal 为 migrated，verify-health-and-ledger 失败，外层 INSTALL_DOCKER_COMMAND_FAILED |
| arm64 | [索引](../../reviews/ta01-product/ci521-arm64-installed-product-failure.json)、[ZIP](../../reviews/ta01-product/ci521-arm64-installed-product-failure.zip)；5,106.39 s，journal 为 staged，initialize-locked-bucket 仍为 intent，guest 记录 TimeoutExpired |

两架构仅完成离线无默认路由、错误组合和 project 锁负例。画像操作、资源样本、升级、
完整恢复及重启尚未通过。run.py:184 是宿主失败汇总，不能证明相同根因。
原件没有底层 Docker stderr，具体健康失败原因和超时期间底层状态仍未知。

## 修正和检查边界

安装工具新增固定分类、输出 SHA-256 和归属容器状态，失败诊断入 journal 和 guest 回执。
参数、环境、密钥和原始服务输出不进入证据。guest 超时时记录准确预算及捕获输出哈希。
原超时和健康断言保持。

应用镜像复用前核全部角色的清单绑定 ID、架构和来源。每次仍核全部候选字节；任一角色
缺失则导入原归档，身份不符则拒绝。减少重复导入不证明旧候选或新画像验收通过。

锁定 Node 22.19.0 的安装器单元 9 项通过，含诊断秘密排除断言。Python AST 首次因
Windows 默认 GBK 解码失败，显式 UTF-8 后通过。静态结果不代根五门禁和完整 guest。

中文文档使用固定 zh-tech-writing 提交 ffda9353768dece8aabd26ccb3a4978025e9437c，
已读 SKILL、manual-structure 和 typography。autocorrect 缺失，按清单手检。
接口、events、schema 和 ADR 状态未变；更新服务端安装说明，其余接入合同及示例沿原实现。

基础范围、原九类测试、真实验收、正式 P0/P1 成果独审、最新 Required CI 和条件合入保持。
Redis-free、filesystem、生产接入、物理最低配置及对外发布未交付。历史匿名卷、两处受拒
目录和共享资源没有重试清理。

## 健康中断后的程序回退修复

源码发现 recover-old 在缺少 pending 的中断路径上，只核迁移账本，可能漏核已启动新程序的兼容性。现将已验证清单的原始 JSON 及其候选摘要保存到 journal。新程序启动的 health intent、healthy 阶段均要求摘要有效且程序兼容，再核真实账本。缺少或损坏候选原件时拒绝，不补猜旧 journal。安装器 10 项单元通过，包含缺 pending、不同程序输入、缺原件、原件摘要损坏及兼容恢复断言。该后续修复尚未进入 9f686fd0 的 CI #522；其原件不能冒本修复的受测结果。

本机依赖首次误将 storeDir 当参数再加了一层 v3，已按准确安装进程停止。修正参数后复用旧实际缓存 510 个包，未重新下载。文档静态、ci-policy 22 项及 CI 结构在 YAML 依赖就绪前首次失败；正常 bootstrap 安装后均通过。根门禁与完整 guest 的结果另记。

## CI #522 的 amd64 健康探针首败

CI #522／run 38513459463 的 amd64 在受测源码 9f686fd0188098961168690fbfbb40a157aafa4f 上失败。1,506.18 s，仅完成原三个负例。API 和 worker 正在运行，无 OOM、无重启，但最后三次健康探针均退出 -1。其输出哈希逐字匹配 Health check exceeded timeout (3s)。PostgreSQL、Redis 和 S3 健康，迁移完成；MCP 因 API 依赖尚未健康而处于 created。原件见 [索引](../../reviews/ta01-product/ci522-amd64-health-timeout.json)和 [逐字成员归档](../../reviews/ta01-product/ci522-amd64-health-timeout.zip)。归档只选 server-install 原成员，原 artifact ZIP 哈希另记，脚本 Git blob 均核一致。

healthcheck.mjs 改用 Node 内置 HTTP／HTTPS 请求，仅核原 2xx 状态判据，收到响应头后显式退出。移除 fetch／Undici 冷启动及未消费正文、keep-alive 的进程留存。HTTP 总预算仍为 2 s，Docker 探针仍为 3 s，安装健康验证仍为 180 s；错误和超时继续拒绝。11 项安装器单元含真实子进程的成功头、503、无响应、非法协议及带凭据 URL 负例。此修正尚未通过完整 TCG guest，不将本机子进程结果当支持通过。

新 guest 负例同时要求健康中断且没有 pending 时，缺少或损坏候选清单原件返回准确错误码，current 和原卷保持。丢唤醒测试只删除本画像 Redis 的 workmesh:domain-events 提示流，再通过 REST 事件 cursor 核真实 PG 事实；不删除限流键，不宣称已测 SSE 长连接。两项均待新候选完整执行。

## 根门禁与恢复 opt-in

本机 Node 22.19.0、pnpm 9.15.4 上的 lint、typecheck、test、test:integration、test:conformance 和真实接入示例全部通过。[根检查索引](../../reviews/ta01-product/resumption-required-checks.json)及 [原件](../../reviews/ta01-product/resumption-required-checks.zip)绑定运行起点 9f686fd0、实际命令、工作树边界和六个资源不存在回执。期间 apps／packages／API／Schema／协议不变；后续 CLI 与健康探针变化另列工作树 SHA，不冒这批根检查完成新候选验收。

恢复 opt-in 的真实 PG／S3 完整恢复套件也通过，起点为 4a9df2ab。[恢复索引](../../reviews/ta01-product/resumption-recovery-checks.json)及 [原件](../../reviews/ta01-product/resumption-recovery-checks.zip)保留实际命令、结果和三个容器、三个卷的定向收尾。共享镜像、工具、旧树、匿名卷和历史受拒目录保留。

对照当前 workItemInputSchema 发现旧 guest 正例缺少必需 statusId。现从真实 GET /api/v1/teams/{id}/states 的 items 读取状态，并显式指定当前负责 Human；不修改或放宽共享合同。HTTP 首败只记录状态、固定错误码和响应哈希，不导出原响应。该 guest 修正不在 CI #523 的 4a9df2ab 输入中，须新候选受测。

CI #522 最终因新提交而取消：amd64 的实际失败原件保持，未完成 arm64 不补写产品结论。CI #523 属于中间候选，后续变更须准确区分，最新 Required CI 和正式 P0/P1 成果独审仍未完成。

## CI #524 的个人画像与第二次备份首败

amd64 的受测源码为 da39ecb013f5f028aa4d843013f871ce6dc997a5，tree 为 5cdb30699e9c8365ab24fe2edc4d531e217b395f。2,152.23 s 后失败。原件见 [索引](../../reviews/ta01-product/ci524-amd64-second-backup-failure.json)及 [原成员归档](../../reviews/ta01-product/ci524-amd64-second-backup-failure.zip)，脚本 Git blob 已核一致。

个人画像已通过真实 API／MCP、worker 私有 CA 读取 fake HTTPS provider、工件上传下载、重复幂等、Redis 故障关闭、丢提示后的 PG cursor 读取、worker 重启与持久 outbox、32 请求／4 并发、无效凭据不能登记 current、迁移前失败保旧及健康中断缺候选原件拒绝。记录包含空闲、首任务、并发原样采样，无 OOM；这些是固定完整 TCG guest 条件，不是物理最低配置。

首次兼容升级及其备份已执行，健康中断负例通过后完成 commit。随后程序回退的第二次 complete-backup 失败，journal 为 staged。原回执只有 Docker 外层代码与 stderr 哈希，不能据此猜底层原因。团队、企业、完整回退／空目标恢复及整机重启仍未验收，不将个人局部结果写为支持通过。

本次为备份失败增加已知恢复／文件系统／S3 错误码白名单，并投影私有 failure.json 的已知代码、报告及消息哈希。消息正文、连接 PID／名称、路径、环境与秘密不进入公开回执；保留原备份、维护和账本判定。新诊断尚待实际失败或通过回执。

## CI #525 的首次启动健康失败与后续探针修正

amd64 受测源码为 6340dfac008899cf2dd2f88c16c9ee193a64f256，tree 为 1a4619886d9eb7ea907a45a02eb66bd62c8ce368。1,783.97 s 后首次安装健康验证失败，只有前三个负例完成；未执行到第二次备份。API、worker、MCP 均运行，无 OOM、无重启，最后三次探针仍被 Docker 3 s 期限终止。数据服务健康。见 [索引](../../reviews/ta01-product/ci525-amd64-probe-timeout.json)与 [原成员归档](../../reviews/ta01-product/ci525-amd64-probe-timeout.zip)。原件并未记录探针内部执行阶段，不能将超时倒填为准确 CPU 或 Node 启动耗时。

上一轮 Node 内置 HTTP 探针未解决该完整 guest 失败。后续改用镜像内 curl 和 POSIX shell，避免每次启动 JavaScript VM；三个生产镜像、Lite Compose 和候选运行指纹同步引用新脚本。curl 依赖随镜像归档。保持 HTTP 2 s、Docker 3 s、安装 180 s，要求完整 2xx；重定向、不完整正文、非 2xx、无响应、非法协议和凭据 URL 拒绝。就绪端点合同不变，没有修改数据维护或恢复断言。

锁定 Node 22 的安装器单元 11 项通过；本机用已有 RustFS 镜像的准确 ID、临时 /data tmpfs 和自动删除容器运行真实 Linux shell／curl，实际覆盖上述成功及负例。没有新增匿名卷或修改共享镜像。该结果不代完整双架构安装；第二次备份根因仍未获新回执，三画像和完整恢复尚不能声明通过。

## CI #525 取消与 CI #526 双架构首败

CI #525 正常取消后，arm64 artifact 没有 result.json；保留 [索引](../../reviews/ta01-product/ci525-arm64-cancelled.json)及 [原成员](../../reviews/ta01-product/ci525-arm64-cancelled.zip)，不补造首败或通过。

CI #526 受测源码 98aeb2d65c28ce19b81358b1a04f8974f21569c2，tree 为 8a64faca5aaf62af86f3b620a8f57e3dfc4cc406。amd64 在 1,722.49 s 后首次兼容升级备份失败；健康和个人 API／MCP／工件／Redis／outbox／并发等局部检查已过，未执行到本轮中断、回退或空目标恢复。见 [amd64 索引](../../reviews/ta01-product/ci526-amd64-upgrade-backup-failure.json)及 [原件](../../reviews/ta01-product/ci526-amd64-upgrade-backup-failure.zip)。其 stderr 哈希与 #524 备份错误相同，但原件仍没有可分类原因、stdout 或 failure.json 回执，不能倒填根因。

arm64 在 5,127.22 s 后首次安装命令达到原 1,800 s 期限。镜像导入耗时 20 分 36 秒，数据服务已健康，迁移仍在运行且无 OOM／重启；没有业务或备份结果。见 [arm64 索引](../../reviews/ta01-product/ci526-arm64-install-timeout.json)及 [原件](../../reviews/ta01-product/ci526-arm64-install-timeout.zip)。两个架构的失败阶段保持分开。

后续将已批准的候选暂存实现为独立 stage，预检后导入全部绑定镜像，不启动服务或登记 current。安装时仍核所有候选字节和实际 ID。原命令、健康及完整 guest 预算，2 vCPU／4,096 MiB 和磁盘条件保持；新步骤尚待双架构实测。

源码发现同 project 的新版本可以配置不同画像、数据卷、数据库／S3 命名空间或加密身份，仅工作项读取不能证明旧工件和秘密仍可用。现于停止服务、备份与迁移前校验原绑定，明确拒绝这些变更；普通版本升级保持原数据身份，不冒已实现数据迁移或密钥轮换。安装器 12 项单元通过，包含真实 Linux 探针、标准 PG 代码与安全栈位置投影、数据绑定变更拒绝。接口、事件、Schema 和 ADR 状态未变。

准确 amd64 候选已逐项核 manifest、源码和全部分块，在本机加载。原生空库两次备份、包含私有 CA／env-file／嵌套 Docker 的备份，以及一个测试对象的备份均通过；对应 [首次夹具失败](../../reviews/ta01-product/resumption-native-backup-probe-first-failure.json)、[空库](../../reviews/ta01-product/resumption-native-backup-probe-second.json)、[嵌套调用](../../reviews/ta01-product/resumption-native-backup-probe-third.json)和 [单对象](../../reviews/ta01-product/resumption-native-backup-probe.json)回执保留各自资源登记与定向收尾。它们未包含已安装的 Human／Agent 业务快照，不能代 guest 备份失败或真实三画像验收。

独立 [模块解析实验](../../reviews/ta01-product/resumption-native-module-resolution-proof.json)在准确 API 镜像中证明 pnpm 逻辑链接路径建立 createRequire 会缺失 S3 依赖，先 realpathSync 后成功。空目标夹具改从 API 镜像的实际包路径加载依赖。该问题不倒填为前面的备份首败。

失败诊断补充 stdout／stderr 独立哈希、字节数、固定错误类型和标准 PG 代码，以及已知恢复／PG 模块的有界行号。完整路径、SQL、消息正文和秘密仍不进入回执；备份、维护与迁移断言保持。新的具体故障诊断尚待实际结果。

安装工具镜像改为复制编译后 config／contracts／Zod 的完整校验依赖，并保留 Node、Docker／Compose 与 PG 客户端；应用、worker、MCP 和数据镜像仍全部交付。本机 [工具闭包索引](../../reviews/ta01-product/resumption-slim-installer-proof.json)及 [构建、单元与上下文原件](../../reviews/ta01-product/resumption-slim-installer-proof.zip)保留首次错误的 FROM ID／registry 403、随后继承 10001 身份写 /installer 被拒及后续新 /tmp 工作目录的实际构建。没有重试被拒 registry 目标或修改旧目录权限。编译 API 基底为 98aeb2d，工具 Dockerfile／脚本为本次工作树，标签不冒全源码提交或候选通过。

本机工具闭包检查通过；Docker 报告的逻辑 Size 从 683,351,646 到 375,567,996 字节，不当物理净释放或归档大小。新镜像不继承 API 全树；空目标 bucket 夹具因此明确使用已验证 API 镜像及其包实路径。镜像瘦身、stage 和数据绑定负例尚待新双架构完整组合。固定 CPU／RAM、所有候选字节校验及原预算保持，没有预写新 PASS。

## CI #527 的个人闭环与团队 MCP 校验首败

amd64 受测源码为 008ec90aaac9d14ff5cb603f5d5132922ae02441。4,518.63 s 后失败；[索引](../../reviews/ta01-product/ci527-amd64-team-mcp-validation-failure.json)与 [原件](../../reviews/ta01-product/ci527-amd64-team-mcp-validation-failure.zip)绑定 tree、脚本 blob、成员及 artifact 哈希。个人画像完成实际安装、API／MCP／工件、Redis 故障关闭与 PG cursor、worker／outbox、并发、数据身份变更拒绝、兼容升级回退、加密完整备份、独立空目标恢复及原卷保留。该组合的局部通过不表示双架构三画像和整机重启完成。

团队画像完成业务局部及升级健康、中断缺原件负例后，commit 的 MCP 读取失败，journal 为 healthy；MCP 重启一次，无 OOM 记录，API／worker／数据服务健康。原件未采集失败请求状态、响应、具体错误或 MCP 日志分类，不能认定重启原因，也不将前面的未知备份错误倒填为已解决。企业与完整 reboot 尚未执行；arm64 结果另记。

本机准确旧 MCP 镜像的 [部分请求中断](../../reviews/ta01-product/resumption-native-mcp-abort-probe.json)和 [完整请求中断](../../reviews/ta01-product/resumption-native-mcp-inflight-abort-probe.json)均未造成进程退出，原资源按准确 ID／owner 收尾。两项不证明 guest 重启原因，未据此修改 MCP 服务。

独立源码发现安装器 SSE 只读取第一条 data，合法前置通知或注释会导致正确响应被拒。现选择唯一匹配 JSON-RPC 请求 ID 的响应，鉴权、错误拒绝、工作项 ID 与账本断言保持；重复响应、缺响应及 malformed JSON 拒绝。安装器 13 项单元通过。业务校验失败增加安全 HTTP／RPC／tool 状态、响应哈希、固定网络代码、准确归属状态与日志分类；30 s 请求预算保持，没有重试失败读取。新的失败诊断与解析改动待完整候选。

## CI #528 的团队直接 MCP 调用中断

amd64 受测源码为 991b394c0cae59367eb49eb1c4c85442f8e4403c。3,229.95 s 后，个人画像再次完成前述升级回退、备份、空目标恢复和原卷保留；团队画像的 API、重复幂等、首任务读取后，直接 MCP 请求发生 RemoteDisconnected。见 [索引](../../reviews/ta01-product/ci528-amd64-team-mcp-disconnect.json)及 [原件](../../reviews/ta01-product/ci528-amd64-team-mcp-disconnect.zip)。该错误在安装器业务校验之前，新增请求诊断没有触发；MCP 重启一次、无 OOM 记录，具体原因仍未知。企业、整机重启和完整双架构组合未完成。

现把精确安装 UUID／根哈希匹配的服务日志，送入可信工具的固定分类器；输入走 stdin，回执仅含哈希、固定错误代码／类型和已知 MCP／SDK 模块的有界行号。原始消息、路径和秘密不进入公开结果，失败诊断不改变原操作结果或超时。13 项安装器单元及 UTF-8 Python AST 通过；新诊断尚待真实 guest 失败或通过回执。

CI #527／#528 的 arm64 均正常取消；两份 artifact 均没有 result.json。分别保留 [#527 索引](../../reviews/ta01-product/ci527-arm64-cancelled.json)与 [原成员](../../reviews/ta01-product/ci527-arm64-cancelled.zip)、[#528 索引](../../reviews/ta01-product/ci528-arm64-cancelled.json)与 [原成员](../../reviews/ta01-product/ci528-arm64-cancelled.zip)。候选 manifest、源码记录、构建和串口原件保持，安装结论及首败原因未知，不补写通过。

## 已安装画像的限流验收补齐

核对发现 guest 原先只测 Redis 故障时凭据失败关闭，没有实际触发每个画像的 429。现新增 realCredentialRateLimit429：使用独有未注册邮箱和正常安装的 API／Redis，先核 INVALID_CREDENTIALS，再在最多 16 次原请求预算内要求 AUTH_RATE_LIMITED 和正整数 Retry-After。不修改生产限流默认值、不冻结或绕过 Redis TIME、不清空限流键；回执只保画像、状态序列和退避秒数。此项尚待新候选实测，CI #529 的 50cfca2 源码未包含该断言，既有个人局部通过不代本项通过。

## CI #529 的原生退出线索与独立诊断

amd64 受测源码为 50cfca24837626c10cb4bc3a02b7e015b6da60fb，2,569.11 s 后失败。个人画像再次完成原局部完整链，团队直接 MCP 请求为 RemoteDisconnected；[索引](../../reviews/ta01-product/ci529-amd64-team-mcp-exit139.json)和 [原件](../../reviews/ta01-product/ci529-amd64-team-mcp-exit139.zip)绑定受测脚本、tree、成员及 artifact。MCP 重启一次、exitCode 为 139，stdout 39 字节仅启动行、stderr 为空，未捕获 JavaScript 栈；原件无原生崩溃栈，不将该线索冒准确根因。arm64 尚在运行，另记实际结果。

检索了 [Node 上游同版本崩溃报告](https://github.com/nodejs/node/issues/59740)，但只有相似版本事实，不能认定本次是同一 OpenSSL 问题。准确旧候选 MCP 镜像的只读版本探测为 Node v22.19.0／OpenSSL 3.0.17；没有据此更换锁定 Node 或关闭 TLS 验证。

现有 CI 增加显式 workflow_dispatch 参数 native-diagnostic，默认 false。诊断模式生成新候选，编译应用源码保持，与受测诊断脚本摘要分别绑定；只装团队画像，在核安装 UUID／根哈希／镜像后由隔离 guest 内 GDB 附着准确 PID。自动加载关闭，只投影 Node／V8／OpenSSL 栈帧符号和哈希，不导出参数、局部变量、完整路径、地址、core 或秘密；附着拒绝保回执并停止该次调用。没有新增 Runner 或令牌权限。

诊断不构成三画像／重启验收，即使没有崩溃也强制非零退出，结果为 diagnostic-only，不能令 Required CI 通过。普通 PR、push 及默认手动运行仍执行原完整三画像与重启门禁。新诊断尚未实际运行。22 项 CI 策略检查、2 项栈投影隐私负例、Python AST 与 CI 静态配置校验通过；它们不冒原生故障已复现或解决。

CI #529 最终为 cancelled；amd64 及 Required CI 的实际 failure 保留，arm64 job 正常取消后的 artifact 没有 result.json。保留 [arm64 索引](../../reviews/ta01-product/ci529-arm64-cancelled.json)及 [原成员](../../reviews/ta01-product/ci529-arm64-cancelled.zip)，安装结果及首败未知。ec438487 的显式原生诊断 CI #531／38587482008 已启动；同源普通 CI #530／38587454712 正常取消，未补写产品结论。诊断尚未得到原生栈，最新完整必需验收仍未完成。

## CI #531 的诊断首败与目标文件绑定

amd64 显式诊断受测源码 ec438487de8c69de9cae4641b9c1e667d5ce8729，结果 diagnostic-only，1,272.45 s。团队直接 MCP 再次 RemoteDisconnected、进程重启一次。GDB 自身退出 1，stdout 78 字节／stderr 510 字节，无信号或原生栈；具体调试器错误仅保哈希，不能据此认定没有崩溃或倒填原因。见 [索引](../../reviews/ta01-product/ci531-amd64-native-diagnostic-no-stack.json)及 [原件](../../reviews/ta01-product/ci531-amd64-native-diagnostic-no-stack.zip)，四份 Python 脚本均与准确 Git blob 一致。新限流 429 断言仍未执行完成；arm64 诊断另记。

诊断补充固定的寄存器、命名空间、线程、符号和权限错误分类。按 [GDB 目标程序与库要求](https://www.sourceware.org/gdb/current/onlinedocs/gdb.html/Connecting.html)，显式用已核目标 PID 的 /proc/PID/exe 与 /proc/PID/root 绑定程序／库；记录实际程序二进制摘要，核 TracerPid 等于本次 GDB PID，关闭 debuginfod 和自动加载。不将该设置修正冒前一轮 GDB 退出的已知原因，也未改生产 Node、TLS 或预算。3 项栈投影隐私负例和 Python AST 通过；新的固定分类与原生栈尚待实际诊断。

## CI #533 的团队业务局部与回执收集器首败

amd64 显式诊断受测源码 7dff9923f2bb0f44af54ec5753582ffb674d0423，1,494.04 s，结果 diagnostic-only。团队实际 API／MCP／工件／Redis／outbox／并发链完成，MCP 无重启记录；新增真实限流为 401 → 429，Retry-After 为 1 秒。见 [索引](../../reviews/ta01-product/ci533-amd64-diagnostic-collector-rejection.json)及 [原件](../../reviews/ta01-product/ci533-amd64-diagnostic-collector-rejection.zip)。该模式没有三画像、升级回退、完整恢复及 reboot 验收，不构成支持通过，也不能证明原生故障解决。

诊断结束上报 native-diagnostic 时，宿主收集器的阶段白名单没有该值，因此拒绝回执并触发 HTTPError。GDB 已返回，但结果未存入最终 failure 诊断，不能倒填符号、错误分类或信号。此为新增诊断入口遗漏的配套修改，现只在显式诊断模式接受该阶段，默认完整验收仍拒绝；三类安装／配对／Session Token 均拒绝进入回执。guest 在上报前先保安全 nativeTrace，避免上报失败再丢失诊断。4 项隐私及阶段边界负例、Python AST 通过，新收集器仍待实际运行。

## CI #535 的构建前干净源码拒绝

两架构受测源码均为 e5ad38a652ec44b3c08e23e586156a8318647c22，Build immutable offline candidate 被 BUILD_CLEAN_COMMITTED_SOURCE_REQUIRED 拒绝，没有候选安装或 guest 结果。分别保留 [amd64 索引](../../reviews/ta01-product/ci535-amd64-dirty-source-build-rejection.json)与 [原件](../../reviews/ta01-product/ci535-amd64-dirty-source-build-rejection.zip)、[arm64 索引](../../reviews/ta01-product/ci535-arm64-dirty-source-build-rejection.json)与 [原件](../../reviews/ta01-product/ci535-arm64-dirty-source-build-rejection.zip)。原件未采集 git porcelain 的具体脏路径，不补造路径。

新增测试导入 run.py，后者导入研究助手；[独有源码副本实验](../../reviews/ta01-product/resumption-bytecode-clean-source-probe.json)复现 docs/reviews/b-ship/tcg/tools/__pycache__ 下未忽略缓存。仅对子进程设置 PYTHONDONTWRITEBYTECODE=1 后，测试通过且没有缓存。服务端 CI job 现冻结同一变量，并加策略删除负例；构建仍要求完整干净已提交源码，没有放宽检查或新增忽略规则。本机实验不代 Linux 候选或安装通过；回执收集修复及原生原因仍待后续实际结果。

## CI #531 arm64 的安装健康首败

arm64 显式诊断源码 ec438487，6,454.27 s，结果 diagnostic-only。首次安装 sh 达到原 1,800 s 期限；迁移已完成，verify-health-and-ledger 失败，多角色最后探针 exitCode 为 -1，输出仅哈希。未执行到业务或 GDB，与 amd64 重启分开记录。见 [索引](../../reviews/ta01-product/ci531-arm64-install-health-timeout.json)及 [原件](../../reviews/ta01-product/ci531-arm64-install-health-timeout.zip)。该原件不能证明具体 OCI exec、资源或 HTTP 错误。

诊断补充探针的固定 Docker exec／资源错误分类，以及独有 guest 的数字内存、负载及任务计数；没有原始输出、命令行、环境或任意进程名，原预算和断言保持。安装器单元首轮因遗漏 Windows 必需的 WORKMESH_HEALTH_PROBE_IMAGE 参数，12 过／1 失败；补经核准确既有 RustFS ID 后 13 项复验通过，真实 shell／curl 临时 /data 使用 tmpfs 且容器自动删除。首轮不冒全过，本机结果不代双架构 guest；新探针分类尚待候选实测。

## CI #537 的已收录诊断与自然运行捕获方式

amd64 源码 ec228240b13cd06041e803931fe238836fa72478，1,786.54 s，结果 diagnostic-only。团队业务局部及真实 429 断言完成，native-diagnostic 回执正确收录。GDB 退出 0、无 SIGSEGV／符号栈，结束时主动中止等待，只有 namespaceMismatch 提示；实际程序二进制摘要已登记。见 [索引](../../reviews/ta01-product/ci537-amd64-native-diagnostic-no-crash.json)及 [原件](../../reviews/ta01-product/ci537-amd64-native-diagnostic-no-crash.zip)。附着调试下未复现不等于之前退出 139 解决，不构成完整三画像／升级恢复／reboot 或 Required CI 通过。

后续显式诊断改为自然运行捕获：在独有、无 swap 的 guest 中登记经安装／根哈希／镜像核验的 MCP PID，临时设置 Linux core 管道。按 [Linux core(5)](https://man7.org/linux/man-pages/man5/core.5.html) 使用初始命名空间 PID，保进程 proc 条目至处理结束；核 PID、进程启动 tick 与预先登记的程序摘要，只接收准确进程，其余不捕获。原始流只进入匿名 memfd，最多 512 MiB，封存为只读；处理总限 90 s、GDB 限 60 s，不保存 core、原始内存或变量，不上传磁盘。安全 trace 原子落盘，核心数据只记字节数／摘要，恢复仅成功改过的内核设置，拒绝目标不重试。

普通产品／验收模式没有此内核设置；诊断仍只跑团队且始终非零／diagnostic-only，原请求、健康、安装和全 guest 预算保持。6 项本机边界／隐私测试与 AST 通过：Windows 不支持 memfd 时明确拒绝，无磁盘替代；Linux CI 将验证匿名文件、封存与容量负例。本机设置拒绝夹具核仅恢复成功写过的目标，受拒 core_pattern 只调用一次；夹具拒绝不冒真实内核权限拒绝。真实自然崩溃捕获尚未执行，不能冒原生原因已定位。

## CI #533 arm64 的独立原件

arm64 受测源码 7dff9923f2bb0f44af54ec5753582ffb674d0423，6,680.58 s，diagnostic-only。首次团队安装 sh 达原 1,800 s 期限；迁移完成，健康验证失败，多个角色探针 exitCode -1，原输出仅哈希。未进入 MCP 业务或原生诊断，也未完成新增 429 断言。见 [索引](../../reviews/ta01-product/ci533-arm64-install-health-timeout.json)及 [原件](../../reviews/ta01-product/ci533-arm64-install-health-timeout.zip)。14 个原成员及四份受测 Python 脚本摘要实核；不能与该轮 amd64 回执收集器拒绝混为同因，具体探针错误仍待新诊断。

## 整机重启后的后端闭环补齐

源码核对发现原整机重启分支只核 API 登录及既有工作项读取，未明确验证 MCP、工件和新 outbox 投递。现三画像重启后各自使用原 Human／Installation 身份：API 读取原项、MCP 实际读取同项、下载原工件并逐字比对、正常 API 新建工作项后核相应 domain_event 的真实 outbox 全部 delivered。保持原请求及 120 次轮询预算，不扩大权限、不直接写领域状态。MCP JSON／SSE 选择唯一准确请求 ID，通知和注释不冒业务响应。

宿主要求三画像各含四项重启证据；删除任一画像或任一项不能通过。7 项本机边界／隐私检查及有通知、重复、错误 ID、malformed 的 MCP 解析夹具通过；夹具没有执行后端，新增真实重启闭环仍未执行。当前诊断 CI #539 受测 b0613b24ccbdcfd64f2a9f86e1cfd4c5f3690110，未含本节新增断言，且该模式本来不做整机重启。后续默认完整候选须绑定新源码。

## 健康失败后实际停止候选程序

源码核查发现 P1：升级候选健康失败时，旧程序兼容检查可能拒绝，但原 catch 只写 stopped-restore-required，没有实际停止已启动的候选 API／Worker／MCP。现先持久化 stop-unvalidated-runtime intent，核安装 UUID／根哈希后按完整容器 ID 停止并实核 Running=false，再尝试旧程序兼容恢复。停止失败记 runtime-stop-failed、固定失败码和安全诊断，不重试该目标，也不启动旧程序；其他失败无法证明停止时只记 restore-required。数据服务和原卷保留。

14 项安装器单元通过，覆盖停止先于恢复、不兼容后保持停止、停止拒绝不重试／不恢复以及不能误写已停止。新增每画像真实 guest 故障夹具：同程序镜像配明确未知兼容指纹，在本任务私有生成 Compose 中原子注入失败健康探针，要求实际停止全部候选程序、旧 current 和卷身份不变。夹具不是两个已发行程序版本，也不更改普通健康预算；只有断言全部通过后才还原已知同程序夹具的私有 journal／原 Compose，意外首败保留。该完整 guest 场景尚未执行，当前 #539 的 b0613b24 未含本项修正。

本机补跑根 lint 首次漏了现有 pnpm PATH 入口，Turbo 无法找到 package manager binary、退出1；没有执行包内检查。使用已有 Node22.19.0 与 pnpm9.15.4 的 bin 后，lint／typecheck 各17任务、test共31任务均实际执行、0缓存，退出0。原命令未另保存原日志，保留工具返回事实而不补造摘要；复验日志与输入子集绑定见 [索引](../../reviews/ta01-product/resumption-latest-checks.json)及 [原件](../../reviews/ta01-product/resumption-latest-checks.zip)，该子集不是完整候选验收快照。既有根 integration／conformance 的准确原件保持，新增程序停止和重启场景仍不冒完整候选通过。

## CI #537 arm64 与 #539 amd64 的新原件

#537 arm64 源码 ec228240b13cd06041e803931fe238836fa72478，6,603.75 s，首次团队安装达到原1,800 s期限；迁移完成，健康动作为intent，容器状态采集未成功。见 [索引](../../reviews/ta01-product/ci537-arm64-health-timeout-no-status.json)及 [原件](../../reviews/ta01-product/ci537-arm64-health-timeout-no-status.zip)。未到业务／GDB，不补造具体探针原因。

#539 amd64 源码 b0613b24ccbdcfd64f2a9f86e1cfd4c5f3690110，1,194.75 s，独立团队自然运行的局部业务与429完成，naturalRun=true、captured=false；没有core或原生栈。见 [索引](../../reviews/ta01-product/ci539-amd64-natural-diagnostic-no-crash.json)及 [原件](../../reviews/ta01-product/ci539-amd64-natural-diagnostic-no-crash.zip)。两架构检查步骤均完成，但Linux内存路径的原日志现只从amd64原件核实，不把job步骤状态冒ARM原日志。该诊断仍为非零／diagnostic-only，不能证明原退出139已解决。

源码对照发现先前诊断只装团队，缺普通首败前的个人画像安装、升级、恢复和停止，团队端口也由原index1变为index0。后续诊断保留原个人闭环前序和原端口，再仅对团队核准确自然进程；诊断前序不运行新增健康故障夹具，以保原场景。默认完整模式仍执行全部新增故障／重启和三画像断言，诊断仍不能满足Required CI。没有据此推断前序、端口、Node或QEMU就是原因。

## CI #540 的真实停止通过与团队再次退出139

amd64 完整模式受测源码39edad1703016901ef679336c58ff5522870d4e0，2,796.40 s，failed。个人画像完成新增真实429、原升级回退／完整加密备份／独立空目标恢复，以及真实健康故障：API／Worker／MCP全部停止，不兼容恢复拒绝，原current和数据卷身份不变。见 [索引](../../reviews/ta01-product/ci540-amd64-personal-stop-pass-team-exit139.json)及 [原件](../../reviews/ta01-product/ci540-amd64-personal-stop-pass-team-exit139.zip)。这只证明该画像该架构的故障场景，新停止逻辑不冒全矩阵通过。

随后团队直接MCP再次RemoteDisconnected，exitCode139、重启一次，日志只有39字节启动行／空stderr；当前OOM字段false不证明历史没有OOM。API／Worker健康。故障回执MemTotal4,009,852KiB、MemAvailable3,155,160KiB、无swap，负载4.97／4.20／3.82；这些是该时刻数字，不据此认定或排除历史原因。企业与完整重启未执行，Required CI未通过，保原前序自然诊断 #541 另候实际结果。

## CI #539 arm64 的应用就绪失败

arm64 显式诊断源码b0613b24ccbdcfd64f2a9f86e1cfd4c5f3690110，6,139.45 s。首次团队安装迁移完成，健康动作失败，API／Worker为starting且无启动日志，MCP仍created、未启动。见 [索引](../../reviews/ta01-product/ci539-arm64-app-readiness-failure.json)及 [原件](../../reviews/ta01-product/ci539-arm64-app-readiness-failure.zip)。未进入业务／原生捕获，不能与AMD64退出139当同因。

五条原probe输出SHA与仅含localhost端口、等待毫秒的合成curl: (7)连接失败文本完整匹配。索引标明哈希匹配推断，未改原件、未冒直接采集stderr，API exit -1未匹配仍未知。快照MemAvailable3,221,296KiB、无swap、负载18.67／14.56／9.60、runnable17／total292；不凭快照认定或排除启动根因，也不调整原预算填通过。

## CI #541 的原前序自然诊断仍未复现

amd64 显式诊断受测39edad1703016901ef679336c58ff5522870d4e0，4,987.42 s，diagnostic-only。个人原安装／升级／恢复／停止前序与团队业务、429完成，naturalRun=true、captured=false，没有core。见 [索引](../../reviews/ta01-product/ci541-amd64-prelude-natural-no-crash.json)及 [原件](../../reviews/ta01-product/ci541-amd64-prelude-natural-no-crash.zip)。该模式未执行新增健康故障、团队升级恢复、企业或完整重启；不能关闭同源常规 #540 的团队exit139。

诊断注册原先读取并散列完整Node程序，改变请求前的读取与时机；影响未量化、不认定其就是未复现原因。下一步登记核完整镜像／安装身份、只读根文件系统、PID／启动tick与程序文件device／inode／size，避免请求前读全程序。崩溃处理时重新核同一身份，再计算实际程序SHA供trace绑定。匿名RAM、无swap、原预算及默认产品行为保持；7项本机边界检查／AST通过，新Linux身份路径与原生捕获仍待实际候选。

## CI #540 arm64 的完整模式首败

完整模式arm64受测39edad1703016901ef679336c58ff5522870d4e0，6,536.46 s。首个个人画像安装sh达到原1,800 s期限；迁移完成，健康动作failed，stop-unvalidated-runtime仅intent，没有停止完成或容器状态回执。见 [索引](../../reviews/ta01-product/ci540-arm64-health-timeout-stop-intent.json)及 [原件](../../reviews/ta01-product/ci540-arm64-health-timeout-stop-intent.zip)。不能将停止intent当已停止，AMD64个人故障通过不套此架构。

快照MemAvailable3,175,196KiB、无swap、负载49.09／32.67／18.42、runnable54／total482。启动根因和停止实际状态未知，不从快照认定原因，不修改原预算或填通过。业务、限流、升级恢复及重启均未完成；最新完整Required CI失败，原生诊断 #541 的arm64仍待实际终态。

## CI #541 arm64 的原前序安装首败

保原前序的arm64诊断受测39edad1703016901ef679336c58ff5522870d4e0，6,827.21 s，diagnostic-only。个人首次安装达到原1,800 s期限，迁移完成、健康intent，容器状态不可得。见 [索引](../../reviews/ta01-product/ci541-arm64-prelude-install-timeout.json)及 [原件](../../reviews/ta01-product/ci541-arm64-prelude-install-timeout.zip)。未到团队或自然捕获，不套AMD64未复现，也不冒完整模式停止已完成。快照runnable52／total450、负载49.18／29.11／16.37、MemAvailable3,176,608KiB、无swap，仅记录当时条件，不认定原因。

## 失败证据采集保留已核容器状态

源码核查发现旧失败采集器会在单个日志分类器超时后丢弃整个容器状态数组。现先核安装 UUID／根哈希并记录全部准确容器的状态，再逐个采集日志；某个分类失败只记录异常类型，其他状态仍保留。仅补容器主进程准确宿主 PID 的数字用户／内核 CPU tick、线程数、启动 tick 和每秒 tick 数，不读取命令行、环境、任意进程名或私有正文。计数是失败时快照，不证明等待原因或历史资源状态，也不据此调整安装预算。

Python AST 与现有边界检查通过；此项尚未完整 guest 实测。正在运行的 #543 仍绑定 e4124a49b4efce3c9b39702324d3d8646fe70532，未包含这项采集修改，不以其结果冒新采集路径通过。

实际采集片段的本机夹具见 [索引](../../reviews/ta01-product/resumption-guest-state-projection-check.json)：三个日志分类器均超时，仍保全部三角色状态、排除无归属对象与异常正文。首轮夹具漏注入 allowed，NameError 未执行完整片段；补测试输入后通过，未因此改产品代码。夹具没有执行 Docker／guest，也没有覆盖 Linux proc 实际读取。

本地六个有据镜像已定向收尾，见 [回执](../../reviews/ta01-product/resumption-local-image-cleanup.json)。先核旧候选源码、准确标签／完整ID与既有账本，探针另核owner；全量容器无消费者后逐项无force删除，再核No such image。共享依赖镜像、其他容器／镜像／卷保留，不prune、不宣称物理净释放。远端CI使用独立runner，不依赖本地已删对象。

本任务旧候选的重复解包目录另已收尾，见 [回执](../../reviews/ta01-product/resumption-local-extraction-cleanup.json)。33个文件逐项核与本地完整ZIP的字节、大小及清单摘要一致；删除前核准确工作区路径、无reparse／进程／容器挂载引用，再按原目标删除。完整ZIP仍在本地保留，作为该旧实验的恢复来源，不是最终交付候选。没有删旧工作区、历史受拒目标或唯一候选副本，不宣称物理净释放。

## CI #543 AMD64 的低读取自然诊断

受测源码e4124a49b4efce3c9b39702324d3d8646fe70532，4,991.48 s，diagnostic-only。个人原闭环及团队业务／真实429完成，naturalRun=true、captured=false，未取得core；见 [索引](../../reviews/ta01-product/ci543-amd64-cheap-identity-no-crash.json)及 [原件](../../reviews/ta01-product/ci543-amd64-cheap-identity-no-crash.zip)。14个成员及五份Python脚本与准确Git源码摘要一致；Linux身份／匿名RAM边界7项原日志通过。未运行新增健康故障、团队升级恢复、企业或整机重启，不关闭正常模式退出139，也不满足Required CI。该轮ARM64仍在运行。

减少完整程序读取后仍未复现，不能将先前未复现归因于程序散列。后续显式诊断将准确MCP进程准备与已有重复安装／空闲测量并行；业务请求前不再串行增加Docker检查。安装UUID／根哈希／实际镜像／只读根／PID与程序身份门禁不变，两次只读Docker调用各限30秒。准备未及时完成则明确拒绝此次诊断，不等到准备完成后继续请求并冒原时机；测量或准备失败保首败，已成功设置只恢复一次，受拒目标不重试。并发准备本身仍有观察影响，尚未量化，不冒故障原因或完整时序等价。

4项实际调度片段的本机夹具及AST、原7项边界检查通过，见 [索引](../../reviews/ta01-product/resumption-async-native-preparation-check.json)。夹具没有真实线程／Docker／Linux内核或guest实测，新路径尚待候选。当前普通CI #544受测1a5e5252a9c306cd3fa61b03fbd58061a09b338f，不包含异步准备；已有根源码、API／Worker／数据库及灾备等已结束门禁通过，服务端双架构和ARM64连接器仍未结束，Required CI未通过。

## CI #543 ARM64 与 #544 AMD64 的独立首败

#543 ARM64受测e4124a49b4efce3c9b39702324d3d8646fe70532，6,791.53 s，diagnostic-only。个人首次安装达到1,800 s期限；迁移完成、健康intent，容器状态采集不可得，未到团队或原生捕获。见 [索引](../../reviews/ta01-product/ci543-arm64-personal-health-timeout.json)及 [原件](../../reviews/ta01-product/ci543-arm64-personal-health-timeout.zip)。runnable44／total446、负载51.71／30.24／16.61、MemAvailable3,166,984KiB、无swap是当时快照，不认定原因。

普通#544 AMD64受测1a5e5252a9c306cd3fa61b03fbd58061a09b338f，3,494.98 s。个人业务／429及首轮升级、中断候选负例完成；随后兼容回退前complete-backup失败，失败候选摘要与原始manifest一致。见 [索引](../../reviews/ta01-product/ci544-amd64-personal-backup-epipe.json)及 [原件](../../reviews/ta01-product/ci544-amd64-personal-backup-epipe.zip)。实际分类为unhandledErrorEvent／EPIPE、stderr600字节及0cf869f6摘要，没有原正文；8个已核容器状态完整保留，API／Worker／MCP当前健康、无重启。未进入团队、新健康故障或重启，不当MCP139解决。两份原件各14成员及五脚本均实核准确Git摘要。

## PostgreSQL 工具的提前关闭输入边界

源码中runPostgresTool将文件流写入子进程stdin，却未处理该Writable的error。真实Node子进程只读32MiB文件开头后退出0，原父进程出现未处理EPIPE、退出1；见 [回执](../../reviews/ta01-product/resumption-postgres-input-fd-probe.json)。这证明实现缺陷，与#544分类相符，但不还原其未保正文的具体子阶段。[PG16说明](https://www.postgresql.org/docs/16/app-pgrestore.html)中 --list 仅列归档目录；该检查不代完整恢复。

现传递只读文件FD作为stdin、关闭父进程FD，并等子进程close和输出文件close后确认成功；非零退出、输入失败、目标已存在仍拒绝，没有吞掉工具错误。[Node22.19说明](https://nodejs.org/download/release/v22.19.0/docs/api/child_process.html)区分exit与stdio关闭，并支持传递FD。4项真实子进程回归通过；首轮夹具cwd错误、类型检查nullable错误和大Buffer深比较超时均保留，修正后类型通过，使用同字节Buffer.equals、原5秒预算保持。新根lint／typecheck／test已过，真实integration仍在运行；这些命令读取当前工作树，不能把起点Git HEAD冒为干净受测快照。

## 原生诊断须区分容器初始化进程与 Node

两份Compose均init:true，旧准备直接取Docker State.Pid，没有识别Node。[Docker说明](https://docs.docker.com/engine/containers/multi-service_container/)指出init是容器主进程。本机真实Node22实验及Docker top确认State.Pid为docker-init，Node为其直属子PID；两者exe不同，Node匹配镜像内 /usr/local/bin/node。见 [回执](../../reviews/ta01-product/resumption-native-init-pid-proof.json)。本机只证明PID层级，未复现MCP崩溃；首次日志未就绪和不存在断言大小写错误保留，容器已成功收尾、没有重复删除，共享镜像保留。

后续准备在核安装UUID／根哈希／实际镜像／只读根后，从已核主PID及其直属子进程中，按受信Node文件device／inode选择唯一Node；PPID不符、缺失、歧义均拒绝，不读取argv／环境，也不回退选择init。继续登记启动tick／程序身份，回执即使未捕获也保注册对象及容器主PID；core预算保持，8项Python边界通过，实际新guest捕获仍待验证。旧原件的注册对象摘要不改写为当前Node摘要，先前GDB无栈／captured=false不能证明Node未崩溃，更不能认定程序读取时机是根因。

根五门禁开始时保存完整工作树文件摘要；后续仅诊断Python及证据／文档有修订，TypeScript运行源码保持。交付将区分该起点与后续诊断快照，不拼成单一干净候选通过。#544 ARM64仍在运行，最新Required CI、全矩阵和正式独审仍未完成。

## CI #544 ARM64 的健康首败与实际停止

普通ARM64受测1a5e5252a9c306cd3fa61b03fbd58061a09b338f，6,614.94 s，failed。个人首次安装迁移后健康验证失败，stop-unvalidated-runtime实际completed；后续8个已核状态完整保留，API／Worker／MCP全部停止、PG／Redis／S3数据服务健康。见 [索引](../../reviews/ta01-product/ci544-arm64-health-failure-runtime-stopped.json)及 [原件](../../reviews/ta01-product/ci544-arm64-health-failure-runtime-stopped.zip)。14成员与五脚本实核Git摘要。与此前仅intent／状态未知区分，本轮证明该故障后的程序停止，不是AMD64同程序不兼容恢复夹具或完整支持通过。

停止前安装器状态显示MCP健康、API／worker不健康，多角色探针含healthTimeout、exitCode -1；输出只保摘要和分类，不补正文或认定原因。停止后资源快照MemAvailable3,470,948KiB、无swap、负载12.50／16.46／11.96、runnable1／total223，不冒停止前或历史资源状态。业务、限流、升级回退、完整恢复及重启未开始。#544 Required CI失败；原MCP139与ARM64健康问题仍未闭合，新PG输入与正确Node诊断目标须由新候选验证。

## 新根检查首败、恢复通过与 M5 定向复验

新根lint／typecheck／test通过；integration退出1，conformance因首败未执行。M5两个真实Pi Connection联合链在review delegation调用前没有模型请求捕获，runner进程nativeExit0但turn为RUNNER_ANSWER_INVALID；不能以进程退出0算成功。见 [首败索引](../../reviews/ta01-product/resumption-postgres-input-required-first-failure.json)及 [原件](../../reviews/ta01-product/resumption-postgres-input-required-first-failure.zip)。记录起点1a5e525的当前工作树完整摘要与661运行输入，诊断Python／文档后续修订及6c20a93提交另列，不冒一份干净源码。所有3容器3卷已定向收尾。

同一M5用例在新独有环境定向复验通过，原断言和预算不改，另外22项按-t未执行；见 [索引](../../reviews/ta01-product/resumption-m5-pi-targeted-pass.json)及 [原件](../../reviews/ta01-product/resumption-m5-pi-targeted-pass.zip)。临时编排入口首轮缺npm_execpath、尚未创建资源时拒绝，补准确已有pnpm入口后执行；不绕锁定Node／pnpm断言。该局部通过不关闭首轮未知原因，现按原完整integration／conformance入口复验中。

真实PG／S3恢复opt-in在6c20a93源码通过，含完整加密bundle、独立空目标恢复及原合同核验，3容器3卷收尾齐全；见 [索引](../../reviews/ta01-product/resumption-postgres-input-recovery-pass.json)及 [原件](../../reviews/ta01-product/resumption-postgres-input-recovery-pass.zip)。此验证证明实际新输入路径，仍不代无源码guest全矩阵。另行conformance为6/6 adapter fixture通过，不冒原完整integration或外部客户全部完成。

6c20a93的新普通CI #545／显式诊断#546仍在运行；新的正确Node目标、完整guest、ARM64健康根因与正式独审尚未完成。现无新的授权／schema／API事件语义改变，仍不可合入。

## CI #546 AMD64 的正确 Node 目标自然诊断

受测6c20a93c3d7113d2750b8b6265abb06f28283b04，2,318.24 s，diagnostic-only。注册目标Node PID34283、容器init PID34217；个人原前序闭环与团队业务／真实429完成，naturalRun=true、captured=false，没有core。见 [索引](../../reviews/ta01-product/ci546-amd64-node-target-no-crash.json)及 [原件](../../reviews/ta01-product/ci546-amd64-node-target-no-crash.zip)。14成员及五脚本实核Git摘要，8项Linux边界原日志通过。正确选中Node后仍未复现，不证明旧退出139已解决，也不据此归因于读取／并发准备。

本轮未执行新增健康故障、团队升级恢复、企业及完整重启；其非零终态符合诊断模式设计，不满足Required CI。普通#545双架构、#546 ARM64及本机原完整integration／conformance复验仍在进行，正式成果独审未做。

## 原完整 integration／conformance 复验通过

6c20a93当前工作树在原独有编排入口执行完整integration（00:37:52–01:23:29 UTC）和conformance（01:23:29–01:23:32 UTC），均退出0，3容器3卷全部核不存在。见 [索引](../../reviews/ta01-product/resumption-postgres-input-integration-recheck-pass.json)及 [原件](../../reviews/ta01-product/resumption-postgres-input-integration-recheck-pass.zip)。复验结束后661运行输入与首轮五门禁起点原字节一致；诊断Python、文档及证据修订不属此子集，不冒完整同一快照。首轮M5失败及局部复验另保，原断言／预算保持，没有已修其未知根因的声明。

普通integration中的恢复与保留升级opt-in仍为skip；真实恢复已在6c20a93独立执行通过，不将skip倒填PASS。conformance单独为6/6 adapter fixture，真实MCP／Pi组合在integration原入口内另验。新文档静态检查通过90链接／4技能文件／35 REST／11 MCP，不代真实支持。当前双架构连接器普通CI已通过，服务端#545双架构及#546 ARM64仍待终态；三画像完整支持、重启与正式独审未完成。

## CI #545 ARM64 首次安装超时与后续停止快照

普通ARM64受测6c20a93c3d7113d2750b8b6265abb06f28283b04，6,481.70 s，failed。个人首次安装外层sh达到原1,800 s期限；迁移完成、健康失败，stop-unvalidated-runtime仍为intent。见 [索引](../../reviews/ta01-product/ci545-arm64-health-timeout-stop-intent.json)及 [原件](../../reviews/ta01-product/ci545-arm64-health-timeout-stop-intent.zip)。14成员及五脚本实核Git摘要。后续8个准确状态显示API／Worker／MCP全部停止、PG／Redis／S3健康；实际状态与journal intent分别保留，不补写completed。

安装器较早投影显示API／Worker不健康、MCP starting；数据服务也有最近三条Docker healthTimeout。API／Worker日志仅有字节／摘要，不能由239字节或94字节猜正文。外层超时后的资源快照MemAvailable3,426,044KiB、无swap、负载29.43／33.26／20.44、runnable20／total277，不代健康前或历史状态，不认定原因。未到业务、限流、升级恢复、完整重启或自然捕获；MCP139与ARM启动问题继续独立未闭合。#545 AMD64及#546 ARM64仍在运行，不能以其他门禁绿色合入。

## 下一候选的固定资源容量对照

当前6c20a93的2 vCPU／4 GiB首败记录保持。ARM64 #545包含数据服务在内的多角色近期探针均出现Docker healthTimeout，仍没有CPU为根因的证据。下一候选将完整TCG guest固定为4 vCPU／4 GiB，两架构采用同一固定设置并在原件记录；尚未执行、不预写PASS。原Docker探针3秒、HTTP2秒、健康180秒、安装外层1,800秒及guest总150分钟不变，三画像、升级故障、备份恢复、业务与整机重启断言全部保持。

这只调整既有CI内独有guest的容量对照，不注册设备／runner，不连接生产、不改变程序或保证，不宣称物理最低配置，也不将旧2 vCPU结果改写为通过。当前#545 AMD64与#546 ARM64仍使用原2 vCPU，等待其真实终态后才推送后续候选，保全部原件。

## CI #546 ARM64 健康首败与停止完成

受测6c20a93c3d7113d2750b8b6265abb06f28283b04，2 vCPU／4 GiB，6,825.33 s，diagnostic-only。个人首次安装迁移完成、健康失败；stop-unvalidated-runtime为completed，后续8状态证实API／Worker／MCP已停、数据服务健康。见 [索引](../../reviews/ta01-product/ci546-arm64-health-failure-runtime-stopped.json)及 [原件](../../reviews/ta01-product/ci546-arm64-health-failure-runtime-stopped.zip)。14成员、五脚本均实核准确Git摘要；与#545停止intent分别记录，不把较晚快照倒填更早动作。

停止后MemAvailable3,458,168KiB、无swap、负载20.11／24.96／16.13、runnable1／total224；不认定启动原因。未到团队、正确Node目标注册、自然捕获或业务／恢复／重启，不套AMD64局部通过。下一4 vCPU容量对照仍未运行；#545 AMD64仍等待终态，基础产品尚未验收完成。

下一候选另在serial输出固定ta01-progress标记：每画像仅health-ready、business-committed、profile-completed，未知画像／阶段在输出前拒绝；最多9条、没有身份、路径、凭据或请求正文。服务被终止时可从原serial核最后完成阶段，不能把标记当整机重启或完整支持通过。没有增加网络回调、变更成功判定或延长期限；少量观察开销仍存在，容量对照不冒CPU单因素根因实验。9个固定输出及2个未知输入拒绝的隔离函数检查、两Python AST通过，没有guest实测。

## CI #545 AMD64 达到总期限且无阶段回执

普通AMD64受测6c20a93c3d7113d2750b8b6265abb06f28283b04，2 vCPU／4 GiB，9,000.77 s，failed／TimeoutError：原150分钟总期限已到，result的receipts为空。见 [索引](../../reviews/ta01-product/ci545-amd64-total-budget-no-receipts.json)及 [原件](../../reviews/ta01-product/ci545-amd64-total-budget-no-receipts.zip)。14成员及五脚本实核Git摘要。serial有cloud-init完成、容器启动和安装服务最终失败行，但没有服务失败的具体原因或画像／动作完成回执；不由启动行补造业务、升级、备份恢复或重启通过，也不能据此关闭MCP139。

#545两架构完整模式均失败。旧2 vCPU运行已全部结束并保原件，后续才推送已准备的4 vCPU固定容量对照与有界serial进度标记；全部原期限／成功断言保持，新候选尚未实测，正式成果独审未做，当前不能合入。

## CI #547 四核容量对照仍达到总期限

受测066351bc64e2fc816c2d12ebc5e3efabed326a5d，两架构均为4 vCPU／4 GiB，均达到原150分钟总期限、result没有阶段回执。AMD64为9,001.18 s，ARM64为9,000.42 s；见 [AMD64索引](../../reviews/ta01-product/ci547-amd64-total-budget-profile-progress.json)／[原件](../../reviews/ta01-product/ci547-amd64-total-budget-profile-progress.zip)和 [ARM64索引](../../reviews/ta01-product/ci547-arm64-total-budget-profile-progress.json)／[原件](../../reviews/ta01-product/ci547-arm64-total-budget-profile-progress.zip)。各14成员及五脚本均实核准确Git摘要。

固定serial标记确认：AMD64个人profile-completed，团队business-committed但没有profile-completed；ARM64个人business-committed但没有profile-completed。因此只承认这些阶段，不当全画像／重启通过。4 vCPU未解决完整验收超时，不将容量调整当根因修复，MCP139仍未闭合。下一步保每命令完整字节／SHA校验，将Node读取缓冲由默认64 KiB改为1 MiB减少读取调度，并记录有界固定操作耗时以定位具体慢段；尚未guest实测，不预写性能或产品PASS。

分块散列及归档读取均固定1 MiB缓冲，仍完整读全部字节，既有文件类型／路径／大小／摘要／OCI闭包／目标实际ID校验保持，不新增缓存或mtime捷径。15项安装器单元通过，含超过缓冲边界的末块与最后一字节变更回归；这不是TCG性能通过。新增ta01-install-action固定操作耗时，128次操作最多256条，未知动作先拒绝，路径／参数／正文不输出；finished表示达到预期结果、包括预期拒绝，不表示产品PASS。隔离函数验证输出边界、原异常及上限保持，不冒实际guest运行。

只读复用本地已保留的436,135,767字节旧ZIP，Windows原生Node22记录的读取块数从6,655降到416，全部字节SHA及实际新fileHash一致，输入没有修改或删除。顺序固定、缓存未控制，不将原生时间差当TCG性能或超时原因。15项原日志、脚本、对照及实际工作树子集绑定见 [索引](../../reviews/ta01-product/resumption-hash-buffer-checks.json)／[原件](../../reviews/ta01-product/resumption-hash-buffer-checks.zip)。下一候选仍须原完整验收，当前Required失败、正式独审未做，不可合入。

## CI #548 的操作耗时与缺失失败回执

受测 26f6293992f01c5d192010b1e224c63d32c7e5c1，4 vCPU／4 GiB，两架构仍达到原 150 分钟总期限，receipts 为空。AMD64 为 9,001.42 s，个人和团队均到 profile-completed，企业仅到 health-ready；ARM64 为 9,000.78 s，个人到 business-committed，升级链第 19 次操作 commit 在 280.09 s 后标 failed，没有完整失败回执。不能由该标记区分命令失败、响应解码失败或其他异常，具体原因未知。两架构不能认定同因，MCP139 及完整重启仍未闭合。

原件与固定操作记录见 [AMD64 索引](../../reviews/ta01-product/ci548-amd64-total-budget-action-timings.json)／[原件](../../reviews/ta01-product/ci548-amd64-total-budget-action-timings.zip)及 [ARM64 索引](../../reviews/ta01-product/ci548-arm64-total-budget-action-timings.json)／[原件](../../reviews/ta01-product/ci548-arm64-total-budget-action-timings.zip)。各 14 成员及五脚本均实核准确 Git 摘要；保原完整下载 ZIP 摘要、选取 ZIP 摘要及逐成员摘要。finished 包含预期拒绝，不由动作名补造成功。Required CI job116331281353 已失败，其他已结束作业均成功，不代服务端完整支持。

ARM64 stage 为 1,157.46 s、首次实际安装为 952.06 s；后续重复确认及部分预期拒绝也超过 200 s。AMD64 对应 stage 为 332.85 s、首次安装为 313.37 s。当前只有整条安装器命令耗时，不能区分散列、配置加载、Docker 导入及请求各自成本；1 MiB 缓冲未使完整验收通过，不将时间差或阶段推进当根因证明。

## 下一候选的轻量配置入口与即时诊断

配置原先从合同总入口加载版本和功能登记，同时初始化无关合同。现抽出 runtime-metadata 入口，原公共入口重导出同一对象；13 项功能、版本值、类型和校验保持，生产 prepare 显式保留编译入口。本机 39 项配置测试通过；实际编译生产闭包证明两个入口对象相同，临时移开复制件总入口时配置仍可加载。全部复制件经准确路径及无 reparse 核验后收尾，源文件和共享依赖未修改。

Windows 原生 Node22.19 的四次新进程量测中，总入口为 123.88／127.04 ms，轻量入口为 28.73／28.99 ms；总入口导出 518 项、轻量入口 4 项。顺序及文件缓存未受控，这些数字不能折算为 TCG 效果或完整产品通过。编译输入、生产闭包、复制件账本及收尾见 [索引](../../reviews/ta01-product/resumption-runtime-metadata-checks.json)／[原件](../../reviews/ta01-product/resumption-runtime-metadata-checks.zip)。

安装器另加默认关闭的 --trace-timings，完整 guest 显式启用，提取固定阶段耗时及当前 Node CPU 数字，每操作最多 16 条、最多 128 次操作，不输出参数或 stderr 原文，也不包含 Docker 子进程 CPU。用于区分包校验、配置加载、导入和业务读取，不跳过完整字节／SHA／OCI 核验，不更改三画像、原期限、故障或重启断言。

guest 在捕获异常、读 journal、核完归属容器状态后分别即时输出固定快照，再进行原日志分类；最多三条，不新增 HTTP 成功阶段或验收通过依据。未知消息、路径、参数、身份和环境不输出，原异常仍传播。该路径及阶段耗时的边界测试已通过，尚未实际 guest 验证，不补写 #548 的缺失诊断。首轮新增 AST 夹具因 Windows 默认 GBK 读取 UTF-8 源文件而有三项 UnicodeDecodeError，工具返回留在对话，未另存完整原始日志；改为显式 UTF-8 后通过。随后 12 项 Python、15 项安装器及语法／AST 原日志在上述本机原件中。

新根五门禁及真实示例正在独有环境运行。17,071 文件摘要在首批检查运行期间生成，产品源码在命令启动前已固定且扫描期间未修改；后续文档／证据另列。它是当前工作树的运行输入记录，起点 Git HEAD26f6293 不是干净受测快照，不拼接旧 6c20a93 或 CI548 为新候选通过。没有迁移、REST/MCP 合同或事件语义变更，正式成果独审未做，当前不能合入。

## 新根 test 首败与连接器管道定向诊断

轻量入口修正已推送 38a8923e267ff60b9b3aaf2df6c9f6f23a2e8428，CI549／run38710331571 执行中，三份新增 ZIP 的实际 Git blob 与工作树原字节一致。根链的真实示例、artifact bucket、lint、typecheck 通过，test 退出 1，integration／conformance 因前序失败未执行。连接器的管道提示用例在约 10.37 s 后未满足 replied=true；原日志没有子进程退出码及其 stdout／stderr 正文，不能认定是超时、启动错误或资源竞争。

首败原件及 3 容器／3 卷收尾见 [索引](../../reviews/ta01-product/resumption-runtime-metadata-required-first-failure.json)／[原件](../../reviews/ta01-product/resumption-runtime-metadata-required-first-failure.zip)。结束后 686 个产品、测试、脚本、构建和合同输入与运行期间摘要一致，文档和证据不属于此子集；不冒一份干净完整快照。父 PID49548 的创建／关闭在原日志，后续只读查询没有其子进程，不执行猜测清理。

同一用例在独立定向诊断中通过，其他 18 项按 -t 未执行，原断言及 10 s 子进程／15 s 用例预算未改；见 [索引](../../reviews/ta01-product/resumption-runtime-metadata-pipe-targeted-pass.json)／[原件](../../reviews/ta01-product/resumption-runtime-metadata-pipe-targeted-pass.zip)。该通过不关闭首轮未知原因，也不代根 test。现在新建独有环境，按原完整五门禁入口复验；当前 Required、完整 guest 及正式独审仍待结果，不可合入。

## CI #549 灾备组件与真实 checkout 绑定

Complete disaster recovery job116340184245 通过，实际 PG／S3 恢复矩阵及恢复后 API／Worker／MCP 生产镜像 smoke 原件见 [索引](../../reviews/ta01-product/ci549-recovery-components-pass.json)／[原件](../../reviews/ta01-product/ci549-recovery-components-pass.zip)。选取七份根日志／报告及四份源码／job 投影，另保完整下载 ZIP 摘要；未纳入其他 332 成员，不将所选包称全部 artifact 原件。报告 sourceBuildSha 为 bbbb 测试夹具值，不当 runner 源码。

该 job 默认 checkout PR 合成提交 a39ca5a600329797b7afe6c0fea46d997a3df520。实际 checkout 日志、完整日志摘要及 Git API 投影证明父为 main c3dd64b 与 head38a8923，tree 为 ae9aac8747435c07b326da854e6d7c7161bdc4bd，与分支 38a8923 完全一致；不由 workflow head_sha 单独推算 runner 检出。此组件通过不代离线三画像、真实重启或当前 Required。根复验 lint／typecheck／test 已通过，integration／conformance 仍待终态。

本次没有 REST/MCP 路径、鉴权、DTO 或配置示例字段变化，因此 reference、getting-started、接入 README 及请求示例无需改输入输出；真实接入示例另已通过。新增安装诊断开关及内部加载边界已同次维护 server-installation.md，不把内部轻量入口当新产品接口。

## 规范 integration 的 M5 首败与事后观测

38a8923 的完整复验中，lint／typecheck／test 通过，integration 在内层真实 MCP/Pi 套件失败：95 项通过、1 项失败，位置为 joint-clients.conformance.test.ts:523 的 producer complete_session。DB／API 前段已通过，后续根 Worker／recovery 阶段及独立 test:conformance 未执行；不能把未到达阶段记 skip 或 PASS。原件、686 个规范输入核对和 3 容器／3 卷收尾见 [索引](../../reviews/ta01-product/resumption-runtime-metadata-integration-m5-failure.json)／[原件](../../reviews/ta01-product/resumption-runtime-metadata-integration-m5-failure.zip)。

失败 Pi 原件 nativeExit=0、captures=0，运行 18.88 s；Runner stderr 为 RUNNER_ANSWER_INVALID，控制面 telemetry 映射为通用 RUNNER_EXECUTION_FAILED。二者不是同一字段，不能由进程退出 0 认定业务成功。原夹具在解析请求及执行回调后才写 captures，0 捕获也不能证明 0 网络请求。原失败没有模型侧传输分类，当前根因未知，不套其他 CI 或旧 M5 失败的原因。

事后只在本机临时加入模型夹具的接收／解析／TLS 错误观测，原文件事前逐字保全，规范与观测 SHA 分开登记；诊断结束须按原字节恢复，不能把临时改动当受测产品源码。定向 M5 链在观测下通过，40 次接收与解析、无夹具或 TLS 错误，尚未复现整套失败。随后保原前序及预算运行完整 conformance 诊断，不以该诊断通过替代规范入口。

首轮附加 fetch 观测写入 stderr，破坏示例原有空 stderr 断言；该采集失败与 2 容器／2 卷收尾保留，不能记为产品失败。已改为退出时写独有有界文件，只记录回环 HTTPS 状态和错误分类，不改请求／响应、模型重试或断言；完整诊断仍在运行。当前 CI549 只剩服务端双架构完整 guest，仍不可合入。

## 已证实的 Pi 压缩请求夹具缺陷与规范修正

整套 conformance 观测运行通过，但 265 次接收／解析中仍有 12 次无 tools 请求触发旧夹具的 tools.map，返回 500。TypeError 消息摘要精确等于 `Cannot read properties of undefined (reading 'map')` 的 SHA-256；记录、SDK 0.87.1 文件摘要、临时源码及收尾见 [索引](../../reviews/ta01-product/resumption-pi-compaction-observation.json)／[原件](../../reviews/ta01-product/resumption-pi-compaction-observation.zip)。SDK 的独立摘要 context 没有 tools，这与业务工具请求不同。观测通过不证明夹具无误，也不补造旧 M5 原件缺失的传输数据，不能直接追认全部旧首败同因。

诊断结束后先逐字恢复原夹具，实核 SHA 与 Git diff 为空，再接入正式修正。新 pi-compaction.fixture.ts 只识别 SDK 摘要 system／developer 前缀、序列化 conversation 及空／缺失 tools，返回明确的测试摘要 SSE；未知无工具请求继续拒绝。摘要独立计数，不消耗业务回调或 captures，业务工具调用、实际结果、权限与链路断言保持；生产 Runner 的压缩及失败结算未变。

真实 HTTP 回归验证摘要正常结束、不回显会话、保留首个业务调用计数，带工具的请求即使含相同摘要前缀也仍走业务。回归、包 typecheck 和生产 build 通过，辅助文件明确从生产 build 排除。临时观测源码及 preload 不进入新规范运行；观测开销及首轮采集失败单列，不冒产品证据。

新规范五门禁已按原入口在独有环境执行，起点为 head38a8923 加本次测试夹具修正，695 个产品／测试／脚本／构建／CI／合同输入在启动前固定。真实示例、artifact bucket、lint、typecheck 已通过，test 及后续仍待结果；不把起点 HEAD 或旧 CI 当本次干净源码快照。CI549 的双架构 guest 仍在运行，当前不可合入。

## CI #549 AMD64 团队回退后真实读取首败

job116340184419 在 6313.08 s 失败，已送达 failure 回执，并非达到总期限。个人画像 profile-completed，团队画像业务已提交，rollback 操作 41 完成；随后 commit 操作 42 在 113439 ms 后失败。journal 的 validate-business-read 为 failed，具体为真实 MCP initialize 的 ECONNRESET／INSTALL_BUSINESS_VALIDATION_FAILED。完整下载 ZIP、所选 14 份原件及逐成员摘要见 [索引](../../reviews/ta01-product/ci549-amd64-rollback-mcp-reset.json)／[原件](../../reviews/ta01-product/ci549-amd64-rollback-mcp-reset.zip)。五份 Python 脚本摘要逐项核受测 Git head38a8923，源码 tree 为 ae9aac8747435c07b326da854e6d7c7161bdc4bd。

安装器当时记录 MCP running／starting、RestartCount=1；稍后的 guest 快照为 running／healthy、RestartCount=1，API／Worker 重启数为 0。没有保存 MCP 历史 die 的退出码，不能将这次连接重置认定为历史退出139或同一根因。日志、串口未出现崩溃分类也不能证明没有崩溃。失败后的可用内存约 3 GiB，不是首败瞬间资源采样，不能据此判断根因。

新增 caught／journal／owned-states 三条即时快照及固定阶段耗时已实际保存。40 次完整包校验累计约 1369.84 s，38 次轻量配置加载累计约 27.55 s；均为本次已执行操作，含预期拒绝，不是完整流程成本或优化收益证明。CPU 数值只包含安装器 Node 自身。ARM64 guest 与本机新规范 integration 仍在运行；本机示例、lint、typecheck、test 已通过，695 个固定输入仍逐字一致。当前 Required 不具备通过条件，PR 保持草稿，不可合入。

## Pi 修正后的规范五门禁终态与后续诊断边界

本机新规范五门禁全部退出0，真实示例也通过；root test 包含新的真实 HTTP 摘要夹具回归。695 个固定输入在运行前后逐字相同，未加载临时传输观测或 preload；3 容器／3 卷均按准确账本收尾。根 integration 的 recovery opt-in 仍按配置跳过，其真实验证另由 CI549 组件原件承接，不补写为本机实跑。十份根日志／输入绑定／账本见 [索引](../../reviews/ta01-product/resumption-pi-compaction-required-pass.json)／[原件](../../reviews/ta01-product/resumption-pi-compaction-required-pass.zip)。该通过不代表离线三画像、整机重启、当前 Required 或正式独审完成。

规范检查结束并核全部固定输入后，才将准备好的三份 Python 诊断修改写回仓库。普通模式业务、故障、画像、重启及期限保持；失败后仅对已核安装 UUID／根哈希的准确 ID 读取固定事件字段，保 die 退出码，最多 64 条，查询限 10 s。Docker 历史缓存不保证完整，空事件不能证明未退出，采集失败不覆盖原异常。

显式原生模式现对准 CI549 团队回退后的原 commit，保正常个人故障恢复及团队业务／升级前序；并行准备不推迟原请求，事后比注册时间与 journal 的 validate-business-read 开始时间，缺失或迟到拒绝。提交只执行一次，原异常原样上抛，finish 负责一次恢复，拒绝不重试；仍为默认关闭、非零、非 Required 的诊断，原匿名内存／无 swap／容量及时间边界保持，完整 guest 尚未执行。

新 21 项 Python 边界通过，本机 Docker 的合成 Node 退出7可准确投影历史 die，按 owner／完整 ID 核退出后移除，无卷；不当真实 MCP 崩溃。首轮不存在断言因 Docker 返回小写 no such object 失败，原失败只在工具返回，后续只读事件证实已 destroy，未再次删除；一轮只读事件查询误设未来 until 而到期，改为当前 UTC 后完成。首败、后续新身份实验、收尾与准确源码见 [索引](../../reviews/ta01-product/resumption-rollback-diagnostic-checks.json)／[原件](../../reviews/ta01-product/resumption-rollback-diagnostic-checks.zip)。这些验证不能代新完整 guest 或根因修复。

## CI #549 ARM64 与 Required 终态

ARM64 job116340184297 在 8679.98 s 失败，操作 19 为个人画像升级后的 commit，原 30 s MCP socket 读取触发 INSTALL_BUSINESS_VALIDATION_TIMEOUT，方法 tools/call、requestId=2。首次个人业务已提交，但个人完整升级／恢复闭环未完成，团队／企业及整机重启均未到达。MCP／API／Worker 当时 running／healthy、RestartCount=0；这与 AMD64 团队回退后 initialize 连接重置的记录不同，不推定同因。十四份所选原件、完整下载摘要及五份脚本对 head38a8923 的核验见 [索引](../../reviews/ta01-product/ci549-arm64-upgrade-mcp-timeout.json)／[原件](../../reviews/ta01-product/ci549-arm64-upgrade-mcp-timeout.zip)。准确 tree 仍为 ae9aac8747435c07b326da854e6d7c7161bdc4bd。

ARM64 已执行的 18 次完整包校验累计约 1457.47 s，17 次轻量配置加载累计约 31.63 s；不代表完整流程或加速比。失败后 load average 为 9.95／9.49／9.34、可用内存 3201000 KiB，是事后快照，不能单独证明瓶颈或根因。Required job116401453704 终态 failure，其余 jobs 成功；CI549 不满足合入条件，健康 jobs 不重跑来追认原失败。

针对新 ARM64 观测缺口，业务读取失败诊断补固定 requestFinished／responseStarted／responseCompleted 布尔值、响应字节数及读取耗时，状态码在响应头到达时记录。请求写入完成不证明服务端接收，未完成响应不写为成功；不记录头值／正文、不提前解析或重试、不改 30 s socket 及原完整成功判定。即时快照白名单补实际超时码。追加后的 15 项安装单元、21 项 Python 边界及 Node 语法通过，原件与准确源码见 [索引](../../reviews/ta01-product/resumption-mcp-read-progress-checks.json)／[原件](../../reviews/ta01-product/resumption-mcp-read-progress-checks.zip)。新增采集仍待新完整 guest，不能称产品根因已修复。
