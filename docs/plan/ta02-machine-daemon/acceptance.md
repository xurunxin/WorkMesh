# 未来产品验收与责任矩阵

## 状态和证据规则

以下全部是未来用例与完成条件，本轮未编写或运行产品测试。现有路径表示可复用的测试入口，不代表它已覆盖机器能力；新增路径全部标“待创建”。产品批准时须冻结路径和用例名，再交执行者落实。

未来每个结果记录 source SHA、实际输入 blob、producer、OS/arch、Node/pnpm、数据库版本、命令、开始／结束 UTC、退出码和原件摘要。fake、真实 PostgreSQL、原生后台、安装后设备和外部服务分列。源码存在、工具注册、CI 成功和旧组件验收都不能替代本卡实测。

## 九类适用测试

| ID／类别 | 未来冻结用例名与断言 | 现有复用路径 | 新增路径和责任 |
| --- | --- | --- | --- |
| T1 happy path | `reports-current-instance-and-dispatches-once`：管理员绑定，实例报告，三端查询同一事实，取得单 slot，start→settle 后释放；时间戳和运行版本齐全 | `apps/api/integration/workbench-runner.integration.test.ts`、`packages/conformance/src/joint-clients.conformance.test.ts` | `apps/api/integration/machines.integration.test.ts`（待创建）；P1/P5 |
| T2 越权 | `denies-cross-team-and-revoked-installation`：跨 Team 列表／详情／mutation／事件／回执拒绝；禁用、撤权、rotation overlap、principal/grant 失效；机器身份不能做业务写或 shell | `apps/api/integration/stage5-agent-connections.integration.test.ts`、`route-policy-authorization.integration.test.ts`、`stage5-connector.integration.test.ts` | `machines-authorization.integration.test.ts`（在 `apps/api/integration/`，待创建）；P1/P5 |
| T3 非法状态 | `rejects-disabled-draining-old-instance-and-terminal-writes`：禁用后探测成功仍禁用；旧 epoch、stale、Stop、终态 start/settle 拒绝；非法升级／回退状态拒绝 | `apps/api/integration/workbench-controls.integration.test.ts`、`packages/domain/src/index.test.ts` | `packages/domain/src/machines.test.ts`、`apps/api/integration/machines.integration.test.ts`（待创建）；P1/P2/P3 |
| T4 重复幂等 | `replays-same-dispatch-without-second-start`：同 key/body/subject 恢复；同 key 异体冲突；报告 K1/K2/retry K1 不回退；跨 key 重复 dispatch 不二次启动 | `apps/api/integration/auth-idempotency.integration.test.ts`、`apps/connector/src/connect.test.ts` | `apps/api/integration/machine-admission.integration.test.ts`、`apps/machine-daemon/src/dispatch.test.ts`（待创建）；P1/P2/P3 |
| T5 旧 revision | `rejects-stale-policy-and-target-revision`：双管理员改容量／禁用／固定目标；旧 If-Match 不覆盖新状态；heartbeat 不推进管理 revision | `apps/api/integration/stage5-agent-connections.integration.test.ts` 的 ETag 模式 | `apps/api/integration/machines.integration.test.ts`（待创建）；P1 |
| T6 事务失败 | `rolls-back-slot-attempt-event-and-outbox-together`：在占用、Attempt 绑定、event、outbox 各边界注入失败，状态全部回滚；commit 前零子进程启动／外发 | `apps/api/integration/agent-lock-order.integration.test.ts`、`workbench-runner.integration.test.ts` | `apps/api/integration/machine-admission.integration.test.ts`、`packages/db/integration/machines-migration.integration.test.ts`（待创建）；P1/P2 |
| T7 webhook/job 重放 | `replays-outbox-and-reclaims-worker-without-second-effect`：重复 tick、重复 outbox、发送前后崩溃、ACK 丢失；dispatch ID 和精确 epoch 收敛；旧 fence 不能写新结果 | `apps/worker/src/index.ts` 的 outbox、`apps/api/integration/workbench-recovery.integration.test.ts` | `apps/worker/src/machines.test.ts`、`apps/worker/integration/machines.integration.test.ts`（待创建）；P2/P3 |
| T8 并发 | `serializes-two-machines-two-processes-and-stop-race`：两台机器争同 Turn、同机双进程争最后 slot、容量满排队；禁用／Stop／撤权与 claim/start/settle 真实 PG 屏障竞争 | `packages/db/src/agent-concurrency.test.ts`、`agent-concurrency-inventory.test.ts`、`apps/api/integration/agent-lock-order.integration.test.ts` | `apps/api/integration/machine-admission.integration.test.ts`、`apps/machine-daemon/test/instance.platform.test.ts`（待创建）；P2/P3 |
| T9 重启／outbox 恢复 | `recovers-with-new-epoch-and-quarantines-unknown-process`：API/worker/daemon 与 OS 各自重启；先提交后丢响应；未知进程保隔离；旧结果／旧续租拒绝；等待只生成唯一新 continuation | `apps/api/integration/workbench-recovery.integration.test.ts`、`packages/db/src/workbench-execution-waits.ts`、`apps/connector/test/install.integration.test.ts` | `apps/worker/integration/machines.integration.test.ts`、`apps/machine-daemon/test/recovery.platform.test.ts`（待创建）；P2/P3/P4 |

