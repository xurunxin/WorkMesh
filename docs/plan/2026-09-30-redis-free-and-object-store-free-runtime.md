<!-- WM-EDGE-20260930:ROADMAP -->
# Redis-free / Object-store-free 运行时与 SQLite 评估

状态：设计完成，等待逐项实现。基线日期：2026-09-30。

规格（source of truth）：`docs/adr/0072-redis-free-and-object-store-free-runtime-profiles.md`。
本计划与 ADR 0071（Lite 单机自托管部署类）配套但独立：0071 回答「Lite 长什么样」，
本计划回答「能不能再少两个服务」。

## 结论摘要

| 候选 | 结论 | 省下的常驻内存 | 主要收益其实是 |
|---|---|---|---|
| Redis | **做** | 8–15 MB | 少一个服务、少一个 fail-closed 外部依赖 |
| RustFS | **做** | 20–40 MB | 少一套 bucket 仪式（Object Lock 初始化、保留策略模板、第二套恢复演练） |
| PostgreSQL → SQLite | **不做** | 60–90 MB | —— |

**SQLite 这一条我给的结论是「不做」，理由在下面第 4 节，是算术而不是偏好。**
复议条件已写进 ADR，不是永久否决。

## 1. 为什么 Redis 可以拿掉（证据）

代码里已经写明了，只是写在注释里：

- `apps/worker/src/index.ts:172` —「Redis is a delivery transport only.
  PostgreSQL remains the source for SSE and the durable recovery point.」
- outbox 领取走的是 **PostgreSQL**：`claimOutbox` 开事务后
  `FOR UPDATE SKIP LOCKED`（`apps/worker/src/index.ts:291-302`）。
  Redis 只被写了一次 `xAdd`（携带 durable cursor + workspaceId，MAXLEN 裁剪，
  同文件 249-258）。
- `NoopWakeSource` 已经存在（`apps/api/src/realtime/wake-source.ts:82`），
  `coordinator.ts:126-132` 有两个按 availability 门控的定时器：healthy 15 s /
  fallback 1 s。行为已被 `coordinator.test.ts:60`「uses one shared fallback
  reconciliation when Redis is unavailable」钉住。
- `admin-retention.ts:152-168` 连 Redis 只为读一个 `xLen` 健康信号。

**所以 Redis 从来不是队列，是唤醒提示总线。拿掉它的全部代价 = 事件延迟从即时
变成最多 `REALTIME_FALLBACK_RECONCILE_MS`（默认已经是 1 s）。正确性零变化。**

## 2. 有 / 没有 Redis 的影响对照

| 能力 | 有 Redis | 无 Redis（compat） | 变化 |
|---|---|---|---|
| SSE 正确性 | 强 | 强 | 无。durable cursor 一直是唯一真相源 |
| 事件可见延迟 | 即时（XREAD） | ≤ fallback 轮询间隔（默认 1 s） | 单用户 LAN 不可感知 |
| 多 API 实例广播 | 一次 XADD 唤醒全部 | 每实例各自轮询 | Lite 单实例不适用；生产类必须保留 Redis |
| 认证限流 | 跨实例共享、fail-closed | 进程内、API 重启即清零 | 单实例正确；多副本必须拒绝启动 |
| outbox 领取 | 与 Redis 无关 | 与 Redis 无关 | **零变化** |
| 内存 | +8–15 MB | 0 | 省 8–15 MB |
| 运维面 | 多一个服务/卷/健康检查 | 少一个 | **这才是主要收益** |

## 3. 有 / 没有对象存储的影响对照

S3 面很小：7 个命令 + 1 个预签名（`packages/artifact-storage/src/index.ts`）。

