我会先核对候选提交、受控方案全文及对应源码，重点检查授权、Worker fencing 和审查交付闭环；全程只读。
候选提交是 `7e7805b1a672878a5644a1e139dfa2ec6520a565`，差异限于 74 个规划工件。我已读完核心安全合同和九类验证方案，接下来会对照 Worker 的重领行为、reviewer 的资源绑定及查询 DTO，检查计划中的恢复承诺是否能成立。
有一处恢复边界需要重点核实：现有 Worker 会重领无 checkpoint 的 action，而 GitHub 的 CI retry 适配器直接发送 `rerequest`，没有查询或去重机制。仅补 attempt CAS 无法阻止丢响应后的重复外发。我会继续核对方案是否已为这种情况定义明确的停发路径。
已完成 370 项来源、743 个 ZIP 成员的 Git／Windows 双字节核对；远端 main 和候选分支也与注记一致。源码核对还发现两个方案缺口：普通 Git 外发没有 context resolution 使用的 authority 锁；同 key 重放会跳过 `createReview` handler 内的仓库校验。我会将这两点及 unknown 重领的停发规则列为编码前必须补齐的合同。
请先解决以下问题，再开始编码。

1. > 已发生效果的结果仅由仍拥有原 generation 的 Worker checkpoint／本地 reconcile，不因过期重新外发。

   无 checkpoint 的重领路径尚未闭合。现有 `claimAction` 会重领过期／failed action，`executeAction` 在 `result=null` 时再次调用 provider；GitHub `retryCheck` 直接 POST `rerequest`，没有去重或对账入口。provider 已成功但响应／checkpoint 丢失后，attempt CAS 只能阻止旧 Worker 写库，无法阻止新 Worker 重复外发。

   请冻结按 provider／kind 区分的恢复规则，明确零迁移下如何保守处理“可能已发送”的 action；无法证明安全恢复时必须停止外发。补 provider 成功、checkpoint 前崩溃及跨租期重领测试，断言真实 HTTP 次数不增加。(blocking)

2. > 保留现 claim／结果 checkpoint／发送前授权机制，补齐新外发前锁后 `clock_timestamp()` 租期与原 attempt 的重验

   普通 Git 外发目前没有这里假定的 authority 锁：`authorizeProviderSideEffect` 只锁 action，随后读取 Session／Delegation／grant 等事实时不锁这些行；`lockAgentAuthorityPlan` 仅出现在 context resolution 路径。因此，读完授权后、授权事务提交前，Stop／撤权仍可先提交，Worker 随后外发，违反方案的提交次序承诺。

   请明确补齐普通 Git 外发的 authority 锁、全局锁顺序及锁后事实重读；merge／CI 的最终门禁和租期检查也须纳入明确的发送前事务边界。验证实际锁竞争及两种提交顺序，不能仅覆盖调用前已经 Stop 的情况。(blocking)

3. > `createReview` 在现有 authority 锁内验证父 Delegation、目标 definition、Team grant 均具 `repo:read`

   只在 handler 内验证会漏掉同 key 重放。`collaboration/routes.ts` 的 `command` 直接调用 `mutate`；后者命中旧回执时跳过 handler，且当前未传 `authorizeReplay`。父仓库范围收窄、目标 reviewer 失去 `repo:read` 或共享 context 失效后，新检查不会执行；路由的粗粒度 `work:write` 门禁不能替代它们。

   请为新增仓库授权路径明确接入锁内 replay 授权，重验准确父子绑定、三方读能力、当前仓库范围与共享 context，再返回旧回执。补“成功创建→收窄／撤权→原 key/body 重放”负例，并保持合法重放不重复创建 child、reservation、Lease 或交付。(blocking)
