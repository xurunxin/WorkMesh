## 上下文

扩展 `createAutomationWorker.claimNotifications` / `deliverNotification`，保留 `effectKey`、`claim_fence`、超时 reclaim 和退避。新增意图与事件 checkpoint，`notification_deliveries` 继续作为唯一发送队列。

接收人固定为：Inbox 的精确 Human 收件人；其他来源的 responsible Human；Project 级来源的 lead。无人被指派或当前无权则不外发。渠道目标仅归当前 Human，管理员无代管权限。

实施前重新核验最新主线及冻结输入差异，同步已合入改动；继续采用 Todos 编排和仓库证据，保留独立复核、Chief 确认及 C1→C2 门禁。

## 改动

- **`packages/contracts/src/index.ts`、`OPENAPI.yaml`**：先定义目标创建、查询、修改、撤销，投递查询与对账 DTO。目标包含 provider、名称、启用状态、秘密引用及 revision；响应只返回配置状态和指纹。mutation 必须有 `Idempotency-Key`，修改、撤销和对账必须有 `If-Match`。新增默认关闭的 `WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS`；明确 noRedis 不支持。

- **`packages/contracts/src/route-policy.ts`、`route-policy-bindings.ts`、`docs/route-policy-matrix.md`**：补齐 Human-only 路由及 feature gate，使用现有生成器维护策略产物；目标和投递均按 workspace＋本人所有权检查，管理员不绕过。

- **`packages/db/migrations/v1/0014_channel_delivery_contract.sql`**：新增不可变 `notification_intents`、本人所有的 `notification_channel_targets`、逐事件 `notification_source_checkpoints`。intent 固定 source event/cursor、source revision、recipient、摘要及目标快照；checkpoint 固定事件摘要和处理结果。扩展 delivery 的 intent/target 关联、目标配置快照、请求摘要、发送 checkpoint、未知结果及对账 revision；约束同 intent/target 仅一条逻辑 attempt。旧 delivery 保留 notification 关联，新行使用 intent 关联，不新建 attempt 队列。

- **`packages/db/src/schema.ts`、`migration-manifest.ts`、`SCHEMA.sql`**：同步上述结构、校验和及执行入口。既有记录保留原发送语义，不补发历史通知；迁移由现有 runner 托管事务，不修改已应用 SQL。

- **`packages/db/src/human-attention-sources.ts`、`apps/api/src/human-attention/projection.ts`**：将现有 `humanAttentionProjectionSql` 的来源查询提取为共享只读实现，展示映射留在 API。worker 复用来源、责任人和生命周期事实；API Query 不增加投递写入。后台授权检查使用持久 Human、workspace、Team、精确收件人及来源状态，不伪造登录 Session。

- **`packages/domain/src/stage4.ts`**：补充纯函数，固定来源→接收人选择、目标快照判断和发送结果分类；复用 `shouldDeliverNotification`、`automationRetry`。陈旧来源只产生通用提醒和深链，不携带决策选项。

- **`packages/db/src/channel-notifications.ts`、`packages/db/src/index.ts`**：实现目标命令、事件 admission、扇出、发送前检查、fenced ack 和对账事务。秘密配置使用既有 `WORKMESH_MASTER_KEY`＋pgcrypto 模式加密，delivery 仅引用目标；幂等摘要使用 HMAC，事件、日志和响应不保存明文地址或秘密。状态变更、领域事件与 outbox 同事务提交。

- **`apps/worker/src/index.ts`**：在 `createOutboxWorker.deliver` 中读取已提交源事件，按 Attention 来源白名单调用 admission。checkpoint、intent、目标快照和 fan-out 原子提交；无接收人、已关闭或无权也记录处理结果。逐事件 cursor checkpoint 配合现有 outbox 重放，避免把最大 cursor 当作提交顺序而遗漏晚提交事件；投递自身事件不再触发提醒。

