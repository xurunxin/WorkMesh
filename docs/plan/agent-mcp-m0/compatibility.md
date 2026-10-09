# 发现、身份与兼容合同提案

本文按当前平台保存正文同步，供定向独审；没有新增产品schema或Accepted ADR。旧草案见 history/original-compatibility.md，原输入完整保全于原提交。以下两层DTO、目标bridge及CI接线是当前具体决定。

## API资格与adapter投影分工

请求仍为 GET /api/v1/agent-capabilities?discovery=qualified；省略discovery保持原strict manifest根结构和旧profile。未知discovery值、profile或认证错误失败关闭。qualified响应保留旧manifest字段，额外discovery只包含精确Session身份和逐operation/variant资格；旧supported、eligibleByCapability原含义不变。

API复用 createAgentCapabilityManifest，并由 registerClientProfileRoutes 查询live session_kind、delegation.role/scope_type、实际request.actor.authentication与definition/Team/Delegation能力交集。API没有MCP注册表、mode、transport或stdio部署上下文，不能返回registered、discoverable、tool/resource名单、Runner部署是否安装。checked-in绑定元数据不是该连接实际注册状态。

API草案的类型边界：

```ts
type Eligibility = {
  status: 'eligible' | 'blocked' | 'requires_target_check'
  reasons: string[]
  pendingChecks: string[]
}
type ApiQualifiedDiscovery = {
  request: 'qualified'
  identity: {
    actorId: string
    sessionId: string
    credentialMode: 'agent_session' | 'coordination_connection'
    sessionKind: 'execution' | 'coordination'
    delegationRole: 'executor' | 'reviewer' | 'researcher' | 'coordinator' | 'triager'
    delegationScopeType: 'work_item' | 'plan_step' | 'project' | 'automation' | 'team'
  }
  operations: Array<{
    operationId: string
    variant: string | null
    requirements: OperationRequirements
    eligibility: Eligibility
  }>
}
```

OperationRequirements来自共享operation决策表，包含认证、角色允许/拒绝、scope类型、现行state规则、feature、能力联合、目标范围、approval/Lease/If-Match/幂等前提。UUID、角色、scope、状态、能力使用现有contracts schema；双方新增对象strict校验。错误原因采用稳定代码，不包含未知目标存在性、隐藏资源ID或其他Team授权详情。本轮99条原待核规则均已核读，见domain-audit.md及domain-rules.json。未知domain只作为阻止编码的未完成审计，不是最终决定；六条真实差异分别写明双方谓词和M0闭合条件，不能用通用pending替代既有功能审计。

共享函数分为 deriveOperationEligibility(apiFacts, operationRules) 和 projectAdapterDiscovery(apiQualification, adapterInputs)。名称是拟新增函数，不冒称当前已实现。后者输入包括实际callback注册表、具名实现、mode、transport、coordination开关、已配置安装bridge、当前身份与可用目标资格。registered表示兼容callback存在；deploymentSupported表示此adapter部署具备实现和所需配置；discoverable表示本次list输出。三个字段及以下DTO只出现在adapter发现结果，不混入API qualified响应。

```ts
type AdapterIdentity =
  | {
      kind: 'exact_session'
      credentialMode: 'agent_session' | 'coordination_connection'
      qualification: ApiQualifiedDiscovery
    }
  | {
      kind: 'installation_target'
      session: null
      delegation: null
      manifest: null
      qualification: null
    }
type AdapterBinding = {
  bindingId: string
  name: string
  kind: 'tool' | 'resource'
  execution: 'api' | 'adapter_internal'
  operationIds: string[]
  variant: string | null
  registered: boolean
  deploymentSupported: boolean
  discoverable: boolean
  eligibility: Eligibility
  identityBinding: 'current_session' | 'current_coordination' | 'explicit_identity_variants' | 'installation_target' | 'none'
  identityVariants: IdentityVariant[]
}
```

API执行binding必须至少一个operationId；prepare_project_import为adapter_internal且operationIds=[]。复合binding按variant列每个实际前置读取与组成命令，任一已知拒绝均阻断；空内部组成不等于授权任何API操作。Runner只声明checked-in具名实现，不声称某远端Runner部署具备它。

