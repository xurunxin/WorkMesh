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
