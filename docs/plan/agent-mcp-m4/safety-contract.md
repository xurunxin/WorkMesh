# 四读取投影与 Runner 安全合同提案

状态：待正式独审；没有端点、权限、数据库或 Runner 行为已经按本提案改动。原文来源是 [冻结 M4](input/frozen-m4.md)、现行 `CONTEXT.md`、`AGENT_PROTOCOL.md`、`OPENAPI.yaml`、`SCHEMA.sql` 与 [ADR 状态索引](input/adr-status-index.json)。以下路径及符号绑定 [完整源码指纹](input/source-manifest.json) 的 current main，不用工具截断前缀计算全文 hash。

## 共同资格、快照与错误

`packages/contracts/src/route-policy.ts` 的现有 GET 操作能力为 `work:read`；四路径在 `OPENAPI.yaml` 早已声明 human/agent，M0 仅因 Human membership 查询差异在 `packages/contracts/src/agent-discovery.ts:58` 的 `queryDifferences` 阻断。修复是实现现行合同允许的最小 Agent 读取，不新增 API、角色、capability、membership 或管理权。

Agent 资格取自精确当前凭据 C 或 E，而不是 caller 提交的 actor/Session ID。复用 `apps/api/src/live-read-authorization.ts` 的 `liveSessionReadPredicate`：live actor、准确 exchanged E token 或 active C Connection/credential/coordination Session、未撤权未过期、读取允许的 Session 状态、active Delegation/definition/Team grant、三方 `work:read` 和 capability_scope。普通 E 分支本身没有 principal Team predicate，不能把它当完整授权：新投影在同一个 SQL authority CTE 关联 current Session 的 Delegation，补 `packages/db/src/principal-team-authority.ts` 的 active Human principal＋admin 或准确 Team membership，与 `apps/api/src/authz/authorize.ts` 的 `loadAgentFacts` 同资格。对 project/item 的现行 scope 继续精确相交。既有 route policy 的角色、feature 和状态检查仍先执行。

每个 Agent 投影以一个 SQL statement 返回 `authority_allowed`、目标可见标记及正文/聚合；标记只在应用内部使用，不新增响应字段。先授权后结果解释：凭据错误保原 `UNAUTHENTICATED` 等；最后快照失权明确 `SESSION_SCOPE_DENIED`，绝不以空数组、零聚合掩拒。合法 authority 下隐藏/不存在单资源用现有 `NOT_FOUND`；集合合法无事实才是空。跨资源过滤显式错误使用既有 `RESOURCE_SCOPE_DENIED`。禁止查询完再单独核权、先 list 当永久权据、使用 lease/receipt 替代授权、普通 GET 加写锁或修改全局 helper 让其他域随之扩展。

用真实 PG barrier 分别证明撤权在正文 statement 前必须拒绝；撤权在该 statement 取得快照之后允许返回该快照正文、下一请求必须拒绝。记录 DB barrier/SQL/HTTP 时间与具体事实，不把两个顺序请求冒充竞争。C 和 E 资格逐项正负验证，不把 C target E bridge 与当前 C 查询混为一个 binding。

发现资格同步须完整执行 [M4 discovery合同](discovery-contract.md)：四读使用current listInitiatives共同门禁与各自精确目标facts，替换Human查询旧谓词，同时移除queryDifferences。受控增量纳入真正discovery生成器及registry，而不是只生成route-policy。目标未知为requires_target_check，最终授权仍是本文件同SQL快照及A2A final gate；生成来源完整并不授额外Team/project/current或target Session权限。当前产品仍未修、未生成。

Human 保留每个路径的当前 admin/membership、Team-null、字段和空结果语义；修复不得缩减合法 Human 读取。A2A 增加最终实时 Human 凭据及 Team 核验是防止中途撤权继续派生写，使用现行 `liveHumanTeamReadPredicate`，不是新增 Human 管理权。

## Initiative：只聚合 list 已允许的项目

现行 `apps/api/src/operations/routes.ts` 中 `listInitiatives` 在当前 Team/Session 项目或准确 WorkItem.project_id 有 linked project 时可见；`getInitiativeRollup` 现用 `memberships.actor_id=current.id` 筛 projects，使合法 Agent 被误算零。新 `readInitiativeRollup` 按 list 的同一 live Session／Delegation／Team grant 与精确 Session.project_id 或 scoped WorkItem.project_id 投影 linked projects，Team、workspace、未删除及 live predicate 均相交，绝不把 Delegation.projectIds 的全部清单或 Team 成员权当可聚合范围。

