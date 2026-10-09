"""人工核读的领域规则目录；只作为受控计划数据，不参与产品授权。"""
from copy import deepcopy
RULES={}
def gate(fact,allowed,reason,description,when=None):
 return {"fact":fact,"allowed":allowed if isinstance(allowed,list) else [allowed],"reason":reason,"description":description,**({"when":when} if when else {})}
def add(ids,path,anchors,predicates,notes,**extra):
 for op in ids.split():
  assert op not in RULES,op
  RULES[op]={"operationId":op,"sourcePath":path,"anchors":anchors,"predicates":deepcopy(predicates),"decision":notes,**deepcopy(extra)}
OWNER=gate("documentOwnerBinding",["session_work_item","work_item_project","session_project"],"RESOURCE_SCOPE_DENIED","work_item owner精确等于Session.work_item；project owner等于其live所属Project或Session.project")
OWNER_SCOPE=gate("documentOwnerCapabilityScope",True,"RESOURCE_SCOPE_DENIED","同Team且workItemIds/projectIds包含准确owner所需绑定；teamIds单独不足")
DOC="apps/api/src/documents.ts"
add("listDocuments getDocument listDocumentHistory getDocumentRevision diffDocumentRevisions exportDocumentMarkdown",DOC,
 ["async function assertExactAgentOwner(","async function assertRead("],[OWNER,OWNER_SCOPE],
 "读取按准确owner而非Team可见性授权；已归档Document仍可读历史；revision/diff必须属于同document。",target=True)
add("createDocument updateDocument restoreDocumentRevision",DOC,
 ["async function assertWrite(","async function assertExactAgentOwner("],[OWNER,OWNER_SCOPE],
 "新写使用当前Session、work:write及owner范围；project owner再assertExactAgentProjectBinding；不增加角色特权。",target=True)
RULES["updateDocument"]["predicates"] += [gate("documentStatus","active","CONFLICT","归档文档不能更新"),gate("documentBaseMatches",True,"CONFLICT","baseRevisionId及baseContentHash必须匹配当前内容")]
RULES["restoreDocumentRevision"]["predicates"] += [gate("documentStatus","active","CONFLICT","归档文档不能恢复"),gate("documentBaseMatches",True,"CONFLICT","准确baseRevisionId及hash"),gate("restoreChangesContent",True,"CONFLICT","目标revision存在于同document且内容不等于当前")]
INBOX="apps/api/src/inbox/routes.ts"
add("listInbox",INBOX,["function listAgentInbox(","const activeScopeSql"],
 [gate("inboxAudience",["exact_recipient","exact_claimant","unclaimed_actor"],"NOT_FOUND","exact Session收件/领取者可完整列；actor-target未领取仅intent/channelId和detail_available=false"),gate("inboxSourceScope",True,"NOT_FOUND","同Team和源Room work_item/project/Session lineage；非Room源可同Team")],
 "无Session输入，始终当前身份；role无额外限制。",target=True)
add("getInboxItem acknowledgeInboxItem replyInboxItem",INBOX,["const itemDetailSql","async function loadAgentItemForUpdate("],
 [gate("inboxAudience",["exact_recipient","exact_claimant"],"NOT_FOUND","同actor另一Session不是收件/领取者；未领取actor目标不能读detail"),gate("inboxSourceScope",True,"NOT_FOUND","同Team和源Room live scope")],
 "get沿liveSessionReadPredicate；ack使用work:read并写receipt而不改item revision；reply使用work:write，If-Match并解析源消息。",target=True)
add("claimInboxItem",INBOX,["app.post(\"/api/v1/inbox/:id/claim\"","const activeScopeSql"],
 [gate("inboxAudience","unclaimed_actor","NOT_FOUND","仅当前actor目标、recipient_session_id和claimed_by_session_id均null"),gate("inboxSourceScope",True,"NOT_FOUND","同Team及源Room范围"),gate("inboxStatus","open","NOT_FOUND","仅open，锁下原子领取")],
 "当前Session凭据+work:read+幂等；不从任意sessionId刷新。",target=True)
RULES["replyInboxItem"]["anchors"].append("async function assertReviewReplyAuthority(")
RULES["replyInboxItem"]["predicates"] += [
 gate("inboxStatus","open","INBOX_REPLY_CONFLICT","open且有source_room_message/channel"),
 gate("inboxReplySourceLive",True,"RESOURCE_SCOPE_DENIED","authorizeExactReplyRecipient复核准确源收件Session/actor，撤权不投递"),
 gate("role","reviewer","CAPABILITY_DENIED","review_request回复必须reviewer",{"replyKind":"review_request"}),
 gate("artifactCapability",True,"CAPABILITY_DENIED","review_request还需live artifact:write",{"replyKind":"review_request"})]
