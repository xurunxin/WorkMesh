# Redis-free 与文件工件保证决策输入

## 当前规则和状态

ADR 0071 和 0072 在准确主线均为 `Proposed`。Lite 已有实现，不意味着两份文档的每个说法都获接受或验收。ADR 0072 将应用拒删映射为 COMPLIANCE 的论证不成立，不能作为新模式启动依据。本轮不修改任何 ADR。

Accepted ADR 0035／0036 的 archive、准确成员及 durable floor，ADR 0039 的加密完整恢复，以及 ADR 0070 的 S3 版本、Object Lock 和签名上传继续约束本卡。历史 Web 内容由纯后端裁定覆盖，原件不重写。

## Redis-free 合同

当前 `loadConfig` 和 `loadRealtimeRedisHintConfig` 要求 Redis URL；`AuthRateLimiter` 通过 Redis Lua 使用 Redis TIME，并在存储错误时失败关闭。`NoopWakeSource` 仅提供 SSE 回退，不替代限流或 worker sink。

| 面向调用者的保证 | 现有机制 | 推荐 Redis-free 设计，待裁定 |
| --- | --- | --- |
| 凭据请求先限流，存储错误拒绝 | `RedisAuthRateLimitStore`、`AuthRateLimiter`、多维 token bucket 和失败退避 | 将 store 接口提升为 admit／failure／success／sample 的语义接口；数据库实现使用 PostgreSQL 时钟和原子事务，错误继续失败关闭 |
| 并发共享与时间一致 | Redis 原子 Lua 和服务端 TIME | 同一次 admission 锁定全部维度，固定锁顺序，统一取数据库时间；保留现有拒绝决策和 Retry-After |
| SSE 从 durable cursor 恢复 | `createRealtimeCoordinator`、Redis hint、PG reconcile | 显式 `database` 选择 `NoopWakeSource`，保持 fallback poll；不承诺一个 poll 周期等于端到端延迟上限 |
| outbox 不因 wakeup 丢失而丢事实 | `createOutboxWorker.claimOutbox` 的 PG claim、锁超时和重试 | 保持 PG durable 事实；只在数据库模式跳过 hint 发送，不能跳过通知、webhook 等真实消费者的准入 |
| 失败重启和外部效果可重放 | PG outbox、独立 webhook／provider／retention 调度 | 逐调度器核依赖，保留 attempt、fence、幂等和不确定外部效果；Redis-free 不是新内存任务队列 |
| readiness 和诊断真实 | Redis probe／admin-retention | 显式未配置 hint，不将其报告成故障；PG 限流或 durable 投递故障仍可使对应 readiness 失败 |

API 的 PG 限流状态比当前无 AOF Redis 状态更持久，保留期、容量和清理需要新 schema 及压力验证。该方案会增加数据库写入成本；低资源收益未测。先保持单 API 候选配置，不能从共享状态推导已支持多副本。

`createOutboxWorker` 当前最多尝试八次，失败可进入 `dead`；离线并不保证无限自动恢复。现有停 Redis 回归在有限重试窗口内证明恢复。新数据库模式须另外测试 hint 确认前后崩溃和消费者重放，不能把现有测试改成“无 Redis 已通过”。

| 裁定项 | 具体方案 | 推荐及代价 |
| --- | --- | --- |
| 保持现状 | 三画像保留 Redis；仅发布安装配置增量 | 当前基础交付采用，保证和成本已知 |
| 消除 Redis | PG 语义限流＋PG polling／outbox，独立 feature 和配置 | 推荐作为后续 Proposed ADR；新增持久表、争用与清理验收，默认关闭 |
| 单进程内存限流 | ADR 0072 的 Map＋时钟；强制单 API，重启失去状态 | 不作为推荐交付；需用户明确接受进程重启窗口和跨进程不共享，不能用副本声明代替实际启动约束 |

后续具体文件：`apps/api/src/auth-rate-limit/redis-store.ts`、`limiter.ts`、`plugin.ts`；新增 `database-store.ts`；`packages/config/src/index.ts`；`apps/api/src/server.ts`、`admin-retention.ts`；`apps/worker/src/index.ts` 和启动／readiness 代码。数据库表、编号迁移及 manifest 在授权后按实际 schema 冻结；内部 store 接口不机械放入传输合同。