合法正例：授权项目有至少一个完成项、published health、已知及 unknown usage；同 Initiative 的另一项目存在更多数据；Agent rollup 非零且只等于授权项目事实。另有同授权场景 Human 对照。C 的 team-only coordination Session 和 projectless Loop E 不因该 Team 的 Initiative 而获得项目读权，目标隐藏。

保持 `packages/domain/src/stage4.ts` 的 `rollupInitiative`、排序、201 行检测超过 200 个可见项目的 `INITIATIVE_ROLLUP_LIMIT_EXCEEDED`。成本仅在 COSTS 启用时纳入；按 currency 分桶，`knownCostMinor` 十进制字符串及 `hasUnknownCost` 原语义不变，无成本证据保未知。已发布健康读取规则不变。合法 Human 空结果照旧；先 list 后撤 Delegation、Team grant、principal membership/active、credential 或 Stop，必须拒绝而非零值。无领域写、无新 event/outbox/receipt。

## Automation run：准确当前 Session 的 run/effects

`listAutomationRuns` 现行 Agent WHERE 已要求 `run.session_id=current.agentSessionId`；`getAutomationRun` 的 Human membership OR `run.team_id IS NULL` 查询不同步，后者不能作为 Agent 通用读取权限。新 `readAutomationRun` 的 Agent 分支要求 exact run.session_id=current E/C-backed Session、workspace 及共同 live authority；只投影该 run 的原字段和按 action_ordinal 排列的原 effects/checkpoints，run/team-null 也不能绕开 exact Session。

保留 Human 原读及顶层 run.*、effects 返回结构。scheduler rule run.session_id=null 不属于 Agent 本人 run，合法 E 读另一个 run `NOT_FOUND`。Loop列表的 `recent_runs` 是现行可见元数据，不能凭其中 ID 推出本路径查看别人结果的权限。调用 `runLoopNow` 的 origin A 与返回的 target B 分开：A 可获 admission 回执，B 自身真实接单兑换的 E 才能读 B 的 run/result；不在 A client 内换成 B token，不假借 Human cookie。无领域写。

## Usage：准确 Session、相同快照及未知成本

`getUsageSummary` 目前两次 SELECT 的 Human membership 与 team-null 逻辑不能供 Agent 聚合；`recordUsage` 已明确准确 Session、agent_id、Session.project_id 或 WorkItem.project_id。新 `readUsageSummary` 限 `usage.session_id=currentSession.id` 和 `usage.agent_id=currentSession.agent_id`，复用该资源绑定。省略过滤参数仅表示本 Session；显式 agentId/sessionId 必须相等，projectId 必须是当前绑定项目；projectless Session 显式 projectId 拒绝，不能用 Loop.project_id 补出。from 包含、to 不包含，现行时间解析及半开区间保持。

authority、filtered records、tokens/runtime/tool_calls totals 和 currency_buckets 在一条 SQL 查询快照中形成，避免两次读取撤权/写入导致正文拼接不同授权时刻。Human 保原可见范围，在同 statement 形成相同字段。传输沿 `input_tokens/output_tokens/runtime_ms/tool_calls/unknown_cost_records/currency_buckets`；已知金额使用 decimal string，每币种保 `known_cost_minor` 与 unknown 计数，不浮点换算、不混币、不造新 monetary total。

合法无记录与失权要分开：原 totals coalesce 的字符串零是计数小计兼容值，不是“成本为零”。无 currency_buckets 代表没有成本观测；有 unknown 记录时任何消费者不得显示已知免费/完整成本。新的共享 DTO与说明标明这一点，不为便利篡改旧字段或添加未经合同确认的计数/新存储。无领域写。

## A2A：目标绑定、有限扫描与既有派生 delivery

`streamA2ATaskEvents` 已存在 `GET /api/v1/a2a-bindings/:id/tasks/:taskId/events`；Human 创建 binding/接受 task 和 pinned protocol 由现行 `packages/a2a-adapter/src/index.ts`、ADR `0027` 负责。Agent 新投影只允许 active binding、同 workspace 的 task.session_id 与 current Session 相同，共同 live authority 成立。不会使 Agent 能创建 binding、接受新外部任务、选择新协议或出站调用。

保留旧 `after` decimal bigint string 的解析/上限、每次扫描 workspace durable domain_events 最多 200 行，以及 `mapStreamEvent` 的当前 task 映射；返回 `{events:[{cursor,event}],cursor}`，cursor 为最后扫描行，未匹配的空页也推进。协议 delivery checkpoint 与普通事件、signed 集合分页分开存储，禁止向另一 API 互传 cursor。MCP `get_a2a_task_events`/Runner 是一次有限查询，不是无限 SSE、subscription 或自动服务端轮询。

