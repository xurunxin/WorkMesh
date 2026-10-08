# C1 独审反馈修复

审核基点为 `9c10ca4`；开工 main 为 `1078bbcd527550bfabee73093b7ffd0032d3fd24`；健康长命令完成后，按 Chief 同步通过同一平台 git 工具 fetch/读回新 main `96e724858e692d262107c34db50b40c3ae7c122c` 并正常整合 A1。tree 与审核 head `07aa293` 一致。不改完整 savedplan、历史版本 null 或用户裁定。上一轮报告及归档保留原义，本目录承载修复后的源码绑定、首败、完整回归与资源清理，不以历史绿灯代替新组合。

## 修复与边界

| 独审意见 | 具体修改 | 新增回归 |
| --- | --- | --- |
| 授权检查与撤权竞态 | `packages/db/src/channel-notifications.ts` 的 `lockChannelAuthority` 先取得与 Team 删除互斥兼容的 workspace 外键锁，再通过 `lockAgentAuthorityPlan` 按 definition → grant → delegation → session → Work Item → Project 锁序获取完整计划，再锁来源行、Team、Human 与 membership；锁后重读并拒绝变化的资源绑定。锁持有至发送 checkpoint 提交；租期按 `clock_timestamp()` 在准备、checkpoint 和 ack 处复核。 | 七类真实双事务竞争：停用、离队、重新指派、grant 撤销、delegation 撤销、Approval 决定、Team 删除；必须实际观察 `pg_blocking_pids` 锁等待。撤权先提交时 adapter 调用为零。反向顺序证明已持有的授权锁持续到 checkpoint 提交。 |
| mutedKinds 不兼容 | delivery 持久化兼容通知类型到 `notification_kind`：Approval 统一 `approval.requested`，其他来源沿用源事件 `event_type`，发送使用 `kind: row.notification_kind`，不将 Attention 的展示分类当通知 kind。 | `approval.requested` 及未达 quorum 的 `approval.decision.recorded` 均入队后设置同名 mutedKinds，发送抑制且 adapter 调用为零。 |
| 批内等待导致 claim 过期 | `apps/worker/src/automation.ts` 默认领取一条，tick 最多处理 25 条，每条处理完再领取下一条；仅逐条隔离 `NOTIFICATION_CLAIM_LOST`，不吞掉注入的进程崩溃或其他错误。 | 完整 25 条慢 fake adapter 批次：第一条挂起时其他 24 条保持 pending、attempt_count=0；全批完成各一次 claim，并执行 Loop。prepare 与 ack 丢失分别覆盖，其余投递及 Loop 继续。 |

发送 checkpoint 提交是外发资格的线性化边界：在该提交之前提交的撤权被重读并抑制；之后的撤权不能召回已经获准的在途调用。adapter 始终在 checkpoint 事务提交后调用。旧 fence、未知发送对账及原 effectKey 语义保持。

新增 `packages/db/migrations/v1/0015_channel_notification_kind.sql`，不修改已应用迁移。旧渠道行从保留的源事件类型回填；源事件已被 retention 移除时，Approval 回填 `approval.requested`，其余回填 `<source_type>.attention_requested`。只补类型元数据，不生成 intent、不重投、不改变原 uncertain/claim/fence 状态；legacy notification 行留空，沿用原 notifications.kind。已执行的迁移字节不改，另增 `0016_approval_notification_kind.sql` 将所有旧 Approval 类型规范为 `approval.requested`，涵盖 partial quorum 事件；同样验证上一阶段升级、回滚与重复执行。manifest、Drizzle 与 SCHEMA 同步。

仅 fake 验证，未启用真实企业微信 adapter、实际外发、发布或合入。C2、独审、Chief 与 required CI 门禁保持。

## 验证证据

实际命令、开始结束时间、退出码与原日志路径见 `runs.json`。`*-checkpoint.log` 绑定整合前的 49 文件 `tested-source-before-a1.json`，原字节在 `pre-a1-source.zip`；不计作新 main 组合验收。`*-integrated.log` 绑定整合 A1 后、补齐 partial quorum 前的 58 文件 `tested-source-before-kind-normalization.json`；其源码原字节也独立归档，不能作为最终验收。`*-accepted-source*.log` 才绑定最终 59 文件 `tested-source.json`，五项必需命令顺序执行。共享 server 的身份解析前拒绝、A1/C1 contracts 和路由均保留；仅路由矩阵生成与策略总数断言发生冲突，已生成 276 条真实路由。差异、精确 main/tree 及冲突处理见 `main-integration.json`。首次及后续失败都保留，完成后无损归档；最终数量与源码绑定以本目录 verification / tested-source 为准。原八类测试、DoD 与九类适用性完整矩阵仍见上级 `test-coverage.json`，本轮完整重跑覆盖原测试并增加上述竞态断言；新增审核断言与原测试的对应关系见本目录 `test-coverage.json`。

