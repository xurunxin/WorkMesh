"""本轮初始一次性生成记录；后续受控细化见Git差异。复核使用archive-audit/check，不重跑本脚本。"""
from pathlib import Path
import json
import hashlib
from datetime import datetime, timezone

directory = Path(__file__).resolve().parent
def write(name, body):
    target = directory / name
    assert target.resolve().is_relative_to(directory.resolve())
    target.write_text(body.rstrip() + "\n", encoding="utf-8", newline="\n")

write("compatibility.md", r'''# 发现、身份与兼容合同提案

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

OperationRequirements来自共享operation决策表，包含认证、角色允许/拒绝、scope类型、现行state规则、feature、能力联合、目标范围、approval/Lease/If-Match/幂等前提。UUID、角色、scope、状态、能力使用现有contracts schema；双方新增对象strict校验。错误原因采用稳定代码，不包含未知目标存在性、隐藏资源ID或其他Team授权详情。未知domain规则固定blocked/DOMAIN_DIFFERENCE_PENDING；不能把未核实自动变成requires_target_check。

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
  identityBinding: 'current_session' | 'target_execution' | 'installation_target' | 'none'
}
```

API执行binding必须至少一个operationId；prepare_project_import为adapter_internal且operationIds=[]。复合binding按variant列每个实际前置读取与组成命令，任一已知拒绝均阻断；空内部组成不等于授权任何API操作。Runner只声明checked-in具名实现，不声称某远端Runner部署具备它。

投影先检验callback/实现与部署配置，再检验mode、凭据、角色/kind、状态、feature和能力，最后处理未知目标前提。明确拒绝为blocked；未指定目标但已实现安全bridge为requires_target_check。只读连接不列写工具，兼容cached call拒绝；条件入口描述必须明确需要准确Session ID和目标资格。任何条件入口都不进入当前身份eligible operation集合。

HTTP/stdio在同一prepareDiscovery流程创建请求内的manifest与投影；tools/list、resources/list、resourceTemplates/list和增强发现tool使用该派生规则。getWorkMeshContext接收该次投影与已读取manifest，不自行再次GET manifest并推导全API名单。allowedOperations是同投影中discoverable且eligible、identityBinding=current_session的API operationIds去重集合；条件bridge和blocked清单单列，不把adapter_internal的空集合塞进API名单。每次HTTP请求重新prepare，不跨连接共享缓存，分别发起list与context的两个请求不承诺事务快照；一致性测试固定服务端事实，比较同配置派生规则。

## 安装用途与C到目标E的单次Token bridge

installation_target是一次请求的认证用途，不由token字符串前缀或是否安装SDK猜测。现行HTTP动态连接把配置凭据作为coordinationToken使用，API允许其派生C；这是明确选择的Connection认证路径。纯installation bearer用于token交换/刷新及exact-target handoff等既有内部入口，API actor没有agentSessionId，不调用agent-capabilities，不填造Session或Delegation，不自动回落为Connection派生。

纯安装用途在adapter内部使用上述null联合，只列既有安装交接内部用途和已核实实现，不列Session模型工具；没有新增纯安装HTTP/stdio登录模式。inspect_pending_handoff、reject_handoff按现行installation_target授权目标检查；不是C/E通用管理入口。它们现有SDK使用installation Authorization bearer，不能用当前C manifest给它们算Session资格。

当前C manifest只描述当前C。带必填sessionId的E bridge工具没有目标时，仅在当前部署有安装bridge、callback实现和mode允许时条件发现，status=requires_target_check，reason=TARGET_CHECK_REQUIRED；没有目标直接call验证失败，allowedOperations不包含它。未配置bridge时blocked/ADAPTER_NOT_IMPLEMENTED。直接E只能绑定自身exact Session；传入其他ID保留服务端拒绝，不能悄悄兑换另一身份。

一次目标调用严格采用下列顺序：

1. 输入验证准确targetSessionId及业务正文/稳定key；mode先拒绝写入。
2. 使用既有installation凭据对该targetSessionId执行token/refresh；沿当前SDK request的refreshSessionId路径，API继续live核installation与准确Session绑定。
3. 将返回Token封在仅本次调用作用域的client；以Bearer获取qualified manifest，验证manifest.sessionId等于输入、sessionKind=execution。没有目标、refresh拒绝、manifest错误、kind或actor错配立即结束；不读C资格代替。
4. 对目标E自身role/state/capability/feature运行binding投影；reviewer publishPlan、E Team CRUD等已知拒绝被阻断；其他目标scope/approval/Lease/revision仍由API调用检查。
5. 以同一Token执行目标命令，不再次隐式refresh；授权可能在这两次请求间撤销，API仍拒绝。受保护401/403不再refresh、不换身份、不重发。并发两个目标各持自身client/Token，shared client不调用setSessionToken。

ACK使用queued精确manifest和现行ACK资格，不能先getContext；paused/stopping/terminal manifest拒绝原样返回，不为发现放宽。Stop ACK现有SDK/REST保持专用入口；MCP/Runner新增清理与C/install终态确认留在M1，不能借普通manifest不可读取而扩权。

## 当前与拟修正binding、旧消费者

完整列表见operation-decisions.json的currentMcpBindings、proposedMcpBindings及bindingDecisions。当前prepare_project_import错误挂listProjects，拟绑定无REST的内部operation；verify_connection和get_current_identity分别补全实际组成。get_workmesh_context包含manifest、current identity、Teams、workflow、info/features；resolve_identifier按kind分列分支读取；apply_project_import含Team/workflow读取、Project/Milestone/WorkItem/relation写入。组成规则和单operation资格分别记录，不将当前单映射冒作全部组成。

Human-only publish_project_update、decide_completion_suggestion在Agent名单隐藏；保存原名/input schema的兼容dispatcher，旧cached call得到结构化FORBIDDEN，不落入领域命令。不删除旧resource URI，默认agent-capabilities resource仍返回旧manifest；增强只读发现tool返回adapter投影，其他等价读取tool复用同SDK方法/分页/范围。新metadata字段只经显式qualified协商，不泄漏给旧strict SDK。

getCurrentAgentConnectionIdentity要求实际coordination_connection和coordinationIdentity，普通E Bearer即blocked/CREDENTIAL_MODE_MISMATCH，调用仍返回现行UNAUTHENTICATED。publishAgentPlan明确拒绝reviewer，即blocked/ROLE_REQUIRED；非reviewer仍需plan:write、精确Session、允许状态、revision和当前批准前提。Project/WorkItem/Milestone/relation写需要teamAccess协调kind、coordinator、team scope、相同Team和work:write，E不因能力名而可用。删除Project/WorkItem的#53文字与当前实现存在未核清差异，固定blocked/DOMAIN_DIFFERENCE_PENDING，先不广告，不新增领域拒绝/授予。

provider create_branch/create_commit是repo:write_branch与对应context权限；open_pull_request要求route repo:write_branch与domain repo:open_pr并有open_pr context权限，不能削掉route门禁。Loop保持admitLoopRun模板能力/scope/Team/state/budget/concurrency/overlap前提，缺工具或未核规则blocked，M4实现不抢入。

## 错误、401与操作身份

MCP沿tool/errorToolResult/currentRevision保全code/message/details/correlationId/currentRevision/safeNextAction，SDK保全status/retry/trace。RunnerApiError补完整envelope；RunnerApi.request仅在请求前Token缺失或本地expiresAt进入当前刷新窗口时refresh；刷新本身也经live授权。任何受保护401或角色/撤权/Stop/profile拒绝之后，refresh与命令重发计数为零。活动失败不得覆盖原命令错误。

显式key在命令前持久化；传输重试和重连使用同key/body/If-Match/trace。正文改变或同正文另一新动作使用新逻辑key。旧协调工具省略key时沿coordinationKey正文hash，公告同正文会被视作同动作的旧限制；不随机化fallback。import沿normalized contentHash与importKey逐命令部分提交/恢复，非新整项事务；相同内容新import的现有限制不冒称满足新动作身份。

Human-only安装请求继续在Coordination解析前拒绝，拒绝账本按ADR0028。resource获取无业务receipt/outbox；合法Coordination派生和token使用记账另列，不能将其冒作读取零数据库变化。

## 真实conformance与Required CI

实际接线、命令和防漏接检查见 ci-integration.md，案例映射见 verification.md。本轮上述内容全部是待合同独审的具体方案，不是产品测试通过或blocking闭合证明。
''')

