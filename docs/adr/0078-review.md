# ADR 0078 对抗式审查

审查日期：2026-10-07。结论：**当前版本不宜进入实现；复用方向成立，但两处 blocking 和下述 high 项必须先落成协议。**

范围：ADR 0078，先读同批 0074–0077 与 `docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.md`，再核对 schema、contracts、实际命令、迁移 SQL 和相关 ADR。下文位置以本次磁盘内容为准；`0078:Lx` 指被审查文件的行号。0074–0077 的文本状态仍为 Proposed，计划 L4 写着未开工；这不否认文件可能已合入，但不能把合入当成功能已实现。

本次只写此报告，不修改被审查文件，不调用远端写入，不执行 Git 操作、不执行 pnpm 全量或其他运行测试。代码和 SQL 证据是静态核查，不能标为运行验收通过。仓库根 `WORKMESH_PRD.md` 不存在，普通文件名搜索也未找到对应 PRD；该项无法核读，以下依据实际存在的协议、OpenAPI、CONTEXT、SCHEMA 入口及 ADR。没有据此猜测 PRD 内容。

## Schema 断言逐条核实

| 待验证断言 | 判定 | 实际证据与边界 |
| --- | --- | --- |
| `room_subject_kind` 只有 `work_item / project / session`，无 team/workspace | **正确** | `packages/db/src/schema.ts:27`；`packages/contracts/src/index.ts:556` 完全一致。加枚举值仍不足以创建 Team 房间，见 B2。 |
| intent 包含 status/propose/decide/handoff/blocker/review_request/review_result | **正确** | `schema.ts:28`、`contracts/src/index.ts:557` 共 11 项，还包括 inform/ask/answer/claim。这里的 `decide` 是消息 intent，不能代替正式授权事实。 |
| room_messages 有列出的七个字段 | **正确** | `schema.ts:352–354` 同时有 `authorActorId / sessionId / recipientActorId / threadId / replyToMessageId / structuredPayload / requiresResponse`。session、recipient、thread、reply 可空；不能仅凭列存在推断消息必已绑定执行者或收件人。 |
| actor 与 session 两级 recipient 表同时存在 | **正确** | `schema.ts:355–356`：`room_message_recipients(messageId,actorId)`；`room_message_session_recipients(messageId,workspaceId,sessionId,actorId,createdAt)`。 |
| inbox status 只有 open/resolved | **正确** | `schema.ts:25`、`contracts/src/index.ts:573`。但“不足以记录中间进度”的推论不成立，见 H4。 |
| inbox 支持 recipientActorId 与 claimedBySessionId | **正确** | `schema.ts:499–502`：actor recipient 非空，另有可空 human recipient、exact recipientSessionId、claimedBySessionId、claimedAt，以及独立 receipts。 |
| guidance 有 team/workspace scope、contentHash、审计事实 | **正确，需精确引用** | `schema.ts:31` scope 为 workspace/team/project；documents 在 L381–385，仅持 currentRevisionId；`contentHash / changeSummary / authorActorId` 在 **guidance_revisions L386–389**；audit facts 在 L390–393。0078 L40 的构件判断成立，所附 L381–384 不能证明 hash。 |
| capabilitySchema 的“16 项”被默认授权/排除两组完整覆盖 | **不符** | `contracts/src/index.ts:2–9,19–26` 导入并重导出 `agent-response.ts`；实际定义在 `packages/contracts/src/agent-response.ts:12–16`，是 **17 项**。0078 L105 的 6 项 + L106 的 9 项 = 15 项，遗漏 `artifact:write`、`repo:read`。本次只读提取计数为 17。0078 没有写“16”，这是核查前提本身也需要纠正。 |
| agent_definitions 无 role/kind 列 | **正确** | `schema.ts:262–268` 无这两个列；有 manifest、skills、requested/approvedCapabilities、maxConcurrency、生命周期字段。不能据此推断系统没有协调 Session，见 H2。 |
| chief/orchestrat/dispatcher/planner_agent 在两个指定文件零命中 | **正确，限指定范围** | 对 `schema.ts` 和 `contracts/src/index.ts` 分别逐词、不区分大小写检查，8 个计数均为 0。不等于全仓库不存在协调机制：`agent_coordination_sessions`、`sessionKind` 和协议 §23 已存在。 |
| agent_session_prompts.authorActorId 可承载“谁激活了这次会话” | **部分不符** | 列确实存在于 `schema.ts:346–348`；它记录作者 Actor，**没有** activation source kind/id、appointment revision、授权消费绑定。`agent/commands.ts:2843–2853` 的现有 prompt 命令仅允许 Human；`collaboration/routes.ts:1427` 的 child prompt 则记录实际调用 Actor。能归因作者，不足以证明激活来源或人类授权，见 B1/H2。 |
| automation_rule_versions.trigger 真能表达 timer | **正确** | DB L551–554 是 JSONB，本身不能证明；contracts L2091–2104 明确支持 `{type:'schedule',cron,timezone:'UTC'}`，有界五字段 cron；worker `apps/worker/src/automation.ts:490–528` 会调度 occurrence。不是任意时区/秒级计时器，也不是现成 Chief 激活器，见 H2。 |

