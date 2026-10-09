# M1 失权排队 Turn 的续接修复

本轮只处理 `420aa1844d43c82ddadeb7af09dfe6acb40173b1` 成果复审尚未闭合的一项 blocking。原 queued 上下文和公平扫描两项已由平台另一 Agent 确认闭合，代码保持不变。前轮失效输入测试直接准备了没有 Turn 的旧消息，不能证明真实 `/turns` 的排队路径；本轮补实际 HTTP 和 Pi 证据，不改写前轮结果为已覆盖。

## 修复行为及边界

`packages/db/src/workbench-execution-waits.ts` 在精确来源、live 授权、Session/Conversation、源 Turn/Attempt 和有效触发校验之后，沿同一事务依序锁最早 queued Turn。作者已失权时，将该 Turn 结算为现行 `stopped / authority_revoked`，补 dispatch/settled 时间，追加已有 `workbench.turn.settled` 事件及 outbox；原消息保留，Runner Attempt 不创建。然后继续选择下一合法 queued Turn，或生成唯一新续 Turn。停止排队项、续接上下文、Session 状态和 wait 消费同事务提交；任何失败全部回滚。异常 queued Turn 若已经指向 Attempt，明确拒绝并回滚，交原恢复路径处理。

实际更新文本为：

```ts
UPDATE workbench_turns SET status='stopped',stop_reason='authority_revoked',
  dispatch_requested_at=COALESCE(dispatch_requested_at,now()),settled_at=now(),updated_at=now()
```

`apps/api/src/workbench-runner.ts` 的 claim 前序门禁保持原文：`AND status NOT IN ('settled','failed','canceled','stopped')`。本轮通过正式终态结算解除旧 queued 前序阻塞，没有仅过滤查询、跳过仍活动的前序 Turn、放宽授权或伪造 Attempt。Stop、撤权和 pause 的前置闭门保持；没有有效触发时不结算旧排队项，也不续接。

`packages/conformance/src/execution-recovery.fixture.ts` 新增独立 Human 的真实 login/request 夹具。当前没有公开 Human/member 创建或移除接口，因此账号/password hash/Team membership 的准备和撤回明确使用 privileged 数据库夹具；该 Human 的登录、`POST /turns`、撤权后的 GET 拒绝，及另一合法 Human 的消息/prompt 全部走真实 HTTP。没有把 Human Cookie 注入 Agent Runner，也不声称存在未实现的 membership REST 接口。

`execution-recovery.conformance.test.ts` 新增 message/prompt 两条回归：实际旧消息与 queued Turn → membership 撤回并 HTTP 403 → 后续合法输入 → 两 Worker 争同 wait → 重建 Worker → 实际 Pi claim/credential/start/完成。断言公开旧 Turn 符合共享 Zod、停止时间/理由准确、结算 event/outbox 各一个、旧消息保留、旧 Turn 零 Attempt、总三个 Turn（旧停止一个，执行结算两个）和两个 settled Attempt、真实模型收到合法输入。prompt 分支对旧 Turn 结算 event 注入数据库失败，证明 wait、Turn、Attempt、Session 和全事实指纹均回滚，再正常恢复。

没有新增 migration、wire 字段、事件类型或权限；批准 hash、prompt FK、原动作来源和只读确认合同不变。派生锁清单仅更新 helper 增行后的一个 siteKey，原 SQL hash、rank 和锁序不变。43 操作映射及七份已审规划原件按最终对象核验保持不变。

## 实际检查与九类差分矩阵

完整受影响组合均取得实际退出；最终退出、runtime、数量、skip 和前后输入差异见 [本轮运行索引](product-evidence/review-queued-check-index.md)。首轮定向两条真实 HTTP/Pi 回归退出 0，2 pass、27 个筛选 skip；完整根入口另外验证 29 条全套，不以定向筛选代完整通过。

| 实际命令 / 回执 | 退出 / 秒 | 原数量与范围 |
| --- | --- | --- |
| `pnpm test:integration` / review-queued-integration | 0 / 584.496 | DB 81 pass / 17 文件；API 257 pass＋1 商业模型凭据未启用 skip / 27 文件；M0/M1 conformance 29 pass / 2 文件、零 skip；Worker 120 pass＋1 retention 环境 skip / 8 pass 文件；根 Recovery 1 未启用 skip。迁移 clean/旧升级/约束/回滚和原 key/source 兼容随 DB/API 完整入口回归。 |
| `pnpm test` / review-queued-unit-fixed | 0 / 136.621 | 32 task 成功。DB 28、Runner 67、SDK 52、MCP 50、API 180、Worker 211＋2 原 Windows/Linux 平台 skip；其余包原数量在索引。无 UPDATE 开关，实际授权锁 inventory 8 pass。 |
| `pnpm lint` / review-queued-lint | 0 / 100.128 | 18 task 成功，零缓存。 |
| `pnpm typecheck` / review-queued-types-final | 0 / 61.383 | 18 task 成功，零缓存。首轮 typecheck 另为 0 / 60.124，完整原输入保留。 |
| `pnpm build` / review-queued-build | 0 / 87.371 | 18 task 成功，零缓存；没有未归档的 apps/packages 编译散落文件。 |
| DB 派生清单 typecheck / review-queued-derived-types | 0 / 6.434 | 最终生成清单的完整 DB 类型检查。 |
| 定向新 HTTP/Pi 两条 / review-queued-conformance-first | 0 / 18.621 | 2 pass＋27 筛选 skip；完整覆盖由上方根集成补足。 |