COL="apps/api/src/collaboration/routes.ts"
add("listLeases",COL,["app.get('/api/v1/leases'"],[gate("leaseHolderMatches",True,"NOT_FOUND","最终SQL只列当前Session leases并live授权")],"仅现有REST/SDK；MCP缺list入口沿M1披露未适配，不改变现有读取权限。",target=True,futureAdapter="M1")
add("acquireLease",COL,["async function acquireLease(","async function assertLeaseResourceScope("],
 [gate("leaseResourceBinding",["exact_work_item","delegated_plan_step","current_plan_step","parent_current_plan_step"],"RESOURCE_SCOPE_DENIED","work_item等于Session work_item；plan_step为准确delegation.scope或当前/parent当前Plan步骤"),
  gate("leaseConflictFree",True,"LEASE_CONFLICT","active exclusive/review_shared冲突按resource和kind锁下判断")],
 "准确body.sessionId+work:write；TTL/MIME等输入由DTO校验；Lease不授予权限。",target=True)
add("heartbeatLease renewLease releaseLease",COL,["async function leaseAction(","async function assertSessionWrite("],
 [gate("leaseHolderMatches",True,"AGENT_SESSION_TOKEN_MISMATCH","租约row.session_id必须为当前Session；不能用id获取别的身份")],
 "无需目标Session输入；现有SDK有实现但MCP缺入口，M1补适配；普通release不成为Stop专用清理。",target=True,futureAdapter="M1")
RULES["heartbeatLease"]["predicates"].append(gate("leaseStatus","active","CONFLICT","heartbeat只核active status；现行handler不额外检查expires_at，不改授权"))
RULES["renewLease"]["predicates"] += [gate("leaseStatus","active","LEASE_EXPIRED","active"),gate("leaseNotExpired",True,"LEASE_EXPIRED","expires_at>now；需If-Match")]
RULES["releaseLease"]["predicates"].append(gate("leaseStatus","active","CONFLICT","仅active；If-Match，重复动作走现有key replay"))
add("getWorkRoom",COL,["app.get('/api/v1/rooms'"],
 [gate("roomSubjectBinding",["self_session","session_work_item","work_item_project","session_project"],"RESOURCE_SCOPE_DENIED","只传一种subject；Session subject仅自身，Project为所属或Session.project")],
 "workItemId/projectId是普通目标；sessionId变体按真实getRoom refresh路径分别当前E与C目标；不是无条件Team Room。",target=True)
add("postWorkRoomMessage",COL,["async function assertSessionMessageWrite(","const reviewResult = intent === 'review_result'"],
 [gate("roomLineageScope",True,"RESOURCE_SCOPE_DENIED","源Session当前范围/Room lineage及准确recipients在merged锁下复核"),
  gate("role","reviewer","CAPABILITY_DENIED","review_result须reviewer",{"messageIntent":"review_result"}),
  gate("artifactCapability",True,"CAPABILITY_DENIED","review_result须artifact:write联合route work:write",{"messageIntent":"review_result"})],
 "普通intent保留work:write；sessionId若省略不能假设目标E，使用DTO和handler当前身份路径；recipientSessionId不是调用身份。",target=True)
add("createWorkItemDecision createProjectDecision createSessionDecision getDecision",COL,
 ["async function createDecision(","function assertDecisionSubjectInSessionScope("],
 [gate("decisionSubjectBinding",["session_work_item","work_item_project","session_project","self_session"],"RESOURCE_SCOPE_DENIED","准确subject work_item/project/session，不能任意Team资源")],
 "Agent提案需当前Token，body.sessionId若提供须匹配；读取同范围。Human终裁另是H-only操作。",target=True)
add("commentOnPlanStep proposePlanAssignment",COL,["app.post('/api/v1/agent-sessions/:id/plan/comments'","app.post('/api/v1/agent-sessions/:id/assignment-proposals'"],
 [gate("currentPlanStep",True,"STALE_PLAN_VERSION","planVersionId/current_plan_version与step都属于源Session当前Plan")],
 "源Session必须当前Token，work:write；assignment只是proposal/routing facts，不授予目标Agent执行资格。",target=True)
