# 发现、旧客户端和错误恢复的可复核说明

本文件解释现有savedplan的实现意图，状态为合同审阅提案，不是Accepted ADR或已实现API。平台savedplan原正文不变。具体DTO、兼容dispatcher和测试入口须在同模型/high平台独审中确认，之后才由Chief放行产品。本轮没有新增ADR或修改协议源码。

## 已有机制与精确差异

`createAgentCapabilityManifest` 在contracts/index.ts根据route-policy、feature和mcpPolicyBindings派生operations，`supported`目前表示feature启用；`eligibleByCapability`只表示live能力交集，不能证明领域角色、目标、状态或adapter已实现。API `registerClientProfileRoutes` 已读取精确Session与实时definition/Team能力，增强披露应加入Session kind和Delegation role/scope，不将历史snapshot当实时授权。

MCP `createWorkMeshMcpServer` 按mode及coordination注册；`publish_project_update`、`decide_completion_suggestion`仍注册但领域Human-only。Pi `createWorkMeshTools` 的手写子集目前只过滤supported和eligibleByCapability；Project/Issue及Milestone/relation写入在 `teamAccess` 或 `authorizeTeamMutation` 要求协调资格，E持work:write也不能成功。操作清单保留这种差异，不能因Runner源码含适配就计为E可用。

provider的route粗门禁为repo:write_branch；delivery.routes.ts对open_pull_request另检repo:open_pr和open_pr仓库context permission。增强发现按kind表达当前联合门禁，不移除粗门禁以暗中扩权。Loop另有模板能力交集、scope、Team授权、状态、budget、concurrency及overlap，不能以feature=true或automation:manage概括。

## 发现协商与字段边界

已定请求为 `GET /api/v1/agent-capabilities?discovery=qualified`。请求省略该参数时保留旧manifest根结构和现有profile语义，避免旧strict schema收到新增字段。显式增强请求通过Zod验证；未知参数值失败关闭，不静默降级。MCP和Pi内部客户端显式请求增强披露；旧 `workmesh://agent/capabilities` 默认响应保持旧结构。

增强返回以旧manifest为基础，另含 `discovery`。合同评审的字段责任如下，不能把下列描述误写为已经实现的schema：

| 信息组 | 明确责任 |
| --- | --- |
| 协商 | 回显qualified请求；profile仍走现行支持集，不引入隐式profile升级 |
| 精确身份 | actorId/sessionId沿旧字段；新增sessionKind、delegationRole、delegationScopeType、credentialMode，来源均为精确Session的live事实 |
| 操作与binding | operationId/policyId、原REST路径、tool/resource名称、变体(kind)、组成operationIds；注册不等于可发现 |
| 适配实现 | 具名SDK方法、真实MCP binding、Runner具名工具；缺少实现明确标未支持，不把SDK泛型T当响应schema验证 |
| 角色与状态 | 允许的C/E/H用途、凭据和Session kind，以及现行允许状态；provider变体和复合命令分别列前提 |
| 资格结果 | eligible、blocked、requires_target_check三态及机器可读原因；eligible只覆盖已知条件，不表示目标授权 |
| 尚须检查 | 目标scope、approval、lease、revision、幂等、feature等；无法在无目标发现阶段求值的前提显式保留 |
| 后续入口 | 未实现tool及后续批次；Stop/终态不能编造当前恢复能力 |

以下是供独审的具体增强DTO草案，作为现有计划的受控说明，不写入产品合同；审查批准之前不标Accepted。已有manifest根字段原样保留，仅增强响应多出discovery：

