# reviewer repositoryIds 与范围兼容

用户裁定仅增加显式限定仓库的 repo:read；无仓库写权、无 plan:write、批准仍 Human。细化规则是本规划的安全实施选择，待独审，不能称已上线。

## 创建与省略

repositoryIds?: UUID[]，显式 min=1/max=100、禁止重复/null；省略不是 []。省略时保持 M2 三项 reviewCaps、原 inherited capability_scope、预算/限额/响应 wrapper。不得为旧输入自动添加 repo:read。普通 createChildAgentSession 仍只具 work:read/work:write，不新增 repositoryIds；“两种适配”指 SDK 和 MCP 的 createReviewDelegation 适配，不是普通 child 升权。

显式时，在现 lockCollaborationSessionTargets、parent authority/Session 与目标 grant 锁内验证三方 repo:read、父 repositoryIds 包含每项、repository/connection 活跃、workspace/Team 一致；增加 repo:read，scope.repositoryIds 精确替换为所选集合，其余仅保原有受限 work/Plan 范围，scope.capabilities 与 permissions_snapshot 同值。不得取目标 grant 的所有仓库或父 repo 写权限。

复用 admitChildSession/default DB 8/跨版本 stable step、有限 budget 与 reservation、目标并发、review_shared Lease、provisionNewSessionDelivery。建议夹具父 budget=100，普通 child=60，reviewer=40；终态不自动释放 reservation，不虚构客户端 maxChildSessions。预算省略/41超额等仍按 M2 拒绝。仓库验证失败使 child/delegation/lease/reservation/event/outbox 全回滚，零受控交付 HTTP。

## context 兼容表

| 父实际选定 context | 子许可 | 当前决定与理由 |
| --- | --- | --- |
| WorkItem-scoped | 子同 WorkItem 且共享同一 immutable context | read 和 review permission 均须存在，父子按同优先级选同 context；paths/branch/base/guidance 原件完全一致 |
| Project-scoped | 子 WorkItem 当前归属该 Project | 现 createReview 不写子 project_id，而 applicableAgentRepositoryContexts 仅 rc.project_id=s.project_id；产品阶段抽共享 helper，以 live WorkItem 所属 Project 派生匹配，不把子空 project_id 改成跨项目授权 |
| 父 Session-only | 不兼容 | 不复制 context，不给子冒父 ID/Token。拒 RESOURCE_SCOPE_DENIED，恢复为 Human 通过既有 pin 建共享 WorkItem/Project context，然后重新正常创建 |
| 其他 WorkItem/Project/Team | 不兼容 | NOT_FOUND/RESOURCE_SCOPE_DENIED，不能继承范围外 guidance |
| 多个候选／最新覆盖 | 只用现 session→WorkItem→Project、created_at/id 优先级 | 父与子选择不同 context 时拒绝；不退到旧的较宽版本，不拿相同 repositoryId 当上下文等价 |

未来在 apps/api/src/delivery/repository-access.ts 抽出共享授权/选择 helper，delivery/routes.ts 与 createReview 使用同一谓词；不是新增 context 实体。每次 reviewer repo 读取或 delivery/structured review 写检查本人 live E、selected repositoryIds、真实 parent_session_id/parent_delegation_id/stable step 绑定、父当前 Agent/principal/grant/Delegation/资源范围及父子当前 context 一致。父无需交出 Token；Token refresh 不代权限验证。父 ordinary-read 状态/Delegation/Team/definition 失效时失败关闭；父等待 reviewer 的 awaiting_input/awaiting_approval/blocked 仍按原合法状态。

late revocation 或 parent repositoryIds/paths 收窄、context 改为父专有、WorkItem 移 Project、connection/repository deactivation、feature off，必须在读及写的最终授权/锁后重验中拒绝。检查 context 一致避免子退到更宽的共享旧 context。不得只在创建时验证三方交集。

同 key/body重放不能只依赖createReview handler。按 [锁内replay合同](review-replay.md) 为createReview接入mutate.beforeReserve完整锁计划和authorizeReplay，三方repo:read/父当前范围/精确父子binding/同一共享context都在返回旧回执前重验；合法回执不重跑admission或再次建child/reservation/Lease/交付。省略输入保M2权限合同，内部锁序也走同类协调前缀。

## reviewer 证据与不可借用权限

本人 Room review_result + 当前 PR/head 的本人 code_review delivery Artifact + 本人 structured review，均在合法执行 E 下提交，随后读新 revision complete reviewer。artifact:write 不能授予 repo:write_branch/open_pr/merge/ci:run；reviewer 无 publish_plan，Runner 不自动发 Plan。独立 reviewer actor 不等于变更 producer；同 Actor 不同 Session 也不能自审。

上传到父 Session 的 file download 保持 own-session 门禁。reviewer 可通过 M2 同 WorkItem 的 Document/授权 context 阅读当前 head 的审查材料；父提供有源码 SHA/差异校验和的可读 Document 及 diff/test evidence。夹具逐值比对材料与 fake provider 真实 commit files，不把 metadata/URL当已读取源码；不新增任意 Git 文件下载或 TA 本机文件访问。

父经 listAgentSessionChildren 查准确 reviewer completed；queued/active/failed/canceled/stale 均仍 blocker。structured review、file 和 noArtifactReason 不豁免双证据。M1 原结果确认保持精确来源和 ordinary terminal E 拒绝。