九类都适用于本特性，没有整类不适用。T7 的机器新增协议建议不新增独立 webhook 消费者，因此“新机器 webhook HMAC”不适用；仍需回归原 Session webhook 的原始字节 HMAC、重放窗口和及时 ACK。机器 outbox、job、dispatch 重放全部适用。T9 的完整 OS 重启只能由真实选定平台验收，内存替身不能证明。

## 原卡专项测试

| ID／原责任 | 未来用例与完成证据 | 路径与边界 |
| --- | --- | --- |
| S1 两机／双进程、满容量、公平性 | `keeps-agent-and-machine-capacity-separate`、`queues-pinned-target-without-failover`、`admits-oldest-eligible-request`；两个不同 Agent 共机仍不超 slot，同 Agent 跨机仍不超 maxConcurrency；固定不可用不迁移；取消／过期不遗留占用 | `apps/api/integration/machine-admission.integration.test.ts`（待创建）；真实 PG 与两个受控 daemon，不能只在数组 mock 中证明 |
| S2 乱序／离线／时钟／fencing | `ignores-old-sequence-without-renewal`、`rejects-old-epoch-after-reboot`、`does-not-release-unknown-physical-slot`；时钟快慢、回拨、系统挂起、网络分区、同序异体；迟到旧 start/settle/ACK/renew 拒绝 | `apps/worker/integration/machines.integration.test.ts`、`apps/machine-daemon/test/recovery.platform.test.ts`（待创建）；服务端数据库钟与本机单调计时分列，epoch 永不复用 |
| S3 凭据／版本和 Windows 后台 | `retains-admin-disable-after-probe-and-rotation`、`rejects-unsupported-wire-version`、`starts-in-background-without-extra-console`；轮换窗口／撤销及重启后系统秘密，foreground 互斥、正常 stop、PID 重用拒绝；三流日志和 ANSI 分块无秘密 | `apps/machine-daemon/test/instance.platform.test.ts`（待创建）；复用 `apps/connector/src/client-process.test.ts`、`connect.test.ts` 与现行 platform 套件。Windows 原生后台实测保留，连接器安全回归不代替 |
| S4 drain／升级／失败回退 | `does-not-upgrade-with-active-or-uncertain-work`、`withdraws-candidate-before-old-version-start`、`rejects-untrusted-or-incompatible-release`；并发升级、断电恢复、健康失败、磁盘不足、同版本异体、错误架构、旧 daemon 迟到；业务状态不误报 completed | `apps/machine-daemon/test/upgrade.platform.test.ts`（待创建）；复用 `apps/connector/test/install.integration.test.ts` 及 `scripts/verify-connector-install.mjs` 的已有责任。D5 选 B 另加签名撤销／未知 key／回滚攻击用例，不借 Skill 签名充数 |
| S5 schema／event／outbox／升级 | 空库与上一个已交付阶段升级；不变量、复合 FK、唯一占用／派发、epoch 单调、索引、未绑定旧数据保持 unknown；event/outbox 任一步失败全部回滚；稳态 heartbeat 有界，状态转变只发一次 | `packages/db/integration/machines-migration.integration.test.ts`（待创建）；复用 `packages/db/src/migrations.test.ts`、`packages/db/integration/migration-baseline.integration.test.ts`。新编号、SCHEMA、Drizzle、checksum、备份恢复同步；不编辑已应用迁移 |
| S6 根检查与端到端 | 产品阶段执行五项根检查、适用 Required CI、真实 API/MCP/SDK/CLI＋daemon 安装后链；记录准确 SHA 和所有 opt-in／skip | `package.json` 的 lint/typecheck/test/test:integration/test:conformance；`packages/conformance/src/`、现行 source-gates 和 connector 平台／安装。原 `test:e2e` 已退役，不重建浏览器入口 |