## Blocking

### **[blocking] B1 — 双通道授权缺少可消费的绑定，作者身份不能证明执行意图**

- **位置**：0078 L185–199、L205–209、L317–319。
- **事实**：L190–192 把 Human 在房间里的指令及 prompt 作者当成分派 authority；L195–196 要拒绝“没有 Human decision 的 Chief 创建 Work Item 或 Session”。但现有 dispatch DTO `packages/contracts/src/index.ts:1216–1223` 没有该 decision/approval 绑定。实际 `apps/api/src/agent/commands.ts:823–886` 校验 coordination connection、principal、Team、能力和 Work Item revision；没有把房间文本或 prompt 作者转成已批准动作。另一条路径 `collaboration/routes.ts:1399–1432` 的 child session 只需现有父权限、计划、scope、并发与预算，L1418 使用 work:read/work:write，不要求 agent:delegate 或本次人类决策。ADR 0050 L46–49、0053 L37–39 明确消息/投影不能代替源命令授权。
- **影响**：实现者若只在 `report_to_chief` 或 MCP 包装里加检查，仍可经普通创建、child、claim、automation 等入口绕过；若将 agent 发起的命令写成 Human author，会破坏 0004 的归因。反之，严格执行 L195 会连 Chief 生成一个待审核任务都拒绝，与 L105/L206 的任务编写能力矛盾。
- **建议**：以如下条款替换双通道段落，并显式承认这是新增的 Chief 分派安全约束，删除“不触及 Work Item/Delegation/Approval、无领域不变量变化”的绝对承诺：

  > 人类消息是输入及来源证据，不直接成为执行许可。人类主动分派与总管建议分派使用同一个、可验证的结构化分派授权。授权绑定 workspace、Team、appointmentId/revision、principal、目标 Work Item/计划版本、目标 Agent、能力及 scope、预算、动作规范化摘要、有效期和允许使用次数。人类通过受治理命令确认这些字段；房间中已显式确认这些字段的操作可直接创建该授权，普通自由文本需先形成待确认的结构化提案。执行命令保留实际 Agent author，并引用真实 Human decision。
  > Chief 可以创建不启动执行的待审核 Work Item/计划；启动、领取、子会话或其他具有执行效果的动作必须在状态变更事务中验证并消费匹配的授权。能力、Delegation、scope、Stop、lease、revision 和 idempotency 校验仍全部执行。缺失、过期、摘要不符、已消费或 appointment 失效返回明确领域错误。

  定义共同 application/domain guard，逐项列出 `delegate_work_item / claim_work_item / create_child_session / retry / automation admission` 的适用规则；不能只检查“当前是否 active Chief”，应持久标记本次 chief 执行上下文，防止结束任命后旧 Session 降为普通 Agent 绕过规则。可复用 Approval 的 hash/consume 构件，但需定义 dispatch 专用 binding；不能把任意 `decisions.status=final` 或 `room_message.intent=decide` 当万能授权。

  必测：普通人类文本不执行；结构化批准仅作用于精确内容；换 target/capability/budget/revision 必须重批；两次消费只有一次生效；原 key 重放不产生第二次效果；消费与 session/event/outbox 任一点失败共同回滚；撤权、Stop、换届以及 child/automation 旁路均拒绝。

### **[blocking] B2 — Team Room 不是“只加一个枚举值”；现有数据库守卫会拒绝它**

- **位置**：0078 L50–55、L119–123、L308–311。
- **事实**：`SCHEMA.sql:13` 纳入 v1 baseline。`packages/db/migrations/v1/0001_v1_baseline.sql:599–614` 的 CHECK 只有 work_item/project/session 三个分支；`enforce_room_subject()` 把任何非 work_item/project 的值走入 session 分支，根据 agent_sessions 找 Team，找不到抛 `WORK_ROOM_SUBJECT_NOT_FOUND`。v1 后续迁移搜索未见替换该函数。API `collaboration/routes.ts:39,588–596,626–677` 也只有三类 subject；普通 Agent room 发现进一步要求 exact Session/Work Item/Project scope。`schema.ts:349–351` 无 archive 字段，本次读取的 collaboration routes 也没有 ADR 声称的通用 channel archive 命令。
- **影响**：照“三个 schema 变更”落地，Team 房间插入会先被触发器挡住。仅放宽 API 类型仍无法使用；把 Team access 当作所有消息的读取权，又会暴露 exact-session 内容。
- **建议**：将“one added subject kind”改为“Team Room subject 的完整扩展”，明确增删清单：

  1. 新迁移扩 enum；后续迁移替换 subject CHECK 和 `enforce_room_subject`，显式查同 workspace 的 Team，要求 `subjectId=teamId`，workItemId/projectId/sessionId 为空；保留既有三类约束与唯一键。
  2. contracts/OpenAPI、Subject 类型、subjectTeam、room 发现、消息写入、recipient 验证、inbox scope、event resources/audience、context message 引用一并支持 Team subject。Team 房间本身的可见性与其中 exact recipient 消息的可见性分开检查；任命不授予额外 scope。
  3. 任命事务确保 standing room 存在；保留一 Team 一 room 的既有 `(workspace,subjectKind,subjectId)` 唯一性。结束任命不删除房间或历史。删除“复用现成 archive 命令”；如确需归档，先定义生命周期、授权和迁移。
  4. 必测四类 subject 的 DB/API 成功及错 workspace/Team 拒绝，旧三类回归，普通执行 Session 不能借 Team room 读取兄弟 Session 私信，撤权后 room/inbox/event/context 全部收敛。