add("createChildAgentSession createReviewDelegation",COL,["async function createChild(","async function createReview(","async function lockCollaborationSessionTargets("],
 [gate("currentPlanStep",True,"STALE_PLAN_VERSION","parent当前Plan、稳定step identity"),
  gate("childTargetGrant",True,"CAPABILITY_DENIED","父Delegation∩目标definition∩同Team grant的所需能力"),
  gate("childCapacityAvailable",True,"CHILD_SESSION_LIMIT","parent/step/Agent并发、预算reservations"),
  gate("childExactInstallation",True,"NOT_FOUND","准确target Agent/Team/principal的active installation用于新Session配送")],
 "审计当前已注册实现；M2承接后续子Session/reviewer完善，不以未来入口缺口屏蔽当前合法调用。调用者role未额外限制；创建目标角色按DTO。",target=True)
RULES["createReviewDelegation"]["predicates"] += [gate("reviewTargetCaps",True,"CAPABILITY_DENIED","target reviewer需要work:read/work:write/artifact:write的联合live交集"),gate("reviewStepLeaseFree",True,"LEASE_CONFLICT","当前Plan step不得有exclusive active Lease")]
add("appendContextDelta",COL,["async function appendDelta("],
 [gate("contextBaseMatches",True,"CONFLICT","baseSnapshotId为源Session当前context；additions不得扩大授权")],
 "准确Session+work:write；新snapshot和context_delta事实，不替换他人snapshot。",target=True)
add("listHandoffs",COL,["app.get('/api/v1/handoffs'"],
 [gate("handoffVisibleScope",True,"NOT_FOUND","同Team/current work_item/project范围且是源Session或target_agent_id为当前Agent")],
 "使用当前身份list；不是按返回from_session_id切换Token。",target=True)
add("offerHandoff",COL,["async function offerHandoff("],
 [gate("handoffSourceMatches",True,"AGENT_SESSION_TOKEN_MISMATCH","fromSessionId为当前准确源Session"),
  gate("handoffTargetGrant",True,"CAPABILITY_DENIED","精确目标Agent/同Team与请求capabilities，不从targetSkill授予身份"),
  gate("handoffScopeNarrow",True,"RESOURCE_SCOPE_DENIED","scope_type/scope_id不能扩大源授权")],
 "源work:write；requested status需要既有目标live资格及至少work:read；payload/context/artifact按当前源事实。",target=True)
add("requestHandoff",COL,["async function transitionHandoff("],
 [gate("handoffSourceMatches",True,"AGENT_SESSION_TOKEN_MISMATCH","记录from_session_id必须等于当前源Session"),
  gate("handoffStatus","draft","CONFLICT","仅draft→requested"),
  gate("handoffTargetGrant",True,"CAPABILITY_DENIED","目标授权及requestedCapabilities中含work:read")],
 "实际SDK通过sourceSessionId刷新源E；准确源而非目标accepted_session；不同targetActor不替代源。",target=True)
add("cancelHandoff completeHandoff",COL,["async function transitionHandoff("],
 [gate("credentialMode","human_session","FORBIDDEN","当前domain对canceled/completed固定assertHumanTeam；route含Agent不放宽")],
 "route宽于domain：Agent已知拒绝，不为其广告；Human按Team和状态完成/cancel。",domainDifference={"kind":"route_agent_domain_human","closure":"M0共享发现规则固定H-only，保留当前API拒绝并补Agent拒绝/Human允许测试；不改写领域权限"},positiveActor="H")
RULES["cancelHandoff"]["predicates"].append(gate("handoffStatus",["draft","requested"],"CONFLICT","仅draft/requested取消"))
RULES["completeHandoff"]["predicates"] += [gate("handoffStatus","accepted","CONFLICT","仅accepted完成"),gate("handoffAcceptedCompleted",True,"HANDOFF_TARGET_INCOMPLETE","accepted子Session completed且有summary/evidence，lease transfer已满足")]
add("getCurrentActor getWorkspace","apps/api/src/server.ts",["app.get(\"/api/v1/auth/me\"","app.get(\"/api/v1/workspace\""],[],
 "当前Actor/Workspace元数据，route要求live Session/work:read；没有目标、无角色追加。")
