# 推荐实施批次、完整任务范围与验收场景

以下是方案，不是新增todo或实施放行。任务采用M0–M5稳定引用；裁定后由Chief按范围派发，不在本轮创建整套流水线。旧#5/#9/#16继续原todo。所有未来测试都为**未运行**，下列不存在的测试文件明确为待创建；已有文件是拟扩展目标，不声称相关用例已存在。

## 顺序、依赖与交付标准

M0 → M1 → M2 → M3 → M5是建议的现有核心闭环顺序。M4是按部署启用能力选择的后续完整任务，依赖M0及其所用核心恢复工具；不强行阻塞M3或Stable验收。#5接入安全收尾、#9仓库后端切片、#16通知后端切片在原卡推进，不是M0–M2全部开工条件；M5若把它们纳入发行物或通知场景，就必须消费已验收精确源及原门禁。

F0–F6依赖与范围授权沿原R1，不由MCP覆盖任务暗含。M2当前Inbox跨Session限制是有意边界；需要审计successor/redelivery才依赖F5；需要任命/Team room/Chief激活/checkpoint及 `get_chief/report_to_chief`才选择F链。TA机器、代码运行、外部CLI、技能库、记忆、出站MCP、秘密投递、日历、shell也不因M5自动启用。

每个任务的DoD共有：合同/API/SDK/policy/feature/MCP/manifest/Runner一致，角色不可越界；负例与恢复用例实证；保存精确受测SHA、来源/消费者差异、实际命令/退出/数量/skip/首败和可脱敏追溯材料；适用必需检查、独审和最新PR Required CI通过。产品新候选不得复用旧head通过。无迁移时明确零迁移；若新增持久化事实则新增编号迁移、SCHEMA及空库/上一阶段升级检查；领域写仍state/event/outbox同事务。

## M0：工具发现、资格披露与操作恢复契约

**问题与结果**：现有manifest支持度、工具注册、领域角色规则及Runner子集不完全一致。目标是新连接能理解“能发现什么、谁能做、还差什么、怎样恢复”，不用先在网页试错或给Agent注入Human cookie。

**范围**：审计全部operation-index并为每条记录“Agent可适配 / Human保留 / adapter内部 / 部署可选 / 领域差异待核”；校正Human-only已注册工具、E Session下Team协调CRUD广告、provider kind能力表达、resource型读取与tool型读取、只读模式和Coordination模式。保留旧tool/resource名字的可审兼容策略，不能无公告删schema导致旧客户端损坏；推荐Human-only工具不在Agent可调用清单出现，同时为已有客户端返回明确角色拒绝。复合import列组成命令；保持错误结构、pagination和稳定key/body规则，changed body与逻辑新调用的操作身份区别明确。

**具体文件与合同**：`packages/contracts/src/route-policy.ts`、`index.ts` manifest/errorReactions、`apps/api/src/client-profile.ts`、`apps/mcp/src/{index.ts,http.ts,coordination-product.ts}`、`packages/agent-sdk/src/index.ts`、`apps/agent-runner/src/workmesh-tools.ts`、OpenAPI/Agent Protocol/client guide。不默认改变领域批准或授予E协调角色；只读披露如需增加字段先走合同评审。改变协议发现语义的部分按ADR0012/0042/0067补决策，不把本方案标Accepted。

**真实客户端链**：管理员既有预授权→客户端安全配对（若包含#5则须其原门禁）→MCP initialize→tools/list/resources/list→verify/context/manifest→使用准确Team/Project/Session ID→故意调用一项无资格动作→读取可理解的错误并继续允许的读操作。Pi在自己的E Session启动，核模型实际收到的tools，而非只看REST manifest。

**测试落点**：扩展 `apps/mcp/src/index.test.ts/http.test.ts`、`packages/contracts/src/route-policy.test.ts/client-profile-contract.test.ts`、SDK test、Runner `permission-matrix.test.ts/workmesh-tools.test.ts`；真实跨客户端集成 `packages/conformance/src/mcp-coverage.conformance.test.ts` 待创建。