## High

### **[high] H1 — 增量读取尚未组成跨会话协议，“只读新增”不是现有性质**

- **位置**：0078 L43–44、L164–179、L291–296、L346–347。
- **事实**：ADR 0033 L19–21 明确 durable event cursor、opaque collection cursor、Session sequence 是不同域；L60–69 明确 retention floor、CURSOR_EXPIRED、SDK 自持 checkpoint、MCP list_events 无状态。`realtime/event-reader.ts:125–140` 读取经过实时授权的事件页，不返回 Team 状态差分。`schema.ts:312–314,399–400` 的 snapshots/deltas 无 Chief consumer checkpoint；`guidance.ts:229–244` materialize 的内容是 scope、work item、guidance/document pins。`collaboration/routes.ts:1436–1478` 的 delta 是调用方指定 source/hash 的上下文追加，不是按 domain cursor 自动计算的全 Team CDC。ADR 0037 L35–37 的 Inbox 游标更绑定 exact Session，不能跨新 Session直接续用。
- **影响**：短会话结束后谁保存 cursor、哪些状态已处理、事件与 baseline 何时一致都未定义。提前提交 checkpoint 会丢任务，晚提交会重做；只看新事件还会漏掉删除、撤权、后来新获授权的旧对象。新 LLM Session 没有旧模型上下文，即使 DB 只读增量，也不能只给它增量便假设它知道未改变的名单。“正确性已具备”掩盖了本功能最重的一段工作。
- **建议**：替换为：

  > 可复用的是有序、可重放且逐页授权的事件源，以及不可变上下文版本；跨会话 Chief 增量投影与消费 checkpoint 尚需实现。正确性要求是不丢已接受输入、不重复执行授权效果、scope 变化不泄露信息且允许重建。增量读取是带量化预算的容量验收要求，不禁止首次、游标过期、权限变化和修复时的有界全量重建。

  新增消费契约：checkpoint 键至少含 workspace/Team/appointment generation/消费者版本；server cursor 为十进制字符串，不与列表游标混用。冻结可重建 baseline 的版本及水位，定义并发写入的快照—事件衔接协议（不能随意拼两个 GET 的结果）。事件按 ID 幂等合并 changed-resource 集，并处理删除/撤权；缺少足够 payload 时按当前授权重读资源。将“已处理至 C”与该批已提交的 proposal/activation 结果原子关联；分派效果仍由 B1 独立去重。新 session 输入使用版本化、受限大小的派生摘要加增量，来源可追溯且不成为业务权威。CURSOR_EXPIRED、消费版本改变或授权扩大时重建；授权收缩先移除不可见数据。

  必测 cursor 保存前后崩溃、重放、长时间离线过期、baseline 构建期间写入、删除/撤权/新授权、跨 Session/Team 隔离；另给固定 Team/Agent/事件规模与 token、查询数、延迟预算。当前吞吐上限与“几名 Agent 就不可用”的数值性主张均**待验证**。

### **[high] H2 — 三种触发源存在，但 Chief 激活、执行身份与累计预算没有接通**

- **位置**：0078 L148–183、L205、L209。
- **事实**：现有 `prompt()` 是 Human-only（`agent/commands.ts:2843–2853`），不能直接承接 agent report/service timer。自动化 schedule 确实存在，但 `packages/db/src/stage4.ts:1326–1383` 的 rule start_session/delegate_agent 路径绑定 Work Item；ADR 0024 L13–15 的 Loop admission 则可创建无 Work Item Session并带预算/overlap，正是可复用的另一种路径。另一方面，`agent/commands.ts:826–880` 的跨 Work Item dispatch 要求 **coordination** Session、Connection/credential 及匹配 principal；普通 execution Session 即便有 agent:delegate 也不是等价入口。L884–886 还要求该 principal 等于目标 Work Item Responsible Human。schema L302–303、L328 已有这些身份构件。`requestApproval()` L2934–2944 也读取当前 Session 的 Work Item，不能未经设计就宣称 Team-only Chief 已能用所有审批路径。
- **影响**：“普通短 Session + 写一个 prompt”不足以启动总管，更不足以代表整个多负责人 Team 分派。若为了跑通而伪造 Human author、借用某管理员 principal 或在 worker 里绕过命令，会破坏 0004/0012。每次 activation 只受单 Session budget 约束也限制不了无限次自激活，总管自己的状态/消息事件可能持续触发下一轮。
- **建议**：在 ADR 增加明确 activation command 和身份/运行矩阵：

  - Human 配置并批准长期运行 policy/Delegation；appointment 只负责路由。report、event、timer 统一映射到受治理 admission，固定真实 source kind/id、initiating actor（如有）、执行 service actor、appointment revision、规则版本和 resulting sessionId，不把 timer 伪装成人类指令。
  - 明确 Chief 推理跑在外部 Runner；优先复用 0023/0024 的 occurrence、admission、budget reservation、fencing 和恢复。若选 Loop 路径，应列出它到 coordination dispatch/approval 的缺口；若选择扩展 coordination Runner，则列出相应协议修订。两者不得以“ordinary session”混写。
  - Team 内不同 Responsible Human：保持现有 principal 相等规则，按经批准的 principal 分派执行上下文，或把不匹配动作送回对应 Human。不得因“Team 总管”身份获得任意 principal 代行权。Team-only proposal/approval 绑定何种资源需先明确。
  - 对 source event/message/occurrence 去重，排除总管自身噪声，合并唤醒并限制激活速率、队列积压、每 Team/时间窗总预算；明确定时补偿和 DLQ。Stop 当前 Session 后不得由同一输入重建 Session 绕过 Stop；提供 Human 暂停/结束 appointment 的全局开关，启动前再次验证。
  - 必测同源重复、两个消费者竞争、Admission/Session/prompt/event/outbox 各边界崩溃、无 runner、主负责人不匹配、旧任命/被撤权/Stop、事件自环和累计预算耗尽。