add("deleteProject deleteWorkItem","apps/api/src/commands.ts",["deleteProject:","deleteWorkItem:","AND s.session_kind='coordination'"],
 [gate("sessionKind","coordination","ROLE_REQUIRED","teamAccess只许协调kind"),gate("role","coordinator","ROLE_REQUIRED","coordinator/team scope"),
  gate("delegationScopeType","team","RESOURCE_SCOPE_DENIED","准确Team grant和scope_id"),gate("sameTeam",True,"NOT_FOUND","同Team")],
 "源码已确定：deleteProject teamAccess manage，deleteWorkItem write；Agent两者沿同一C coordinator规则；Human分别admin/maintainer管理与writer。不新增MCP删除入口。",states=["acknowledged","planning","executing"],positiveActor="C")
add("listWorkItemComments","apps/api/src/server.ts",["app.get(\"/api/v1/work-items/:id/comments\""],
 [gate("workItemExact",True,"RESOURCE_SCOPE_DENIED","最终live SQL w.id=Session.work_item_id")],
 "读取准确Work Item评论可用于E；写评论另H-only，不把读权限转成写权限。",target=True)
add("listSavedViews createSavedView","apps/api/src/server.ts",["app.get(\"/api/v1/views\"","async function createView("],
 [gate("savedViewVisibleScope",True,"RESOURCE_SCOPE_DENIED","列表仅owner_actor_id=self、builtins和同Team/Workspace scope；create可指定已授权Team")],
 "createView领域不含额外role门禁，沿route身份/live capability/Team scope；只插当前actor所有的view和event。",target=True)
add("delegateAndStartAgentSession","apps/api/src/agent/commands.ts",["export async function delegateAndStartAgentSession(","AND connection.grant_agent_delegate"],
 [gate("credentialMode","coordination_connection","CREDENTIAL_MODE_MISMATCH","Agent仅准确Connection C"),
  gate("role","coordinator","ROLE_REQUIRED","连接Coordinator"),
  gate("sameTeam",True,"NOT_FOUND","目标Work Item同Team"),
  gate("principalResponsibleMatches",True,"RESOURCE_SCOPE_DENIED","principalHumanActorId=Connection principal=work item responsible"),
  gate("delegateGrantEnabled",True,"CAPABILITY_DENIED","Connection grant_agent_delegate及agent:delegate联合"),
  gate("childTargetGrant",True,"CAPABILITY_DENIED","target definition/Team批准请求能力、安装配送身份"),
  gate("assignmentCompatible",True,"ACTIVE_AGENT_EXECUTION","不替换Human强制/不兼容或live执行")],
 "C→新E创建，不是输入已有sessionId bridge；输入role为executor；Human分支沿现行Team授权。",states=["acknowledged","planning","executing"],positiveActor="C",target=True,extraCaps=["agent:delegate"])
add("claimWorkItem","apps/api/src/agent/commands.ts",["export async function claimWorkItem(","const coordinationActive ="],
 [gate("credentialMode","coordination_connection","FORBIDDEN","仅active/rotating准确Connection"),
  gate("sameTeam",True,"NOT_FOUND","目标Work Item同Team"),
  gate("principalResponsibleMatches",True,"RESOURCE_SCOPE_DENIED","Connection principal与responsible及授权一致"),
  gate("assignmentCompatible",True,"ACTIVE_AGENT_EXECUTION","无live/不兼容执行；旧同Agent stale可继续兼容assignment"),
  gate("claimWorkCapabilities",True,"CAPABILITY_DENIED","Connection∩C Delegation∩definition∩Team包括work:read/work:write"),
  gate("claimRequestedSubset",True,"CAPABILITY_DENIED","requestedCapabilities不扩大live交集；agent:delegate不继承")],
 "当前C self claim；返回queued新E和exchangeToken，SDK用Connection交换；无需预配置installation bridge。",states=["acknowledged","planning","executing"],positiveActor="C",target=True,extraCaps=["work:read","work:write"])
add("listAgentSessions listAgentPlanVersions listArtifacts listApprovals getApproval","apps/api/src/agent/routes.ts",["async function readableSession("],
 [gate("readSessionMatches",True,"AGENT_SESSION_TOKEN_MISMATCH","Agent读只绑定自身Session，列表按自身过滤；Human按Team"),
  gate("readObjectSessionMatches",True,"RESOURCE_SCOPE_DENIED","plan/artifact/approval准确session FK")],
 "sessionId过滤不是任意Token切换；C list只返回当前C的事实，不列其他E。",target=True)
add("consumeApproval","apps/api/src/agent/commands.ts",["export async function consumeApproval(","async function consumeApprovalInTx("],
 [gate("approvalSessionMatches",True,"RESOURCE_SCOPE_DENIED","approval.session_id=self"),gate("approvalUsable",True,"APPROVAL_REQUIRED","approved、未过期未消费、hash和If-Match")],
 "领域只允许Agent Session，Human虽然route宽仍FORBIDDEN；准确当前Session+work:write。",target=True)