| 验收类 | 具体场景及判定 |
| --- | --- |
| 正常 | C只读/读写与E分别initialize/发现；每个可选工具有准确参数/返回引用，资源客户端和只消费工具客户端均能读取前提；Pi仅呈现其确有adapter的工具 |
| 越权/撤权 | 发现后撤Team grant/Delegation/Connection，调用拒绝不自动刷新绕过；H-only工具不能成功；E不能因有work:write创建跨Team Project；跨Team NOT_FOUND不泄露存在性 |
| 非法状态 | queued、paused、stopping、terminal manifest披露与实际调用一致；feature enabled不覆盖状态，错profile/credential mode失败关闭 |
| 幂等 | 对已有代表写工具丢响应重放同key/body只一条事实；异体冲突；工具重新发现或重连保留逻辑身份；同body的另一新动作不误回旧动作 |
| 旧revision | 错If-Match返回结构化冲突及可读取currentRevision；不得先盲重写再返回成功 |
| 事务失败 | M0纯发现没有新领域写事务，因此新command事务回滚不适用；对有代表性的下游写注入失败验证适配不吞原错误。GET身份解析需区别允许的Coordination派生与Human-only早拒绝，拒绝账本仍按ADR0028 |
| 重放 | MCP initialize/工具重连不复制领域事实；SDK响应重试完整错误/trace保留；resource获取无receipt/outbox。M0无新job，job效果去重沿M1–M4验 |
| 并发 | 两客户端以同Connection分别调用，exact Session bridge不串身份；发现后并发撤权/改feature仍服务端拒绝；相同key/body并发不重复写 |
| 重启/恢复/Stop | API/MCP重启后重新发现并从durable cursor恢复；Stop后普通工具失败，专用清理入口保持可走；本批不证明外部CLI或机器恢复能力 |

**任务DoD**：277条现有operation的角色/发现决策无漏项；每个误广告项有服务端与适配一致的证据。工具数量只是静态覆盖数据，不能作为功能验收通过率。

## M1：现有执行、批准、租约与 Stop 恢复闭环

**范围**：补允许的Session get/list、Plan/context读取及版本列表、Approval list/get、Lease list/heartbeat/renew/release、Recovery list/get、专用stopAck工具；补欠缺具名/typed SDK并沿现有 `mutateLease(action)`复用。Runner只补自己精确E授权下的工具；生命周期握手/token刷新/Stop清理由受控adapter承担。保留H pause/resume/stop/retry、force-release及批准决定。

Stop清理不能直接复用默认 `makeTool`：它会先写普通Activity且检查已abort signal；停止时这些写已被拒绝。推荐受控Runner生命周期finally路径单次提交专用cleanupSummary/residualRisks，不启动模型继续执行、不任意替别的Session确认。服务器Stop已释放Lease；不能拿停止Agent普通lease release来替代该机制。

**文件**：contracts/SDK/MCP/Runner/conformance与API现有查询合同；`apps/api/src/agent/routes.ts/commands.ts`、`collaboration/routes.ts`、`recovery/routes.ts`用于一致性检查。不新增状态机、权限或表；只有准确typed适配缺口，如发现现行查询缺字段先契约更新。

**终态失响应的实际缺口与最小设计建议**：main的 `authorize.ts` 在stopAck只允许stopping；成功后已canceled，complete后已completed，原key重放可能在到达幂等账本前被拒绝。`getAgentSession`等读取也有active Session前置，不能声称同一终态E token还能GET确认。ADR0068仅对既有settle提供有限重放例外，不能泛化给所有命令。

推荐M1增加一个**精确执行结果只读确认合同**（新增查询范围，先ADR/安全合同评审）：由仍有效的Connection/安装身份或Human发起，重新验证live身份、Team grant、principal/delegation关联及准确session/action归属，只返回该主体可读的终态、revision、原command/event/result引用与清理概要，不签新执行Token、不续Session、不改变receipt/event/outbox。Coordination读取执行结果也必须验证上述绑定，不能只因当前C Session活跃就读任意E结果。Runner由受控认证adapter提交settle后沿既有协议重放；独立静态E未配置可用确认身份时明确待H查询，不能偷偷借Human cookie。查询路径/operationId/DTO在M1方案冻结时确定；本卡不创造一个已实现端点名。

