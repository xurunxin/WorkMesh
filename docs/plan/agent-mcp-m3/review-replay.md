# 显式 reviewer 仓库授权的锁内 replay

状态：Proposed；回应独审第三条 blocking。当前 collaboration/routes.ts:command 只把 handler 传给 mutate，commands.ts 在命中旧回执时跳过 handler，且 createReview 未传 authorizeReplay。不能以 router 的 work:write 代新增 repo:read/context 校验。

## 接线与完整锁计划

仅扩展 collaboration 的 command wrapper 透传已有 MutationOptions；不修改 mutate 的通用语义。createReview 两种输入路径都在 beforeReserve 取该 review 命令的 actor/workspace/key 协调 advisory，随后读 locator 并用 lockCollaborationSessionTargets 扩展的完整 plan 取 authority 锁，再由 mutate 领取/锁 idempotency receipt；不持旧回执行再反向取低 rank。省略 repositoryIds 的权限、DTO、预算与回执合同仍保持 M2，只调整内部锁序。

beforeReserve 未加锁读当前 key 的 operation/hash/response仅用于定位：匹配本请求时，以 reviewDelegationResponseSchema 中准确 child Session/Delegation ID 扩展 parent/target definition、两个 grant、父子 Delegation/Session及原 caller token/installation、WorkItem/Project的完整锁计划，包含已 completed 子，不只用旧 helper 的活跃容量列表。不能凭输入 reviewerAgentId 猜某个最近子；异 operation/hash 仍由 mutate 原冲突门禁裁定，不泄漏他人回执。锁后重读所有locator绑定，变化则失败关闭，不能边锁边追加较低 rank。

同类首次创建及同 key 重放共用协调前缀，避免读到未提交子后漏锁；不同 target ID 的同 key/body变化也由相同 key 协调串行。禁止为 replay 再执行 admitChildSession、目标并发 admission或累计DB child额度；已完成的合法 child不因新的预算/并发压力被重新创建。

## handler 与 authorizeReplay 共用校验

新增纯授权校验器（名字是提案，不冒现有函数），新显式创建调用同一校验器的 creation模式；mutate已核operation/hash/过期/回执可用后，authorizeReplay以当前被锁旧回执及DB child读 replay模式。

显式 replay必须重验当前调用方本人E/准确parent authority、父 Delegation/当前父 definition/grant、目标reviewer definition/Team grant的 repo:read、每个 repositoryIds 属父当前范围、connection/repository合法、父子最新同一共享 WorkItem/Project context及read/review/path/branch。核 child.parent_session_id、child.delegation_id、parent_delegation_id、reviewer Actor、stable step/version/WorkItem/Team及 stored仓库清单准确对应原请求/回执；子不得具 repo写/plan:write。回执创建时 state不会被伪改成live状态，当前子终态诊断沿M2列表；返回旧创建回执不续Session或复发交付。

三方读能力缺失、父scope收窄、context替换成父专有/较宽旧版本、父子binding不一致、repo/connection停用，返回原稳定授权拒绝；不返回旧回执、不追加普通事实/交付。合法重复仅原JSON回执，child/reservation/Lease/event/outbox/HMAC HTTP计数保持一份。父 Session-only context不复制；省略输入仍不追加 repo:read。

完整authority rank之后，按发送合同的资源顺序锁所选repository FOR SHARE并读取最新context；context实际pin采用同仓库FOR UPDATE，防止只有不可变context行/FK锁却允许新版本插入。查询普通GET仍用最终SELECT授权快照，不把这个写/replay锁安排扩大成新GET副作用。

## 必需产品用例

分别成功显式创建后仅收窄父 repositoryIds、撤目标definition repo:read、撤目标Team grant repo:read、替换共享context（保 work:write，让请求实达 replay hook），以原 key/body重放，均拒绝且不泄漏回执、零新事实/HTTP。再做未变授权的合法重放，包括 child completed、预算已满和目标并发已满，仍返回准确旧回执不跑 admission；异 body旧key保持 IDEMPOTENCY_KEY_REUSED。

用真实PG锁交错 replay与撤权/scope/context修改，保存等待关系；授权先提交只允许本次回执，撤权先提交则拒绝。覆盖新创建同key并发、不同target异体key冲突、事务失败全回滚和原省略M2回归。源码接线、静态Zod、HTTP实际调用分别报告，不以handler单元通过冒replay通过。