add("listHumanAttention getHumanAttention","apps/api/src/human-attention/routes.ts",["export function humanAttentionAuthorizationPredicate("],
 [gate("attentionScope",["self_session","session_work_item","work_item_project","session_project","coordination_same_team"],"NOT_FOUND","E准确源范围；C同Team；所有live事实在最终SQL"),
  gate("attentionInboxRecipient",True,"NOT_FOUND","Inbox source还需actor收件且Session null或self")],
 "只读聚合，不授予Attention上的Human action；可选sessionId为过滤，不自动bridge。",target=True)
add("listRecoveryItems getRecoveryItem","apps/api/src/recovery/routes.ts",["export function recoveryAuthorizationPredicate("],
 [gate("readSessionMatches",True,"NOT_FOUND","recovery.session_id必须当前exact Session，C不借Team scope读其他E")],
 "只读恢复投影；M1专用终态确认不在此新增。",target=True)
add("listControlCenter getProjectControlCenter getWorkItemExecutionSummary","apps/api/src/control-center/routes.ts",["const sourceScopePredicate ="],
 [gate("controlSourceScope",["self_session","session_work_item","work_item_project","session_project","coordination_same_team"],"NOT_FOUND","源Session/Work Item/Project或C同Team；每collection沿对应SQL")],
 "只读bounded投影；allowedControls为服务端建议，不授予control写；Project/not found保守。",target=True)
add("explainAgentSession previewAgentSessionControl","apps/api/src/control-center/routes.ts",["async function readRunExplanation(","async function previewControl("],
 [gate("readSessionMatches",True,"NOT_FOUND","liveSessionReadPredicate exact session.id=self；有sessionId参数不代表C可直接查其他E")],
 "explanation/preview为读取；preview POST无领域写，allowed字段是目标状态建议，不能凭它执行H-only控制。",target=True)
add("getWorkspaceGuidance getTeamGuidance getProjectGuidance","apps/api/src/guidance.ts",["export function registerGuidanceRoutes(","export async function readGuidance("],
 [gate("guidanceScopeMatches",True,"RESOURCE_SCOPE_DENIED","route workspace/team/project resolver要求当前live授权范围；handler只读取已选scope")],
 "无目标Session字段；Guidance URI普通scope id；未发布返回空文档，不授予publish/archive/rollback。",target=True)
DEL="apps/api/src/delivery/routes.ts"
add("listRepositories getRepositoryContext",DEL,["function applicableAgentRepositoryContexts(","async function assertRepositoryRead("],
 [gate("repositoryContextApplicable",True,"REPOSITORY_ACCESS_DENIED","准确Session/work_item/project context且live repo:read、repositoryIds、同Team、active repo/provider"),
  gate("repositoryHumanFiltersAbsent",True,"FORBIDDEN","当前main teamId/availableOnly仅Human；Agent携带过滤失败")],
 "repo:read不扩大为配置权限；Agent DTO can_configure_context=false；context数组返回原件/provenance。A2改变DTO，不改变Session资格。",target=True,extraCaps=["repo:read"])
RULES["listRepositories"]["anchors"].append("Repository filters require a Human session")
RULES["listRepositories"]["predicates"][-1]["reason"]="VALIDATION_ERROR"
add("publishDeliveryArtifact requestArtifactUpload",DEL,["async function assertAgentRepositoryWrite(","async function assertDeliveryTarget("],
 [gate("deliveryWorkItemExact",True,"RESOURCE_SCOPE_DENIED","准确session work_item、可选project为其所属、planStep为当前Plan"),
  gate("repositoryContextApplicable",True,"REPOSITORY_ACCESS_DENIED","repository分支live repo:read及context权限read"),
  gate("deliveryCurrentHead",True,"MERGE_HEAD_CHANGED","提供PR/head必须为同work_item/repository准确当前head"),
  gate("artifactMetadataValid",True,"VALIDATION_ERROR","checksum/sourceTool/安全正文或上传mime/size准确DTO")],
 "artifact:write；普通artifact无repository变体不要求repocontext，当前MCP固定deliveryLink repository分支；上传只能物化file不能当code_review。",target=True,extraCaps=["artifact:write"])