投影先检验callback/实现与部署配置，再检验mode、凭据、角色/kind、状态、feature和能力，最后处理未知目标前提。明确拒绝为blocked；未指定目标但已实现安全bridge为requires_target_check。只读连接不列写工具，兼容cached call拒绝；条件入口描述必须明确需要准确Session ID和目标资格。任何条件入口都不进入当前身份eligible operation集合。

HTTP/stdio在同一prepareDiscovery流程创建请求内的manifest与投影；tools/list、resources/list、resourceTemplates/list和增强发现tool使用该派生规则。getWorkMeshContext接收该次投影与已读取manifest，不自行再次GET manifest并推导全API名单。allowedOperations是同投影中discoverable且eligible、identityVariant属于当前Session（current_session/current_coordination/self_execution）的API operationIds去重集合；条件bridge和blocked清单单列，不把adapter_internal的空集合塞进API名单。每次HTTP请求重新prepare，不跨连接共享缓存，分别发起list与context的两个请求不承诺事务快照；一致性测试固定服务端事实，比较同配置派生规则。

## 安装用途与C到目标E的单次Token bridge

installation_target是一次请求的认证用途，不由token字符串前缀或是否安装SDK猜测。现行HTTP动态连接把配置凭据作为coordinationToken使用，API允许其派生C；这是明确选择的Connection认证路径。纯installation bearer用于token交换/刷新及exact-target handoff等既有内部入口，API actor没有agentSessionId，不调用agent-capabilities，不填造Session或Delegation，不自动回落为Connection派生。

纯安装用途在adapter内部使用上述null联合，只列既有安装交接内部用途和已核实实现，不列Session模型工具；没有新增纯安装HTTP/stdio登录模式。inspect_pending_handoff、reject_handoff按现行installation_target授权目标检查；不是C/E通用管理入口。它们现有SDK使用installation Authorization bearer，不能用当前C manifest给它们算Session资格。

当前C manifest只描述当前C。带必填sessionId的E bridge工具没有目标时，仅在当前部署有安装bridge、callback实现和mode允许时条件发现，status=requires_target_check，reason=TARGET_CHECK_REQUIRED；没有目标直接call验证失败，allowedOperations不包含它。条件广告还要求静态domain规则已核实；任何新增未核规则会令受控静态门禁失败，不能用目标未知掩盖审计缺口。未配置bridge时blocked/ADAPTER_NOT_IMPLEMENTED。直接E只能绑定自身exact Session；传入其他ID保留服务端拒绝，不能悄悄兑换另一身份。

一次目标调用严格采用下列顺序：

1. 输入验证准确targetSessionId及业务正文/稳定key；mode先拒绝写入。
2. 使用既有installation凭据对该targetSessionId执行token/refresh；沿当前SDK request的refreshSessionId路径，API继续live核installation与准确Session绑定。
3. 将返回Token封在仅本次调用作用域的client；以Bearer获取qualified manifest，验证manifest.sessionId等于输入、sessionKind=execution。没有目标、refresh拒绝、manifest错误、kind或actor错配立即结束；不读C资格代替。
4. 对目标E自身role/state/capability/feature运行binding投影；reviewer publishPlan、E Team CRUD等已知拒绝被阻断；其他目标scope/approval/Lease/revision仍由API调用检查。
5. 以同一Token执行目标命令，不再次隐式refresh；授权可能在这两次请求间撤销，API仍拒绝。受保护401/403不再refresh、不换身份、不重发。并发两个目标各持自身client/Token，shared client不调用setSessionToken。

ACK使用queued精确manifest和现行ACK资格，不能先getContext；paused/stopping/terminal manifest拒绝原样返回，不为发现放宽。stale ACK和Stop ACK现有SDK/REST保持各自既有入口；qualified manifest不可取得的目标bridge不得宣称支持恢复；MCP/Runner新增清理与C/install终态确认留在M1，不能借普通manifest不可读取而扩权。

## 当前与拟修正binding、旧消费者