### **[high] H3 — “逐次 Human 决策”与 ADR 0062 的 YOLO 策略批准冲突**

- **位置**：0078 L7–13、L190–199、L208、L317。
- **事实**：ADR 0062 L13–25 允许任意风险级别由 policy-authored decision 满足 Approval，明确不能伪装成人类逐次批准。`agent/commands.ts:2947–2956` 在 yolo 下写入 `approval_decisions.source='workspace_policy'`，actor_id 来自策略更新者。仅检查存在 decision、actor 是 human，或者只看最终 approved，都会把策略来源误读为本次人类确认。
- **影响**：0078 同时说“不重决 0062”和“无人类决策绝不运行”，实现无法同时遵守。升级部署中已开 YOLO 的 workspace 最容易出现这种静默放行。
- **建议**：必须选择并写明政策。推荐保持本文的人类逐次确认目标：

  > Chief dispatch authorization 是 ADR 0062 的显式例外；只能由 source=human 的本次结构化决定满足。requestApproval 即时自动批准与既有 pending-approval reconciliation 均不得自动批准此动作类型。workspace_policy 记录保持原来源，不改写成 Human。其他动作保留 0062 原语义。

  若产品希望尊重 YOLO，则把全文改成“匹配的 Human 或 policy 决策”，承认不保证逐次 Human 介入，UI 展示真实来源。两种方案二选一；不可留给实现者猜。必测已启用 YOLO、后启用 YOLO 的 reconciliation、project exclusion、过期批准及来源混淆。

### **[high] H4 — 拒绝 Inbox 的理由忽略 receipts，短会话反而撞上不可转移 claim**

- **位置**：0078 L66–72、L139–143、L164–169、L264–266。
- **事实**：`schema.ts:26,500,502` 已有 claimed/read/acknowledged/replied receipts 和 claimedBySessionId；ADR 0037 L24–49 定义 Inbox 是统一 actionable projection，ACK 不等于 resolve，reply 与 room message/recipients/resolution/event/outbox 同事务。L99–102 明确 claim 不可转移，winning Session 被 Stop/revoke 后条目被搁置，无 reclaim。回执只能代表实际收件 Session 的动作，sender 的 POST 不能代收件人声明 ACK。
- **影响**：以两态 status 为由另做 Room queue 会重新发明 claim、重试、ack 和消费进度；每次激活新 Session 又可能永远读不到上一轮已 claim 的未完成条目。“report 返回 Chief 的 acknowledgement”若同步等待模型，会使可靠投递依赖模型时延；若发信即 ACK，则审计造假。
- **建议**：删除 L66–72 和替代方案中“状态不够”的理由，替换为：

  > Work Room 承载不可变通信事实，Inbox 承载面向收件人的 actionable projection 与回执；两者配套复用。已投递、已 claim、已 ACK、已回复分别来自已提交事实。report 只保证消息提交，返回 message/inbox/activation 引用及当时已知的响应状态；不会代 Chief 写 ACK，也不等待模型完成。

  v1 必须选定未完成条目跨短 Session 的恢复：复用同一非终态 Session 处理至终态；或**显式修订 0037**，引入有审计的 successor/re-delivery，把旧 claim 保留在原 Session 并新建相联输入，禁止原地改 claimedBySessionId。若决定 Room-only，则必须承认新消费协议和持久事实的成本，不能继续说“不需要第二个队列”。

  必测 claim 后崩溃/Stop、同 actor 双 Session、错误 recipient、ACK 后尚未回复、重复 report/reply 与回执不伪造。

### **[high] H5 — 换届、未任命、跨 Team 的报告路由缺少原子规则**

