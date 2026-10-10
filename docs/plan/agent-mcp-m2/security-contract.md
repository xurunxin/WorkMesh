# 父子状态与 reviewer 安全合同提案

## 最小只读投影

新增 `GET /api/v1/agent-sessions/{id}/children`，operationId `listAgentSessionChildren`。path id 必须等于当前 E 的 agentSessionId；仅 agent_session Bearer／execution Session，C、installation、Human 不调用此新增投影，Human 原查询入口保持。`childSessionId?:uuid` 精确筛选、`limit` 默认 50／最大 200、不透明 signed `cursor`。排序 created_at DESC,id DESC，cursor 的 filters 显式绑定 parentSessionId、childSessionId、exact Session；Actor／Workspace／route／sort 沿 Paginator。

响应为 strict `{items,nextCursor}`。每项仅 `id,parentSessionId,requiredForParent,state,revision,planStepId,planVersionId,resultArtifactIds`；字段名、null、数组限额见 dto-proposal.ts／openapi-proposal.yaml。状态是准确持久值，不映射 failed/canceled 为成功。结果引用只从 child 的 result_evidence.artifactIds 与 artifacts 实际存在行相交，必须同 Workspace、session_id=child.id、work_item_id 与父一致或为 null 的 Session evidence，最多 100，按 ID 排序；不返回 URI、metadata、summary、checks 或未验证的外部引用。创建输出仍沿旧 Session 结构，不能将此最小 DTO 用作子执行凭据。

## live 父授权与精确创建绑定

复用 route authorization、liveSessionReadPredicate 的凭据／Session／definition／Team grant／scope 谓词；它对 E 本身不充分证明 principal membership，因此最终查询另 join 父 delegation 的 principal Actor(kind=human,is_active)及实时同 Team membership。复用当前 credentialHash 的 exact exchanged、未撤销、未到期 parent Token，不 refresh、不签子 Token。对于 Connection 来源凭据按当前认证合同重验其 live Connection／credential overlap 与 principal 绑定；native 来源不猜 Connection。判定 SQL 从当前父与 trusted actor 构造，不接收 actor/principal/team 自报值。

父可读状态沿现行 read 集合：acknowledged、planning、executing、awaiting_input、awaiting_approval、blocked。queued、paused、stopping、stale、completed、failed、canceled 及任何撤权拒绝。其 active Delegation、Agent definition、Team grant 对 work:read 的三方交集、Team／WorkItem／Project live scope 全部重新核。资格在最终保护数据 SELECT 中重验，每页执行；空列表不掩盖父失权。先校验父并在最终 SELECT 重验，父存在且授权、确实没有子时才返回空 items。

子必须 same Workspace／Team，parent_session_id=父.id，child.delegation.parent_delegation_id=父.delegation_id，principal 同父，子 WorkItem 同父，原 plan_step_version_id 所指 version.session_id=父，step 在该 version 中存在并有该父 stable identity。只列直接 child，不递归，不把 Handoff 的非 Plan child 混入。读取原 version，不要求等于父 current_plan_version_id，以免后续版本隐藏 required blocker。子 terminal 或其自身 Token／grant 已失效仍可读上述最小持久事实；这不是读取子正文的权限。原绑定缺失／歧义的历史 child 不推断，不补写；精确筛选返回 NOT_FOUND，无过滤列表排除不可信绑定。

有效父＋不存在／错父／跨 Team child 一律 NOT_FOUND，不泄露 existence。父不匹配 current Session 为 RESOURCE_SCOPE_DENIED；缺／失效 Token 沿 UNAUTHENTICATED，live grant／state 拒绝沿现行码，不将拒绝翻成空成功。参数／cursor 格式错误沿 VALIDATION_ERROR／PAGINATION_CURSOR_*。错误完整保留 code/message/details/correlationId。

## 零副作用

查询不调用 mutate、resolveCoordinationIdentity、loadAgentSessionForMutation、provisionNewSessionDelivery 或 token refresh，不更新时间／usage／revision，不创建 receipt、Session、Delegation、Activity、Turn、Attempt、event／outbox。授权拒绝可沿已有 authorization_denials 独立安全审计，须在零业务事实断言中单独列出；成功路径该表也不新增。REST GET 与 Runner 读取包装均不得追加 Activity。测试逐表 count＋指纹，并断言只序列化 DTO allowlist。

## 两种创建的共用准入

createChild／createReview 继续走 command→lockCollaborationSessionTargets→assertSessionWrite，沿全局 authority 锁序重验。parent current version＋step＋stable identity，父全部活跃子数量和同 stable step 的跨 version 活跃数量共同计入（沿 agentExecutionCapacitySqlPredicate，含 stale/stopping）；terminal 仅不计活跃槽位。额外按当前 enforce_stage2_session_tree 的语义检查父所有直接子累计总量（含终态和Handoff child），不得超过 parent.max_child_sessions，子终态不释放父总量槽位；保留原DB trigger而非修改baseline。共享准入提前返回沿API的 CHILD_SESSION_LIMIT，details明确 totalChildren／activeChildren／maxChildren，step拒保PLAN_STEP_CHILD_SESSION_LIMIT。父总量及活跃上限、step 活跃上限、target maxConcurrency、installationAuthority 都必须通过才写 Session 或 reservation。