add("getArtifactUploadStatus finalizeArtifactUpload cancelArtifactUpload downloadVerifiedArtifact",DEL,
 ["app.get('/api/v1/artifact-upload-intents/:id'","app.post('/api/v1/artifact-upload-intents/:id/finalize'"],
 [gate("uploadSessionMatches",True,"RESOURCE_SCOPE_DENIED","upload.session_id=self；Human为本人requester或对应Team下载规则")],
 "不从uploadId推断可切换身份；finalize body current Session沿SDK显式目标，cancel和status为当前Token。",target=True)
RULES["finalizeArtifactUpload"]["predicates"] += [gate("uploadProofValid",True,"ARTIFACT_CHECKSUM_MISMATCH","精确storage对象长度/hash及允许type/mime，verified重放沿现行规则")]
RULES["cancelArtifactUpload"]["predicates"] += [gate("uploadStatus",["pending","uploaded","canceled"],"CONFLICT","仅pending/uploaded可变更，canceled可返回")]
RULES["downloadVerifiedArtifact"]["predicates"].append(gate("uploadStatus","verified","CONFLICT","仅verified并由存储生成有界download链接"))
add("listWorkItemArtifacts",DEL,["app.get('/api/v1/work-items/:id/artifacts'"],
 [gate("workItemExact",True,"RESOURCE_SCOPE_DENIED","准确Session.work_item，不用任意同TeamWork Item")],
 "列表投影沿live work:read，包含同Work Item证据；不等于批准review/merge。",target=True)
add("publishStructuredReview",DEL,["async function prepareAgentPullRequestAccess(","delegation.role !== 'reviewer'"],
 [gate("role","reviewer","REVIEWER_CONFLICT","必须reviewer Delegation"),gate("independentReviewer",True,"REVIEWER_CONFLICT","actor!=PR producer"),
  gate("repositoryContextApplicable",True,"CAPABILITY_DENIED","live repo:read及context review permission"),
  gate("deliveryWorkItemExact",True,"RESOURCE_SCOPE_DENIED","PR属于exact Session work_item/repository"),
  gate("deliveryCurrentHead",True,"MERGE_HEAD_CHANGED","准确当前head"),
  gate("linkedReviewArtifact",True,"NOT_FOUND","自己的code_review artifact，checksum/sourceTool/head/work_item/repository/PR完整provenance")],
 "artifact:write联合route能力，file upload不满足reviewartifact；不授予executor reviewer身份。",target=True,extraCaps=["artifact:write","repo:read"],roles=["reviewer"])
add("requestPullRequestMerge retryPullRequestCheck",DEL,["async function prepareAgentPullRequestAccess(","assertMergeReady("],
 [gate("repositoryContextApplicable",True,"CAPABILITY_DENIED","live repo:read及merge/ci context permission"),
  gate("deliveryWorkItemExact",True,"RESOURCE_SCOPE_DENIED","准确PR/work_item/repository"),
  gate("deliveryCurrentHead",True,"MERGE_HEAD_CHANGED","准确当前head"),
  gate("providerApprovalBound",True,"MERGE_APPROVAL_MISMATCH","approved未过期未消费；Session/action/provider/connection/repository/PR/head/method/check及canonical hash准确")],
 "写仅持久化provider intent；审批/required CI/独审仍server裁决；不在本轮外发。",target=True,extraCaps=["repo:read"])
RULES["requestPullRequestMerge"]["predicates"] += [gate("mergeReady",True,"MERGE_CHECKS_BLOCKED","当前head required checks齐全通过且blocking/high findings和独立review闭合"),gate("pullRequestState","open","NOT_FOUND","open PR")]
RULES["retryPullRequestCheck"]["predicates"].append(gate("checkStatus",["failed","skipped"],"CI_RETRY_NOT_ALLOWED","仅failed/skipped current-head check；准确provider.ci.retry批准"))
add("getProjectDelivery",DEL,["app.get('/api/v1/projects/:id/delivery'"],
 [gate("projectDeliveryVisible",True,"NOT_FOUND","route Project范围+readableTeam；列表PR provider feature与context不授予配置权限")],
 "按现行project delivery查询；无MCP入口不误列supported；不会新增Agent管理动作。",target=True)
add("createProjectUpdateDraft",DEL,["Project update is outside the session scope","await assertEvidenceArtifacts(tx,"],
 [gate("projectBinding",["work_item_project","session_project"],"RESOURCE_SCOPE_DENIED","准确Project或其Work Item"),
  gate("evidenceSameTarget",True,"RESOURCE_SCOPE_DENIED","evidence artifacts属于准确Project/WorkItem")],
 "当前Agent只draft，work:write；MCP sessionId供SDK选择当前E/目标E，正文不含该字段；publish H-only。",target=True)