另一项是为complete/stopAck设计只返回**已提交的精确同key同body结果**的有限重放路径；它涉及终态/撤权的安全语义，必须独立裁定、验证无新写，不推荐直接放宽terminal active gate。采用只读确认建议时，下表duplicate判定是“无双写、拒绝能准确确认原结果”，不要求每次普通命令重放返回200。这是新增最小查询与现有门禁适配，非纯工具别名，不能套“不新增权限/合同”的一般描述；仅新增这一明确确认读范围，普通命令权限和状态机保持。

**真实客户端链**：C接单得到queued Session事实及E bridge→E能力握手（queued允许）→ACK→转planning→读Session/context/revision→发布整Plan→进入合法executing状态→读当前revision→取Lease→heartbeat/renew→请求准确批准→等待H/既有授权策略→执行允许动作→释放Lease→publish evidence→complete。另一场景Human stop→客户端停止普通写→专用清理确认→canceled；Session完成不自动Issue done。

**测试落点**：MCP/SDK/Runner既有单元；扩展 `apps/api/integration/stage1.integration.test.ts`（现有）、已有Lease/Approval集成；`packages/conformance/src/execution-recovery.conformance.test.ts` 待创建。纯读恢复的事务/job负例不能套写命令统计。

| 验收类 | 具体场景及判定 |
| --- | --- |
| 正常 | 从新Connection接单到Plan/Lease/证据完成；只消费tools的真实客户端能读所有前提；Plan稳定step ID跨版本不变，批准仍准确hash |
| 越权/撤权 | 别的Session不能stopAck/续租/读Inbox细节；已取Lease后撤Delegation/Team/能力不再写；批准不可自决 |
| 非法状态 | invalid transition拒绝；paused/stopping/terminal普通写拒绝；stopAck仅允许stopping专用例外，不允许重新executing |
| 幂等 | ack/Plan/Approval请求/lease维护/complete/stopAck同key重复不增事件；异体冲突；K1/K2/K1 heartbeat不回退诊断投影 |
| 旧revision | Plan更新冲突不覆盖；lease renew/release/complete/stopAck用旧revision拒绝；错误包含准确新版本读取方式 |
| 事务失败 | Plan、lease、批准请求、completion、stopAck注入事务失败，领域state/event/outbox全部回滚；只读list/get不产生新领域事实，拒绝审计例外单独核 |
| 重放 | outbox重复不能再完成Session或重复批准；lost response重放沿原key；Stop清理重复保持一个专用事实；heartbeat稳态无事件放大 |
| 并发 | 独占Lease两Session竞争、续租与过期job、Plan两个版本、Stop与complete/普通写竞争按提交次序裁定；Lease holder详情可理解 |
| 重启/恢复/Stop | 重启保Lease/PostgreSQL事实、durable cursor和未完成批准；过期Lease停止受保护动作；默认Activity已失权而stopAck成功；外发checkpoint的Stop前后竞争由M3追加验证 |

**任务DoD**：执行和停止两条链均通过Native HTTP/MCP及Pi实际适配；没有H控制动作偷渡，没有Plan前置Activity破坏revision，完成材料/显式no-artifact遵循现行合同。

终态确认另须覆盖：stopAck/complete提交后丢响应、同key重放被前置终态门禁拒绝、仍有效准确C/安装身份查原结果成功、不同Connection/其他Session/已撤权或越scope身份读不到、不建新执行事实。原E GET终态拒绝是正负对照；若未具备确认身份/合同则记闭环未验收，不宣称无障碍恢复。

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

## M3：现有 Git、异步动作与证据交付闭环