普通 child 能力严格 work:read/work:write，专用 reviewer 严格 work:read/work:write/artifact:write，均为父 Delegation、目标 definition、目标 Team grant 的共同子集；reviewer 无 plan:write。普通 child role=reviewer 不获得专用 reviewer 能力或 Lease，兼容保留输入但明确可能无法完成 reviewer 双证据，调用方应选专用工具。Lease 从来不授权。

两路径 budget 沿 inheritChildBudget(parent.budget, body.budget ?? {})；reviewDelegationInputSchema 新增可选 budget:z.record(z.number().finite().nonnegative()).optional()，与普通child共享有限非负数字record。显式维度不能超过父已声明上限，省略维度继承父值，省略或{}不是取余额，而是继承全额；未声明维度沿普通child原规则，不新增计费维度／计费逻辑。对有效预算统一调用reserveChildBudget；超父cap或Σreserved＋requested超过任何声明cap，保持API外部CHILD_BUDGET_EXCEEDED（helper内部CHILD_BUDGET_RESERVATION_EXCEEDED映射），负数／非有限输入在Zod边界VALIDATION_ERROR。

在既有父authority及Session锁下，读取reserved rows加旧无reservation活跃reviewer占用，锁后重验并将有效预算同值写入 child.budget、child.inherited_budget、reservation.allocation、reservation.reserved。provisionNewSessionDelivery不接收budget参数，执行者沿准确child Session/context读取其budget，不能在SDK/MCP/Runner边界重新填parent.budget；真实Pi验证该读取实收40及受控假模型实际usage，不靠只少预留但仍呈现执行预算100通过。现行Session预算利用率是投影，不把它冒作新的模型hard cap机制；本批不新增预算计费/释放/模型限额域。保留原事件类型，在同一事务创建上述事实，不提前投递。

用户在原卡q-ka2GipEunxQuHuFYGap2C批准可选显式缩减budget，此处取代旧候选“全额reservation唯一方案”。父100、普通child60完成后reservation仍60；review显式40的有限预算完整链是必验正例，省略review budget或41为拒例。不能仅用父{}说明有限预算链完整，也没有Human调父预算恢复入口。现有reserved份额不因completed／failed自动清除；额度不足如实拒绝，没有新消费／释放账本。旧review无reservation的存量不补历史事实，按全部活跃review budget加入有效占用，排除已有reservation重复计数，直到存量终态；不回写历史行。本轮修订依然等待独审，不标三blocking已闭。

## 创建响应与上限入口

childAgentSessionResponseSchema扩展agentSessionResponseSchema：五字段parent_session_id／plan_step_version_id必UUID、required_for_parent布尔、inherited_budget数字record、max_child_sessions非负整数；覆盖budget为数字record，`.passthrough()`保留原创建响应额外字段。reviewDelegationResponseSchema={session:childAgentSessionResponseSchema,lease:leaseResponseSchema}并保wrapper额外字段。leaseResponseSchema来自execution-contracts.ts，原schema已在refine前passthrough，不能对ZodEffects再调用passthrough。不将该创建响应用于通用get扩大权限，不返回新增秘密。SDK保原泛型调用兼容、默认typed结果；MCP structuredContent.data和模型实收都要保字段，不再用普通Session schema丢掉创建绑定。

planStepInputSchema／父创建DTO没有maxChildSessions，publishPlan INSERT不写max_child_sessions，DB父／step均默认8。正常HTTP/MCP/Pi链使用默认值；边界默认8造满后第九次创建拒绝；低父总量／step活跃limit=1等仅测试专用特权DB夹具预备，明记真实SQL、归属和原值，不让Agent传该字段、不扩大客户端配置。跨version夹具每新version用相同stable step和明确step DB值，证明计数而非声称DTO配置成功。

所有 mutation 写 Session／Delegation／reservation／review_shared Lease／prompt／room／交付／event／outbox 同事务。review 当前 exclusive 冲突拒绝，TTL 以锁后真实时间核验；回滚不产生外部交付。消息与完成沿原门禁，非 required 不改为 required gate，failed required 不自动替换。

## reviewer 与父完成

本人 reviewer Room review_result 的 author_actor_id 与 session_id 必须匹配本人；本人 artifacts producer_actor_id 与 session_id 且 type=code_review。finishSessionInTransaction 要求两者都存在；structured review、noArtifactReason、父代发、另 Session／actor 代发均不能豁免。required=true 子处于任一非 completed 状态时，父 complete 返回 COMPLETION_PLAN_INCOMPLETE 和准确 blockerSessionIds，数组集合须逐 ID 验证。未来完整状态表／调用链见 lifecycle.md。

## 迁移与门禁

本提案复用现有 Session／Delegation／Plan／Artifact／reservation 表，没有新持久列、backfill、事件类型或 migration；SCHEMA.sql 不变。0001_v1_baseline.sql 已有 agent_sessions_parent(parent_session_id) WHERE parent_session_id IS NOT NULL，满足parent定位，再按有界页排序；保留父总量trigger与required完成guard。历史 binding 无证明失败关闭，旧 review 占用从现行事实只读计算。clean 与上一阶段数据库及 migration harness 仍跑回归。产品 schema 若出现本提案之外的必要改变，先提交精确合同差异独审，不默改已应用迁移。

本轮只提交 Proposed 文档／DTO 草案，现行 API、policy、protocol、SDK、MCP、Runner 均未实现这些变化。