当前 GET 会 INSERT `a2a_deliveries`，不能声称零 DB 写。新实现初始一条 SELECT 同快照核资格、准确 binding/task 和最多 200 原事件，映射在应用层完成；然后在 READ COMMITTED 事务的最终单条 guarded batch statement 再核同凭据、active Session/Delegation/Team/principal、binding/task 和已扫描的原 domain_event_id 归属，通过 `INSERT ... SELECT` 写既有 outbound 派生 delivery，并返回 authority 标记/安全页。即使零映射事件也执行最终 gate，失权 rollback 且不给正文；最终 gate 与新 delivery 插入在同 statement，不能先校权再裸 INSERT。固定原扫描 cursor/ID，不能重扫换成不一致的后续页。

沿现有 `ON CONFLICT(binding_id,domain_event_id) WHERE domain_event_id IS NOT NULL DO NOTHING`、delivery_id、sequence 和 payload 格式，不新增输入 Idempotency-Key、receipt、event/outbox 或表。同页重试仅一份既有 derived delivery；中途撤权／故障不得部分写；并发用唯一约束证明。最终 gate 之后撤权按该快照返回，后续拒绝。以上 A2A 派生写及 final gate 是本次 ADR 必审内容，不把 `write:false` 的发现读分类当零 DB 副作用。

## 既有有限写与 Runner 边界

`runLoopNow` 复用 `admitLoopRun`、`assertAdmissionAuthorization` 和 route/domain 两层交集：现行 `automation:manage`＋`work:write`，同 Team、可见 Loop、active pin/routing、definition/grant 交集、容量/预算/no-overlap/idempotency；不放宽 queued/blocked 的路由限制。源码 admission 主要核 caller Team，不能宣称存在不存在的 caller 项目二次钳制。target delegation bounded automationIds/projectIds 沿原生成。`packages/db/src/stage4.ts` 插入 target Session 不含 project_id/work_item_id；本卡不改变，target usage 必须省略 projectId，项目健康/Initiative 用另一个合法 project/item E。真正需要项目归属或跨 Session 观察另卡审查。

普通 `listSavedViews`/`createSavedView` 复用 `apps/api/src/server.ts` 的 owner/current actor、Team读取和 `createView` mutation；不借此创建高级共享 View。`listAdvancedViews/evaluateAdvancedView` 沿 owner/workspace/currentTeam 与 resultScope，不增加 Advanced View Agent 管理。Template 仅返回 `listTemplates` 当前 run 的执行 pin/body/version；workspace owner 不等于 Agent 执行 pin。规则/Loop/Template/预算/通知/A2A 管理与 completion Human decision 保留 Human。

`recordUsage` 的准确本人输入、dedupe、费用来源与 append-only usage/event/outbox沿原命令；route 仅要求 `work:read`。Runner `makeTool` 的普通写 Activity 包装会额外要求 `work:write`，故此工具明确 `recordStart=false, recordCompletion=false`；保命令原事实和模型 tool result，不伪造 Activity。工作读权限工具边界须直接准确 E 正反测试；真实 Pi 执行生命周期另用既有合格权限，不据 tool 边界证明整个 read-only Session 可以启动 Runner。

Runner 只以当前 executing E 的 `createWorkMeshTools` manifest 投影；C 不在内嵌 Pi 工具中伪装执行 E，C 的合法查询通过 SDK/MCP 真凭据测试。GET 不追加 Activity。单资源 run/usage/rollup、Template 大内容及 A2A 页完整输出；沿原 12,000,000 字符传输边界，超界明确错误且不给已消费 cursor；集合页沿现行缩小 limit＋同 cursor 的有界最多 8 次逻辑，仍不能提供完整页时明确错误，不用 ID 摘要推进。

现有 health/completion 的 exact project/item、source、revision、批准及 Human 工作流决定合同不变。ADR `0084-runner-tool-bounded-transport-replay.md` 的自动 transportReplay 白名单仍仅三原动作；M4 run/usage/saved view 不加进去，不遇401/403刷新并重试。ADR `0085-mcp-original-execution-recovery-discovery.md` 的原凭据 ACK/heartbeat/Stop/terminal 恢复特殊路径不被普通 feature/manifest 阻断，不用旧 receipt证明新领域资格。结构化错误完整进入 Pi/OpenCode 模型实收而不是成功 JSON；无隐藏思维链记录。