| 能力 | 有 RustFS | 无（filesystem） | 变化 |
|---|---|---|---|
| 制品上传 | 客户端直传 S3（预签名） | 客户端 PUT 到 WorkMesh，API 落盘 | **契约变更**，客户端与 MCP 需跟进 |
| 完整性 | 读时 `ChecksumMode: ENABLED` | API 侧重算 SHA-256 后 rename | 等价且更强（不信客户端声明值） |
| 不可变 | Object Lock COMPLIANCE | `O_EXCL` + 内容寻址 + 侧车 `retentionUntil` 只增不减 + 拒绝删除 | 等价（机制不同） |
| 误覆盖恢复 | versioning + 版本列举 | 内容寻址使覆盖不可能 | 对本用法等价；**失去版本历史列举**（当前无路径使用） |
| 保留归档 | S3 版本化 | 同样不可变 | 等价 |
| bucket 校验 | HeadBucket + GetObjectLockConfiguration | 根可写 + 锁目录 + `O_EXCL` 探测 | 等价 |
| 内存 | +20–40 MB | 0 | 省 20–40 MB |
| 恢复门禁 | `RECOVERY_TARGET_OBJECT_LOCK_REQUIRED` | 归档 + 恢复 + 重算全部校验和 | 门禁换证明形式 |

**结论：内存省 20-40 MB，运维面省掉一整套 bucket 仪式。** 版本历史列举的损失
在今天没有任何调用路径使用，已在 ADR 里点名承认而不是掩盖。

## 4. 为什么 SQLite 不做（这一节是重点）

不是「SQLite 不好」，是**成本落点和算术**。

SQLite 没有：行锁、advisory lock、`uuid`、`jsonb` 运算符、`INTERVAL`、
`SKIP LOCKED`、`unnest`、`LISTEN/NOTIFY`，且单写者。

对照仓库现状（`packages/db/src` + `apps/api/src` + `apps/worker/src`）：

| 构造 | 出现次数 |
|---|---|
| `FOR UPDATE` | 211 |
| `jsonb` | 199 |
| `::uuid` | 161 |
| `RETURNING` | 273 |
| `interval` | 146 |
| `ON CONFLICT` | 55 |
| `SKIP LOCKED` | 40 |
| `FILTER (WHERE)` | 23 |
| `pg_advisory` | 15 |

外加 56 个 SQL migration、86 KB 的 Drizzle `pg-core` schema。

所以 SQLite 移植**不是兼容层**，是：并发控制层的第二套实现 + 86 KB schema 的
孪生 + 每个 raw SQL 仓库的方言分支 + 56 个 migration 的分叉。锁序清单
（`agent-lock-order-manifest.ts` 27 KB + 27 KB 一致性测试）反而**不用移植，
直接删掉**——SQLite 让死锁结构上不可能。这一部分很便宜；199 个 `jsonb`、
161 个 `::uuid`、schema 孪生不便宜。

**决定性的是算术**：PostgreSQL 调优后 60–90 MB；本次两个开关合计省 30–55 MB；
而 ADR 0071 的 Tier 0（Worker 内嵌 API 进程 + Web 静态导出）省 240–400 MB，
是前者的 3–4 倍，且不触碰任何领域不变量。

> **1 GB 设备不是靠换数据库够到的，是靠少跑 Node 进程（或者干脆不跑）够到的。**

**复议条件（写进 ADR，可被证伪）**：若 `docs/operations/lite-footprint.md` 的实测
显示 Node 运行时已被消除、剩余常驻仍由 PostgreSQL 主导，且操作者确实拥有这样一台
设备，则本决策带数据重开。

## 任务链

E0 → E1 → E2 → E3 → E4 → E5，串行门禁。

### E0 — 能力开关（单一真源）

**目标**：`loadRealtimeRedisHintConfig` 返回判别联合
`{kind:'redis', redisUrl, maxLen} | {kind:'database'}`；新增
`WORKMESH_REALTIME_TRANSPORT`（默认 `redis`）与
`WORKMESH_ARTIFACT_STORE`（默认 `s3`）。两个开关**互相独立**，绝不互相推导。

**测试清单**
- 判别联合单测：`redis` 需要合法 URL，非法值报明确错误；`database` 完全不读
  `REDIS_URL`，不设置也能启动。