write("ci-integration.md", r'''# 真实MCP套件的必需CI接线

本文件为产品实施后的确定接线，当前不修改CI、不启动服务。现行来源：.github/workflows/ci.yml的api-integration job、scripts/ci-policy.mjs的classifyChanges/evaluateResults、scripts/validate-ci.mjs的jobSections与根脚本断言。agent-smoke现有conformance CLI使用reference-fixture内存driver，保留但不能替代真实链。

## 必需入口与选择

根package.json新增test:conformance:integration：
node scripts/require-integration-env.mjs && pnpm --filter @workmesh/db test:reset && pnpm --filter @workmesh/conformance test:integration

根test:integration依次执行db、api、test:conformance:integration、worker、recovery。包conformance的test:integration为vitest run --config vitest.integration.config.ts；新配置仅include src/mcp-coverage.conformance.test.ts，passWithNoTests=false，forks、maxWorkers=1、fileParallelism=false。普通vitest配置exclude该文件，避免单元运行偷跑真实服务。conformance rootDir=src，fixture放src，不跨包直接import API/Runner源码；通过子进程实际入口启动。包新增官方MCP Client测试依赖，并在锁文件记录，版本取当前仓库已有SDK。

CI在现有api-integration job的Run API integration步骤之后新增Run real MCP coverage，运行：
set -o pipefail
pnpm test:conformance:integration 2>&1 | tee ci-logs/mcp-coverage/execution.log

ci-logs/mcp-coverage预先创建；不设置continue-on-error、不用环境缺失skip。套件零测试、fixture缺失、ready超时或进程异常均非零退出，进入api-integration失败，再由既有required-ci/evaluateResults阻断。前置API集成失败时新步骤不会被冒作通过。

classifyChanges把mcp、agent-sdk、agent-runner、conformance加入api-integration选择集，保留api、worker和full规则。contracts沿依赖传播影响这些包；脚本或workflow改动仍沿现行full。ci-policy.test.mjs分别验证四包的单文件变动会必选job，以及选中job失败、取消、意外skip均不能被Required CI接纳。

validate-ci.mjs同步根脚本精确断言，核包脚本→配置→准确include→非空要求，以及workflow步骤位于API集成之后、pipefail、无continue-on-error和证据目录上传。防漏接验证在本任务隔离副本分别删除workflow调用、移除根串接、清空include或令fixture失败，validator或真实命令必须非零；不在主工作树篡改门禁。

## 服务准备与隔离

复用api-integration现有Postgres、Redis、固定RustFS及bucket准备。它已设置RUN_INTEGRATION、含test数据库、随机bootstrap派生、SESSION_SECRET、32字节主密钥、Runner service token和S3配置。串行结束原API测试，再reset该job专属test库；本机运行使用本任务专属test库，绝不reset共享或生产数据库。fixture先用真实连接确认DB迁移/reset已完成、Redis可用、HeadBucket成功；不能把端口存在当ready。

fixture登记run ID、数据库、S3前缀、所有子进程PID/入口/端口及状态目录。动态分配且绑定loopback端口；启动API实际server监听入口时NODE_ENV=development，单元仍test；启动只读和读写MCP两服务。HTTP等待API/MCP readyz，stdio通过真实initialize响应判就绪，fake模型健康检查后才启动Pi Runner。Secret只进子进程环境/fixture内存，准备Human cookie不进入Agent/MCP/Pi。

模型夹具使用当前configured-model支持的本机兼容协议，响应有效流式tool-call并记录模型请求tools；不得只调用createWorkMeshTools替代Pi。真实fixture从预授权、配对兑换到Connection取证，使用真实REST进行准备，所有外部URL为本机fake provider，不真实外发。

## 执行、失败与证据

真实套件创建官方MCP Client的HTTP/stdio连接；资源客户端测试initialize、tools/resources/templates list及readResource；仅tool客户端不使用readResource。C同身份两个mode、直接E及安装/目标bridge分别测试；Pi独立E Session只收到实际具资格工具。错误、Token目标、数据库事实、幂等receipt/event/outbox、durable cursor和重启后恢复按verification映射断言。

fixture在finally保全脱敏stdout/stderr、JSON/JUnit/transcript、模型实收tools schema、请求/错误及数据库事实摘要，记录runtime、skip、首败、准确源码head/blob与工作树换行。执行日志和各组件日志落入ci-logs/mcp-coverage/；原api-integration的always Upload raw API logs覆盖ci-logs，if-no-files-found=error，沿现有artifact名称与保留策略。失败日志不能被后续成功覆盖。

服务启动/运行/清理失败均保留原首败；仅终止登记且仍匹配的己有子进程、清闲置专属状态目录/S3前缀，不停止job提供的共享服务，不global prune。CI服务生命周期沿job结束回收；本机精确清理按spec，已拒目标不重试或绕行。artifact存在只证明文件上传；RequiredCI验收另核该命令真实运行、测试数非零和全部适用用例，无产品证据预填。
''')