最终源码绑定 SHA-256 为 `973c4b8490dc513809a5b96a1eb8a1b6e829572a3d19fb9fe113bd14a5c05aaf`。全部本地必需检查成功，期间受测的 59 个源码文件未再改变：

| 命令 | 实际结果 |
| --- | --- |
| `pnpm lint` | 18 个任务成功 |
| `pnpm typecheck` | 18 个任务成功 |
| `pnpm test` | 1662 通过，2 项原可选入口跳过，0 失败 |
| `pnpm test:integration` | 370 通过，3 项原可选入口跳过，0 失败；DB 80、API 177、worker 113，其中迁移基线 22、C1 目标 API 9、指定 worker 49、A1 readiness 14 |
| `pnpm test:e2e` | 完整 68 项通过，0 失败、0 跳过 |
| `pnpm check:route-policy`、锁清单检查、`pnpm ci:validate` | 均成功；锁清单 8 项通过；本地 CI 结构校验不代远端 required CI |

五项 skip 的实际入口和适用范围见 `environment.json`，不计通过。E2E 首次启动时发现另一个工作树占用 3100/3101，没有执行用例；归属证据见 `e2e-port-conflict.json`，未复用、停止或修改外任务服务。端口自然释放后在同一受测源码上重跑完整套件成功。

`raw-evidence.zip` 与索引无损保存 205 个逻辑条目、113 个内容成员，包括 38 份原日志、三个阶段受测源码与整合前 patch；逐字节解包比较成功后才清除已入档散日志。归档脚本首次因日志的来源 blob 字段为 null 被现有验证器拒绝，未删除原件；为日志计算原字节身份后成功，保持验证器不变。历史 71 份日志、70 个成员和 48 个源码文件仍按原审核 head 校验成功；完整计划正文哈希和版本 null 同样通过，不把历史证据重绑定为本轮源码。

首败：worker 第一轮 42 通过、5 失败，为 revoked_at 夹具约束、checkpoint 枚举及三个 Loop 无到期时间；第二轮 37 通过、10 失败，为误加不存在的 delegation 时间列及旧 Loop 重叠。不存在字段已撤回，不扩展领域语义。unit 首轮迁移末项断言仍指向旧末项，已随新增迁移更新。临时 S3 夹具最初从 API 包加载 SDK 报 MODULE_NOT_FOUND，改用其实际依赖包 artifact-storage；成功初始化 ObjectLock 测试桶。整合 A1 后 unit 首次又在原有 landing-screen 派生 budget chip 断言失败，该文件未修改；保留首败并在最终源码上完整重跑，未放宽断言或测试时间，未将未定位的失败归因于 C1。必要失败输出保留，不通过放宽测试预算或忽略错误验收。

## 收尾与复核

资源创建、ID/镜像/卷/临时绝对路径及实际清理结果见 `resources.json`。本轮容器 `9cb78424600b`（PostgreSQL）、`791861c72ade`（Redis）、`1f4bedf5bc83`（S3）和各自匿名测试卷已移除，清理前服务日志脱敏归档；没有创建专用镜像，保留共享基础镜像与 bridge，未执行 global prune。已登记的测试命令、服务、浏览器进程均退出，没有杀其他任务进程。

已清理本轮新建的 `apps/web/.next`、`C:\Users\xurx\AppData\Local\Temp\workmesh-c1-review-01a1187a`；Playwright 自行移除本轮 `playwright_chromiumdev_profile-iGH5mK`，存在性检查均为不存在。目录操作前实核绝对边界、无 reparse point、无活动引用，以单一明确路径、无 force 的 PowerShell 命令删除。认证状态及 trace 不提交；最终 E2E 运行摘要和必要原 stdout 已保全。只清本轮资源，当前工作树、依赖、其他构建服务保留；旧工作树未满足实际 main 合入及成果保全条件，保留。配置仅注入测试子进程，结束自动恢复；不改系统环境或真实部署配置。

复核入口：先运行本目录 `verify-evidence.mjs`，核验本轮归档和当前源码，同时按原审核 head 核验历史受测 blob 与计划正文；再检查本轮实际五项命令、失败恢复、适用 skip 和各条锁序。修复提交待平台生成，证据不自引用未知最终提交，不提前宣称远端可见、独审或 Chief 已通过。