- 默认值回归：两者都不设置时行为与今天逐字节一致。
- 显式性回归：不得存在「因为没设就自动降级」的路径；必须显式设置。
- `pnpm lint && pnpm typecheck && pnpm test` 绿。

**DoD**：两个开关成为唯一真源，所有消费者不再直接读 `REDIS_URL` / `S3_*`。

### E1 — database 传输下的 realtime

**目标**：`server.ts:347-351` 的 `NODE_ENV === "test"` 分支改为配置分支；
worker 在 `kind:'database'` 时不发布（no-op sink）；`admin-retention` 报告
`not-configured` 而非 `unavailable`。

**测试清单**
- 唤醒延迟单测：`database` 下事件可见延迟 ≤ `REALTIME_FALLBACK_RECONCILE_MS`。
- 正确性单测：单次 reconcile 后所有已提交事件都被 SSE 读到（durable cursor 语义）。
- admin 视图词汇单测：`not-configured` 不被渲染成故障态。
- 回归：`redis` 路径全部既有测试不变。

**DoD**：设备上无 Redis 时 SSE 功能完整，代价仅为轮询间隔。

### E2 — 限流语义化 store 与双实现一致性套件

**目标**：把 `AuthRateLimitStore` 从 `eval(LUA)` 抬到语义接口
（`admit` / `recordFailure` / `clearFailure` / `sampleLogOnce`）。
`RedisAuthRateLimitStore` 保留两段 Lua 不变并映射调用；新增
`InMemoryAuthRateLimitStore`。**这是安全策略变更，单独记账。**

**测试清单**
- **一致性套件（核心门禁）**：同一组场景同时跑两个 store 并断言决策完全相同：
  突发耗尽、部分补充、指数退避与上限夹取、成功清除、多维度取最小等待时间、
  边界值。
- 注入时钟单测：in-memory 的补充算术在假时钟下可确定复现。
- 淘汰单测：惰性淘汰 + 周期清扫不会让 Map 无界增长。
- **多副本拒绝**：配置 >1 个 API 实例时 in-memory store 拒绝启动（不是警告）。
- 回归：生产 `redis` 路径的 fail-closed 行为不变，
  `AuthRateLimitUnavailableError` 仍只在 Redis 路径出现。
- 套件进 `pnpm test`（不是独立可选 job），两实现不允许静默漂移。

**DoD**：两实现决策等价由机器验证；单实例前置条件由代码强制。

### E3 — filesystem 制品存储核心

**目标**：`FilesystemArtifactStorage` 实现同一 7 命令面。内容寻址布局
`objects/<sha[0:2]>/<sha>`，`O_EXCL` 创建，侧车 `<sha>.meta.json` 记
size/contentType/checksum/retentionUntil/legalHold，retentionUntil 只增不减，
删除一律拒绝。

**测试清单**
- 不可变性：同 key 二次写入被拒（`O_EXCL`）。
- 内容寻址：不同内容落不同路径；同内容重复上传幂等。
- 保留语义：`retentionUntil` 不可缩短；`DeleteObject` 恒拒绝且返回稳定错误码。
- 校验和：读时重算并与侧车比对，不一致即失败。
- 能力探测：`assertObjectLockEnabled` 的文件系统等价物在缺目录/不可写时正确失败。
- 迁移脚本（verify-and-copy）带逐文件校验和比对，测试用小样本。
- 保留门禁：S3 路径的 `RECOVERY_TARGET_OBJECT_LOCK_REQUIRED` 测试不变。

**DoD**：两个实现通过同一份存储行为套件；ADR 表中每条映射都有对应测试。

### E4 — 上传意图契约变更

**目标**：`createUploadUrl` 在 `filesystem` 下返回 WorkMesh-origin URL
`/api/artifacts/upload/<intentId>`；上传令牌为
`HMAC(intentId, expectedChecksum, contentType, expiry)`，用
`WORKMESH_MASTER_KEY` 签名；客户端仍需发送 `x-checksum-sha256`（ADR 0070 的
签名头纪律保留）。API 流式落临时文件 → 重算校验和 → 原子 `rename` → finalize。
硬性体积上限与 MCP 上传上限共用同一常量。

