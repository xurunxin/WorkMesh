# M5 当前实施与联合验收交付

本轮真实 OpenCode/Pi 四链与九类组合已执行，当前补充集成检查也已逐项通过。原完整入口在补充检查门禁退出 1，随后只续接证据门禁退出 0，不能把后者改写成原命令退出 0。正式 `_oY` 成果复审、最新 PR Required CI 和 actual Done/main 尚未取得；本卡不合入、不启下一批。

当前代码基准为 `8b42873c48358dfda26f0bf1f65341781f608ddb` 加本轮修改；[新的主线观察](input/current-main-observation.json) 实读 `996c940eb6c725fdfe408976ff9570997d1d5bdb`，相对此前 `2da4918` 只增加清理 followup 文档，本任务未改其目录。候选提交由平台生成，最终回复报告实际提交 head，不伪填未来 SHA。[旧产品报告](product-report.md)、[旧缺口](product-gaps.md) 保持各自历史失败含义。

## 实施与授权边界

此前已落地的普通 E 实时 principal 资格、事务 guard 和 receipt 授权修复继续复用活跃 Human 加 admin 或准确 Team membership，本轮没有扩角色。`apps/api/src/workbench-runner.ts` 的 status 将准确 Attempt/Turn/Session/E、实时 principal 资格及 steering 正文放在同一只读 SQL statement snapshot。原注释是 `Authorization and the returned steering body share one statement snapshot.`；没有后续正文读取、写锁、Token refresh 或领域活动。真实 PostgreSQL 并发屏障分别证明撤权在准入前提交时拒绝，以及已开始的一致快照只返回该快照的旧正文、下一请求拒绝；停止 Turn/aborted Attempt 的诊断 steering 为 null，终态普通 E 仍拒绝。Document 读、原 key receipt、新 key 写在撤 membership 后准确 403 `SESSION_SCOPE_DENIED`；恢复后原正文/receipt 可读且 effect 仍 1。inactive/admin-demotion 与合法 admin 正例、锁序和专用 settle 保留。

Runner 补齐已有 `listEvents` 的只读工具消费，不新增 REST 或能力；GET 不写 Activity。MCP 修复原生客户端缓存工具清单导致 Stop_ACK 不可调用的问题：[ADR0085](../../adr/0085-mcp-original-execution-recovery-discovery.md) 单列有条件恢复描述符，实时撤权仍失败、无原 E/read-only 不增加入口，REST 每次用原 Token 重新核状态和授权。没有数据库迁移、公开 API 参数或新事件。受限普通工具重放仍严格限三个白名单、一次 toolCall 至多两请求、同 bytes/key/body/E/If-Match、共同预算；外层 settle 和未知 provider 效果单列。

实际驱动使用现有 Windows OpenCode 2.0.26 与内置 Pi 0.87.1、本人 loopback 模型/服务和 fake Git。原生 `serve --stdio` 与 `run --server` 的私有配置/data/state、readiness/PID、EOF 退出、2 builtin skills/85 builtin plugins、用户元数据不变、受控模型原 HTTP/TLS 及完整中文实收均有原件。临时认证只在本人 loopback 进程环境；外部模型仍禁签名上传/下载两工具。Human 准备使用已授权 REST，cookie 不进入客户端或 Runner；真实 provider/model 账号、外发、新安装/登录和公共 Skill 发行没有执行。

## 四链与冻结九类

`joint-complete-current` 实际运行 905.7747903 秒，四链和后续五个故障阶段全部完成，最后因引用失败补充检查而 exit 1。`joint-combination-evidence-final` 对该原 stdout/stderr、690 个运行源码项以及 945 个补充消费源码项做精确匹配，仅续证据门禁，实际 exit 0；单条诊断链的冒证负例实际 exit 1 `M5_COMPLETED_ACTUAL_RUN_REQUIRED`。入口不是恒 throw，也不会从身份探针推断领域完成。源码入口的续接前文本经反向撤销本轮插入并与当时起止 hash 精确核对，来源说明在 [provenance](input/joint-entry-continuation-provenance.json)，不称其为当时已保存的原始正文捕获。

