# C1 渠道投递实施与审查证据

本文及原归档记录审核基点 `9c10ca4` 的历史实施结果；三项独审反馈的修复、新源码绑定、完整回归及本轮清理见 [独审修复证据](review-fixes/README.md)。历史日志和绑定未覆盖为新结果，旧验证器可用 `--source-ref 9c10ca4` 精确复核原受测 Git blob。

本次依据用户已确认的完整计划实施，交付仍停在独审与 Chief 确认门禁。未合入 main，未执行真实渠道外发或发布，不据此放行 C2。最终实际检查结果见 [验证记录](verification.json)，资源归属与清理结果见 [资源登记](resources.json)。

## 可审输入与源码绑定

- [完整中文计划阅读副本](../../plan/c1-channel-delivery/savedplan-Ry2L3-U5lGSRc8EpsaLs6.md)与[精确正文 JSON](../../plan/c1-channel-delivery/savedplan-Ry2L3-U5lGSRc8EpsaLs6.json)：当前 ID 为 `Ry2L3-U5lGSRc8EpsaLs6`，正文 UTF-8 SHA-256 为 `959cb493a06ad8b17d313d419b75cc9e46ed9bdf8697e8c7e18718a31a62367b`，未提供的版本字段保持 `null`；没有为归档另存平台计划或循环自引用。
- [本轮完整规格](current-spec.md)来自本轮 `todos(id)` 的完整 Spec 段，包含本人目标管理、精确指派收件人与收尾清理要求。原冻结来源、哈希和历史状态仍保留原意；本批使用 Todos 与仓库，不声称真实 WorkMesh 双轨同步。
- [受测源码](tested-source.json)记录工作树字节与 Git blob，包含迁移、契约、实现与测试。开工和恢复均核验 main `1078bbcd527550bfabee73093b7ffd0032d3fd24`；本轮基点 `5b908fec4c9dbcd4f3fec4f7b2c76865698f4d8f` 只有计划资料，产品改动由本轮交付。最终提交 ID 由平台生成，不猜测未来提交或远端已 push。
- [原验收与九类矩阵](test-coverage.json)保留完整原 8 项测试和 DoD，逐项列出当前用例与实际结果；历史待实现字段仅为源快照。独审、Chief 确认、实际 main 合入均不冒称通过。

## 实现范围与复用

`packages/db/src/events.ts` 在原业务事件/outbox 事务内通过内部 `domain_events.notification_sources` 捕获最小来源 ID/revision，不向对外事件 payload/DTO 暴露其他人的 Inbox ID；定向 Room 按精确受众划分，公共可见性事件只补未覆盖的负责 Human。`session-lifecycle.ts` 在同事务内先建立超时 Inbox 再生成来源事件，避免提交后来源投影切换造成漏投；`human-attention-sources.ts` 共享原只读来源查询，API 展示仍只读。worker 处理已提交事件，checkpoint、intent 与逐目标扇出原子提交。逐事件 cursor 防止低 cursor 晚提交被最大水位遗漏；事件写入器显式检测该增量列，旧阶段升级夹具仍写原事件格式；旧事件无内部快照不补发，投递事件不递归生成通知。

既有 `notification_channels` 内建渠道与偏好继续使用原路径；新增本人 provider 目标通过 `notification_channel_targets` 补充地址的秘密引用与 revision。新记录使用原 delivery 的 `webhook` 外部类别和 target.provider，旧记录继续关联 notification，新记录关联 intent/target。`notification_deliveries` 是唯一发送队列及每 intent/target 的逻辑 attempt。`createAutomationWorker.claimNotifications` / `deliverNotification` 扩展原 claim、`claim_fence`、reclaim、退避与 `effectKey`，保留既有 Web Push、通知和 webhook 路径。逐目标独立重试，已确认目标不因其他目标失败重投；八次自动重试预算耗尽进入死信，最后一次 claim 崩溃也须恢复。

发送前重新读取当前指派、Human/Team 权限、Approval 的实时 Agent 授权、偏好、目标状态与配置 revision。只投给 Inbox 精确 Human recipient、Work Item responsible Human 或 Project 级来源的明确 lead；Work Item 未指派时不能由 Project lead 替代。排队后撤权、离队、禁用或换配置均抑制外发。内容仅通用提醒、登录深链与原 source revision；不写入决策，不把目标地址当 Human 身份。

发送 checkpoint 提交后才调用 adapter；发送已开始但未完成 ack、调用超时或异常均进入未知结果，等待本人显式对账。允许确认送达、重试或终止；重试保留 delivery ID、`effectKey` 和累计 claim 次数，可能重送，承诺至少一次而非外部恰好一次。旧 fence 不确认新持有者，ack 同体重放不写、异体冲突。

目标配置按 workspace＋当前 Human 本人所有权管理，管理员无代管权限。API mutation 使用 `mutate` 的幂等预留、重放授权和当前凭据检查；修改、撤销与对账需要 `If-Match`。秘密按原 `WORKMESH_MASTER_KEY`＋pgcrypto 加密，幂等摘要用 HMAC；响应、事件、日志只留秘密引用、状态和指纹。设置页提供创建、修改、启停、撤销与未知结果对账，秘密只写不回显、不进浏览器持久缓存，保存不探测外部渠道。

## 迁移、API 与事件

新增 `packages/db/migrations/v1/0014_channel_delivery_contract.sql`，更新 `SCHEMA.sql`、Drizzle schema 与 manifest 校验和；不修改已应用迁移，不补发历史 delivery。新增目标、不可变 intent、逐事件 checkpoint 和事件内部来源快照列，扩展原 delivery 的意图/目标关联、配置 revision、发送 checkpoint、结果与对账 revision。空库与上一阶段升级、事务失败回滚、重复执行和旧记录保持由完整数据库集成检查证明。

