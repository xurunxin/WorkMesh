## M2：现有规划、文档与协作闭环

**范围**：补Issue评论读取、文档history/diff/restore/export与Guidance只读、里程碑/层级/relation、允许的Decision提案/读取、Room/Inbox和Handoff读取/合法转换、规划完整分页；明确承接已有 `createChildAgentSession` 与 `createReviewDelegation` 的创建、启动、证据与父子完成链。C普通创建/管理与E精确委派允许子集分别验证；Runner缺parent/milestone等参数不能写成已覆盖。复用现有对象与命令，不改Human-only finalize/accept/Guidance publish。

现行评论写虽在policy声明含Agent，handler明确Human-only；M2不把Agent评论写纳入既有权限补齐，M0修正披露，另裁定后才改领域/ADR。

**文件**：SDK typed查询与MCP/Runner适配、contracts共用schema、`apps/api/src/documents.ts/guidance.ts/collaboration/routes.ts/inbox/routes.ts`、`apps/api/src/agent/commands.ts:2880–2900`与Runner `workmesh-tools.ts/run-session.ts`、domain/DB现有不变量核对；不新增Team room、archive模型或F5跨Session继承。导入组合按现有逐实体key恢复，不宣称全导入事务原子。

**子 Session／reviewer 承接决定**：这是ADR0017现有功能，不依赖F2新自主委派。M2补Runner父Session作用域的两种创建工具，复用现有SDK与MCP合同，模型不可指定别的父身份、取得子秘密或扩大能力；子执行交由 `provisionNewSessionDelivery` 的已有准确installation authority／受控adapter，不以返回queued对象当启动成功。目标Agent须已授权且有可用交付身份；名单仍按既有H输入/受控清单限制。普通child目前只授work:read/work:write，不能臆称继承父的全部能力；通用child选择role=reviewer也不能替代专用review delegation的artifact权限与review_shared Lease。

专用reviewer的三方能力交集为父Delegation、目标definition、目标Team grant共同允许work:read/work:write/artifact:write；work:write仅维持ACK/state/heartbeat等窄协议写，仍无plan:write。Runner按角色和live manifest提供Room review_result、code_review发布、读取及完成工具，过滤publish_plan并避免任何自动Plan发布；普通child同样按实际能力执行，不因executor角色默认获得plan:write/artifact:write。M1提供其生命周期与completion/Stop路径，M3提供PR provenance/structured review工具。Room消息使用准确reviewer Session与本人actor，不拿父Session代发；普通Activity不替代Room消息。

**父读子状态的入口缺口**：现行 `agent/routes.ts:144–197` 的Agent Session列表只选自身，get还拒绝非自身Session，不能把M1通用Session get/list当父读子的既有入口。M2推荐增加最小父子状态只读投影，先安全合同/ADR审查：请求者须为仍有效的准确父E，重新验证父Delegation、principal、Team grant、parent_session_id及子创建绑定，只返回child ID、required、state/revision、稳定Plan绑定和允许的结果引用，不返回子token、prompt或扩大普通getSession权限；子终态可确认，父终态/撤权拒绝。路径/operationId/DTO在实施冻结时确定，本卡不冒已有端点。MCP及Runner补同一有界查询；不同父/Team、伪造child ID、父撤权与终态负例必须覆盖。若不采用该最小读合同，只能由具备资格的H／受控身份沿M1确认并如实记父自主查询缺口，不能声明纯工具适配已完成。

**数量、预算与并发的实际差异**：`collaboration/routes.ts:1399–1433`普通child校验父/step活跃数量、缩减继承预算、累计reservation及目标Agent并发；`:1482–1517`review路径校验稳定Plan、三方能力及目标并发，继承父budget并建review_shared Lease，但没有同等父/step限额和reservation写入。M2必须按ADR0017核齐review路径的限额/预算保障及原消费者影响，必要后端修复归本批既有不变量补齐，不标为已通过或F提案；没有这项证据不得声明有界reviewer闭环完成。不擅自新增ReviewDelegationInput的budget参数；若实现需要合同变化，先更新OpenAPI/Zod并提交精确差异审查。

**真实父子调用链（无Git也适用）**：父E沿M1进入planning、发布包含稳定step ID和maxChildSessions的整Plan→读取当前planVersionId/step→`create_child_session`（required/budget）或`create_review_delegation`（reviewerAgentId/ttlSeconds）→读回queued child、精确绑定（review另含review_shared lease）→受控交付→子E能力握手→ACK→合法planning/executing；reviewer不发布实施Plan→读取授权材料→本人 `post_work_room_message(intent=review_result,sessionId=child.id)`→本人 `publish_artifact(type=code_review,sessionId=child.id)`（有Git时采用M3的publish_delivery_artifact）→重新读revision并complete reviewer→父通过本批最小父子状态投影确认required child已completed→父complete。普通executor child按实际能力提供现行完成证据/明确no-artifact说明，不要求其发表review_result。终态丢响应沿M1准确结果确认，不默认父/子终态Bearer可读。

父完成在required child为queued/active/failed/canceled/stale时均返回 `COMPLETION_PLAN_INCOMPLETE` 与 `blockerSessionIds`；不能把终态失败当成功或改required绕过。reviewer缺本人Room消息或本人code_review任一项返回 `REVIEW_COMPLETION_EVIDENCE_REQUIRED`；structured review和noArtifactReason都不豁免。绑定旧Plan/version、非稳定step时先读取当前Plan并报告，不能自动换step重派。