```ts
type QualifiedDiscovery = {
  request: 'qualified'
  identity: {
    sessionKind: 'execution' | 'coordination'
    delegationRole: 'executor' | 'reviewer' | 'researcher' | 'coordinator' | 'triager'
    delegationScopeType: 'work_item' | 'plan_step' | 'project' | 'automation' | 'team'
    credentialMode: 'agent_session' | 'coordination_connection' | 'installation_target'
  }
  bindings: Array<{
    bindingId: string
    kind: 'tool' | 'resource'
    name: string
    execution: 'api' | 'adapter_internal'
    operationIds: string[]
    variant: string | null
    registered: boolean
    discoverable: boolean
    deploymentSupported: boolean
    implementations: {
      source: 'checked_in'
      sdkMethods: string[]
      runnerTools: string[]
    }
    requirements: {
      actorKinds: Array<'human' | 'agent' | 'service'>
      sessionKinds: Array<'execution' | 'coordination'>
      credentialModes: Array<'agent_session' | 'coordination_connection' | 'installation_target'>
      delegationRoles: string[]
      sessionStates: string[]
      capabilities: string[]
      targetScope: boolean
      approval: boolean
      lease: boolean
      revision: 'none' | 'if_match'
      idempotency: 'none' | 'required'
    }
    eligibility: {
      status: 'eligible' | 'blocked' | 'requires_target_check'
      reasons: Array<'ROLE_REQUIRED' | 'CREDENTIAL_MODE_MISMATCH' | 'SESSION_STATE_BLOCKED'
        | 'CAPABILITY_MISSING' | 'FEATURE_DISABLED' | 'ADAPTER_NOT_IMPLEMENTED'
        | 'TARGET_CHECK_REQUIRED' | 'DOMAIN_DIFFERENCE_PENDING'>
    }
    compatibility: 'unchanged' | 'readonly_alias' | 'hidden_role_denial'
    followupBatch: 'M0' | 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | null
  }>
}
```

Zod对象使用strict；UUID及状态/角色/能力采用现行shared schema，bindingId和具名方法非空。execution=api时operationIds至少一项；prepare标adapter_internal且operationIds为空，不伪造REST命令，资格由已注册、本地校验和部署mode决定。无目标参数时reasons不携带资源ID、存在性或授权对象。registered记录代码中兼容callback是否存在，discoverable记录此请求的tools/list或resource名单结果；implementations只证明checked-in实现，不证明远端部署的Runner版本。domain差异未核到证据时固定blocked及DOMAIN_DIFFERENCE_PENDING。

增强schema必须与OpenAPI/Zod/SDK同一来源同步，旧响应投影测试验证没有额外字段泄漏。以上草案由独审检验是否与实际Session枚举及adapter内部例外一致，不借草案放宽任何调用门禁。

资格计算顺序是注册/适配存在→凭据与mode→角色/kind→现行状态→部署feature→能力交集→尚待目标检查。任何一项明确拒绝即blocked；目标条件尚未知为requires_target_check。错误profile、身份错配或manifest读取被拒绝时保留原错误，不用缓存结果继续授权。

`sessionActiveForOperation` 是现行coarse route predicate。queued仅manifest和ACK前提，不能先读context；stopping只既有专用Stop ACK和允许诊断；paused/terminal的manifest被现行门禁拒绝时不修改门禁来展示字段。未来终态结果确认沿M1精确归属C/install只读方案，本批不实现。

## 旧名称、resource和tool的兼容

SDK公开request handler将list与call处理分离；兼容表保留旧名称和原input schema。Human-only不进入Agent tools/list，旧客户端缓存名称直接call则验证输入并返回结构化FORBIDDEN，不进入Human命令。文档公告发现语义变化；不删除URI或让旧工具名落成无说明的unknown tool。

C只读、C读写、E精确Session及安装target用途分别过滤。只读部署不列写工具；缓存写工具call也明确拒绝。HTTP/stdio的混合凭据拒绝，不从失败的installation请求回落到静态Session；双客户端不共享可变执行Token。同Connection不代表同一执行Session。

现有resource的等价tool复用SDK方法、范围与返回，不能产生receipt或outbox。新增只读别名在operation-decisions.json逐项列出；已有list_session_activities/get_work_item/get_document_revision继续复用。resource读取、resources/list、resourceTemplates/list和仅tool读取均需验；分页nextCursor原样传递。

## 错误和401刷新

当前MCP `tool` 返回isError、text JSON与structuredContent.error，保留code/message/details/correlationId/currentRevision/safeNextAction。SDK `WorkMeshSdkError`还包含status和retry元数据，自动网络/429/5xx重试只在原身份和同key/body下执行，不盲重写冲突。