**测试清单**
- 令牌：过期、篡改 intentId、篡改 checksum、contentType 不符一律拒绝。
- 体积上限：超限请求被拒且不落盘（防止磁盘打满）。
- 流式：中途断开的请求不留半截对象（临时文件清理）。
- 原子性：只有校验和通过才进入内容寻址路径。
- 契约版本：事件/契约版本独立于 REST 版本推进，`packages/contracts` 记录新形状。
- 客户端跟进：MCP adapter 与 client profile 的上传路径测试更新并通过。
- E2E：制品上传→校验→展示全链路绿。

**DoD**：完整性保证不弱于 S3 路径（服务端重算更强）；契约变更已在版本化契约中记录。

### E5 — 拓扑、文档与足迹复测

**目标**：`docker-compose.lite.yml` 支持去掉 redis 与对象存储两个服务（通过
env 开关切换 profile）；更新 ADR 0071 的 Lite 服务表（它不再是唯一拓扑）；
复测常驻内存并更新 `docs/operations/lite-footprint.md`。

**测试清单**
- 两种 profile 都能 `config --quiet` 通过；默认 profile 与生产语义一致。
- 去掉两个服务后 E1–E4 的功能测试仍绿。
- 实测复测：记录新的常驻/峰值 RSS，并与 ADR 0072 的估算（省 30–55 MB）比对。
  实测与估算偏差较大时修订 ADR 数字。
- 文档：`deploy/lite/README.md` 说明两个开关、切换顺序、不可逆点
  （先装 filesystem 并搬完数据，再删对象存储服务；反序会丢制品）。

**DoD**：ADR 0071 与 0072 的数字与实测一致；Lite 拓扑表覆盖有/无两版。

### 记录项（不作为实现任务）

SQLite 移植不在本轮范围。ADR 0072 已写明复议条件：若 E5 实测显示 Node 运行时
已被消除、剩余常驻仍由 PostgreSQL 主导，且操作者确实拥有该档设备，则带数据重开。

## 风险与已知限制

- **限流状态随 API 重启清零**（in-memory 路径）。与 ADR 0071 关闭 AOF 后 Redis
  重启清零是同类暴露，LAN 单管理员可接受；多副本被代码拒绝，不是文档约定。
- **上传契约变更**是唯一客户端可见的破坏性变更，MCP 与 client profile 必须同步。
- **失去对象版本历史列举**。当前无调用路径使用，但如果有未知的外部消费者读
  S3 版本，这会静默失效——迁移前需确认。
- **filesystem 存储不做跨机复制**。单节点本地盘，备份责任在 `backup.sh`。
- 三个数据服务里只拿掉两个，**PostgreSQL 仍是设备上最重的单一组件**（60–90 MB），
  这正是第 4 节算术的由来。

## 演示步骤

1. 起 Lite（E5 后的版本），`WORKMESH_REALTIME_TRANSPORT=database` +
   `WORKMESH_ARTIFACT_STORE=filesystem`，`docker compose up` 只剩 4 个服务。
2. 浏览器登录，创建一个 Work Item，发一条消息，观察 SSE 事件在 1 s 内出现。
3. 通过 MCP 传一个制品，比对返回的 sha256 与落盘文件重算值一致。
4. `docker stats --no-stream` 记录常驻，与切换前对比。
5. 把开关改回 `redis` / `s3`，确认行为与切换前一致（无数据移动）。

## 规格分歧

- ADR 0071 的 Lite 服务表假设 6 个常驻服务；本计划落地后可为 4 个。E5 必须
  同步修订 0071，否则两份规格会互相矛盾。
- 容量估算（省 30–55 MB）在 E5 实测前是估算。对外材料引用前必须有 E5 记录。