完整列表见operation-decisions.json的currentMcpBindings、proposedMcpBindings及bindingDecisions。当前prepare_project_import错误挂listProjects，拟绑定无REST的内部operation；verify_connection和get_current_identity分别补全实际组成。get_workmesh_context包含manifest、current identity、Teams、workflow、info/features；resolve_identifier按kind分列分支读取；apply_project_import含Team/workflow读取、Project/Milestone/WorkItem/relation写入。组成规则和单operation资格分别记录，不将当前单映射冒作全部组成。

Human-only publish_project_update、decide_completion_suggestion在Agent名单隐藏；保存原名/input schema的兼容dispatcher，旧cached call得到结构化FORBIDDEN，不落入领域命令。不删除旧resource URI，默认agent-capabilities resource仍返回旧manifest；增强只读发现tool返回adapter投影，其他等价读取tool复用同SDK方法/分页/范围。新metadata字段只经显式qualified协商，不泄漏给旧strict SDK。

getCurrentAgentConnectionIdentity要求实际coordination_connection和coordinationIdentity，普通E Bearer即blocked/CREDENTIAL_MODE_MISMATCH，调用仍返回现行UNAUTHENTICATED。publishAgentPlan明确拒绝reviewer，即blocked/ROLE_REQUIRED；非reviewer仍需plan:write、精确Session、允许状态、revision和当前批准前提。Project/WorkItem/Milestone/relation写需要teamAccess协调kind、coordinator、team scope、相同Team和work:write，E不因能力名而可用。deleteProject/deleteWorkItem已核commands.ts的teamAccess：当前C coordinator/team scope可按现有权限删除，E拒绝；两者没有当前MCP callback，不新增删除入口，不再标domain pending。

provider create_branch/create_commit是repo:write_branch与对应context权限；open_pull_request要求route repo:write_branch与domain repo:open_pr并有open_pr context权限，不能削掉route门禁。Loop保持admitLoopRun模板能力/scope/Team/state/budget/concurrency/overlap前提，缺具名工具仅adapter不支持；当前run admission已核清，route active与DB状态交集为acknowledged/executing/awaiting_input/awaiting_approval，automation:manage和work:write联合，M4实现不抢入。

## 错误、401与操作身份

MCP沿tool/errorToolResult/currentRevision保全code/message/details/correlationId/currentRevision/safeNextAction，SDK保全status/retry/trace。RunnerApiError补完整envelope；RunnerApi.request仅在请求前Token缺失或本地expiresAt进入当前刷新窗口时refresh；刷新本身也经live授权。任何受保护401或角色/撤权/Stop/profile拒绝之后，refresh与命令重发计数为零。活动失败不得覆盖原命令错误。

显式key在命令前持久化；传输重试和重连使用同key/body/If-Match/trace。正文改变或同正文另一新动作使用新逻辑key。旧协调工具省略key时沿coordinationKey正文hash，公告同正文会被视作同动作的旧限制；不随机化fallback。import沿normalized contentHash与importKey逐命令部分提交/恢复，非新整项事务；相同内容新import的现有限制不冒称满足新动作身份。

Human-only安装请求继续在Coordination解析前拒绝，拒绝账本按ADR0028。resource获取无业务receipt/outbox；合法Coordination派生和token使用记账另列，不能将其冒作读取零数据库变化。

## 真实conformance与Required CI

实际接线、命令和防漏接检查见 ci-integration.md，案例映射见 verification.md。本轮上述内容全部是待合同独审的具体方案，不是产品测试通过或blocking闭合证明。

## 实际输入和当前凭据的逐binding定案

verify_connection的inputSchema为空，callback三个SDK方法只读当前C：getAgentCapabilities、getCurrentAgentConnectionIdentity、listTeams；没有sessionId输入，无installation bridge要求。get_current_identity亦为空输入的当前C读取。claim_work_item输入只有workItemId/revision/requestedCapabilities/initialPrompt/contextSnapshotId/budget/idempotencyKey；先当前C claim，再取返回session.id/exchangeToken兑换新E，不能把返回id视作目标输入。HTTP/stdio把同一Connection凭据装入SDK coordinationToken与installationToken两个用途槽，exchangeClaimedSessionToken当前要求后者；这不是另一份外部Installation bridge配置。SDK只配置coordinationToken的自造client目前会在兑换前INSTALLATION_TOKEN_REQUIRED，必须区分该部署反例与正常MCP构造。API兑换仍核Connection/新Session准确Team、Agent、principal、nonce和live授权。