add("suggestWorkItemCompletion",DEL,["Work item does not belong to this project","await assertDeliveryTarget(tx,"],
 [gate("deliveryWorkItemExact",True,"RESOURCE_SCOPE_DENIED","准确SessionWork Item且属于输入Project"),
  gate("evidenceSameTarget",True,"RESOURCE_SCOPE_DENIED","PR/artifacts同target")],
 "Agent suggestion不是Human completion decision；无现有MCP入口，按当前SDK实现披露。",target=True)
OPS="apps/api/src/operations/routes.ts"
add("listCycles listAutomationRules",OPS,["app.get('/api/v1/cycles'","app.get('/api/v1/automation-rules'"],
 [gate("teamCollectionScope",["workspace","current_team"],"NOT_FOUND","最终live SQL只许Workspace或当前Team")],
 "现有REST/SDK列表，role无额外限制；缺MCP具名适配单列，不阻断领域审计。",target=True)
add("listInitiatives",OPS,["app.get('/api/v1/initiatives'"],
 [gate("initiativeLinkedProjectScope",True,"NOT_FOUND","必须关联当前Team且准确Session project/Work Item project")],
 "聚合列表只是可见Initiative；rollup另有实际membership差异，不能借此扩大。",target=True)
add("listAdvancedViews evaluateAdvancedView",OPS,["app.get('/api/v1/advanced-views'","const resultScope ="],
 [gate("viewVisibility",["owner","workspace","current_team"],"NOT_FOUND","owner或workspace/current team的saved view")],
 "evaluate结果按entity issue/project/session/initiative再缩到Session绑定；cost字段需显式currency及feature；supported layout/filter由DTO/domain校验。",target=True)
RULES["evaluateAdvancedView"]["predicates"] += [gate("viewResultScope",True,"NOT_FOUND","每类结果使用Session准确绑定"),gate("viewLayoutFilterSupported",True,"VIEW_FILTER_UNSUPPORTED","有效layout/filter与cost currency和feature")]
add("getInitiativeRollup getAutomationRun getUsageSummary streamA2ATaskEvents",OPS,["app.get('/api/v1/initiatives/:id/rollup'","app.get('/api/v1/automation-runs/:runId'","app.get('/api/v1/usage-summary'","app.get('/api/v1/a2a-bindings/:id/tasks/:taskId/events'"],
 [gate("legacyMembershipQueryVisible",True,"NOT_FOUND","当前handler查询仍按actor workspaceRole/admin或memberships；没有与列表一致的exact Agent source投影")],
 "真实领域差异已定位，不能把Human membership SQL当Agent通用支持；M0不广告这些未适配聚合。",target=True,domainDifference={"kind":"agent_list_vs_legacy_detail_scope","closure":"M0共享发现固定blocked/DOMAIN_QUERY_NOT_AGENT_ALIGNED，static核差异与缺MCP，产品验收验证不广告及允许既有精确列表；M4负责领域投影补齐，本轮不改变原API写授权"},discoveryBlocked="DOMAIN_QUERY_NOT_AGENT_ALIGNED",positiveActor="H",futureAdapter="M4")
add("listAutomationRuns",OPS,["app.get('/api/v1/automation-runs'"],
 [gate("automationRunSessionMatches",True,"NOT_FOUND","run.session_id=current exact Session且live")],
 "列表有精确Agent分支；getAutomationRun另记差异，不整体关闭列表。",target=True)
add("listLoops",OPS,["app.get('/api/v1/loops'"],
 [gate("loopVisibility",["workspace","owner","current_team"],"NOT_FOUND","loop workspace可见、当前actor拥有或Session Team，live Session")],
 "当前list可适配；run admission另列状态/模板/预算，不从enabled推可运行。",target=True)
add("runLoopNow",OPS,["const admissionAuthorization =","app.post('/api/v1/loops/:id/run'"],
 [gate("loopSameTeam",True,"FORBIDDEN","DB admission要求非null Team且等于Session Team及teamIds"),
  gate("loopTemplateActive",True,"RUN_TEMPLATE_INVALID","active AgentRunTemplate版本"),
  gate("loopAdmissionCapacity",True,"LOOP_RUN_LIMIT","loop state/budget/concurrency/overlap/occurrenceKey及template所需cap/scope")],
 "route automation:manage与DB work:write联合；state取交集acknowledged/executing/awaiting_input/awaiting_approval；无MCP入口，M4只补后续入口不以此阻断M0。",target=True,extraCaps=["work:write"],states=["acknowledged","executing","awaiting_input","awaiting_approval"],additionalSources=[["packages/db/src/stage4.ts","async function assertAdmissionAuthorization("],["packages/db/src/stage4.ts","export async function admitLoopRun("]],futureAdapter="M4")