## 文件工件完整性与保留

当前仅有 `S3ArtifactStorage`，上传用短期 intent、签名必需 header，finalize 核对象 size／MIME／metadata／checksum。archive 写入和读回固定 VersionId，并验证 COMPLIANCE horizon。完整恢复复制所有版本、当前 delete marker、活动保留和 legal hold；只备份文件正文不能满足这个合同。

| 属性 | filesystem 所需机制 | 保证边界 |
| --- | --- | --- |
| 内容完整性 | 流式重算 SHA-256，严格 size／MIME，临时文件与目标同文件系统，flush 后原子提交，读回复验 | 可以检测损坏，不阻止高权限用户替换正文和 hash |
| 路径与租户隔离 | 固定根、禁止任意路径和 symlink／reparse，根目录身份和权限读回，按授权下载 | OS 权限与 API scope 均须验证，hash 不授下载权 |
| 并发及不可覆盖 | exclusive create、内容地址和显式对象身份；同 hash 内容碰撞或元数据冲突拒绝 | 防普通代码误覆盖；root 或宿主管理员仍可删除或改写 |
| 保留策略 | 不缩短 retentionUntil，默认不删除，记录保留和 legal hold | 应用约束不等于不可绕过的 WORM；文件 sidecar 也可被管理员修改 |
| 完整备份 | 维护窗口内同时捕获 PG、全部文件版本／身份和元数据，GCM 加密、manifest HMAC，空目标恢复、journal 及读回 | 新存储类型需要新的可验证格式，旧 S3 bundle 不能静默复用 |
| 容量不足或崩溃 | 写入预算、硬上限、ENOSPC 保旧、重启对账；孤儿文件不能随启动盲删 | 不移除业务数据来让验收通过；未明确归属的文件保留 |

纯文件模式没有当前 Accepted Object Lock 证明，本方案将它列为不支持。推荐后续研究混合模式：普通工件文件可独立评估，retention archive 保持具有 COMPLIANCE 的 S3；这仍保留对象存储依赖，不能宣传为 object-store-free。

| 待裁定方案 | 必须说明的差异 | 推荐 |
| --- | --- | --- |
| 全 S3 | 保持完整现行版本／锁／恢复合同 | 基础交付采用 |
| 文件工件＋S3 archive | 分开工件和 archive 后端，两个后端一起加密备份／空目标恢复；新文件身份、上传协议和权限实测 | 后续推荐候选，待明确不可绕过保留究竟覆盖哪些工件 |
| 全 filesystem 的降级画像 | 明确没有 WORM／Object Lock 等价，不再满足现行保留保证；提出替代威胁模型、恢复及产品支持声明 | 须独立改 Accepted 保证并获用户批准，不能由本卡规划自行接受 |

文件上传须仍经原意图鉴权，新增 API-origin 上传不能拿路径或任意 bearer 当凭据。短期 upload token 绑定 intent、checksum、MIME、上限、expiry 和操作身份；保留完成／取消状态机、幂等、过期和撤权核验。协议变化先修改 `OPENAPI.yaml`、共享 Zod，再同步 SDK／MCP／客户端实际消费；不直接沿用 ADR 0072 的示例路径冒现行端点。

未来候选文件包括 `packages/artifact-storage/src/filesystem.ts`、`index.ts`，API intent／流式上传／下载边界、`packages/recovery/src/types.ts`、`manifest.ts`、`backup.ts`、`restore.ts`，以及合同、SDK 和 MCP 消费者。均待批准，当前不创建。

## 用户下一关口的具体输入

下一关口分别裁定基础服务端交付范围、Redis-free 的 PG 限流方案、工件与 archive 是否允许分后端，以及是否考虑无 WORM 的独立画像。每项须单独记录结果，不把采纳本方案文档当成批准保证变更。

真实服务端验收还需确定目标 OS／架构／设备、CPU／RAM／磁盘条件、私有 CA、身份和内网服务访问范围。当前未指定的条件保持未测，不自动申请凭据、设备或付费资源。