Session resource的{id}、list_session_activities/explanation/preview等读取各有两条独立变体。self_execution：当前E Token直接读取自身，id必须等于自身manifest.sessionId，无安装刷新。target_execution：当前C给准确目标E，当前部署需安装bridge，一次取得该E Token后读取其资格并执行；无目标只能条件披露，不能计为当前C可执行。create_child_session的真实输入是parentSessionId；offer/request handoff是fromSessionId/sourceSessionId。get_work_room及post_work_room_message只有sessionId分支可刷新；参数省略保留当前身份，recipientSessionId(s)只表示收件人。list_human_attention的sessionId为普通过滤，完全不触发刷新。

SDK rejectHandoff还存在sessionToken优先的当前分支：E会发当前Session Token，当前installation_target policy不满足该认证，不能因SDK分支存在就广告通用E拒绝能力。拟发现只保留已核准安装target分支，旧E cached call明确凭据拒绝，不扩权限。inspect_pending_handoff始终安装target用途。上述当前与拟身份分列，不修改已闭API/adapter与安装null身份合同。

Document：work_item owner精确为Session work_item；project owner为该work_item所属Project（范围仍含work_item），或无work_item时Session.project+project范围；同Team单独不足。Inbox：详情/ack/reply仅exact recipient/claimant Session；同actor另一Session拒绝；actor-target未领取列表只有有限元数据，claim原子领取open项，review_request回复还需reviewer/artifact:write和准确源收件资格。Lease：acquire绑定准确work_item或现行plan_step/parent current plan，后续heartbeat/renew/release必须当前持有Session；普通release仍受普通Session状态，force-release为Human。

实际领域差异仅六项：cancel/complete handoff的route含Agent而domain固定Human，M0发现按Human-only拒绝，保留领域权限；initiative rollup、automation run详情、usage summary和A2A event stream仍使用legacy membership查询，与Agent精确列表不同。后四项无MCP具名入口，M0固定不广告并验证准确列表正对照，M4补读投影；具体SQL、当前API谓词、拟发现原因和闭合条件见逐操作表，不能冒称这些API已修改为Human-only。

本轮静态检查还解析SDK request实际布尔条件并求值64组合：有自身E Token而无Connection时不安装刷新，C带准确目标且安装用途槽可用时才局部刷新；未知运算/字段失败关闭。Workbench settle的route非active标记仍受domain普通写状态交集，credential入口仅executing；不是新增终态权限。

当前C的Document资格还可由已知Session形态早判：派生C只有team scope、无work_item/project owner，因此固定RESOURCE_SCOPE_DENIED；E在提供准确owner前为requires_target_check，提供后沿三种owner谓词判定，不整体关闭既有读取。

直接E在initialize/list阶段尚无读取参数时，self_execution的准确自身id已由manifest确定，可披露自身读取；只有C target_execution无目标才是条件入口。实际调用缺必填id仍按旧schema拒绝，异id拒绝且不刷新。静态检查分别断言发现无参数允许与调用异id拒绝，不把输入必填误当所有发现都需安装bridge。

## 产品成果独审后的恢复补充

平台原三 High 及原候选字节引用见 `platform-recovery-review-original.md`。普通发现保持精确 Session 门禁；调用仅对既有 ACK/heartbeat 使用原准确 Token/明确刷新路径，不先读取 ordinary qualified。acknowledged 条件只允许回执重放；新 key 仍被原命令拒绝。只读写与 Human-only 早拒绝保持，不从被拒 manifest 降级普通工具。

安装交接按实际安装用途槽独立投影 null 身份，调用无需 C/E manifest。MCP reject 使用显式安装方法，SDK 原 Session 分支不变。目标 handoff、live grant 和 scope 仍由 REST 校验。无安装凭据的 E cached call 拒绝。此补充不改变冻结 savedplan 或历史方案证据，也不授予新权限。