**范围**：补仓库/交付查询、upload状态/cancel/download/列表、completion suggestion/health授权子集及Runner工具。增加**最小exact provider action只读查询合同**：建议 `GET /api/v1/provider-actions/{id}`及typed返回（提案路径，当前不存在），绑定requester/精确Session/资源范围、feature与安全字段，不返回secret payload/provider原始错误；不领取或修改action。completed返回准确目标与result引用，pending/claimed提供下一查询条件，failed/dead提供safe error/recovery，NOT_FOUND不泄露跨Team。

该查询需先OpenAPI/Zod/route binding、授权/SDK再MCP/manifest/Runner/conformance；不能用context任意变化当精确action成功。A2的 `provider_action_id` 可为resolve context提供来源佐证，但历史null及通用commit/openPR/merge结果仍需独立终态查询。查询不自动重试外部unknown，不改变旧action事实。

**文件**：`apps/api/src/delivery/routes.ts`（可拆专门read模块）、contracts/SDK/MCP/Runner、`apps/worker/src/provider-actions.ts`用已有查询facts，artifact storage/upload worker和git provider能力矩阵作为消费者；fake Agent与fake Git provider。有持久化必要才新增迁移，本方案推荐复用现有action projection零迁移；若改事件/持久化语义补ADR。

**真实客户端链**：H已连接Git/pin context→E发现并读仓库准确base SHA/path scope→acquire Lease→branch→查询exact action→commit(expected head)→查询→openPR→读delivery/current head/checks→上传/发布证据→父E按M2稳定Plan调用create_review_delegation→受控交付独立reviewer并ACK/进入合法执行态（不发布Plan）→reviewer读取授权材料、本人发布Room review_result和绑定当前PR/head/provenance的code_review delivery Artifact→本人publish_structured_review→读当前revision并complete reviewer→父确认required reviewer已completed→E请求精确merge/CI重试批准→H批准→Worker重验后执行→E查询终态→父结果摘要与complete。structured review不替代reviewer完成所需Room消息；必须在reviewer仍有有效执行授权时发布，不能先complete再尝试普通写。merge不自动deploy、不自动Issue done；file upload不能充code_review授权。

**测试落点**：扩展stage3 delivery、provider action/worker、artifact upload与MCP/SDK/Runner单元；`packages/conformance/src/delivery-recovery.conformance.test.ts` 待创建。先fake端到端；真实Git provider/文件存储支持度按部署可用条件另实证，不发布外部内容补验收。

| 验收类 | 具体场景及判定 |
| --- | --- |
| 正常 | 从准确base/path到PR/current-head证据/review/批准/终态；exact action返回原target/result；upload headers实际可用；无Artifact store场景明确unsupported/限制 |
| 越权/撤权 | E越路径/仓库/Team查询action拒绝；repo:write_branch有而repo:open_pr无仍拒openPR；外部读取后撤权禁止最终context写；独立reviewer不审自己产生的变更 |
| 非法状态 | stale expectedHead、未通过check/有BlockingHigh review、无有效merge approval、不支持provider操作拒绝；file artifact不能structured review；只有structured review缺Room消息仍不能complete reviewer，required reviewer未completed仍阻父；sending unknown不自动重发 |
| 幂等 | provider intents/上传finalize/review/merge重复同key只一action/事实；丢response读原action再恢复；不同body拒绝；外部不支持exactly-once时如实unknown |
| 旧revision | upload cancel等按现行合同校验；head变化不消费旧review/批准；context异步POST无If-Match，不伪造revision要求；查询不需要If-Match写锁 |
| 事务失败 | intent提交失败零provider I/O，state/event/outbox全回滚；结果checkpoint与权限拒绝回滚/定向事件；query不写业务事实 |
| 重放 | 重复provider webhook、outbox/job、worker reclaim/fenced ACK不双提交；PR head更新使旧批准失效；上传到期/重复finalize保持同证据身份 |
| 并发 | 两commit expected head、review与head换代、批准与撤权/Stop、Worker claim fencing、锁等待超过真实租期；观察实际锁等待，不拿注入delay代证明 |
| 重启/恢复/Stop | 外发前checkpoint commit次序正确；Stop/撤权先commit则零外发，checkpoint先commit后的在途调用不能召回要记录；worker崩溃/未知结果只读对账，exact-action terminal恢复不猜context变化 |

