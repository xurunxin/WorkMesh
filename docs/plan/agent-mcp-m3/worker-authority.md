# 普通 Git 外发的完整 authority 事务

状态：Proposed；回应独审第二条 blocking。现 authorizeProviderSideEffect 只锁 action，其后 facts SELECT 没有 authority 行锁；lockAgentAuthorityPlan 当前仅 context resolution 使用。旧方案不能据此宣称 Stop/撤权与发送授权按提交次序串行。

## 全部路径的一致锁顺序

在 apps/worker/src/provider-actions.ts 建共用完整 locator/锁计划和锁后事实重读，不嵌套旧 withTx。未加锁 SELECT 仅发现 IDs，不能授权；locator 变化则整个事务退出/失败关闭，不在高 rank 后补低 rank。普通写、context resolve/pin、本地 finish 及 merge/CI 拒绝处理凡需要 authority+delivery 行锁的路径均使用以下顺序：

1. workspace FOR KEY SHARE。
2. packages/db/src/agent-locks.ts:lockAgentAuthorityPlan 的既有完整 rank：definition → Team grant → Delegation → Session → Session Token → Installation Token → WorkItem → Project。同 rank 去重并按 ID／grant tuple 排序；相关父子 authority 在同一完整计划内，不对 action 先 FOR UPDATE。Worker 以原 action 来源读取，不能伪造 Agent Token。
3. provider connection → repository → Team → actor/principal → membership，普通发送使用SHARE模式并排序，不持这些锁再调用低rank helper。context实际pin的finish路径对repository用FOR UPDATE，普通发送/replay写授权用FOR SHARE；仅FK KEY SHARE或双方SHARE不能阻止新context插入。由同仓库UPDATE/SHARE冲突保证pin与最新context选择串行，其余资源维持原SHARE。
4. PR projection → CI check projection，按 ID 排序；继而 approval → merge binding → provider action。PR/check 顺序与 delivery API 的对应入口一致，双方均在 approval 前锁目标，避免 Worker 原 action→approval→PR 顺序造成反向等待。review/findings 是 append-only，在被锁 PR/head 下完整重读，不用旧缓存。

claim 只锁 action 并在短事务提交，不持 action 等 authority；checkpoint 仅 action CAS，没有低 rank 回边。需要 authority 的 finish/拒绝/context 路径统一上述完整顺序。更新 packages/db/src/agent-lock-order-manifest.ts，原 inventory 与负例必须复验，不豁免新增低 rank 写；本合同不宣称整个系统所有锁域无死锁。

## 每一次仓库写的发送前边界

Worker 先做完整 live preflight，拒绝后不构造 provider 执行链；merge 的准确 provider head 只读观察在事务外取得，不能持 DB 锁跨网络 I/O。随后每次 repository mutation 的 beforeMutation callback 进入同一完整事务，锁后重读 actor/principal、definition/grant/Delegation/Session、Team/WorkItem/Project、repo/connection、当前 context/branch/path、Plan step，确保 locator/原 action 绑定不变。

merge 的 canonical payload/当前 PR head、最新全部 checks/reviews/findings、精确 approval/binding/status/consumed 同该事务重读；CI 的准确 PR/check/head/status/canonical approval 同该事务重读。把现 revalidateMergeExecution/revalidateCiRetryExecution 的逻辑改为接受同一个 tx，不继续分散三个已提交快照。最后一条发送许可 SQL 用 clock_timestamp() 校验 claimed_at+原60秒租期、workerId、原 attempt/status，以及 approval 的实时到期。失代零发送；过期无 checkpoint 按 worker-recovery 保守停发，不写 authority_revoked。

成功提交后才可执行本次请求；callback返回有界单次许可，adapter 在调用 fetch 的同一同步段再次核有效期，丢弃已过期许可。凭据准备与 provider GET 属已授权的只读/安装协议输入，不作为仓库写成功；统计单列这些 HTTP。初始 preflight 与每次 mutation 最终事务区分，不把前者的通过当最终外发许可。

内部类型确定为 ProviderMutationGuard = () => Promise<ProviderMutationPermit>，permit仅含deadlineMonotonicMs。最后SQL按clock_timestamp返回min(claim期限,适用approval期限)的正余量；Worker以本次callback起始performance.now加该余量形成保守deadline，提交等待也扣入，不通过客户端墙钟延长许可。adapter拿到permit后至fetch之间不再await，按同进程monotonic检查，一次消费、不缓存、不自动重取重发。无guard的既有非Worker调用保持兼容；Worker五类写不得漏传guard，单元与真实HTTP必须断言。

packages/git-provider/src/index.ts 导出内部 ProviderMutationGuard，GitHub/Gitea constructor options增加可选 beforeMutation，保持普通 SDK/REST DTO不含该函数。ProviderResolver增加兼容可选第三参 executionGuard；apps/worker/src/index.ts按本次action创建带该guard的adapter，fake共享后端只套新的请求级facade，不改共享实例callback/身份。GitHub/Gitea的 #request 在 token/header/body准备后、实际仓库POST/PUT/PATCH fetch前调用，fake facade在每个对应效果前调用；安装 access_tokens POST、GET不冒repo mutation。commit的tree/commit/ref都各自guard，不只在createCommit开头检查。首个请求已发送后Stop/撤权或租期失效，后续仓库写拒绝，原动作无checkpoint则unknown，不能重启从头补发。

发送授权事务先提交的单次在途请求不能召回；Stop/撤权可能随后提交，其后每次 mutation callback 必须拒绝。Stop/撤权先提交，Worker 等锁后读到失权，仓库写 HTTP 为零。这里的线性化点是授权事务成功提交，不是新增发送 marker，也不是 HTTP 与 Postgres 原子事务。provider 侧 head 的外部变化仍依赖各 adapter 自身条件与诚实支持限制。

## 必需实际锁竞争

用独有真实 PostgreSQL 保存 PID、pg_locks、pg_blocking_pids 与 clock_timestamp：Stop 或 revoke 持有 Session/Delegation/grant 锁并未提交时启动 Worker callback，证明其真正等待；控制方先提交，Worker获得锁后拒绝、仓库 mutation 计数0。反向让 Worker拿完整authority/PR/check/approval锁并读事实，启动 Stop/撤权证明等待，再提交发送事务，仅该次已授权请求可发生，后续 callback 拒绝。不是在调用前简单设置 stopped。

对 merge/CI 同样交错更换 head/check、取消/过期 approval；跨真实60秒阻塞后最后 lease SQL 拒绝。保存同 workerId 新 attempt 与旧响应竞争、context pin与发送/完成竞争、双 Worker及真实 adapter 多步写停发。检查零数据库死锁、零越权仓库写、checkpoint/finish只有原generation可落事实。
