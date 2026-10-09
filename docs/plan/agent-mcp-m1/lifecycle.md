# 精确 E Runner 生命周期与失败残留（Proposed）

现行 runPi/run-session.ts 的 poll 在 Session 非 executing 时 abort；RUNNER_ABORTED 使 executeTurn 跳过 settle；ensureExecuting 和 assignment 不接纳等待态。这是本轮修订的代码原因。复用 ModelRuntime/createAgentSession、waitForIdle、既有 fence、RunnerApi、agentMutate 与 ADR0068 settle；不启动新的长期模型 Attempt。等待 wire/持久条件见 [等待合同](wait-contract.md)，事务与锁序见 [迁移合同](migration-contract.md)。

## 正常执行和工具闭门

安装发现→queued ACK→合法 executing→list Turn→claim 新 Attempt→credential→start。普通模型只收到准确自身 E 的 Session/context/Plan/版本/Approval/Lease/Recovery 具名工具，权限依现行 role/state/scope/capability。Plan/state 命令和 Lease heartbeat 使用专门 wrapper，不能在请求前 append Activity 消耗 If-Match；其余原 makeTool 脱敏 Activity、结构化 error 和 SDK 响应校验保留。服务器最后校验仍为准。

模型 state 工具到 planning/executing 时走原合法 transition；到 awaiting_approval/awaiting_input/blocked 时生成唯一 waitIntent，不立刻写 Session。approval 先 requestApproval 获得准确 ID/原完整 sha256: hash，再提交等待工具；等待工具严格校验字段、持有当前 Turn 的 opt-in 能力，第二个不同 intent 拒绝。state target 不包括 Human pause/resume/stop、terminal 或 retry。Completion intent 和 waitIntent 互斥。

lifecycle 本地顺序是 stop/revocation/shutdown 闭门优先，其次 waitIntent，最后普通 completion。所有 tool、contextTool、steering 和晚到 poll 回调检查同一代际与关闭标记；本地闭门不依赖普通 Activity 被服务端拒绝。每个真正运行模型的 Turn 仍限原两分钟；被动 monitor 没有模型、没有原 Attempt，不把等待计作长模型调用。

## 请求等待 → 原子结算

1. 精确工具写 waitIntent 后立即关闭新普通工具/contextTool/steering，取消模型生成并等待 Pi idle 和已开始工具结束。使用 WAIT_REQUESTED 类型退出结果，不能走 RUNNER_ABORTED 跳过结算。等待回复为公开、脱敏的 reason 与批准/输入指引；不能要求/保存模型隐式思维链。
2. 如果外部在途未知，externalEffectsReconciled=false，不登记可自动恢复 wait。保存明确失败/恢复信息；Attempt 不得被重新播放未知外部调用。已知在途全部静止才允许结算。
3. 尚在 executing 且 live 时释放自己持有的 Lease，保留稳定 key/body；停止已经到来时不调用普通 release。release 丢响应先沿既有结果确认/读取当前 Lease 判定，不盲建 key。清理完成后读取准确 Session revision；若其间 pause/Stop/撤权，则取消等待结算，进入该控制路径。
4. 用独立有界 signal POST 原 settle endpoint，稳定 runner-settle-{attemptId} 外层 key/body，携带 public assistantMessageMarkdown、toolInvocations、settlement(outcome=settled,externalEffectsReconciled=true)、sessionWait。服务锁后核 fence/current Attempt、executing、If-Match、live 来源/授权和具名批准，把 Session 等待态、pending wait、公开回复、工具事实、原 Turn/Attempt settled、原 response 与 event/outbox 同事务提交。
5. executeTurn 返回 waiting；main 保留授权安装身份并进入 monitor，不重用旧 Attempt，不续 Lease。只能诊断 Session heartbeat 和读取当前等待/控制状态；查询确认入口本身不会 refresh 或续 Session。heartbeat 仍沿旧专用授权，不能恢复 paused/stale/stopping/terminal。

原 settle 丢响应只能原 key/body 走既有外层回执重放；不改正文、新 key、普通 complete 或 fallback Turn-only。明确旧 revision 拒绝且没有未决发送时读取新版本；原来 state 不再合法则不重做等待。故障全回滚后模型已静止，受控有界恢复结算或合法 aborted/failed settlement，未知状态保留记录；不得复活原模型去补一个无条件 wait。RUNNER_FENCE_STALE 不能旧写入，交现行 Worker reconciliation。