**任务DoD**：至少fake provider完整交付链Native HTTP/MCP/Pi一致，所有异步命令可准确确认；每个真实provider“支持/不支持/未测”有实际依据。#9切片新组合证据单独绑定，不借其旧UI验收。

## M4：现有可选领域的 Agent 操作覆盖

**范围**：选择已部署启用的Planning、Template、Automation、Agent Loops、Costs/A2A读取族及现行有限写：`runLoopNow`、`recordUsage`、health/completion提案等。增加typed SDK/MCP与必要Runner适配；Human管理规则/Loop/template/通知、私有view/预算与身份边界不改变；按owner/scope补现有saved view读取/允许创建适配。A2A event stream使用隔离协议adapter，不把其cursor当domain event cursor；若目标客户端只支持tool，给有界查询或明确不支持，不伪装工具能无限流。

**Initiative rollup后端读取修复**：推荐M4包含 `getInitiativeRollup` 的既有Agent读修复，先实现与 `listInitiatives` 一致的live Session、Delegation/Team grant与project/work-item scope授权投影，再补typed SDK/MCP/Runner。当前 `operations/routes.ts:496–569` 仍用Human membership.actor_id=current.id筛项目，不能将合法Agent的零项目聚合当成功。仅扩大到现行允许读取的项目，不给Agent membership或Initiative管理权；保持Human读取、200可见项目上限、COSTS feature及currency/unknown成本语义。未修复前Agent rollup明确暂不支持，发现/交付报告不得标全面可用；不以空聚合掩盖拒绝或缺口。

**文件**：`apps/api/src/operations/routes.ts`、contracts/SDK/MCP/Runner/feature registry、DB stage4与 `packages/a2a-adapter`既有协议；没有TA新机器/日历/CLI计费/出站MCP功能。默认feature关闭仍有明确错误。

**真实客户端链**：授权C/E查询已启用规则/Loop→读取一次run/source/effect/usage事实→允许时runLoopNow→跟踪运行、预算/结果→读项目进展；不能通过自然语言通知或变更rule暗中扩大scope。未启用则客户端明确该链不可用，核心链继续。

**测试落点**：stage4 operations/automation/Loop/usage既有集成、feature/policy/MCP/Runner测试；`packages/conformance/src/optional-domains.conformance.test.ts` 待创建，按启用配置分别运行，禁用负例也要验证。

| 验收类 | 具体场景及判定 |
| --- | --- |
| 正常 | 遍历分页/滚动引用读rule/run/Loop/usage/Template pin/Initiative；同一非空Initiative中授权项目rollup必须非零且计数/健康/成本与授权事实一致，Human membership读回归；允许run产生准确run/effect及可跟踪结果；缺usage保未知不填0 |
| 越权/撤权 | rollup中同Initiative的其他scope项目排除，跨Team/Project负例有可读正对照；先list再撤Delegation/Team grant，rollup必须拒绝（不能返回零值冒成功）；私有advanced view/Template owner、预算/Loop scope重新授权；Human管理不授Agent，关闭feature拒绝 |
| 非法状态 | 已停用Loop、重叠运行、超预算、错误Template pin/协议版本拒绝；enabled不变成管理权限 |
| 幂等 | runLoopNow/usage同key同body、异体冲突；同occurrence重复effect不执行第二次；读查询无key写义务 |
| 旧revision | 对选定revisioned有限写保原版本规则；纯GET无If-Match不适用；Human-onlyrule版本更新用例归现行领域消费者回归，不新增Agent管理 |
| 事务失败 | 有限写run/admission/usage/effect回滚零新state/event/outbox；只读列表无新领域command事务，不适用写回滚但需零写断言 |
| 重放 | 定时/webhook/job/outbox重复effect fenced/idempotent；新增适配不重演已完成run。没有日历新规则时不把TA14条件写为通过 |
| 并发 | 两run竞争no-overlap、预算预留竞争、分页撤权，H暂停rule/Loop与E请求按现行锁门禁处理 |
| 重启/恢复/Stop | 读取持久run/result并从cursor恢复；停止E不再触发普通effect；外部unknown仅对账。M4无新增shell/机器资源，不适用那些进程清理测试 |

