# 父读子最小状态投影与有界 reviewer 创建

Status
Accepted。规划候选独审三项 blocking 已闭合且无新增 blocking/high；按用户明确执行已审方案的指令实施。产品成果验收与规划审查分开。

Context
ADR0017 已定义两种创建、稳定 step、有限能力及预算；当前 agent/routes.ts 的 get/list 仅准自身。collaboration/routes.ts 的 createChild 有父／step 限额和 reservation，createReview 仅目标并发、继承预算和 review_shared Lease，父无法靠通用 get 确认子终态。commands.ts 的 finishSessionInTransaction 已要求 required 子 completed 及 reviewer 本人双证据，不重写该门禁。

Decision
新增 GET /api/v1/agent-sessions/{id}/children，operationId=listAgentSessionChildren，仅准确 live 父 E，绑定当前 Token／Delegation／principal／membership／definition／Team grant／资源与真实创建关系；只读直接子状态、revision、required、原 Plan/version/stable step 和授权 Artifact IDs。子终态可读，父终态／失权拒绝。使用 signed cursor，有界分页逐页重新授权；不返回子 token/prompt/正文，不扩大通用 get 权限，没有业务写副作用。

两种创建共用现有 authority 锁序、父现有累计总量及活跃限额、stable step 跨版本活跃限额、三方能力交集、目标并发和 reservation。保留 enforce_stage2_session_tree 的所有直接子总量保障，终态不释放父总量槽位。父和step客户端输入不新增上限配置，正常使用DB默认8；低上限／跨版本边界只由测试专用特权DB夹具构造并标记。

用户在 q-ka2GipEunxQuHuFYGap2C 明确批准 ReviewDelegationInput 新增可选 budget。reviewer 复用 inheritChildBudget(parent.budget, body.budget ?? {})，仅显式缩减有上限的维度，未提供维度仍继承父值；省略整个参数继承全额。所得有效预算同时写入 budget／inherited_budget、reservation.allocation／reserved，并由受控交付和Runner按该Session预算执行。累计reservation不足拒绝，不自动释放旧份额、不自动按余额重写输入。旧活跃reviewer无reservation的占用只读计入，已有reservation不重复计数，不回写历史。

创建响应使用 childAgentSessionResponseSchema 扩展原Session schema，保全 parent_session_id、plan_step_version_id、required_for_parent、inherited_budget、max_child_sessions；budget记录及现有额外字段不得被普通schema剥离，review保原 {session,lease} wrapper。专用 reviewer 无 plan:write，不自动发布 Plan；必须本人 Room review_result＋本人 code_review Artifact，structured review/noArtifactReason 不豁免。具体 DTO、错误、legacy、分页与消费者限定以 docs/plan/agent-mcp-m2/security-contract.md、openapi-proposal.yaml、dto-proposal.ts、policy-proposal.json 为精确冻结提案，实施前独审须同时消费。

Alternatives
扩大通用 Session get、授 Human 身份、返回子凭据及新增自主委派域均排除；此决策仅增加最小有界投影和修齐既有创建保障。

Consequences
父能确认 required 子事实但不能执行其工具。有限预算父maxInputTokens=100，普通child显式60完成后仍保留reservation60；review显式40即可在余额内执行和预留，双证据完成后父完成。省略budget或提交41仍拒绝；没有Human调整父预算的API入口，也不能靠增大父预算解决全额review与旧正额预留相加的问题，删除旧恢复承诺。本批不增加预算释放／消费账本；额度耗尽时明确拒绝，不将未完成链说成通过。可选参数是用户裁定，具体方案仍需复审。存量无证明绑定失败关闭。保留原创建字段、幂等及无 If-Match；Agent Room细节经本人Inbox，timeline仍Human-only，导入逐实体恢复。

Migration
复用现有表、索引、字段，无新 migration、backfill 或事件类型；上一阶段和 clean 数据库照常回归，SQL 执行计划须验证现有 parent_session_id／Plan 索引满足有界查询。查询按 cursor 分页且限制返回数量；不声称必须新索引。无法证明的历史 child 不猜测绑定，不授正文权。

Spec changes
投影 DTO 写入 contracts／OpenAPI／协议；M2 discovery 增量合成现行 policy、SDK、MCP、Runner、conformance。无 Schema 或 migration 变更；原 #53/M0/M1 和 M2 规划候选原件保全，产品检查另行记录。
