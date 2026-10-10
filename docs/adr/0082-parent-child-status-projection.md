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

产品独审增补：创建投递的发送前确认
真实 receiver 验证暴露既有 agent.session.created 发送路径仅在创建时确认资格、没有发送前撤权与 claim fence。新增 authorizeSessionWebhook，在解析后的 HTTP 目标确定后、发送前，以原 delivery、event、Session、nonce hash、唯一 SessionToken 和安装来源定位；不猜最新 Token。事务设置全程 LOCAL lock_timeout=250ms（包括 canonical 获取阶段），先 workspace FOR KEY SHARE，再完整 lockAgentAuthorityPlan，来源 Connection／credential 使用 FOR SHARE NOWAIT，随后锁 Team／actor／membership、endpoint／secret与 delivery 并重新验证全部绑定、活动资格和 clock_timestamp 租期。Connection DELETE 还会先锁 installation 后锁 coordinator，故整个发送确认的行锁等待均有界，来源锁额外 NOWAIT；55P03／40P01 回滚并释放全部 canonical 锁，沿现有 retryable 投递退避，禁止省略来源锁或将锁竞争当成功。此设计不改既有撤权命令或授权角色。

M1 self_claim／self_claim_recovery 通知保留无 nonce：创建事务取 Token INSERT RETURNING id，把非秘密 sessionTokenId 写入原 delivery payload，只允许该原 event.assignmentMode，按准确原 Token／安装来源重验，不选择最新 Token、不通过通知授交换凭据。缺旧来源绑定失败关闭。nonce 未交换时仅 queued 能启动；已交换的准确原 nonce 允许合法活动 Session 的同 deliveryId 至少一次重放，由 receiver 幂等返回 409，不创建第二授权。paused／stopping／stale／终态或来源失权均拒投递；失权永久失败沿现有 dead 结算。claim 的 attempt_count、workerId、租期及原 payload 同时确认，完成／失败更新也检查 attempt_count，拒同 worker ABA。事务 commit 是发送授权界限，commit 前撤权零 HTTP，commit 后在途请求不能召回；不持事务跨网络。来源锁竞争、installation 先锁的撤权逆序争用回滚及准确 revoker PID 的 pg_blocking_pids 等待后撤权提交、Stop、旧 claim、重启与响应丢失重放由 M2 conformance 验证。内部同模型独审继续核对此修复设计，最终成果仍须平台独审与 Required CI。

存量兼容限制：部署前无 nonce 且缺 sessionTokenId 的待发 self-claim 通知无法证明原 Token，发送确认失败关闭并按原永久失败策略 dead-letter，不回填历史 event/payload 或挑选最新 Token。已有原 claim 回执及同一合法 C 来源可继续调用原 exchangeClaimedSessionToken，再 ACK／执行；这不是通知恢复。若原回执丢失或原来源撤销，该 Session 没有此通知的自动恢复路径，须 Human 沿既有 Stop／取消及重新合法 claim 流程创建新的事实；不声称旧通知重新发送成功。实际测试分别保存无 ID、错误 ID、过期 claim、Stop、原 Connection 撤权的零 HTTP，以及准确原 ID 的实际签名 receiver 投递。

锁结论仅为有界争用回滚后重试。早先“消除循环”判断不成立，保留在内部审查历史；250ms／NOWAIT 不证明全部 API 删除路径统一锁序，也不把 55P03／40P01 当发送成功。实际 installation／来源 Connection／delegation 争用回执须与 commit 前后的授权边界分列。

Spec changes
Runner 具名 failure 入口复用现有 failAgentSession DTO 与 POST /agent-sessions/{id}/fail，不扩权限、迁移、事件或终态重放。failure／completion／wait 意图互斥；failure 关闭新工具，Stop／撤权优先，静止后只按 ExecutionLifecycle.reconciled 实值登记外部效果。宿主先以原 fence/key/body 持久 failed Turn／Attempt，再以意图原 ifMatch/key/body 调用 /fail。两个事务分别提交，不承诺原子性：崩溃间隙可留下 failed Turn 与 active Session，无自动重 claim；后一步明确拒绝或网络／解码／5xx 不明分别记录 rejected／unconfirmed，不把终态拒绝当成功确认，不再次 settle 或 Stop cleanup。原失败命令仍重验 live Session／委托／能力／revision；未知响应后只沿既有授权读取诊断，不能猜测原动作已成功或增加 failure execution-result 例外。真实 HTTP/MCP/Pi、旧 revision、Stop／撤权及响应丢失用例交正式成果独审。

里程碑与关系有序分页保存 PostgreSQL created_at 原微秒值到签名 cursor，响应删除内部游标字段并保原 Date 序列化；sort/filter/actor/workspace/signature/TTL 绑定与原 Paginator 不变。历史已发行的毫秒游标继续按原值校验，但不能恢复丢失微秒；消费者应从首屏重读以取得精确新游标，不能伪造 cursor 或改变权限门禁。

投影 DTO 写入 contracts／OpenAPI／协议；M2 discovery 增量合成现行 policy、SDK、MCP、Runner、conformance。无 Schema 或 migration 变更；原 #53/M0/M1 和 M2 规划候选原件保全，产品检查另行记录。