**任务DoD**：被选现有可选域逐operation闭环证据，未选/禁用/权限保留明确，不把整个TA路线图计入范围。

## M5：选定客户端与部署画像的联合验收及交付说明

**范围**：用同一已验收后端候选验证外部MCP客户端（首批建议仓库支持的Codex/OpenCode/pi式客户端协议行为）及内置Pi Runner。实际客户端/OS/版本与是否真实厂商客户端必须记录，公开行为fixture只证明协议、不能冒真实厂商认证。个人Lite/小团队/企业配置尽量同核心后端；支持等级逐一声明，不给未测画像打勾。

不借M5发布公共签名Skill：ADR0069的Runner内嵌pin和公共1.1.0不可变release分别处理，新公共版本需要实际签名/发行授权及#20/既有W12衔接。管理员通过团队Secrets注入凭据，不通过聊天；没有设备/OS/服务时记未测，沿原门禁暂停相应宣称。

**文件**：conformance drivers/fixtures/reporters、SDK/MCP smoke、Runner集成、docs Agent guide/operation matrix及发布说明；若改代码必须运行其消费者checks。无新业务功能，不修改UI设计；Human前提通过已有经授权REST/客户端演示。

**真实客户端链**：从新建授权Connection到规划→接单→执行→协作→批准→Git/证据→停止/重试与完成的两条演示；含无Git项目链（不判repository unmet），和有Git交付链；两人两Agent交接及撤权；企业受限出网/内网Git只有实际部署支持时验，不能用fixture等同实机。

**测试落点**：`packages/conformance/src/drivers.ts/runner.ts`、新增前述conformance文件、SDK测试、MCP smoke、Runner permission/isolation；不会为纯方案再次运行这些未来测试。

| 验收类 | 具体场景及判定 |
| --- | --- |
| 正常 | 两类真实客户端用完整工具序列完成同一事务语义，返回资源/证据可由Human读；至少无Git核心、有Gitfake交付两路径；OS/客户端实测矩阵明确 |
| 越权/撤权 | 跨两Human/两Team/两Agent的读取正对照与拒绝、live撤权、Connection轮换overlap身份；无Human cookie/secret输出/活动泄露 |
| 非法状态 | 已停/失败Session不得普通写；unsupported/feature-disabled/protocol mismatch可恢复核心查询；重试是新Session不复活旧事实 |
| 幂等 | 网络断开/MCP重连/API重启仍同操作身份；重复计划/消息/外部intent不双事实；logical新intent不被旧key吞掉 |
| 旧revision | 两客户端同时改Plan/Document/Issue，旧版本得到同错误；读当前值后明确合并，不能默默覆盖 |
| 事务失败 | 演示下游实际rollback及结果证据，整体不标完成；ADR0068 settle＋Session completion一起失败回滚，明确拒绝后仅Turn settle要给可见warning |
| 重放 | 回放webhook/outbox/inbox/event，作用域/受众与统计不重复；协议fixture结果和真实客户端记录分列 |
| 并发 | 多Connection/Session与Runner attempt不串token/bridge、独立审查不混producer；Stop/撤权与动作提交次序明确 |
| 重启/恢复/Stop | MCP/API/Worker/Runner分别重启、durable cursor resync、lease丢失/过期、准确外部unknown对账、清理资源归属和Stop_ACK；不借模型回答宣称领域完成 |