- **位置**：0078 L87–96、L133–146。
- **事实**：appointment 草图只有 Agent、Team、status/revision；report 描述未说明输入是否绑定 appointment id/revision、与换届如何串行化、重试时是否改投新 Chief。仅凭 active partial unique index保证的是同一时刻至多一个 active **身份**，不会停止旧 Session、迁移旧 actor 的收件项，也不会使 get_chief 与稍后的 post 原子化。ADR 0037 的旧 actor/exact-session recipient 不能任意重写。
- **影响**：A 读出旧总管，Human 换届，A 发信时可能静默送错人；同一 idempotency key 的重放可能重复发给新人。结束 appointment 若不约束已在运行的 Chief session，还可能出现两代总管同时提出或执行调度。
- **建议**：冻结下面的最小契约（错误码为建议的新契约，非声称已实现）：

  | 情况 | get_chief | report_to_chief |
  | --- | --- | --- |
  | 已授权 Team 无 active Chief | 纯 Query，明确返回 `chief:null`；不创建 room/appointment | `CHIEF_NOT_APPOINTED`，不发消息、不静默升级到 workspace Chief；由调用方提示 Human |
  | 请求不在调用者已授权 Team | 不泄露目标存在性，统一 NOT_FOUND | 同样 NOT_FOUND，不转发；首版只服务当前明确 Team，不含跨 Team 路由 |
  | appointment 已变化 | 返回当前 appointmentId/revision 与 roomId | 请求带预期 appointmentId/revision；在事务内锁定并重验；陈旧返回 `CHIEF_APPOINTMENT_CHANGED`，重取后以新操作意图重发，不静默改收件人 |
  | 首次已提交后重放同 key | 不适用 | 在当前授权允许重放的前提下返回原 message/recipient，不向新 Chief 再发；异体按现有幂等冲突语义拒绝 |

  appointment 增加稳定 id、workspace/Team/Agent/Human 的一致性约束、事件与 outbox；任命/结束/替换用 revision 和幂等命令。替换事务结束旧任命并建立新代次。旧运行保留审计归因，但失去新增调度效果的资格；是否完成纯只读总结另定。旧未完成报告保持原收件事实，经显式 successor/re-delivery 交接。声明“可发现 room”不等于可读房内所有内容。

  将 L145 的“两者都是 commands”改为 get_chief 是无副作用 Query；仅 report 是 mutation。必测 get/post 间换届、同时双任命、重放跨换届、旧 Chief 停用、跨 Team 猜 ID及事务回滚。

### **[high] H6 — 记忆威胁成立，但跨 Team 可见性和“引用需审批”的执行机制缺失**

- **位置**：0078 L222–250、L295–296、L314–315、L335–339。
- **事实**：append-only 保护审计不可改，不证明文本可信；脱敏保护秘密，不识别攻击指令。`agentTeamAccess`（schema L269–271）允许同 Agent 多 Team，而新 memory 只按 `(workspaceId,agentId)` 限定。L241–245 依赖“来自外部内容/是否引用”的分类，却没有来源记录和判定机制。系统也并非第一次有未来输入面：`guidance.ts:229–243` 已将文档/指导版本 pin 进后续 Session；`apps/agent-runner/src/run-session.ts:113–120` 会把前文再次送入模型，并明确标记 untrusted。故“其他地方没有这种注入面”过强。
- **影响**：Team A 的私有信息可经同一个 Agent 的记忆进入 Team B或撤权后的新会话；让模型把恶意指令改写一遍便不再算 quote，能绕开字面规则。反过来所有学习都来自输入，若一律要 Human确认，自动记忆近乎不可用。另设一张表并不能解决这些问题。
- **建议**：保留“长期记忆是新的自动检索/注入路径，需要专项治理”，删去独有威胁和只对字面引用判断的承诺。采用如下可实施边界：

  > memory 是带 provenance 的非权威数据，不是 standing instruction。每条记录绑定写入 Session、workspace、Team及必要的 Project/资源范围、source references/hash、信任分类和 supersedes/retraction 事实。加载时按新 Session 的当前权限重新过滤全部来源；来源已失权或无法证明可见则不加载。Agent 只能提议自己的记忆，不能自行把任意文本提升为可信 guidance。

  允许自动保存有限的结构化业务事实与可追溯引用；这些仍作为 untrusted evidence，不能授予权限。要持久改变行为指令、信任级别或扩大可见范围，才走 Human 批准和 guidance 发布。任意自然语言的可信提升在 v1 默认关闭，不能依靠模型自报“不是引用”。明确 prompt 中指令与证据的分区、读取 token/条数限额、到期/撤回、纠错和审计保留；append-only + 总数量上限也必须有到顶行为，不能写满后永久失效。长期 memory 可从 Chief MVP 中延后，先用现有不可变上下文/受限派生摘要证明协调价值。

  必测恶意 repo/webhook 指令跨轮转述、同 Agent 跨 Team、来源撤权、guidance 与 memory 冲突、敏感信息与配额耗尽。对既有 activity 进入所有 prompt 路径是否已完全隔离，本次未穷尽，标为**待验证**；不能据此宣称已有实际漏洞，但其 append-only/脱敏不足以单独覆盖新威胁。

## Medium

### **[medium] M1 — 能力表漏两项，且“结构性禁止”与允许显式授予互相矛盾**

