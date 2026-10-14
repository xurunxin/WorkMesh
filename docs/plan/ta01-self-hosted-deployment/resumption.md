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
