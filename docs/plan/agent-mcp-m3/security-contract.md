# 最小精确 provider action 安全合同

状态：Proposed，待独审。GET 尚不存在；本文件及提案不改变现产品。

## 请求、身份与实时授权

采用 GET /api/v1/provider-actions/{id}，operationId=getProviderAction。path 为 UUID，query 为严格空对象，不接受 sessionId、operationKey、If-Match、Idempotency-Key 来改变身份或领取动作。REST 只接受现有 Human cookie 或直接 E Session Bearer，不新增安装身份入口。

E：准确 token 绑定 action.session_id 与 requested_by_actor_id，actor/Agent/principal 活跃、Session 属执行型且在现 ordinary-read 状态、Delegation active、Team grant 未撤销；work:read 和 repo:read 同时为 Delegation/definition/Team grant 三方交集。工作项、Project、仓库/Connection 同 workspace/Team，repositoryIds 含目标，按最新适用 context 重验 read 和路径/branch 范围。公开只返回本人原 action；reviewer 不取得父 action 查询权。queued、paused、stale、stopping、terminal E 保持普通读取拒绝。

Human：resolve_repository_context 仅原 requested_by_actor_id 当前合法 Human，维持原 workspace admin 或该 Team admin/maintainer 及目标读取资格。Agent action 仅当前合法 principal Human，绑定原 Delegation/principal/准确 Session，当前 Team/目标读取资格仍须满足；不因 workspace admin 或知道 UUID 越过原 principal 绑定。Human 可诊断原 E 终态，但不能借读结果继续其普通写。撤销原 Delegation/Team 资格仍拒绝；不可确认不是未提交。

在 READ COMMITTED 的最终取数 SELECT 里同时结合 liveHumanTeamReadPredicate/liveSessionReadPredicate 和准确资源/来源关联；前置 locator 不得单独授权。成功与拒绝不调用 provider，不写 usage/token/receipt/Activity/domain event/outbox；ADR0028 原独立 authorization_denials 审计另列。部署 provider feature 先在授权资源上判断，隐藏对象不泄漏 provider 是否启用。

C 的 MCP 输入必须显式 sessionId 和 id，复用 M0 一次局部 Token bridge；API 仍收到准确 E Bearer。SDK/MCP 不以 action 返回值猜目标，不修改共享 client 身份。Token bridge 是既有独立调用，不冒整个组合是无 Token 写的纯 GET；REST GET 自身不刷新或续 Session。直接 E 无需 bridge；readonly 模式可发现合法查询。受保护 401/403 不刷新重发。

## 白名单输出

所有对象 strict；禁止 raw JSON、passthrough result、payload、文件内容、intent_key、claimed_by、秘密、原始错误或签名 URL。

公共字段：id/kind/status/provider/connectionId/repositoryId/requesterActorId/sessionId/workItemId/projectId/planStepId/expectedHeadSha/approvalId/createdAt/updatedAt/completedAt。nullable 按旧事实，不能把缺省来源补写为可信。

target 由原 payload 严格按 kind 摘录，只含 branch/baseSha/expectedHeadSha、PR provider ID/baseBranch/headBranch/headSha/method、checkRunId、context resource kind/ID；不含 commit message、文件 bytes、PR body 或 guidance 正文。create_commit 的路径集合只在服务器做范围核验，不返回 files。

result 为按 kind 校验后的安全值：branch 名/headSha；commit provider ID/sha/branch；PR provider ID/number/本地 projection ID/baseSha/headSha/state；merge bool/mergeSha；CI requested/checkRunId；context 的本地 contextId。artifactIds 来自本 action provenance 及同 scope artifact links，不复制 metadata/URI，不从当前 context 任意变化推断结果。

effect 为 committed、checkpointed、unknown：status=completed 且合法 result/本地绑定齐为 committed；非 completed 但合法 result 为 checkpointed（仅 provider checkpoint，不冒本地全链完成）；其余为 unknown。现表没有 sending/unknown 枚举或发送前标记；pending/claimed/failed/dead 都不能仅凭 status 宣称零外发。无效/旧 result 返回 result=null、effect=unknown、safe error RESULT_UNAVAILABLE，不能伪成功。

error 仅 code，来自封闭 allowlist；不以 split(last_error) 原样放行任意 provider 字串。可识别权限拒绝、head/approval/check、claim lost、provider unsupported 统一映射为稳定安全 code，其余 PROVIDER_ACTION_FAILED。该 code 不证明副作用没有发生。

