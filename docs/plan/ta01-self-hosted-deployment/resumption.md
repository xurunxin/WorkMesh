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