- **位置**：0078 L76–78、L98–117、L125–131、L198–220。
- **事实**：17 项枚举只覆盖 15 项，详见 schema 核查。实际 Room `review_result` 写入在 `collaboration/routes.ts:231–255` 要求 artifact:write，其他 room 消息用 work:write；不能仅凭工具名称推断 message:write 足够。L108 允许 Admin 显式授予排除项，L77 却称 structurally denied，L106 又说 never touches。agent:delegate 的获授不自动授予所有工具；work:write 本身可进入 child session 路径。
- **影响**：同样按 ADR 实现的两个客户端会对证据发布、仓库读取、review_result 得出不同结论。“总管绝无外部效果”也不是默认能力表能证明的性质；有外部能力的被委派执行者仍可能产生效果，必须由 B1 的调度授权约束。
- **建议**：明确完整、互斥、穷尽的 17 项分类，并增加根据 capabilitySchema 校验分组的验收。建议：

  | 分类 | 能力 |
  | --- | --- |
  | 默认协调能力，仍受逐请求实时授权 | work:read、work:write、comment:write、message:write、agent:delegate、plan:write |
  | 默认排除，允许按目的单独审批 | repo:read、artifact:write、repo:write_branch、repo:open_pr、repo:merge、ci:run、deploy:staging、deploy:production、secrets:use、automation:manage、admin:* |

  默认排除 artifact:write 时，明确 Chief 仅引用他人 review_result，不能发布该 intent 或 Artifact；若产品需要 Chief 发布审查结果/证据，则显式批准 artifact:write 及对应 role/scope，或调整默认组并解释代价。repo:read 是否必要取决于总管是否直接看源码，不能因为它是只读就自动授权。

  `ci:run` 默认排除合理：启动计算、消耗配额，流水线可能有外部写入；它不是“查看 CI 结果”。`automation:manage` 默认排除也合理：总管可由 Human 预配的 rule 唤醒，不需要管理规则，更不应自行扩大触发频率/动作。将轴名改成“协调默认集 / 须另批的访问或效果”，不把所有排除项一概称不可逆。将 structurally denied/never 改为“默认不授予；显式例外有审计”，或真正采用硬上限并删除显式例外，二选一。

### **[medium] M2 — 一个入口不等于串行判断；singleton 也没有提供执行互斥**

- **位置**：0078 L76、L91–92、L297–301。
- **事实**：appointment partial unique index只限制 active Agent 数；`agent_definitions.maxConcurrency`（schema L266）及多 Session 模型仍允许该 Agent 并发运行。0078 没有锁/overlap/budget admission 协议，却直接声称 removes parallel dispatch。ADR 0024 L13–15 已把 no_overlap 定义成独立运行策略。
- **影响**：若把 singleton 理解成全 Team 推理锁，慢模型/长任务会挡住所有报告；若只加索引却认为已经串行，两轮判断会基于同一旧状态重复分派。两种实现都符合当前模糊文字。
- **建议**：替换为：

  > 每 Team 一个可发现入口与当前协调责任人；这不要求全 Team 推理串行。允许按 Work Item/Project/事件批次并行读取与生成提案，仅在同一资源/分派意图提交时用 revision、授权消费与幂等键去重。跨资源矛盾通过提案 revision 和依赖校验显式拒绝重算。

  若 v1 暂用 no_overlap，写明有限范围、短轮次、合并激活、最大排队时延、超时接管和 Human 直接分派的退路，作为可测容量取舍，不能声称唯一性自动带来一致性。按 Team 切分本来已在设计中，只缓解跨 Team 压力；不应要求用户拆业务 Team 才能扩容。并行判断 + 资源级提交去重是优先替代。没有负载证据，不断言目前必然发生瓶颈。

### **[medium] M3 — 缺少与 client profile/Pi 工具及部署档位的完整交付约束**

- **位置**：0078 L133–146、L150–183、L330–347；同批计划 D4/D5。
- **事实**：ADR 0042 L16–22 已规定 exact Session 的 derived capability manifest，由 route-policy/feature/MCP bindings 生成；ADR 0067 L13–19 已规定 Pi tools 只展示支持且 eligible 的操作，服务端逐次授权，写入有稳定操作身份及脱敏审计。`apps/mcp/src/index.ts:307` 已有 request_approval；`apps/agent-runner/src/workmesh-tools.ts:268` 已映射它，所以“请求 Human 授权”的第三个新工具不必重建。但新 MCP 工具不会自动变成 Pi 自定义工具。ADR 0071 L62–72 把 Runner 放在外部；0072 L81–88 明确 DB fallback/worker 存在 polling。0078 的“no poll loop”只能理解成没有专属模型常驻轮询。0077 L128–136 已把 conversation 称 Chief surface，但同批计划的 D 链是表现层工作，不含本报告列出的 Chief 后端契约。
- **影响**：只交两个 MCP 工具，Pi Chief 可能根本发现不了/调用不了；把配置就绪误当执行就绪会与 0074 冲突。布局先上线若暗示可用总管，会让 Proposed 能力提前成为产品承诺。
- **建议**：在 Spec changes 加入完整交付矩阵：REST → contracts/SDK → route-policy/feature registry → MCP bindings → derived manifest → Pi tool adapter → conformance；get_chief 为 Query，report 为 Command，两条路都要测 unsupported/feature disabled、撤权、Stop、重试、payload 上限。复用 request_approval + 0050/0053 Human Attention，补 B1/H3 的动作绑定和来源限制，不增一个同义 generic respond 工具。

  Lite 中 Chief 推理必须由外部 Runner 执行；控制面只做 admission/投递。写成“无专属常驻模型进程，复用现有受限调度/补偿轮询”。No-Redis 档位只能列兼容性待验收，不能假定 0072 已实现。D4 在没有 appointment/runner 或功能关闭时展示普通对话/明确不可用状态；布局不以 Chief 已可运行作前提。上述 profile 和 Pi 形状是应直接复用的基础设施，并不已经包含 Chief designation、增量 checkpoint、记忆和分派授权。

