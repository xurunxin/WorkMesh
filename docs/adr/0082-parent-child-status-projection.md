# 父读子最小状态投影与有界 reviewer 创建

Status
Proposed。仅规划候选；另一 Agent 独审 blocking／high 闭合并经 Chief confirm 后实施。

Context
ADR0017 已定义两种创建、稳定 step、有限能力及预算；当前 agent/routes.ts 的 get/list 仅准自身。collaboration/routes.ts 的 createChild 有父／step 限额和 reservation，createReview 仅目标并发、继承预算和 review_shared Lease，父无法靠通用 get 确认子终态。commands.ts 的 finishSessionInTransaction 已要求 required 子 completed 及 reviewer 本人双证据，不重写该门禁。

Decision
新增 GET /api/v1/agent-sessions/{id}/children，operationId=listAgentSessionChildren，仅准确 live 父 E，绑定当前 Token／Delegation／principal／membership／definition／Team grant／资源与真实创建关系；只读直接子状态、revision、required、原 Plan/version/stable step 和授权 Artifact IDs。子终态可读，父终态／失权拒绝。使用 signed cursor，有界分页逐页重新授权；不返回子 token/prompt/正文，不扩大通用 get 权限，没有业务写副作用。

两种创建共用现有 authority 锁序、父现有累计总量及活跃限额、stable step 跨版本活跃限额、三方能力交集、目标并发和 reservation。保留 enforce_stage2_session_tree 的所有直接子总量保障，终态不释放父总量槽位。专用 reviewer 无 plan:write，不自动发布 Plan；必须本人 Room review_result＋本人 code_review Artifact，structured review/noArtifactReason 不豁免。reviewer 不新增 budget 参数，沿现有输入继承全额 budget，增加全额 reservation；有限父预算已有正额占用则可拒绝。旧未记 reservation 的活跃 reviewer 预算只读算入有效占用，已有 reservation 不重复计数，不补历史事件；既有 reservation 不自动释放。

这是作者依据 ADR0017 和代码提出的待审预算方案，不能表述为用户已选择。具体 DTO、错误、legacy、分页与消费者限定以 docs/plan/agent-mcp-m2/security-contract.md、openapi-proposal.yaml、dto-proposal.ts、policy-proposal.json 为精确冻结提案，实施前独审须同时消费。

Alternatives
扩大通用 Session get、授 Human 身份、返回子凭据及新增自主委派域均排除；此决策仅增加最小有界投影和修齐既有创建保障。

Consequences
父能确认 required 子事实但不能执行其工具。预算方案保守：完成旧 child 不恢复已 reservation 额度，可能需要 Human 修订父预算后再 review；本批不增加预算释放账本。存量无证明绑定失败关闭。保留现有创建输出、幂等、无 If-Match 创建合同；consumer 增量与拒绝码详见兼容表。Agent Room 细节经本人 Inbox，Room timeline 仍 Human-only。导入逐实体恢复，未变整项目原子。

Migration
复用现有表、索引、字段，无新 migration、backfill 或事件类型；上一阶段和 clean 数据库照常回归，SQL 执行计划须验证现有 parent_session_id／Plan 索引满足有界查询。查询按 cursor 分页且限制返回数量；不声称必须新索引。无法证明的历史 child 不猜测绑定，不授正文权。

Spec changes
本轮只有 Proposed ADR 和 M2 目录草案，AGENT_PROTOCOL.md、OPENAPI.yaml、SCHEMA.sql、产品源码不变。实施门禁通过后将投影 DTO 写入 contracts／OpenAPI／协议，将 M2 discovery 增量合成现行 policy、SDK、MCP、Runner、conformance；原 #53/M0/M1 冻结证据保持不变。