**任务DoD**：推荐选定画像/客户端矩阵按实际结果全链成功，未测或依赖H/凭据步骤明确。交付内容包括实现范围/文件/迁移/API/events/实际检查/演示/限制/规格偏差、精确head及证据；Required CI与旧门禁不被协议报告替代。

## 范围问题与推荐

下列问题供方案审查及Chief后续范围裁定，不阻塞本次方案提交；不通过等待时间推断批准。后端独立交付已定，不再作为问题。

| 需裁定的具体边界 | 推荐与另一选项 | 影响及原卡衔接 |
| --- | --- | --- |
| “全面”先验哪些现有领域 | 推荐先M0–M3＋M5核心链，M4按已启用部署逐域验；另一项同批验全部已存在可选域 | 后者仍不含TA新增，但验收矩阵/环境明显扩大；无需先启动所有F/TA |
| E执行Agent应否拥有Team协调创建Project/Issue、查询peer名单 | 推荐保留C/E现行分工，缺peer发现先明确H提供目标/受控清单；另一项设计scope受控Agent目录和新的E创建授权 | 后者改变现行领域角色/信息披露，需独立ADR/合同；不能为Runner工具可见直接给E团队权 |
| Human专属管理动作是否要Agent化 | 推荐保留所有现行H门禁，工具返回具体等待/请求/管理员前提；另一项只选某一动作给有界委派设计 | 逐项权限/安全决策，非“补工具”可默认解决；approval decide/secret配置不能无界自批，Issue评论Agent作者与现行Human-only冲突亦须独立裁定 |
| Session终态失响应如何确认 | 推荐精确归属的C/安装身份或H只读结果确认；另一项严格同key/body已提交结果的有限终态重放 | M1新增最小查询需安全ADR/合同评审，普通E终态读与新写仍拒绝；静态E缺确认身份如实限制，不能默默扩active Session门禁 |
| #9/#16原卡后端子范围与剩余UI DoD如何记录 | 推荐原todo分别验后端子范围并显式保留UI待后续重设计，不整卡done；另一项由Chief正式缩减原卡DoD并另保留历史UI成果引用 | 都须完整纠正规格、来源、新候选独审/CI，不能将本次方向答复当视觉接受或丢原失败；本轮不改旧卡 |
| 是否现在纳入Chief完整F链 | 推荐先现有MCP闭环，再明确授权原F0–F6；另一项与核心批次并行启动选定F链 | F0 room/F1 appointment/F3 admission/F4 checkpoint/F5 recovery是真新增前置；F2自主与F5重新投递既定选择不重问，F4容量数字按原卡实测关口 |
| TA新增后端首选范围 | 推荐先仅TA05/TA08中复用已有任务/Git闭环的选定增量，TA02/03/04机器/代码Runner单独方案；另一项先受控Coding Runner | TA本地全文当前不可读，Chief先纳受控源；TA11出站须TA12秘密前置，TA17 shell独立授权，不混入MCP |
| 首轮真实客户端/部署验收设备 | 推荐一个外部MCP真实客户端＋内置Pi、已有可用Lite/团队fixture；企业/其他OS未测明确；另一项所有目标OS/三画像实机 | Chief从已有设备矩阵落实实际版本/访问条件；#5三OS和#20无源码门禁不因此缩减。没有凭据不要求聊天发送秘密 |

## 本阶段验证适用性与收尾

当前只产Markdown方案：域happy path/权限/状态/幂等/版本/事务/job/并发/restart等**产品运行用例全部未执行，不适用本阶段实现验收**。本阶段适用的是精确ref/完整blob来源核对、277操作无漏项、路径/参数/角色与消费者证据、自包含可审性、文档链接/空白/范围不越权、独立方案审查及当前docs CI分类。

后续每轮先登记独有PostgreSQL/Redis/S3/fake provider/Runner资源、测试进程与临时配置；失败也保全必要脱敏首败，再只清本任务闲置资源，禁global prune、共享清理、审批拒后换工具继续。Windows原生OS、UTF-8/CRLF与Git blob/运行字节区别按既有记录处理。全部未来用例保持未运行直到有实际精确源结果。