- **`apps/worker/src/automation.ts`**：扩展现有 claim 查询和 sink 注入，接入 C2 可注册的 provider adapter。没有对应 adapter 时不 claim 新目标、不消耗重试次数。发送前重新检查有效 fence、当前授权、偏好、目标启用状态及配置快照，重建通用低敏提醒和 canonical 深链；先提交发送 checkpoint，再调用外部 sink。ack、失败和抑制均核验 claimant＋fence，旧持有者不得修改 delivery、目标状态或事件。

- **`apps/api/src/notification-channels.ts`、`apps/api/src/server.ts`**：注册本人目标管理和投递对账入口，路由只转换输入，调用上述事务命令。复用 `mutate` 的幂等预留、重放授权和 revision 检查。未知结果允许本人显式确认已送达、重试或终止；重试复用原 attempt 和 `effectKey`。

- **`apps/web/app/settings/notification-channel-settings.tsx`、`apps/web/app/settings/page.tsx`**：加入个人渠道管理卡片，提供创建、修改、启停、撤销及未知结果对账。秘密字段只写不回显、不进入浏览器持久缓存；配置冲突要求重载，保存不执行外发探测。

- **测试与文档按上述模块配套修改**：扩展指定的 `apps/worker/integration/stage4-automation.integration.test.ts`，新增目标 API、迁移及设置页测试；更新 `packages/db/src/event-resources.ts` 的私有事件归属和 `agent-lock-order-manifest.ts` 的受影响锁语句。将复用映射、用户裁定、C2 接口及恢复规则写入 `docs/adr/0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md`、`docs/plan/c1-channel-delivery.md`；实际验证结果保存至 `docs/reviews/c1/`，逐项对应冻结测试清单。

## 边界与实施假设

- admission 固定当时的目标集合；重放不加入后来创建的目标。目标配置改变或禁用后，旧快照对应的排队投递被抑制；不自动换地址发送。
- 已确认目标不随其他目标失败重投。已开始发送但未完成 ack 的记录在恢复时进入未知结果，等待显式对账；允许重试并保留至少一次语义，不承诺外部恰好一次。
- reclaim 必须处理最后一次 claim 后崩溃，不能因重试上限留下永久 `claimed` 行；外部调用超时短于 claim 有效期。
- C1 的 provider 配置预留企业微信出站目标，实际协议校验及 adapter 归 C2。本项不实现卡片审批、身份桥接、其他渠道或真实外发验证。

## 验证

1. 使用独立测试数据库及完整 CI 夹具，执行新迁移的空库、前一阶段升级、回滚与重复运行测试；断言旧通知、Web Push 和 webhook 路径不受影响。
2. 执行定向 worker 测试：
   `pnpm --filter @workmesh/worker exec vitest run --config ../../vitest.integration.config.ts integration/stage4-automation.integration.test.ts --maxWorkers=1`

   用 fake sink 和可控崩溃点覆盖目标选择、两 worker 竞争、旧 fence、单目标失败、同体重放／异体冲突、未知结果对账，以及 source commit、fan-out、发送 checkpoint、发送和 ack 各边界恢复；撤权、离队、禁用及旧配置均断言零外发。
3. API 与网页测试覆盖本人管理、管理员越权、Agent 拒绝、跨 workspace、陈旧 revision、幂等重放、秘密脱敏和对账。反复读取 Attention，比较 intent、delivery、checkpoint 数量，证明 Query 零投递写入；feature 关闭和 adapter 缺失均回归原路径。
4. 运行 `pnpm generate:route-policy`、`pnpm check:route-policy`；按 `UPDATE_AGENT_LOCK_MANIFEST` 生成并逐语句审核锁清单，执行锁顺序及并发验收。
5. 顺序完成 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e`，记录实际执行数量、失败和跳过项。证据绑定测试提交、命令、环境和结果；全部适用检查成功后提交独立复核及 Chief 确认，不使用历史 CI 替代本次验收。