| 冻结类 | 当前实际证据与适用边界 |
| --- | --- |
| 正常 | O-N/P-N 为真实两消费者分别 producer、另一消费者 required child/Handoff 承接；B 新 Session Plan/批准公开等待/证据/完成、旧 A E 拒绝。O-G/P-G 为实际 producer/reviewer、Human exact-head 批准、fake Git branch/commit/PR、本人 review_result/code_review/structured review、父子完成，DB event/outbox 绑定，SDK 准备另列 |
| 越权/撤权 | O/P 跨准确 Session/Team Document 拒绝及 Human 正对照、原 E membership 撤销/恢复和 inactive/admin 降级、原 key/new key拒例、旧 A completed Delegation 拒绝。Connection rotation overlap 的精确 credential/principal 身份由当前 API stage5 原集成验证，作为 REST 合同证据，不能借作 OpenCode 模型已跑 rotation |
| 非法状态 | 实际 O/P 非法 transition/Stop/终态普通写拒，零 revision/effect；准确 E 有条件恢复发现与普通读取拒绝由实际 MCP 12 项复验。feature-disabled/provider-unsupported/profile/protocol 对照由当前 API/协议套件分层核验，不称为真实企业/厂商设备认证；Human retry 和旧事实边界保持 |
| 幂等 | 真实 Pi 单 toolCall 三白名单原请求丢响应后的第二同 key/body/E 请求、API 真 PID 重启、effect1；自有 timeout/响应流中断、后台 Token 更新不换原 headers、关闭/到期/拒绝保 unknown/unreconciled。实际 O MCP 重启后原 receipt、Room 原 key 消息单事实；provider unknown 不盲发 |
| 旧 revision | 同 owner/Session 两合法 O/P E 在唯一 Pi Attempt start 后模型屏障竞争，两提交顺序 Plan 冲突及显式新 intent 合并、stable step ID 保留；共享 Document 竞争。跨 Session 身份拒绝不冒 revision；Issue 双 C 是协议对照，Pi E 拒绝另列 |
| 事务失败 | 实际 O Plan outbox 注入 500 整体回滚、零 Plan/event/receipt；真实 Pi settle 首次 500 时 Session/Turn/Attempt/消息/完成事实全回滚，Runner 原 outer settle 同 key/body 再提交；明确 409 后仅 Turn settle、Session 仍 live、team 可见 warning。Handoff 回滚为当前协议/DB 专项，未把 GET 无写当 rollback |
| 重放 | 实际 O/P durable event/cursor 重启与 CURSOR_EXPIRED/resyncCursor 模型实收、原 Room 重复单事实；同 delivery HMAC 原 bytes 重放409、过期/非法401为真实签名协议投递。Inbox/outbox/续等待的单事实与唯一 Turn 来自客户端链及当前持久服务套件，协议回放与模型参与分别记录 |
| 并发 | 真 O/P Plan/Document 两轮竞争、两个 O 独立 Connection 模型屏障领取只一 Session；parent/reviewer 身份不混。status/principal 与 Worker Stop/撤权的两种提交顺序通过真实 pg_locks/pg_blocking_pids 实证；原 fence/权限拒绝保持 |
| 重启/恢复/Stop | MCP/API 真 child PID EOF 退出再启动；fake Git Worker 与批准等待 Worker 重启、Runner 等待退出后新进程承接唯一 continuation；O/P cursor resync、Lease 清理、原 E Stop_ACK。精确 unknown/checkpoint/Lease 丢失由当前真实服务器/Pi补充套件验证，不把 fixture app 重建称原生 PID 重启 |

客户端四链、协议夹具、Human 准备、特权 DB 故障和 fake provider 始终分列。完整 JSON/模型实收、领域事实和进程回执在 [脱敏原件索引](product-evidence-index.json) 中按 ZIP member 读取；相同名称曾覆盖的中间原件仍明确缺失，不伪补。准确状态与运行命令见 [当前矩阵](product-current-matrix.md)、[检查回执](product-checks.json) 和 [检查摘要](product-check-summary.json)。

## 必需检查与首败

当前 API 全集成 278 pass/1 skip、DB 81 pass；conformance 四个无变套件 72 pass 加修订 MCP 套件 12/12，Worker 147 pass/1 skip、恢复 1/1。原 root integration 的 exit 1 以及后续 82pass/2fail、旧桶版本6而非3的恢复首败全部保留。原 root 以 `&&` 串行执行，日志与消费源码逐文件证明已通过前缀；只续失败/未运行阶段。[分段证据](product-integration-resume.json) 最终复核 exit 0，不冒原 root 命令 rerun exit0。最终 CI validate 的实际 stdout/stderr 和共用源码 ZIP member 另存 [final CI 原件](input/final-ci-validate-evidence.json)，不再重复全份源码快照。

root lint/typecheck/unit 实际 exit0，分别 18/18、18/18、32/32 tasks，缓存15/13/28；后续只改 native acceptance/test-only 入口，conformance lint/typecheck 再实际 exit0。Runner 74、MCP 51、锁清单8、权限守卫14、真实 Pi 重放/撤权组合23为对应实际运行，不合并成虚构总数。当前 E2E 70 pass exit0；conformance build exit0、源码 build18/18 tasks/12cache exit0、CI 分类16/16与 validate exit0。其运行时刻和跨包消费指纹分列，不拿旧 aa324 checks 代当前 source。

## 支持、演示与资源

Windows 本人多 Human/Team 测试部署的两客户端核心/fake Git 链实测；个人核心链共享同一后端，但不等于 Lite compose 资源预算/硬化/发行实机。企业、其他 OS、Codex/其他客户端、真实模型/provider 账号均未测；旧三 OS/无源码发行门禁不缩减。外部签名传输两工具不支持本次模型调用，Pi 受控真实 store 传输结果不借给外部。

复现先阅读 owner 和原件索引，恢复本人既有容器并核 ID/label；测试准备隔离新空 DB/桶后，从根 `pnpm.cmd --filter @workmesh/conformance acceptance:joint` 运行四链及故障，必须另绑定当前补充检查。`--journey`/`--fault` 只做诊断，不授整卡通过；`--verify-completed-run` 仅能复核已完成四链/故障且唯一失败是补充检查门禁的原命令，要求所有原字节/消费源码匹配。

资源组成、准确可回收项、未证 DLL/历史恢复引用、逻辑与物理大小差异见 [中文资源报告](product-resources-current.md)。本人已退出子流程的50个 EXE hardlink 名称已收尾，原 bytes/canonical 保留；共享 cache/store/image、其他任务和 G1D0C3/父目录不动。本轮健康检查已取得实际退出，CIM 无本人 Node/OpenCode 服务残留；精确3个本人容器停止 exit0、after全部Running=false，见 [收尾回执](product-cleanup.json)。容器/卷/数据库/桶/镜像/恢复目录保留；旧中断命令缺失退出仍是unknown。没有后台自动删除。
