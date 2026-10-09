# C2 quota 丢失恢复复审

输入 HEAD `61736fa2298279f76642309ee2e2478439258f80`；本轮平台 git 实读 main `74f247f9240eaf21e74ef248f71a445c1d4276d7`，仅新增清理证据后正常整合。已审 implementation-plan/product-design 与历史原件保持不变。

## 修复与负例

`apps/worker/src/wecom-notifications.ts` 在重设 epoch/ready 的同一 Lua 操作中执行 `redis.call('ZADD', quota, '+inf', '__sentinel')`，发生在冷却提前返回之前。一次丢失因此只开启一次 120 秒冷却；新发生的丢失仍失效旧许可，额度及串行 token 原语义保持。

`apps/api/integration/wecom-notifications.integration.test.ts` 新用例使用真实 Redis 执行产品 Lua，只替换 TIME 原语。在 1/30000/60000/119999ms 六路并发重试，逐次验证 ready/epoch 不变；120000ms 两目标各只发出一个许可，旧 validate/finish 不恢复发送、不释放新 token。受控时钟不推进真实 TTL，因此仅模拟 60 秒 serial TTL 到期；原生 Redis TIME 测试仍在完整集成中运行。

## 实际验证

首败旧实现见 [回执](../product/20261008T165543Z-057421/results.json)。修复后的定向回归见 [回执](../product/20261008T165722Z-99576c/results.json)：1 通过，17 项因精确过滤未运行，不计通过。两轮补测断言纠正和下载 HTTPS 中断亦保留原始结果及日志，不覆写历史。

五项必需命令 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e` 均退出 0，各自真实命令、UTC、PID、源码前后与脱敏日志见 [verification.json](verification.json)。受测源码为 889 文件，指纹 `ef2b698840c48de6e7ccaffdef8cfea357ad3f0ed77c7683dfcfea8298ca7f5d`，源码前后与五项之间一致。仅 fake provider，无真实外发。UI 源码未变，原图与视觉停点保持历史含义。

复现：`python docs/reviews/c2/product/run-checks.py quota-regression` 或 `full`；前者保留独有 Redis/数据库及实际 Lua，只运行本条负例。原六验收、九类、DoD 与旧五项绿色保持原记录，当前补充映射见 currentQuotaRecovery。

## 证据与门禁

独有容器逐 ID/label 核验并清理，共享镜像与当前/恢复 worktree 保留。临时目录先保全再逐路径清理见 [回执](../product/temporary-cleanup.json)；raw ZIP 的恢复、CRC、工作树/暂存 blob 和当前全部受测源码双哈希见 [核验](checks.json)。历史首败/未知时间/回执缺口未改写。

本轮成果停 review，仍需独立复审、Chief 视觉停点、最新 PR Required CI、actual main 和最终确认。没有合并或整卡完成声明。