## Low

### **[low] L1 — 迁移原则正确，但需要写出 enum 的事务边界和滚动发布顺序**

- **位置**：0078 L306–324。
- **事实**：ADR 0038 L17–22、L39–41 要求保留已应用 SQL、追加 checksummed v1 migration。`packages/db/src/migrations.ts:73–95,202–218,335–341` 验 checksum，每个新 v1 entry 独立事务执行 SQL并登记。仓库 Compose 使用 PostgreSQL 16（`docker-compose.yml:3`）。PostgreSQL 允许事务中 ADD VALUE，但新值必须等该事务提交后才能使用，见 [PostgreSQL 16 ALTER TYPE 官方文档](https://www.postgresql.org/docs/16/sql-altertype.html)。
- **影响**：改变当前数据库 enum **不会**导致旧 migration checksum 冲突；修改旧 SQL 文件才会。真正的失败是把 B2 新 CHECK/约束使用 `'team'::room_subject_kind` 和 ADD VALUE 放在同一迁移事务，或为此手写 COMMIT 绕开 runner。旧应用也可能不识别新 enum。
- **建议**：Migration 段加入：

  ```sql
  -- 新的 v1/NNNN_* entry；由 runner 管理事务，文件内不写 BEGIN/COMMIT。
  ALTER TYPE room_subject_kind ADD VALUE 'team';
  -- 本 entry 不使用该新 enum 值；提交并登记后才执行下一 entry。
  ```

  后一个新 entry 再更新 B2 的 CHECK/trigger、创建 appointments/memory 及实际所需的持久绑定；具体总数量由 H1/H2/B1 契约决定，不预先承诺只有三处。更新 v1 manifest 中**新增项**和 `SCHEMA.sql` 入口，已应用 baseline/legacy/其 checksum 原样保留；不为了加 enum 重生成已发布 baseline。先部署能读新类型且功能关闭的版本，迁移完成并确认所有消费者支持后才允许写 Team room。回滚应用时保留新增 enum/历史数据并关闭功能，不尝试删除 enum label。

  应测上一版本升级、空库 baseline 后续升级、每 entry 提交前后故障与重跑、旧 checksum 不变和旧 subject 行不变。本次未执行数据库迁移，运行结果**未观察**。这不是与 0038 的既成冲突，而是可直接补齐的实施说明；B2 的缺失守卫另按 blocking 处理。

## Nit

### **[nit] N1 — 两处措辞会把已知事实说反或说漏**

- **位置**：0078 L82–85、L286–289。
- **事实**：L83 的 “The Chief adds a kind” 与本节标题和实际设计相反；L288–289 的“三项 additions”列出 subject、appointment、tools，遗漏后文明确新增的 memory 表。
- **影响**：读者无法区分反事实比较和本次决定；成本摘要与 Migration 不一致。
- **建议**：改成 “Adding Chief as a new actor kind would require separate grants, visibility rules and audit semantics; this ADR instead designates an existing Agent.” 成本摘要统一为实际选定的 schema、授权/激活/消费协议和适配工作，不再以“三个小缺口”代替完整清单。

## 与指定既有 ADR 的逐条结论

| ADR | 核对结论 | 直接修订点 |
| --- | --- | --- |
| 0004 actor model | designation 而非第四 actor kind **一致**；prompt 作者当权限、worker 伪装 Human 则不一致 | B1/H2 保留真实 author、principal 与 source 的不同字段；非仓库工作仍合法 |
| 0013 lease 不授权 | 原则引用 **正确**；“lease+routing records 重分派”不足以描述领域动作 | 明确先授权再租约，force-release 仍 Human+reason；不能借租约更换 Responsible Human |
| 0014 handoff 事务 | 未发现必须冲突，但 L209 的 reroute 留了旁路空间 | 替换为调用既有 offer/accept 流程；不得在接受 exact-agent handoff 时改变目标；target delegation/session/lease/event/outbox 按原事务生成。0078 不授予 Chief accept 权限（0067 仍 Human-only） |
| 0037 inbox | 用 status 两态否定 Inbox 的理由 **不成立**；短 Session 与不可转移 claim 有真实张力 | H4/H5 明确 successor/recovery，不能静默重写收件人或 claim |
| 0050 Human Attention | 同一源事实派生投影可复用，**不需要新 attention queue** | B1 使 proposal 对应正式 Decision/Approval；纯 propose 消息不自动变审批 |
| 0053 governed responses | 现有 Human reply/Approval/Decision 源命令应复用 | 自由文本回复、message resolve 不等于批准；结构化 dispatch 的 hash/revision 必须绑定 |
| 0062 autonomy/lifecycle | “总要本次 Human 决定”与 YOLO 需显式决策；archive/revoke 还须覆盖 appointment | H3 的来源政策；Agent失活/归档/Team grant 撤销后任命不可再解析为可运行 Chief，取消未来 admission，审计旧历史 |
| 0071 Lite | 外部 Runner 执行可兼容；无 resident Chief 不等于零运行依赖 | H2/M3 明确外部 Runner、队列等待与累计预算；不声称本次验证了 Lite 足迹 |
| 0072 无 Redis/对象存储 | durable Postgres 方向一致，但不能假定 Proposed 档位已可用，也不能禁止其 fallback polling | M3 声明支持矩阵与兼容验收；无 Redis 不改变 cursor 正确性契约 |
| 0042 client profile | 已有发现/能力清单形状，**应复用** | M3；manifest 描述 eligibility，不是 appointment 授权 |
| 0067 governed Pi tools | 已有审批、租约、handoff offer、计划、审计等基础，**应复用** | M3；新工具补 Pi adapter，不能开放 Human-only 接口或借 Human cookie |

## 必须修（按顺序）

1. **冻结分派授权与 0062 的关系（B1/H3）**：定义 Human-directed 的具体证据、授权消费事务、所有执行入口的共同 guard；区分创建提案与启动工作。
2. **冻结 Session/principal/激活模型（H2）**：选已有 coordination/Loop 构件的具体组合，写明跨负责人行为、来源去重、累计预算、Stop 和换届下的取消；不允许直接写表冒充集成。
3. **修 Team Room 的完整 DB 与授权扩展（B2/L1）**：enum、CHECK、trigger、read/recipient/event/context 路径与两阶段事务迁移。
4. **冻结消费与恢复协议（H4/H5/H1）**：先确定 Inbox claim 的跨 Session 处理，再定义 appointment 路由、ack、checkpoint、baseline/增量与重建；同时明确并发判断和提交去重（M2）。
5. **补全能力与记忆边界（M1/H6）**：17 项全部归组；若暂不能给出来源权限与加载规则，将 memory 从 v1 移出，不阻塞基础协调验证。
6. **收齐交付及验收契约（M3）**：OpenAPI/contracts、SDK、profile、MCP、Pi、Human Attention 和同批 UI 的有/无 Chief 状态；把每个高风险分支落成确定的失败码、事务边界和测试用例。全部是建议后续执行，本文未实现或运行它们。

## 设计最强的一条

**把 Chief 定义为普通 Agent 的可撤销任命，而不是第四 actor kind或图数据库。** actor、delegation、Team access、handoff、lease 已经表达身份、授权与协作关系；既有 rooms、Inbox 和 Human Attention 能承载通信及治理。任命只提供可发现的协调责任，不扩权，这个决定能把 feature 留在现有审计与 Stop 模型内，是值得保留的核心。

## 设计最脆的一条

**把“构件存在”直接升级成“组合性质已经成立”。** 最明显的是“短 Session + snapshot/delta/cursor = 跨会话只取新增”，同样的问题出现在 prompt author = dispatch authority、timer trigger = Chief activation、enum 扩展 = Team Room 可用。表和事件确实存在，但缺的连接恰好负责权限、原子性和崩溃恢复；这些不是接线细节，不能用“只有三个 schema 变化”概括成本。

## 明确没有问题的部分

- 上述 room intent/字段、双层 recipient、Inbox actor recipient/claim、guidance revision/audit、agent definition 无 role/kind、指定关键词零命中，均有真实源码证据；没有构件凭空捏造的普遍问题。
- schedule trigger 是真实实现，不只是任意 JSON 的可能性；限制为有界五字段 UTC cron即可。
- 不新增 actor kind、不建图数据库、不建另一套消息库、任命不授予 capability、租约不授权、Human 保留最终责任，这些原则成立。
- Human-only guidance 与记忆分离合理；append-only 和脱敏值得保留，只是不能作为唯一注入防护。
- ci:run、automation:manage 及 repo 写/merge/deploy/secrets/admin 默认排除有合理依据；发现的是漏项和保证措辞不一致，不是主张将这些能力全开放。
- 无需新增一个“请求人类批准”的同义工具：request_approval 已在 MCP/SDK/Pi 中存在。需要的是精确动作绑定及 Team-only Session适配。
- 新增 enum 值与 checksummed migration **并不冲突**；保留旧文件、追加新 entry并遵守提交边界即可。
- 一个 Team 的单一可发现入口是合理产品选择；本次没有吞吐实测，不以猜测认定 singleton 已造成生产性能故障。
- 没有观察到 0078 已被实现，因此本报告描述的是设计不可落地或易误实现的缺口，不把它们冒称为现有线上漏洞。

**一句话总评：保留“任命普通 Agent、复用治理构件”的主轴，但必须把授权、激活、消费恢复和 Team Room 扩展写成可检验协议后再实施；当前的“基本都有了”低估了核心工作。**