recovery：completed/committed 为 none；初次 pending/claimed 为 poll_same_action，nextQueryAt=max(服务端当前时刻+有界轮询间隔,available_at)。五类写 action 有领取历史且无合法 checkpoint 的任何恢复路径先保守停发转 dead/PROVIDER_ACTION_OUTCOME_UNKNOWN，投影 scheduled=false、human_reconcile；旧 failed 写 action不冒还有安全自动外发。context纯 GET 才保留原有界重试，合法checkpoint只本地完成。完整 provider/kind 分表见 [Worker恢复合同](worker-recovery.md)。任何unknown都不提供重新POST、new key、claim/lease续期或自动重发；不将adapter去重、当前merge观察或读合同冒provider exactly-once。

## 六类 action 与消费者

本提案覆盖 create_branch/create_commit/open_pull_request/merge_pull_request/retry_ci_check/resolve_repository_context。历史字段 null 如实返回；action 完成与 E Session 终态不同，E 在活跃期间可以确认 action 终态。E complete/stopAck 丢响应仍沿 M1 原安装来源专用 execution-result；Pi completion 沿外层 settle，不放宽本 GET 的终态 E。

查询不消耗merge/CI approval。现普通authorizeProviderSideEffect只锁action，不具备context resolution使用的authority锁；claim的CAS缺attempt且锁后未核真实租期，无checkpoint重领还会重调adapter。三项缺口均明确改为待实现，不宣称旧实现满足新竞争验收。

按 [完整发送前事务](worker-authority.md) 补普通Git的authority-first锁计划、锁后事实重读、同tx merge/CI门禁及最后clock_timestamp租期/approval核验；每次真实仓库写HTTP前执行action-scoped beforeMutation guard，事务提交后发送，锁不跨provider I/O。按 [恢复合同](worker-recovery.md) 保守停发历史无checkpoint写action，attempt保持单调，失代零覆盖；合法checkpoint只本地完成，不借merged观察合成原结果。零新状态、期限或发送标记列、零迁移；unknown停发用既有dead/last_error/原dead_lettered事件，不是authority_revoked。授权事务先提交允许该次在途请求，Stop/撤权先提交则零仓库写，后续请求各自重验。

authz/authorize.ts 对新getProviderAction只收敛目标可见性边界：正常身份/状态/能力检查保留，隐藏target的所有早期拒绝统一NOT_FOUND或由最终授权SELECT裁定；不得按未授权locator返回不同Team/feature错误。其他operation不沿此例外。

零迁移：全部原事实已有 provider_actions/result、artifact_links、PR/check/review/approval 表。新查询派生 effect/recovery，不保存新状态。新持久化或发送语义不在此零迁移决定内。

## 交付查询与上传

getProjectDelivery 增加可选 pullRequestId 精确过滤；默认 envelope/字段保持。targeted 模式只返回授权 PR 当前 head 的完整 reviews/findings/checks/批准，不因 LIMIT 200 丢遗漏而说无 blocking。超出传输上限明确拒绝并保持未消费，不能返回成功摘要代完整判定。通用列表的原分页/数组兼容，不声称 bounded project view 是全 Project 列表。

GET 成功在最终 SELECT 重验实时 scope；WorkItem-scoped E 不读同 Project 其他 WorkItem 的交付事实，repo 范围外 PR/Artifact 不混入。Human 默认视图保持原合法字段。上传 status 限原准确 Session，download 保持现 own-session 规则，不增加 reviewer 读取父 upload 的权限。

request/finalize/cancel 继续 Idempotency-Key；upload cancel 无 If-Match，来源为 delivery/routes.ts 与 OPENAPI。finalize 过期事实先 commit 再稳定错误；canceled/verified/expired/rejected 不能重开。file 不参与 structured-review authority；reviewer 的 delivery 发布沿 generic publishArtifact 的 code_review-only 规则核齐，不能借另一入口发表 build/file。

REST/SDK/MCP 现签名响应作为受控客户端传输资料保持兼容，不写回消息、日志、snapshot、Activity；Pi 受控模块消费这些短期凭据，不把 URL/headers 交模型。只访问配置的 artifact store origin 和 server 返回的准确 object URL，拒绝 userinfo、未配置 origin、重定向；不发送 WorkMesh cookie/Bearer。使用现 MIME/size/checksum 限制、requiredHeaders、expiresAt，模型只给有界 bytes/文件名/业务绑定，不取得任意本机路径或任意 URL I/O 权。

health 的 createProjectHealthUpdate 沿 source=agent、exact Project、sources 与 If-Match；publish=false 可草拟，publish=true 必须 Human 决定的 project.health.publish 精确 payload approval。同 family 的 publishProjectUpdate 仍 Human-only。本项是现源码，不是用户新增权限裁定。