外部未绑定条件的 Session 状态变化仍停止模型，并尝试当前 state/live 授权允许的 aborted settlement；不猜批准或输入条件。暂停时普通 E 门禁拒绝，该 Attempt 由现行 Worker 超时/合法 Human 控制处理，记录尚未结算限制；不得声称所有强杀路径 finally 成功。

## 条件触发 → 唯一后续 Turn

Worker 每次 tick 扫持久 pending wait；相同权威/资源/Conversation/Turn/Attempt 顺序锁后才取 wait 锁。取真实requestApproval返回的准确 approved/原完整sha256: hash/未消费/未过期批准（不strip前缀），或等候边界之后真实合法 prompt/message。重验来源/principal/Team grant/双 Delegation（native 仅目标）、scope、负责 Human、Conversation 与模型权限。输入到达可沿现行 Human prompt 先合法切 executing，Worker 必须核真实触发并消费 wait，不再无条件 resume。

paused 保留 pending，无续 Turn/新 Attempt；批准或输入此时到达也不启动，Human resume 后 fresh 重验。Stop/撤权先提交使 Worker 不消费、不续接；拒批/过期也不启动，可保留待 Human 处理信息。无模型或凭据权限时不消费条件，避免“已继续却无法 claim”失去恢复事实。

满足条件：同事务 pending→continued，Session 按合法图转 executing（已合法 executing 时不重复），绑定最早 queued Human Turn 或创建唯一 continuation Turn/service system message，真实触发引用与既有 queued/state_changed/event/outbox 一起提交。Turn lineage 不用 retry_of 伪造自动 retry；wait 源/续 Turn 引用即准确关系。所有 waiting/pending 相关普通 Turn 在未消费前都不可 claim，防旧消费者或 prompt 自动 executing 绕过。

只有 executionWaits opt-in 且精确来源的 Runner 可取得续 Turn。claim 再验 pending 已消费与触发、single Conversation、predecessor、live scope、state；生成新 Attempt 和新 fence。credential 再验模型与受校验 continuation context，start 再验权限、executing、current fence；实际动作仍核批准。然后重新取自己的 Lease，模型运行新 Turn 并正常完成。

重复事件/双 Worker/tick 用数据库条件更新/unique 保证一个续 Turn；claim 用原 key/body 与 Conversation/current fence 保证一个 Attempt。重启重扫数据库，不靠丢失的进程内 debounce。故障全部回滚不遗漏 resume；Worker 在事务中断后看到原 pending 可重做。已消费原条件不再次消费；后来第二次等待是新源 Turn、独立 pending 记录，仍每 Session 一个。Runner 离线使 Session stale 不自动复活，按既有 Human 恢复处理，明确此支持边界。

## Stop 与 finally

观察 Human Stop/服务状态 stopping → 先关闭所有新工具/steering/模型生成 → 等待 idle/在途有界退出 → finally 只清理本人登记资源 → 保留 cleanupSummary/residualRisks → 原准确 E Token 发专用 stopAck。保持原 Token，不经 RunnerApi 自动 refresh，不经 manifest/普通 makeTool，不用已 abort 模型 signal；专用 AbortController 每次请求上限十秒，清理与 ACK 总预算三十秒，稳定 cleanup key/body。超时即保留原未决发送，不能为预算再生 key。

server Stop 已释放 Lease，finally 不以 release 代 Stop、不在 stopping 普通写 Activity/Plan。用原诊断 heartbeat 取 stopping revision，明确冲突且无未决发送才重读生成新逻辑请求。若强制取消已终态，不重发 ACK，不签新 Token；安装身份只走零写确认原 key/action。stopAck 提交丢响应：原 E 命令重放/普通 GET 终态拒绝，live 原来源安装/C 查询精确确认；无证明/撤权拒绝时留“无法确认”，不表示没有提交。

撤权、Token 过期、进程强杀、未知在途、清理失败均记录已执行清理、未清资源和风险，不复活模型；强杀不承诺 finally。Pi 原子 complete 丢响应走旧 settle 回执，不以内部 completion key冒 direct complete 证明。确认查询零事实，合法自动续接新事实分开统计。

本轮prompt FK准确绑定源Session，不替代Worker锁内workspace/live授权；两项具体合同修订见wait-contract/migration-contract，原自动续接路径与Stop时序不变。