当前Runner `RunnerApi.request`在任意401后刷新并重发，`RunnerApiError`只保留status/code。保存计划明确取消这条401兜底：只有请求前本地已知尚未取得Token或expiresAt进入既有刷新窗口时，通过installation凭据刷新精确Session；刷新自身仍经服务器live授权。受保护调用收到401、FORBIDDEN、撤权、Stop或profile错误后，不刷新、不重发、不换身份。提前刷新失败终止本次调用，保留原结构化错误，不伪装目标命令已执行。

RunnerError需保全message/details/correlationId；token-refresh的失败也解析真实结构化envelope而非只写SESSION_TOKEN_REFRESH_FAILED。Pi的失败回包保留可读错误并允许仍被授权的读操作继续。started/failed活动无法写入时，原命令错误仍是主结果；不得用Activity异常掩盖撤权拒绝。计划发布的现有不写started特殊路径和Session完成intent保留。

## 操作身份与复合导入

普通写操作调用前由客户端生成并持久化显式key；SDK单次自动重试与重连恢复同逻辑调用保持key、正文、If-Match及trace。相同key异体由既有幂等账本拒绝；正文修改或同正文另一个新动作使用新逻辑身份。Pi复用exact Session、attempt、tool-call、operation的operationKey，不能仅按正文hash去重。

当前MCP协调写省略key时使用coordinationKey(toolName,payload)正文hash，旧客户端同正文再次调用会被视为同动作；它不具备“同正文另一新动作”的身份表达。保留旧省略key行为作为兼容限制并公告；新客户端必须显式传不同逻辑key以新建动作，同一key/body用于失响应恢复。不能把省略key的旧fallback冒称满足新动作验收，也不能静默换随机key导致旧重连重复写。代表验收分别测试显式key新动作和旧fallback限制。

`apply_project_import`沿现行normalized plan/contentHash及 `importKey`逐组成命令恢复，非整项单事务。读取Team/workflow→createProject→createProjectMilestone→createWorkItem→createWorkItemRelation全部列入复合binding；prepare只本地规范化，不假称调用listProjects。get_workmesh_context与resolve_identifier的组成读取另列。

同hash/plan重放恢复同mapping；过窗先核已有mapping，不能自动另建。现有导入没有独立的新import身份参数，同内容另起一个新import受现合同限制；保持这项原限制，不能把一般写新身份规则误实现为改变导入旧keys。

## 真实API/MCP conformance

现有conformance/cli.ts只使用reference-fixture的内存driver；这可以保留但不能证明HTTP服务链。新增mcp-coverage.conformance.test.ts运行真实本任务API/MCP及专用测试数据库，fixture管理后台Human凭据仅在测试准备进程内使用，不进入Agent、Pi、MCP tool参数或活动。

资源客户端用官方MCP Client调用initialize/listTools/listResources/listResourceTemplates/readResource；仅tool客户端禁用readResource，仅用tools/list与等价tool取得同前提。C只读、C读写和E各自独立客户端，安装target交接使用精确bridge，所有Secret留在测试进程。记录实际库、客户端和OS版本；不冒称Codex/OpenCode真实发行客户端或外部模型已验收。

真实Pi Runner启动后接入本机fake模型服务，抓取实际模型请求中tools schema及一次允许读/一次故意被拒动作后的继续读，证明不是仅模拟createWorkMeshTools。模型流与提供方协议用当前Runner配置支持的本机测试adapter，不作外部请求或外发。模型密钥仅fixture提供的本机假值；没有真实外部凭据时不向聊天索取。

新真实套件从普通单元发现中排除，单独test:integration入口显式include该文件、passWithNoTests=false，并由根必需集成脚本执行；RUN_INTEGRATION、专用含test数据库与API/MCP连通是硬前提，缺夹具应失败，不能skip计过。使用现有Windowsforks串行集成模式；服务在专用子进程用实际监听模式，避免NODE_ENV=test不监听。根集成完成后再运行E2E，避免共享构建目录并发。

九类验收的数据库事实、错误、客户端包与适配断言见verification。M1新增恢复能力不作为M0越界实现：Stop用现有SDK/REST stopAcknowledgement验证专用门禁仍可达，并明确MCP/Runner缺口。
