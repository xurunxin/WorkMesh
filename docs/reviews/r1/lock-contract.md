# 恢复与根完成的锁序交接

这是待实现/验收的共同契约，不是已改 SQL 的锁清单；本轮未修改产品代码。

## 已读到的机制

- `apps/api/src/inbox/routes.ts:309` 的 `lockReplyParticipantsBeforeReservation` 收集 Session 并去重排序 advisory 锁，`:1266` 在 `beforeReserve` 调用。Agent 路径不能先持有业务根再回头取该锁。
- `apps/api/src/agent/guard.ts:183` 的连接生命周期前缀在普通 authority 之前；`:207` 调用中央 helper，`:237` 的 `revalidateLockedAgentSessionForMutation` 是 post-lock 重验接口，不再追加 ranked 锁。
- `packages/db/src/agent-locks.ts:66` 的 `lockAgentAuthorityPlan` 要求一次收集完整计划，`:83` 实际锁顺序与 `packages/db/src/agent-lock-order-manifest.ts:1` 一致：definition、Team grant、delegation、Session、Session token、installation token、work item、project；各 rank 内稳定排序。
- `docs/adr/0037-agent-inbox-recipients-claims-and-receipts.md:46` 已规定 Session 锁先于幂等预留。Human Inbox reply 当前分支先取业务行再补 advisory，F5 扩展全链时必须一起纳入统一计划，不能仅新恢复端点使用新顺序。

## 冻结顺序与 owner

无锁 locator 只发现根、前驱、后继、参与者、来源资源与当前授权 id，不授予权限。先排序去重的 Session advisory，再既有连接/凭据/coordination 生命周期前缀；有 Chief 上下文再按稳定 id 锁 appointment，然后既有全部 authority rank。包括 Chief 委派的 delegation 实体留在既有 delegation rank、按稳定 id 排序，不能提前放入前缀或重复取得同一行。锁后 guard 重验身份、recipient、授权、任命代次、Stop、revision、根非终态与恢复资格。之后才取 root → 直接前驱 → 稳定排序后继的业务锁，锁后再读绑定。业务锁后不得补低 rank；绑定/锁集变化则整事务回滚，以原请求幂等身份重新定位并重试。

#24 F1 与 #25 F2 实现任命/换届/修订/撤权时采用同一 Chief 前缀；#28 F5 同时修改恢复和 Inbox reply、Work Room answer、Human resolve 三条根完成路径；#26 F3 保留根输入 Stop 抑制；#29 F6 使用已验收接口做最终联合验收。普通无 Chief 上下文事务不新增 Chief 锁或权限。

#25 同时负责影响 Chief 派生执行的普通 definition/Team grant/delegation 撤权交接：先发现完整参与者/appointment/authority 集，再按同一顺序锁定，不能在已有 rank 之后插入 appointment。#28/#29 交叉并发包含这三类撤权；本次只冻结新接口所需顺序，不声称旧语句已经改好。

## 必需的实现清单与验收

#28 执行者逐条列出新 SQL 的 symbol、statementId、涉及 ranks、前缀与业务锁，不按行号机械更新；复用 `packages/db/src/agent-lock-order-manifest.ts` 的符号/statement 清单及 `UPDATE_AGENT_LOCK_MANIFEST=1`，由独立审查者逐语句核对，不能申请宽泛豁免。本轮无新增 SQL，不伪造未来清单。

目标文件：`apps/api/integration/agent-lock-order.integration.test.ts`（现有，扩展以下用例）和 `apps/api/integration/inbox-redelivery.integration.test.ts`（待创建，归 #28）。用例须覆盖恢复×reply/answer/Human resolve、恢复×Stop/撤权/换届、Human 完成×Agent 完成、双恢复竞争、locator 锁集变化回滚重试；断言有界完成或明确冲突、无逆 rank/死锁、仅一次根最终 resolution、全链一致、原 claim/回执不可变、失败无状态/event/outbox 残留。#29 再叠加 checkpoint 保存前后崩溃与工具重放；不能只用静态顺序扫描代替运行并发验收。