## DoD 和后端承接

| 原 DoD | 必须取得的未来证据 | 本轮状态 |
| --- | --- | --- |
| API/MCP、调度、CLI 一致且有时间戳 | 同一 `asOf` 快照返回机器 ID、epoch、管理／接收状态、占用、报告时间、安装与运行版本；MCP 与 SDK 实际消费；状态变动后各端明确刷新 | 仅规划，端点和工具待创建 |
| 确定性并发及离线恢复 | T4/T6—T9、S1/S2 的真实 PG 和受控双 daemon 原件；D4 选定后测试对应物理保证 | 未测，不借既有 Agent 容量测试通过 |
| 受控升级 | 选定 OS 上 S3/S4，真实停止／重启／健康失败与旧版恢复；原 pending 身份和系统秘密跨重启不变 | 未测；#20 既有升级校验仅作可复用输入 |
| 未知值不伪造可用 | 无报告、探测失败、过期、未知版本、秘密后端不可用和时间异常均有安全原因；禁用重启后仍生效 | 未测 |
| 源码／迁移／API/events 交付 | P0 冻结合同后实现并交准确差异，编号迁移和 event audience；中文接入文档、配置及可运行示例同次更新 | 本轮仅文档，无上述变化 |
| 独审和既定门禁 | 指定独审仅 P0/P1；最新适用 Required CI 和实际设备验收，问题闭合再按用户裁定 | 本轮方案送审，不替产品独审或合入 |

WebUI 资源页、视觉和浏览器检查已按 ADR0087 退役。机器查询、鉴权、事件新鲜度、Stop、容量和版本提示的后端责任由 T1/T2/T3/T8/T9、S1—S6 承接。不是将旧 UI 断言写成通过，也不依赖已关闭的 UI 卡。

## 未来演示步骤

以下仅为验收设计，不是本轮运行指导；候选命令和 API 名称待合同冻结。

1. 在批准的独有 test 环境和两个 x86 执行实例中，按管理员确认的身份建立机器绑定。通过实际 API/MCP/SDK/CLI 核对安全状态及 `asOf`。
2. 向容量为 1 的机器提交两个合法执行，第二个显示持久排队；另一台机器争相领取同一 Turn 仍只有一个业务执行。固定目标离线时展示原因，不迁移。
3. 禁用运行时，再报告探测成功；状态仍禁用。注入旧 sequence、旧 epoch、时钟偏差及旧结果，核拒绝与无重复 event。
4. 对当前实例断网／重启，按 D4 保持隔离或验证已批准的逻辑容量保证。Stop 和撤权后迟到写拒绝；核重启后的唯一 continuation 与准确 Attempt。
5. 运行中请求升级，确认 drain 和阻断。使用受审候选完成升级，再制造健康失败并回退兼容旧版；业务执行不误报成功，安装版本与实际运行版本分别显示。
6. 在批准的 Windows x64 原生环境运行后台启动、关闭终端、停止、异常退出和升级测试。核无额外控制台，保留脱敏日志和进程身份记录。
7. 完成对应数据库迁移／恢复检查及最新 Required CI。只定向收尾本次准确资源，保留原件与首败，再交成果独审。

## 回退与停止条件

新功能默认关闭；缺机器报告时保留原 readiness unknown，不虚构兼容机器。未来部署先迁移，再部署兼容 API/worker，再更新 daemon，验证后明确开启；混合旧版不自动进入新调度。

回退先停止 admission，核清所有 slot 和副作用，持久撤回候选，切到已验证兼容的旧程序，再以新实例 epoch 核账。不能降级覆盖新 journal、删除新表、回滚已提交业务事件、延长凭据窗口或改写 pending。旧版不兼容时保持 stopped，使用备份恢复须单独授权并验证一致性。

认证或路径安全拒绝、版本不兼容、签名／摘要不符、机器身份未知、进程归属不明、drain 超时、必需检查失败、设备或外部服务未获批准，均停止相应动作并保留安全回执。不得换 key、改权限、删除共享锁或扩大预算来补成功。