write("README.md", r'''# M0受控方案与定向复审入口

本目录属于原todo [#54](todo:pMO6s_SmEL_d81kjKm6S1)，本轮仅按既有授权同步文档，不进入产品。平台当前计划doc:WS-FdgmfTwloZE8hNXvAb已经存在；不再次edit_plan，不创建新计划。提交后停confirm，四项blocking必须由另一Agent定向复审闭合，Chief确认后才进入产品；文档提交不是整卡完成或产品放行。

1. [savedplan.md](savedplan.md) 与 [implementation.md](implementation.md)：本轮注入的完整当前平台计划，正文不增加头尾，字节相同。
2. [spec.md](spec.md) 与 [steering.md](steering.md)：完整当前spec和原授权/审查/本轮同步指令；历史输入未改写。
3. [compatibility.md](compatibility.md)：API资格/adapter名单分工、installation用途、C到E单次Token资格、旧schema兼容与Runner401合同提案。
4. [operation-index.md](operation-index.md)、[operation-decisions.json](operation-decisions.json)：实际operation全集、结构化C/E/H/installation决定、当前与拟binding、variant和逐操作反例。
5. [verification.md](verification.md)、[ci-integration.md](ci-integration.md)：九类DoD、真实客户端与现有api-integration Required job的完整接线。
6. [sources.md](sources.md)、[source-manifest.json](source-manifest.json)、[archive-metadata.json](archive-metadata.json)、[generation.json](generation.json)：精确base、最新main增量、doc引用、真实生成时序和Git/工作树字节。
7. [review.md](review.md)、[sync-check-receipt.json](sync-check-receipt.json)、[archive-byte-manifest.json](archive-byte-manifest.json)：本轮实际静态核验及提交绑定，不冒产品/CI通过。
8. [history/original-manifest.json](history/original-manifest.json)：原00a5提交21文件完整可达性及逐blob指纹；旧正文、截断读回、版本null、回执/草案另存history，原首败 [first-byte-check-failure.md](first-byte-check-failure.md) 保持原字节。

JSON和核验脚本仍按现行CI真实分类，不修改CI/属性豁免，不因docs路径冒称prose绿色。受控文档同步之外无产品源码、API、迁移、事件、权限或Web UI变更。当前worktree、恢复目录和原证据保留；实际提交head在最终交付报告，不预填自身SHA。
''')

# 元数据来自已实读conversation；不声称后端doc全文或平台版本字段。
old = json.loads((directory/"history/original-archive-metadata.json").read_text(encoding="utf8"))
metadata = dict(old)
metadata.update(currentDocId="WS-FdgmfTwloZE8hNXvAb", currentVersion=None, platformDocCreatedAt=None,
 savedPlanMessageAt="2026-10-09T05:05:49Z", feedbackMessageAt="2026-10-09T05:06:33Z",
 originalArchiveHead="00a5e34e48f4a099f7a85dbf8dd41c79d8ee2294",
 observedMainHead="add4340e9c52575c2fd9615b3b114ac9acd3e30e",
 syncStartedAt=datetime.now(timezone.utc).isoformat(), editPlanCalled=False,
 planSource="本轮注入的当前authoritative saved copy；工具只比对截断前缀",
 newPlanCreated=False, originalHistory="history/original-manifest.json",
 scope="同分支仅方案资料；独审阻断未由本代理宣告闭合")
write("archive-metadata.json",json.dumps(metadata,ensure_ascii=False,indent=2))
print(json.dumps({"结果":"受控说明已同步","产品文件修改":False},ensure_ascii=False))
