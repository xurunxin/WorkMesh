# Worker 按 provider／kind 的恢复合同

状态：Proposed；回应独审第一条 blocking，未实现、未运行产品恢复测试。现源码 `claimAction` 会重领 failed／过期 claimed，`executeAction` 在 result=null 时再次执行 adapter；GitHub retryCheck 直接 POST rerequest。旧候选的 attempt CAS 承诺不足以防第二次外发，以下规则替换旧规则。

## 持久事实与保守停发

不增加字段、状态、迁移或发送标记。复用已有单调 attempt_count：pending 且 attempt_count=0、result=null 是尚无领取历史的初始 action；领取原子递增。五类写 action 在任何后续领取／恢复前，若已有领取历史且没有合法 result checkpoint，均视为“可能已经发送”，在原行锁与 generation CAS 下转 dead，last_error 仅保存稳定 PROVIDER_ACTION_OUTCOME_UNKNOWN，复用 provider.action.dead_lettered 及原事务 outbox。客户端 effect=unknown、result=null、recovery=human_reconcile、scheduled=false，不消费 approval，不建交付 Artifact，不发第二次仓库写 HTTP。

失去 generation 不写旧状态；过期且仍拥有 generation 的旧 Worker 不再发送，按同规则保守停发，不能冒权限撤销。claim/release/fail/checkpoint/finish 全部绑定 id、claimed_by、attempt_count、原 status；attempt 不退减、不清零，避免同 workerId 的 ABA。部署关闭、首次领取后崩溃、明确未外发但无法持久证明的失败，也可能产生保守停发；这是零迁移的恢复限制，不声称自动重试全部临时错误。旧 pending/failed/claimed 无 checkpoint 且有领取历史同样停发，没有免检的历史行。

写 action 只有初次领取的原 generation 可执行多步 adapter；每一次实际仓库写都经过 [发送前事务](worker-authority.md)。第一次 HTTP 已在途后，新的 generation 不得继续它，也不重调 adapter。旧 generation 丢失后其迟到响应不能 checkpoint 或覆盖新状态；可能存在真实效果但无结果的动作仍为 unknown，等待 Human 对账。新 REST GET 本身不进行 provider 对账，不把 unknown 解释为没有提交，不新建 action/key。

## 冻结恢复矩阵

“合法 checkpoint”必须逐 kind 校验原 action/provider/connection/repository/target、result 白名单及本地绑定；非法／无法证明的 JSON 也停发。表中的本地完成不调用 resolveProvider、不取得 provider token、不发送 GET 或写 HTTP，仅复用 finishAction 的投影／批准消费事务；不能把别人的合并观察补成自己的 checkpoint。

| provider | kind | 初次合法动作 | 无 checkpoint 且已有领取历史 | 合法 checkpoint |
| --- | --- | --- | --- | --- |
| fake | create_branch | 允许 | dead/unknown，零再次写 | 本地完成 |
| github | create_branch | 允许 | dead/unknown，branch 已存在不证明来源 | 本地完成 |
| gitea | create_branch | 允许 | dead/unknown，不再 POST branches | 本地完成 |
| fake | create_commit | 允许 | dead/unknown，不借内存去重重调 | 本地完成 |
| github | create_commit | 允许 | dead/unknown，不再次 tree/commit/ref 写 | 本地完成 |
| gitea | create_commit | 单文件允许，多文件不支持 | dead/unknown，不再次 PUT/POST contents | 合法单文件结果本地完成 |
| fake | open_pull_request | 允许 | dead/unknown，不借内存去重重调 | 本地完成 |
| github | open_pull_request | 允许 | dead/unknown，不借有界 PR 列表或 marker 重调 | 本地完成 |
| gitea | open_pull_request | 允许 | dead/unknown，不再次 POST pulls | 本地完成 |
| fake | merge_pull_request | 精确批准允许 | dead/unknown，不用当前 merged 推定原动作 | 本地完成／一次批准消费 |
| github | merge_pull_request | 精确批准允许 | dead/unknown，不再次 PUT merge，不合成结果 | 本地完成／一次批准消费 |
| gitea | merge_pull_request | 精确批准允许 | dead/unknown，不再次 POST merge，不合成结果 | 本地完成／一次批准消费 |
| fake | retry_ci_check | 精确批准允许 | dead/unknown，retriedChecks 不再增加 | 本地完成／一次批准消费 |
| github | retry_ci_check | 精确批准允许 | dead/unknown，rerequest 写 HTTP 总数保持一份 | 本地完成／一次批准消费 |
| gitea | retry_ci_check | 保持不支持，零仓库写 | 历史无证明事实不重发 | 不接受伪支持结果 |
| fake | resolve_repository_context | 只读 guidance | 原有界纯读重试，再重验 Human 与目标 | 本地 pin，精确 provenance |
| github | resolve_repository_context | 只读 commits/tree/blob | 原有界 GET 重试，再重验 Human 与目标 | 本地 pin，精确 provenance |
| gitea | resolve_repository_context | 只读 contents | 原有界 GET 重试，再重验 Human 与目标 | 本地 pin，精确 provenance |

已证明的不支持可用原稳定 unsupported 拒绝，不冒 unknown 已成功。context 的本地 pin 保持 final transaction 授权及 exactly-one 原事实；其 provider 请求只有读，故可重试。合法 checkpoint 达原尝试上限后仍允许本地完成，不因 attempt<8 的发送限额丢失结果；纯读上限保持原合同。

上述自动本地完成只适用于原可领取 pending/failed/过期claimed 状态；completed只读确认，dead不得自动复活或消费批准，保持人工对账。合法结果不能抹掉已有binding conflict/dead事实；查询仍诚实区分checkpointed与committed。

## 必需产品验证

对上述每行保存实际原请求与计数。用本机 HTTP GitHub adapter fixture 按真实 retryCheck 路径，在 receiver 成功记录 rerequest 后丢响应／checkpoint 前杀 Worker，跨真实60秒租期后双 Worker 重领：新 tick 不增加仓库写计数，DB 为 dead/unknown，approval 未消费。另在回包后、checkpoint 前注入现 PROVIDER_INJECT_FAILURE_AFTER_PROVIDER_SUCCESS，验证同结果；不是只测 failAction mock。

覆盖 branch/commit/PR/merge 的对应已发生效果窗口，commit 分别在 tree、commit object、ref 写后崩溃；新的 Worker 均不调用任何写 adapter。fake 确定性全链与 Gitea 本机 HTTP fixture 分开保存；真实账号均未测。合法 checkpoint 后重启仅本地完成，provider 总 HTTP 次数不增加，Artifact/approval/event/outbox 只一份。未发生效果但已领取的崩溃也显式验证保守停发；零迁移不承诺更强可用性。