**真实客户端链**：C读Team/workflow→新Project/Issue/里程碑/blocks→普通Document写方案并读回版本hash→E读授权Issue与Guidance→精确Session Inbox claim/read→reply/ACK→提Handoff→H接受后目标E继续→读取Human评论和版本差异→各Session完成并留证据。目标peer Agent ID需经已授权清单或H输入，当前Human-only名单查询不是C已实现自主发现。

**测试落点**：已有planning/document/Inbox/Handoff集成、`apps/api/integration/stage2-collaboration.integration.test.ts`及 `agent-lock-order.integration.test.ts`、MCP/Runner测试，`packages/conformance/src/planning-collaboration.conformance.test.ts` 待创建；分页构造超过一页并验证late授权变化，不能仅首页通过。以下子Session／reviewer用例全部是未来验收，未在本轮运行。

| 验收类 | 具体场景及判定 |
| --- | --- |
| 正常 | 多页Milestone/Issue/Document/history/Room相关事实可读；restore生成新revision；blocks/related精确；claim→reply与ACK语义分别成立；Handoff正确目标接续 |
| 越权/撤权 | 跨Team/Project父关系和文档拒绝；他作者评论编辑拒绝；Inbox未claim只有metadata、别Session不读正文；H-only接受/Guidance发布拒绝；分页中撤权不泄露后页 |
| 非法状态 | hierarchy/relation循环、删除被引用Milestone、archived文档更新、Handoff错阶段拒绝；当前Inbox短Session失效不自动继承 |
| 幂等 | Human评论回归及Agent文档/关系/消息/claim/reply同key只一事实；异体冲突；导入同hash断点继续原mapping，过期后先对账 |
| 旧revision | Document baseRevisionId/hash/revision同时校验；relation/handoff/reply旧版本拒绝；不覆盖更新Plan/文档 |
| 事务失败 | Human评论消费者回归及Agent文档、claim/reply、关系与Handoff转换注入回滚，state/event/outbox一致；逐实体import部分完成明确报告、能继续，不能报整项目原子完成 |
| 重放 | Room/Inbox投影重放不产生双回执/重复消息；source完成沿现行命令。F5 successor/redelivery尚未实现，不拿旧receipt重放当该特性验收 |
| 并发 | 两claimant竞争、两文档编辑、同时插循环边/父关系、reply与Human resolve竞态；按当前域边界精确断言，不静默抢占 |
| 重启/恢复/Stop | 恢复旧Document/Inbox/导入mapping后继续允许读；失效/停止Session不回复或变换Handoff；durable cursor resync不重发业务写；跨新Session恢复需F5另验 |

子Session／reviewer另外逐类验收：

| 验收类 | 具体场景及判定 |
| --- | --- |
| 正常 | 两种创建命令准确绑定父当前Plan/version/stable step、预算、required及目标身份；受控交付ACK成功；review_shared与允许读取；本人Room结果+code_review齐备才能完成，随后父完成成功 |
| 越权/撤权 | 三方能力任一缺失或撤销、installation authority不可用拒绝；跨父/Team/step拒绝；reviewer publishPlan和非code_review Artifact拒绝，其他actor/Session代发review_result不计本人证据；不能自审PR producer |
| 非法状态 | 旧Plan、无stable identity、错误step、exclusive Lease冲突拒绝；缺消息/缺Artifact/仅structured review分别拒reviewer完成；required child每种未completed状态阻父并给准确IDs；非required子不是该gate阻断条件，不能因调用失败改required |
| 幂等 | 两种创建同key同body只有一个child/delegation、reservation/lease/交付事件；异体冲突；Room消息/Artifact/完成同key不双写，终态拒绝按M1确认原结果。SDK默认step派生key仍需区分同step多次合法意图，正文/角色/version变化不得沿旧key |
| 版本 | 当前Plan/version/step整体验证，版本更新后旧输入拒绝；创建REST无If-Match合同，不伪增该header要求；完成用当前revision，旧revision拒绝 |
| 事务失败 | 创建、budget reservation、review_shared Lease、交付/outbox任一点失败全回滚；证据/父完成失败不推进state，state/event/outbox一致；不提前派发子执行 |
| job/重放 | 重复provisioning outbox不生成第二子Session/执行授权；证据重放不放大，原父/step归属不变；不会自动把failed required child替换为已完成 |
| 并发 | 两创建竞争父/step限额、累计预算与目标maxConcurrency，无越界；review与普通child竞争也覆盖；review_shared/exclusive冲突、Plan发布与创建、父complete与child完成按事务提交顺序裁定 |
| 重启/恢复/Stop | 重启后绑定、预算reservation、Lease及required blocker事实不丢；停止/撤权后普通创建和证据写拒绝，子清理沿M1；父Stop后子是否继续依当前状态/授权重新检查，不假定自动级联；无新增机器shell，进程清理用例不适用 |

**任务DoD**：既有规划与协作、子Session与reviewer完整链不依赖Web点击执行Agent允许步骤；父完成gate、reviewer双证据、稳定Plan与限额/预算/并发及Runner角色适配有实证。H保留动作与现有缺peer发现/跨Session前提明确，不能因同名字tool存在隐藏限制。