| 方法 | 路径 | 契约 |
| --- | --- | --- |
| GET | `/api/v1/notification-channel-targets/config` | 显式声明 Redis 必需、noRedis 不支持；本批无 provider adapter |
| GET / POST | `/api/v1/notification-channel-targets` | 本人分页查询与创建，响应脱敏 |
| PATCH / DELETE | `/api/v1/notification-channel-targets/{id}` | 本人修改或撤销，revision＋幂等 |
| GET | `/api/v1/channel-notification-deliveries` | 本人分页查询投递元数据 |
| POST | `/api/v1/channel-notification-deliveries/{id}/reconcile` | 本人对账未知结果，revision＋幂等 |

新增私有事件为 `notification.channel_target.created/updated/revoked`、`notification.intent.admitted`、`notification.delivery.started/settled/suppressed/recovered/reconciled`；事件、状态与 outbox 同事务提交。`event-resources.ts` 补齐 target 的精确本人 audience 与两类 delivery 来源映射；锁清单生成与现有库存/并发检查共同约束新增 SQL。

## 验证、演示与边界

| 必需命令 | 最终实际结果 |
| --- | --- |
| `pnpm lint` | 18 个任务成功 |
| `pnpm typecheck` | 18 个任务成功 |
| `pnpm test` | 1658 成功，2 项既有 opt-in skip |
| `pnpm test:integration` | 341 成功，3 项既有 opt-in skip；数据库 78、API 163、worker 100 |
| `pnpm test:e2e` | 完整 68 成功，无失败/跳过；包含 C1 设置页与全部既有用例 |

worker 指定文件完整 36 项，其中原 14 项及新增 C1 22 项；目标 API 9 项，迁移基线 20 项全部成功。各 opt-in 原因见验证记录，C1 没有跳过。首次完整 E2E 的既有 Stage 1 委托请求没有在断言窗口完成，重验通过；根因未定位，未改该测试、产品或超时，保留截图、上下文和脱敏网络记录。本轮远端 required CI 尚待平台提交后实际运行，不引用历史 CI。

完整检查顺序为 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e`；另执行路由策略生成/校验、锁清单生成和 `pnpm ci:validate`。测试用本任务专用 PostgreSQL/Redis/RustFS、随机 bootstrap 及本地测试凭据，integration 与 E2E 不并发重置同库。确切命令、数量、跳过与失败保留在验证记录；未运行和可选 skip 不算通过。

历史 worker 定向 30 pass 和 API 6 pass 保留为历史运行事实，没有当时精确源码树绑定，不替代新组合。首败中的事件资源缺映射、对账枚举类型、迁移夹具/编辑问题、设置页隔离夹具、feature 数量断言、撤销请求的空 JSON body 和旧阶段事件写入兼容问题，均保留原日志及修复说明；机器离线中断只有启动记录，不填通过。

原日志在 [无损归档](raw-evidence.zip) 与 [内容寻址索引](raw-evidence-index.json) 中，保持生成时工作树原字节。索引的 `sourceCommit: null` 明确这些日志当时未提交；`sourceBlobId` 是原字节虚拟 Git blob 摘要，不声称旧对象存在或可达。运行 `node docs/reviews/c1/verify-evidence.mjs` 可无网络校验归档、受测源码 Git blob 和精确计划正文；Windows checkout 换行与受测原字节分开记录。

演示：在独立测试部署启用 `WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS`、迁移后以 Human 登录设置页，创建个人目标，修改/禁用/撤销并核对脱敏响应；配套 worker fake adapter 用例验证投递和未知结果对账。默认 feature 关闭，registry 为空，无 adapter 不 claim、不消耗重试；noRedis 不静默降级。Query 零投递写入，鉴权拒绝保留原独立安全审计。

真实企业微信协议校验、adapter 与官方外发归 C2；本批不实现卡片审批、身份桥接、其他渠道或真实发送验证。ADR 保留其他 Proposed 范围的原状态。未扩大需求范围；收件人与管理权限按用户已裁定规则落实，清理按追加要求执行。

## 已执行清理与保留

必要日志已在删除临时资源前无损归档并逐字节读回校验。已清理本任务三容器及其三匿名卷：`workmesh-c1-postgres`（`c32da4297855`）、`workmesh-c1-redis`（`752795a3f22f`）、`workmesh-c1-s3`（`88251e3399a6`）；完整 ID、卷 ID 与核验结果见资源登记。各卷删除前确认无其他容器引用。没有构建专用镜像，共享 postgres/redis/RustFS 基础镜像和 bridge 网络保留，没有 global prune。

自有测试服务和浏览器进程正常退出；按 PID 与创建时间核验，没有操作 tds 或他人服务。已删除 `C:\Users\xurx\AppData\Local\Temp\workmesh-c1-env.ps1`、`C:\Users\xurx\AppData\Local\Temp\workmesh-c1-playwright` 和本任务生成的 `apps/web/.next`。临时浏览器 profile 已自动清理并核验不存在；临时环境只作用于子 shell，没有修改系统环境或原 .env。原 trace/video/auth 可能含测试登录凭据，不进入仓库；必要首败截图、原上下文和脱敏网络片段保留，不声称归档了完整原 trace。

当前构建工作树、node_modules、.turbo 和其他旧 workspace 保留。本轮尚未实际合入 main；旧工作树须在合入、证据保全且没有活动引用后经正式 worktree 管理清理，不 force 抹 dirty。其他工作树占用端口的启动首败已记录，未终止或复用其服务。完整改动清单见 [文件清单](changed-files.json)。