add("getProjectHealthHistory createProjectHealthUpdate",OPS,["app.get('/api/v1/projects/:id/health'","assertExactAgentProjectBinding(agentHealthSession"],
 [gate("projectBinding",["work_item_project","session_project"],"RESOURCE_SCOPE_DENIED","准确所属Project或Session Project且live Team")],
 "read history work:read；Agent health source必须agent，work:write，If-Match；Human source另分支。",target=True)
RULES["createProjectHealthUpdate"]["predicates"] += [gate("healthSource","agent","FORBIDDEN","Agent不得提交human source"),gate("healthSourcesSameProject",True,"HEALTH_SOURCE_SCOPE_INVALID","有来源且source属于准确Project"),gate("healthPublishApproval",True,"APPROVAL_PAYLOAD_MISMATCH","publish=true需准确project.health.publish批准/hash",{"healthPublish":True})]
add("recordUsage",OPS,["Usage Agent must match the Agent Session","Usage Project must match the Agent Session resource"],
 [gate("usageSessionMatches",True,"RESOURCE_SCOPE_DENIED","只当前Session"),gate("usageAgentMatches",True,"RESOURCE_SCOPE_DENIED","body.agentId等于Session.agent_id"),
  gate("usageProjectMatches",True,"RESOURCE_SCOPE_DENIED","body.projectId等于Session.project或其work_item所属Project")],
 "领域要求work:read，route所需能力仍取联合；dedupeKey是持久事实去重，不能用外部agentId扩大身份。",target=True)
add("listTemplates",OPS,["app.get('/api/v1/templates'"],
 [gate("templatePinnedToRun",True,"NOT_FOUND","仅自己automation_run→loop→run_template_version的active模板")],
 "当前Agent已授权模板读取有精确SQL；不广告模板管理，缺MCP适配单列。",target=True)
WB="apps/api/src/workbench-runner.ts"
add("listAgentWorkbenchTurns claimWorkbenchTurn getWorkbenchAttemptCredential startWorkbenchAttempt getWorkbenchAttemptStatus settleWorkbenchAttempt",WB,
 ["const exactAgentSession =","const serviceToken ="],
 [gate("credentialMode","agent_session","FORBIDDEN","拒绝C Connection和installation；exactAgentSession读取当前E"),
  gate("runnerServiceAuthorized",True,"FORBIDDEN","还需真实x-workmesh-runner-token；不披露secret"),
  gate("workbenchAttemptOwn",True,"NOT_FOUND","turn/attempt准确当前Session和conversation")],
 "Runner内部REST，不向模型/普通MCP工具广告；缺Runner service配置是部署前提，不伪造Session资格。",target=True,adapterInternal=True)
for op in ["claimWorkbenchTurn","startWorkbenchAttempt"]:
 RULES[op]["states"]=["executing"];RULES[op]["predicates"].append(gate("runnerFenceCurrent",True,"RUNNER_FENCE_STALE","queued或当前claim/running attempt fence及conversation次序"))
RULES["getWorkbenchAttemptCredential"]["states"]=["executing"]
RULES["getWorkbenchAttemptCredential"]["predicates"] += [gate("runnerFenceCurrent",True,"RUNNER_FENCE_STALE","准确claimToken/fence"),gate("workbenchExecutable",True,"SESSION_STOPPED","state executing且current未settled turn，敏感model credential仅Runner")]
RULES["settleWorkbenchAttempt"]["states"]=["acknowledged","planning","executing","awaiting_input","awaiting_approval","blocked"]
RULES["settleWorkbenchAttempt"]["additionalSources"]=[["packages/domain/src/index.ts","export const authorizeAgentMutation ="],["apps/api/src/agent/guard.ts","export function assertAgentWrite("]]
RULES["settleWorkbenchAttempt"]["predicates"].append(gate("runnerFenceCurrent",True,"RUNNER_FENCE_STALE","当前running turn/attempt精确fence；domain普通write门禁仍在，不用route requireActive=false宣称terminal可settle"))