全仓单元首轮退出 1，唯一失败是授权锁 inventory 的 siteKey 从 `385:77` 移到 `402:77`。现有 `UPDATE_AGENT_LOCK_MANIFEST=1` 生成器运行 8 pass 后，以无更新开关的标准根单元重新验证；不删锁断言，不增加豁免。首败完整原日志和实际输入归档保留。

| 九类 DoD | 本轮差分证据与原回归范围 |
| --- | --- |
| 正常 | 新 message/prompt 两条真实 HTTP/Pi，实际后续 claim/start 穿过前序门禁并完成；M0/M1 完整 conformance 回归。 |
| 越权/撤权 | 真实旧 Human 排队后移除 membership，旧客户端 GET 403；失权 Turn 停止且零 Attempt，另一合法 Human 输入继续；双 C/双 install/scope/grant/撤权原负例在完整 API/conformance。 |
| 非法状态 | 旧 Turn 正式 stopped，Zod 要求的 dispatch/settled 时间与 authority_revoked 组合合法；无有效触发零变更，Stop/pause/撤权原优先用例回归。 |
| 幂等 | 两 Worker 总续接数一，重建 Worker 和重复 tick 均零；旧 Turn 结算 event/outbox 各一，不双建 Attempt。 |
| 旧 revision | 沿原 HTTP If-Match 创建 queued Turn；旧 revision 的 Session/Plan/Lease/批准门禁由完整 API/conformance 原用例回归，未新增忽略版本入口。 |
| 事务失败 | 新 prompt 路径在旧 Turn 结算事件故障时，完整事实指纹和等待快照不变；移除故障后唯一续接。 |
| job/webhook 重放 | 双 Worker/重建/重复 tick 不重复停止旧 Turn 或继续 wait；完整 Worker/outbox 原套件回归。 |
| 并发 | 既有 Conversation 锁、queued Turn 锁及 wait 锁下终态结算和消费；双 Worker 只提交一次，锁 inventory 标准门禁复验。 |
| 重启/恢复/Stop | 新 Worker 实例与实际 Runner 子进程重新准入；原 121 秒等待、停止 finally、失响应、API/MCP 重连及公平扫描保持完整回归。 |

E2E、route policy、Runner skill、CI policy、真实 Recovery 专项及已充分绑定的其他原通过检查，按未变输入保留原证明范围；本轮不为无变化的通过检查重复造回执。Web E2E 不含 executionWaits/sessionWait 工具路径，当前变化由实际后端 Worker/Pi conformance 验证。商业模型未启用、环境条件 skip、物理强杀组合及分发门禁保持 [原报告](product-report.md) 的限制，不因本修复冒作已测。

## 原件、源码与资源

新回执、日志、客户端模型实收、资源登记和输入归档使用独立 `review-queued-*` 前缀；`420aa…`、`6e909…`、规划 938/69/004554、前轮 18 份修复归档及所有首败保持历史。记录器保存运行前工作树与 HEAD Git blob 分列字节，并记录结束时 fingerprints；不能以提交字节或 Windows 换行展开代运行输入。

最终 [源码索引](product-evidence/review-queued-source-index.json)、[归档索引](product-evidence/review-queued-archive-index.json)、[资源回执](product-evidence/review-queued-resources.json) 和 [静态对象核验](product-evidence/review-queued-static.json) 分别证明源码/ZIP/暂存对象及清理边界。原始日志保存在内容寻址 `review-queued-raw-logs.zip`，可读副本仅规范尾随空白和末空行。索引生成器增加 prefix/base 参数，使本轮不会覆盖前轮证据。

运行期间产品 helper 与新客户端测试在标准根集成开始后保持冻结；期间变动是派生锁清单的一个位置锚点，以及报告/证据生成器完善。首轮定向/typecheck 之后，helper 对异常 queued Attempt 改为抛错使整个事务回滚；随后根集成、lint、最终 typecheck、标准 unit 和 build 消费该最终产品字节。根集成和 typecheck 内的清单位置变化不改 SQL 语义；最终 unit、DB 类型检查及 build 再核最终清单。所有前后差异逐文件保留于索引，不声称全树每次运行都零变化。

[真实当前 main 观察](product-evidence/review-queued-main.json) 由平台只读 Git 工具实读 `refs/heads/main=e49eda142d61bdd248ddc42ec16f5563abd4bbc6`；与候选父提交 `420aa…`、历史规划 base 分列。工具未提供 native exitCode，记录 null，不推测该退出码或拿共享 FETCH_HEAD 当主线。

服务 helper 的 finally 在健康命令实际退出后，先保存脱敏日志和 HTTP/MCP/Pi 运行证据，再按成功创建的准确 ID/name/owner 标签停止并清理本轮独有容器。共享镜像/网络/卷、其他任务服务、G1D0C3 已拒目标、当前恢复工作树及 Node 运行时保留；没有全局 prune 或额外删除。正常 stop/rm 原 helper 验真实退出但未逐条保留 stdout，此既有证据限制仍明确保留。

## 交付及复审

复现命令为 `python scripts/m1-run-services.py <新的唯一名称> pnpm test:integration`；定向用 `pnpm --filter @workmesh/conformance test:integration -t '真实 HTTP 旧消息排队'`。本轮最终状态由主执行回复给出准确提交 SHA，避免文件自身未来 SHA 循环。交平台另一 Agent 定向核尚余 blocking 与受影响完整成果；当前没有替该 Agent 宣布闭合，未取得 latest Required CI、实际 main/Done，不能称整卡验收或合入。
