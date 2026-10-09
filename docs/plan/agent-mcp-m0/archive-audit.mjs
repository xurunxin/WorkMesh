// 仅生成本目录的结构化审阅材料；不修改产品、连接服务或调用领域命令。
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const directory = dirname(fileURLToPath(import.meta.url))
const root = resolve(directory, '../../..')
const originalHead = '00a5e34e48f4a099f7a85dbf8dd41c79d8ee2294'
const sourceHead = 'c768e1e3db297d8b91b53dd68b60e723a8a40e7d'
const remoteMain = 'add4340e9c52575c2fd9615b3b114ac9acd3e30e'
const cache = 'C:/Users/xurx/.tds/workspaces/DzkLDn6UW-IbfoTJzN9Ro/repo'
const startedAt = new Date().toISOString()
const git = (args, cwd = root) => execFileSync('git', args, { cwd, windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
const read = path => readFileSync(resolve(root, path), 'utf8')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const save = (path, value) => writeFileSync(resolve(directory, path), JSON.stringify(value, null, 2) + '\n', 'utf8')
const changedProduct = git(['diff', '--name-only', sourceHead, 'HEAD']).toString().split(/\r?\n/).filter(Boolean).filter(path => !path.startsWith('docs/plan/agent-mcp-m0/'))
if (changedProduct.length) throw Error('来源产品树变化，需重核: ' + changedProduct.join(','))
const old = JSON.parse(git(['show', originalHead + ':docs/plan/agent-mcp-m0/operation-decisions.json']))
const apiFiles = git(['ls-files', 'apps/api/src']).toString().split(/\r?\n/).filter(path => path.endsWith('.ts') && !/\.test\.ts$/.test(path))
const texts = new Map()
const objectIds = new Map()
const sourceText = path => { if (!texts.has(path)) texts.set(path, read(path)); return texts.get(path) }
const evidence = (path, needle, reason) => {
  const text = sourceText(path), offset = text.indexOf(needle)
  if (offset < 0) throw Error('证据锚点缺失: ' + path + ' ' + needle)
  return { path, line: text.slice(0, offset).split('\n').length, anchor: needle, reason,
    sourceHead, gitObjectId: objectIds.has(path) ? objectIds.get(path) : (objectIds.set(path, git(['rev-parse', sourceHead + ':' + path]).toString().trim()), objectIds.get(path)) }
}
const baseGate = evidence('apps/api/src/authz/authorize.ts', 'export async function authorizeRequest(', '现行认证、live grant、exact binding与scope门禁')
const stateGate = evidence('apps/api/src/authz/authorize.ts', 'export function sessionActiveForOperation(', '实际route状态规则；下游命令可更严格')
const active = ['acknowledged','planning','executing','awaiting_input','awaiting_approval','blocked']
const allStates = ['queued',...active,'paused','stopping','stale','completed','failed','canceled']
const roles = ['executor','reviewer','researcher','coordinator','triager']
const teamWrites = new Set(['createProject','updateProject','createWorkItem','updateWorkItem','createProjectMilestone','updateMilestone','deleteMilestone','createWorkItemRelation','deleteWorkItemRelation'])
const domainPending = new Set(['deleteProject','deleteWorkItem','getInitiativeRollup'])
const knownSessionWrites = new Set(['acknowledgeAgentSession','heartbeatAgentSession','transitionAgentSessionState','appendAgentActivity','publishAgentPlan','publishArtifact','requestApproval','completeAgentSession','failAgentSession','acknowledgeAgentSessionStop'])
const knownReads = new Set(['getServerInfo','getDeploymentFeatures','getAgentCapabilityManifest','getCurrentAgentConnectionIdentity','listTeams','listWorkflowStates','listProjects','getProject','listWorkItems','getWorkItem','listProjectMilestones','getMilestone','listWorkItemRelations','getAgentSession','getAgentSessionContext','getAgentPlan','listAgentActivities','listEvents','streamEvents'])
const commandNames = { acknowledgeAgentSession:'acknowledge', heartbeatAgentSession:'heartbeat', transitionAgentSessionState:'transitionState', appendAgentActivity:'appendActivity', publishAgentPlan:'publishPlan', publishArtifact:'publishArtifact', requestApproval:'requestApproval', completeAgentSession:'finishSessionInTransaction', failAgentSession:'finishSessionInTransaction', acknowledgeAgentSessionStop:'stopAck' }
const proposedAliases = Object.fromEntries(old.operations.filter(row => row.resourceToolAlias).map(row => [row.operationId, row.resourceToolAlias]))
const composite = {
  verify_connection: ['getAgentCapabilityManifest','getCurrentAgentConnectionIdentity','listTeams'],
  get_current_identity: ['getAgentCapabilityManifest','getCurrentAgentConnectionIdentity'],
  get_workmesh_context: ['getAgentCapabilityManifest','getCurrentAgentConnectionIdentity','listTeams','listWorkflowStates','getServerInfo','getDeploymentFeatures'],
  resolve_identifier: ['listTeams','listProjects','listWorkflowStates','listWorkItems','getWorkItem','listProjectMilestones'],
  apply_project_import: ['listTeams','listWorkflowStates','createProject','createProjectMilestone','createWorkItem','createWorkItemRelation'],
  prepare_project_import: [],
}
const currentBindings = new Map(old.operations.flatMap(row => row.mcpBindings.map(binding => [binding.name, { ...binding, operationId: row.operationId }])))
const mcpText = sourceText('apps/mcp/src/index.ts')
const bindingDecisions = [...currentBindings].map(([id, binding]) => {
  const name = id.split(':')[1], match = new RegExp("server\\.register(?:Tool|Resource)\\('" + name + "'").exec(mcpText)
  if (!match) throw Error('未找到注册: ' + id)
  const next = mcpText.indexOf('server.register', match.index + 1)
  const block = mcpText.slice(match.index, next < 0 ? undefined : next)
  const variant = name === 'open_pull_request' ? 'open_pull_request' : name === 'create_repository_commit' ? 'create_commit' : name === 'create_repository_branch' ? 'create_branch' : null
  const operationIds = composite[name] ?? [binding.operationId]
  const targetParam = /sourceSessionId/.test(block) ? 'sourceSessionId' : /fromSessionId/.test(block) ? 'fromSessionId' : /sessionId/.test(block) ? 'sessionId' : id.startsWith('resource:') && ['agent-session','session-context','session-plan','session-activity'].includes(name) ? 'id' : null
  const targetBridge = targetParam !== null && !['get_work_room','list_human_attention'].includes(name)
  const internal = name === 'prepare_project_import'
  const source = evidence('apps/mcp/src/index.ts', match[0], '当前注册和完整input schema/callback')
  const coordinationOnly = match.index >= mcpText.indexOf('function registerCoordinationTools(') && match.index < mcpText.indexOf('function registerMutations(')
  const installation = ['inspect_pending_handoff','reject_handoff'].includes(name)
  const writes = operationIds.some(op => old.operations.find(row => row.operationId === op)?.currentPolicy.idempotency === 'required')
  const projection = { execution: internal ? 'adapter_internal' : 'api', operationIds, variant,
    mode: writes ? ['read-write'] : ['read-only','read-write'],
    coordinationConfiguredRequired: coordinationOnly, identityBinding: installation ? 'installation_target' : targetBridge ? 'target_execution' : internal ? 'none' : 'current_session',
    targetParameter: targetBridge ? targetParam : null,
    unspecifiedTarget: targetBridge ? { status:'requires_target_check', reasons:['TARGET_CHECK_REQUIRED'], countedInAllowedOperations:false, needsConfiguredInstallationBridge:true } : null,
    advertisedRoleDenial: ['publish_project_update','decide_completion_suggestion'].includes(name) ? 'hidden_role_denial' : null,
    calls: '兼容调用保留原schema；mode/凭据/角色拒绝不进入下游命令' }
  return { bindingId:id, current:{ operationIds:[binding.operationId], registered:true, source, registrationConditions:{ coordination:coordinationOnly, readWriteOnly:match.index >= mcpText.indexOf('function registerMutations(') || (coordinationOnly && writes) }, inputSchemaSource:source },
    proposed:projection, branchVariants: name === 'resolve_identifier' ? {
      team:['listTeams'], workflow_state:['listTeams','listWorkflowStates'], project:['listTeams','listProjects'],
      work_item_uuid:['listTeams','getWorkItem'], work_item_key:['listTeams','listWorkItems'], milestone:['listTeams','listProjects','listProjectMilestones']
    } : null, testIds:['M0-BINDING-'+name,'M0-MODE-PROJECTION','M0-CONTEXT-PROJECTION'] }
})
for (const [op, name] of Object.entries(proposedAliases)) bindingDecisions.push({ bindingId:'tool:'+name, current:null, proposed:{execution:'api',operationIds:[op],variant:null,mode:['read-only','read-write'],identityBinding:op.includes('Session') || op === 'getAgentPlan' ? 'target_execution':'current_session',sourceResource: old.operations.find(row=>row.operationId===op).mcpBindings.find(b=>b.name.startsWith('resource:'))?.name ?? null},testIds:['M0-RESOURCE-TOOL-'+op] })
const handlerEvidence = row => {
  const path = row.rest.path.replace(/\{([^}]+)\}/g, ':$1')
  const method = row.rest.method.toLowerCase()
  const matches=[]
  for (const file of apiFiles) {
    const t = sourceText(file)
    const re = new RegExp("\\bapp\\."+method+"\\(\\s*(['\"\\x60])"+path.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&')+"\\1")
    const match = re.exec(t)
    if (match) matches.push(evidence(file, match[0], '精确REST注册；领域额外资格另列'))
  }
  return matches
}
const routeStates = op => op==='acknowledgeAgentSession' ? ['queued','stale','acknowledged'] : op==='getAgentCapabilityManifest' ? ['queued',...active] : op==='acknowledgeAgentSessionStop' ? ['stopping'] : op==='heartbeatAgentSession' ? allStates : active
const operations = old.operations.map(row => {
  const op=row.operationId, p=row.currentPolicy
  const correctedHuman = ['createComment','updateComment'].includes(op)
  const humanOnly = p.authentication==='human_session' || correctedHuman
  const internalCredential = ['public','bootstrap','provider_signature','installation_target'].includes(p.authentication)
  const proof=[baseGate,stateGate,evidence('packages/contracts/src/route-policy-bindings.ts', "operationId", 'checked-in REST全集；具体条目在bindingDeclaration中')]
  const declaration=sourceText('packages/contracts/src/route-policy-bindings.ts').split('\n').findIndex(line=>line.includes("'"+op+"'") || line.includes('"'+op+'"'))
  const openApiLine=sourceText('OPENAPI.yaml').split('\n').findIndex(line=>line.trim()==='operationId: '+op)
  proof[2]={...proof[2],line:declaration+1,anchor:op}
  const handlers=handlerEvidence(row); proof.push(...handlers)
  let verified=humanOnly || internalCredential || knownReads.has(op) || teamWrites.has(op) || knownSessionWrites.has(op) || op==='requestProviderAction'
  let allowedRoles=[...roles], deniedRoles=[], allowedKinds=['execution','coordination'], extraCapabilities=[], pending=[]
  if(teamWrites.has(op)) {
    allowedRoles=['coordinator']; allowedKinds=['coordination']
    proof.push(evidence('apps/api/src/commands.ts',"AND s.session_kind='coordination'",'teamAccess限定协调kind、coordinator/team scope、同Team、work:write'))
    pending.push('目标Team必须等于Session/Delegation Team；scope_type=team且scope_id相同')
  }
  if(op==='getCurrentAgentConnectionIdentity') proof.push(evidence('apps/api/src/agent-connections.ts',"request.actor?.authentication !== 'coordination_connection'",'普通E Bearer明确不满足Connection认证'))
  if(correctedHuman) proof.push(evidence('apps/api/src/server.ts', op==='createComment' ? 'app.post("/api/v1/work-items/:id/comments"' : 'app.patch("/api/v1/comments/:id"', '对应handler检查kind=human，否则RESOURCE_SCOPE_DENIED；拟校正policy声明'))
  if(commandNames[op]) {
    proof.push(evidence('apps/api/src/agent/commands.ts','export async function '+commandNames[op]+'(', '现行具体命令入口'))
    proof.push(evidence('apps/api/src/agent/guard.ts','export function assertAgentWrite(', '精确Session、live能力/资源和领域状态门禁'))
  }
  if(op==='publishAgentPlan') { deniedRoles=['reviewer']; allowedRoles=roles.filter(role=>role!=='reviewer'); proof.push(evidence('apps/api/src/agent/commands.ts','Reviewer sessions cannot publish implementation plans','reviewer明确FORBIDDEN')); pending.push('awaiting_approval须approvalId、action payload hash且当前批准可消费') }
  if(['completeAgentSession','failAgentSession'].includes(op)) {
    proof.push(evidence('apps/api/src/agent/commands.ts','sessionDelegation.role === "reviewer" ? "artifact:write" : "work:write"','reviewer完成/失败额外artifact:write，route work:write保留'))
    pending.push('reviewer需artifact:write与route work:write联合；complete须review_result消息及code_review artifact；required children completed')
  }
  if(op==='publishArtifact') {proof.push(evidence('apps/api/src/agent/commands.ts','Reviewer sessions may publish only a code_review artifact','reviewer非code_review拒绝'));pending.push('reviewer仅允许type=code_review')}
  if(['listDocuments','createDocument','getDocument','updateDocument','listDocumentHistory','getDocumentRevision','diffDocumentRevisions','restoreDocumentRevision'].includes(op)) {
    proof.push(evidence('apps/api/src/documents.ts','async function assertExactAgentOwner(', '同Team不足；需要精确work_item或project owner及live capability_scope'))
    pending.push('Document owner必须为当前Session准确work_item或其project；单纯Coordination Team scope不能替代owner绑定')
  }
  if(op==='publishStructuredReview') {
    allowedRoles=['reviewer'];deniedRoles=roles.filter(role=>role!=='reviewer')
    proof.push(evidence('apps/api/src/delivery/routes.ts',"delegation.role !== 'reviewer'", '独立reviewer且不等于PR producer；exact head及带provenance的code_review artifact'))
    pending.push('独立reviewer，不是PR producer；当前headSha与linked code_review artifact；repository context review权限')
  }
  if(op==='postWorkRoomMessage') {
    proof.push(evidence('apps/api/src/collaboration/routes.ts',"const reviewResult = intent === 'review_result'", 'review_result追加reviewer/artifact:write；普通message为work:write，route保持work:write'))
    pending.push('intent=review_result需要准确reviewer Session和artifact:write；普通intent保持work:write；Room lineage与exact recipient范围')
  }
  if(op==='requestProviderAction') {proof.push(evidence('apps/api/src/delivery/routes.ts',"body.kind === 'open_pull_request' ? 'repo:open_pr'",'provider kind额外能力与repository context permission'));pending.push('pinned context、work item、repository、path/branch、Lease及provider feature')}
  if(op==='runLoopNow') {
    proof.push(evidence('packages/db/src/stage4.ts','async function assertAdmissionAuthorization(', 'admission额外work:write与模板/Team状态前提'),evidence('packages/db/src/stage4.ts','export async function admitLoopRun(', 'scope/capability/template/state/budget/concurrency/overlap'))
    extraCapabilities=['work:write']; verified=false
    pending.push('route active states与DB admission states取交集；template live capabilities、scope、budget、concurrency、overlap')
  }
  if(domainPending.has(op)) verified=false
  const credentialModes = humanOnly ? ['human_session'] : p.authentication==='coordination_connection' ? ['coordination_connection'] : p.authentication==='human_or_coordination_connection' ? ['human_session','coordination_connection'] : p.authentication==='installation_target' ? ['installation_target'] : p.authentication==='public' ? ['public'] : p.authentication==='bootstrap' ? ['bootstrap'] : p.authentication==='provider_signature' ? ['provider_signature'] : p.authentication==='agent_session' ? ['agent_session','coordination_connection'] : ['human_session','agent_session','coordination_connection']
  const kinds= p.authentication==='coordination_connection' || p.authentication==='human_or_coordination_connection' ? ['coordination'] : allowedKinds
  const status=(role)=>{
    if(op==='getServerInfo') return {status:'eligible',reasons:[],eligible:true,purpose:'公开安全元数据；不授予Session权限'}
    if(humanOnly) return {status:'blocked',reasons:['HUMAN_ONLY'],eligible:false}
    if(role==='E' && !credentialModes.includes('agent_session')) return {status:'blocked',reasons:['CREDENTIAL_MODE_MISMATCH'],eligible:false}
    if(role==='C' && !credentialModes.includes('coordination_connection')) return {status:'blocked',reasons:['CREDENTIAL_MODE_MISMATCH'],eligible:false}
    if(internalCredential) return {status:'blocked',reasons:['INTERNAL_OPERATION'],eligible:false}
    if(role==='E' && !kinds.includes('execution')) return {status:'blocked',reasons:['ROLE_REQUIRED'],eligible:false}
    if(!verified) return {status:'blocked',reasons:['DOMAIN_DIFFERENCE_PENDING'],eligible:false}
    return {status:'requires_target_check',reasons:['LIVE_FACTS_REQUIRED',...(p.resourceResolverId==='none'?[]:['TARGET_CHECK_REQUIRED'])],eligible:false}
  }
  const currentMcpBindings=row.mcpBindings.map(binding=>({bindingId:binding.name,operationIds:[op],registered:binding.registered,registrationScope:'checked_in_callback；本次部署注册条件见bindingDecisions，非实时tools/list',source:binding.source}))
  const proposedMcpBindings=bindingDecisions.filter(b=>b.proposed.operationIds.includes(op)).map(b=>({bindingId:b.bindingId,variant:b.proposed.variant,execution:b.proposed.execution,operationIds:b.proposed.operationIds,identityBinding:b.proposed.identityBinding}))
  const negative=[{id:'M0-CREDENTIAL-'+op, file:'packages/contracts/src/client-profile-contract.test.ts',input:{operationId:op,credentialMode:credentialModes.includes('agent_session')?'installation_target':'agent_session'},expect:{status:'blocked',reason:humanOnly?'HUMAN_ONLY':'CREDENTIAL_MODE_MISMATCH'},executionStatus:'待产品测试'}]
  if(op==='getServerInfo') negative[0]={id:'M0-MISSING-ADAPTER-'+op,file:'apps/mcp/src/index.test.ts',input:{operationId:op,registered:false},expect:{status:'blocked',reason:'ADAPTER_NOT_IMPLEMENTED'},executionStatus:'待产品测试'}
  if(!verified) negative.push({id:'M0-PENDING-'+op,file:'packages/contracts/src/route-policy.test.ts',input:{operationId:op,domainEvidence:'unverified'},expect:{status:'blocked',reason:'DOMAIN_DIFFERENCE_PENDING'},executionStatus:'待产品测试'})
  if(teamWrites.has(op)) negative.push({id:'M0-E-TEAM-'+op,file:'apps/mcp/src/index.test.ts',input:{kind:'execution',role:'executor',capabilities:['work:write']},expect:{status:'blocked',reason:'ROLE_REQUIRED'},executionStatus:'待产品测试'})
  if(op==='publishAgentPlan') negative.push({id:'M0-REVIEWER-PLAN',file:'packages/conformance/src/mcp-coverage.conformance.test.ts',input:{kind:'execution',role:'reviewer',capabilities:['plan:write'],state:'executing'},expect:{status:'blocked',reason:'ROLE_REQUIRED',callError:'FORBIDDEN'},executionStatus:'待产品测试'})
  if(op==='getCurrentAgentConnectionIdentity') negative[0]={id:'M0-E-CONNECTION-IDENTITY',file:'packages/conformance/src/mcp-coverage.conformance.test.ts',input:{credentialMode:'agent_session',kind:'execution',state:'executing'},expect:{status:'blocked',reason:'CREDENTIAL_MODE_MISMATCH',callError:'UNAUTHENTICATED'},executionStatus:'待产品测试'}
  if(!internalCredential&&!humanOnly)negative.push({id:'M0-STATE-'+op,file:'packages/contracts/src/client-profile-contract.test.ts',input:{operationId:op,state:routeStates(op).includes('paused')?'revoked_credential':'paused'},expect:{status:'blocked',reason:routeStates(op).includes('paused')?'CREDENTIAL_MODE_MISMATCH':'SESSION_STATE_BLOCKED'},executionStatus:'待产品测试'})
  const variants = op==='requestProviderAction' ? [
    {variant:'create_branch',capabilitiesAll:['repo:write_branch'],contextPermission:'write_branch',pending:['pinned baseSha','branch pattern','Lease']},
    {variant:'create_commit',capabilitiesAll:['repo:write_branch'],contextPermission:'write_branch',pending:['created delivery branch','allowed_paths','expectedHeadSha','Lease']},
    {variant:'open_pull_request',capabilitiesAll:['repo:write_branch','repo:open_pr'],contextPermission:'open_pr',pending:['created delivery branch','pinned base/head branch','Lease']}
  ] : op==='publishArtifact' ? [{variant:'reviewer',allowedTypes:['code_review'],deniedOtherwise:'REVIEW_ARTIFACT_REQUIRED'}] : ['completeAgentSession','failAgentSession'].includes(op) ? [{variant:'reviewer',capabilitiesAll:[...new Set([...p.agent.capabilities,'artifact:write'])],completionEvidence:op==='completeAgentSession'?['review_result','code_review','required children completed']:[]}]:[]
  if(op==='requestProviderAction')negative.push({id:'M0-PROVIDER-OPEN-PR-CAPS',file:'apps/mcp/src/index.test.ts',input:{kind:'open_pull_request',capabilities:['repo:write_branch']},expect:{status:'blocked',reason:'CAPABILITY_MISSING'},executionStatus:'待产品测试'})
  if(op==='publishStructuredReview')negative.push({id:'M0-STRUCTURED-REVIEW-ROLE',file:'apps/mcp/src/index.test.ts',input:{role:'executor',capabilities:['artifact:write']},expect:{status:'blocked',reason:'ROLE_REQUIRED',callError:'REVIEWER_CONFLICT'},executionStatus:'待产品测试'})
  if(op==='postWorkRoomMessage')negative.push({id:'M0-REVIEW-RESULT-ROLE',file:'apps/mcp/src/index.test.ts',input:{role:'executor',intent:'review_result'},expect:{status:'blocked',reason:'ROLE_REQUIRED'},executionStatus:'待产品测试'})
  return {...row, classification: [...new Set([...row.classification, ...(!verified?['领域差异待核']:[])])],
    agentDiscoveryDecision:{C:status('C'),E:status('E'),H:{credentialMode:'human_session',allowedByRoute:p.actorKinds.includes('human')||correctedHuman,requirements:p.human,domainStatus:humanOnly?'现行Human门禁保留':'调用时沿现行领域规则，不授予Agent Human身份'},installation:{purpose:p.authentication==='installation_target'?'内部exact-target入口':'不能作为Session manifest身份',session:null,delegation:null,status:p.authentication==='installation_target'?'requires_target_check':'blocked'},liveEligibility:'本轮未求值；结构化规则不等于授权证明'},
    qualifications:{credentialModes,sessionKinds:humanOnly||internalCredential?[]:kinds,
      delegationRoles:{allowed:humanOnly||internalCredential?[]:allowedRoles,denied:deniedRoles,source:teamWrites.has(op)?'teamAccess':deniedRoles.length?'publishPlan':'route无role追加；未核domain则blocked'},
      scope:{typeRequired:teamWrites.has(op)?'team':null,route:p.agent.resourceScope,resolver:p.resourceResolverId,targetSessionBinding:p.agent.sessionBinding},
      states:{route: p.agent.requireActiveSession?routeStates(op):[], commandNewWrite:op==='acknowledgeAgentSession'?['queued','stale']:teamWrites.has(op)?['acknowledged','planning','executing']:p.agent.requireActiveSession?routeStates(op):[],acknowledgedAck:'仅same-key既有ACK重放入口，不允许新ACK动作',source:stateGate},
      capabilitiesAll:[...new Set([...p.agent.capabilities,...extraCapabilities])],feature:p.feature,
      targetChecks:[...(p.agent.resourceScope==='resolved_resource'?['目标live范围与存在性，跨Team NOT_FOUND']:[]),...(p.approval.required?['现行批准与payload fingerprint']:[]),...(p.lease.required?['现行Lease，非授权']:[]),...pending],
      revision:p.revision,idempotency:p.idempotency,domainAudit:verified?'已绑定具体门禁；仍需真实调用验证':'未核实，发现固定blocked/DOMAIN_DIFFERENCE_PENDING'},
    variants,currentMcpBindings,proposedMcpBindings,
    mcpBindings:currentMcpBindings,
    sdkNamedAdapters: [...row.sdkStaticEvidence.matchAll(/([A-Za-z][A-Za-z0-9]*):(\d+)/g)].map(match=>({method:match[1],source:'packages/agent-sdk/src/index.ts:'+match[2],sourceHead,implementation:'checked_in；不代表具备当前调用资格'})),
    notes: ['凭据允许集='+credentialModes.join(','),'Session kind='+kinds.join(','),'Delegation role允许='+allowedRoles.join(',')+'；拒绝='+deniedRoles.join(','),'route states='+routeStates(op).join(','),...pending,verified?'已知门禁已定位，调用时核live事实':'未核domain固定blocked；不以capability交集或已注册替代资格'],originalNotes:row.notes,
    sourceEvidence:proof,bindingDeclaration:{path:'packages/contracts/src/route-policy-bindings.ts',line:declaration+1},openApiDeclaration:{path:'OPENAPI.yaml',line:openApiLine+1},
    negativeTests:negative, verificationStatus:'待产品实现与真实调用；当前仅文档静态核验'}
})
const count=new Set(operations.map(row=>row.operationId)).size
if(count!==operations.length)throw Error('重复operation')
save('operation-decisions.json',{sourceHead,observedMainHead:remoteMain,originalArchiveHead:originalHead,planDocId:'WS-FdgmfTwloZE8hNXvAb',generatedAt:new Date().toISOString(),status:'待定向复审；没有产品通过结论',operationCount:count,completeness:'全集相等与逐项结构化决定分别核验',compositeBindings:composite,bindingDecisions,operations})
const md=['# M0逐操作受控决定','','当前原始policy、完整OpenAPI输入/返回、结构化凭据/角色/状态/variant、源码锚点与反例全部见 [operation-decisions.json](operation-decisions.json)。枚举blocked是确定的保守发现决定，不宣称对应领域入口已全面核清或可执行；pending项无静默默认允许。','','| operationId / REST | 分类 | C / E资格 | 当前 → 拟binding | 证据与反例 |','| --- | --- | --- | --- | --- |']
for(const row of operations)md.push('| `'+row.operationId+'`<br>`'+row.rest.method+' '+row.rest.path+'` | '+row.classification.join('；')+' | C='+row.agentDiscoveryDecision.C.status+':'+row.agentDiscoveryDecision.C.reasons.join(',')+'<br>E='+row.agentDiscoveryDecision.E.status+':'+row.agentDiscoveryDecision.E.reasons.join(',')+' | '+(row.currentMcpBindings.map(b=>b.bindingId).join('；')||'无')+' → '+(row.proposedMcpBindings.map(b=>b.bindingId).join('；')||'无；不广告缺适配')+' | '+row.sourceEvidence.map(e=>e.path+':'+e.line).join('<br>')+'<br>'+row.negativeTests.map(t=>t.id).join('<br>')+' |')
writeFileSync(resolve(directory,'operation-index.md'),md.join('\n')+'\n','utf8')
const originalSources=JSON.parse(git(['show',originalHead+':docs/plan/agent-mcp-m0/source-manifest.json']))
const sourcePaths=[...new Set([...originalSources.files.map(f=>f.path),...apiFiles,
  'apps/api/src/agent/guard.ts','packages/domain/src/index.ts','packages/domain/src/authorization.ts',
  '.github/workflows/ci.yml','scripts/ci-policy.test.mjs','scripts/validate-ci.mjs','scripts/require-integration-env.mjs',
  'packages/conformance/package.json','packages/conformance/tsconfig.json','apps/agent-runner/src/configured-model.ts','apps/agent-runner/package.json','apps/mcp/package.json','docs/adr/0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md'])]
const files=sourcePaths.map(path=>{
 const blob=git(['show',sourceHead+':'+path]),worktree=readFileSync(resolve(root,path))
 const normal=bytes=>bytes.toString('utf8').replaceAll('\r\n','\n')
 const currentMainBlob=git(['show',remoteMain+':'+path],cache)
 return {path,gitBlob:{objectId:git(['rev-parse',sourceHead+':'+path]).toString().trim(),bytes:blob.length,sha256:sha256(blob)},worktree:{bytes:worktree.length,sha256:sha256(worktree),crlf:(worktree.toString().match(/\r\n/g)??[]).length},mapping:blob.equals(worktree)?'字节相同':normal(blob)===normal(worktree)?'仅CRLF/LF转换':'其他差异：须复核',
 currentMain:{head:remoteMain,gitObjectId:git(['rev-parse',remoteMain+':'+path],cache).toString().trim(),bytes:currentMainBlob.length,sha256:sha256(currentMainBlob),equalsBase:blob.equals(currentMainBlob)}}
})
const changedMainPaths=git(['diff','--name-only',sourceHead,remoteMain],cache).toString().split(/\r?\n/).filter(Boolean)
save('source-manifest.json',{sourceHead,observedMainHead:remoteMain,observedAt:new Date().toISOString(),files,mainDelta:{allPaths:changedMainPaths,sourceChanges:files.filter(file=>!file.currentMain.equalsBase).map(file=>file.path),integration:'本轮仅文档，不混合或合并产品；编码前将实际已合main增量整合到候选并重核相关来源。操作全集与policy未变；通知config部署provider表达差异已记录，非Agent管理授权。'}})
save('generation.json',{startedAt,completedAt:new Date().toISOString(),sourceHead,observedMainHead:remoteMain,node:process.version,python:execFileSync('python',['--version'],{encoding:'utf8',windowsHide:true}).trim(),command:'node docs/plan/agent-mcp-m0/archive-audit.mjs',count,sourceFiles:files.length,readOnlyDomainEvaluation:true,productChecksRun:false,planDocId:'WS-FdgmfTwloZE8hNXvAb',planVersion:null,planBodySource:'本轮注入的完整authoritative saved copy；工具截断只比对前缀',planFiles:['savedplan.md','implementation.md'].map(path=>{const b=readFileSync(resolve(directory,path));return{path,bytes:b.length,sha256:sha256(b)}}),previousGeneration:'history/original-generation.json'})
console.log(JSON.stringify({operations:count,bindings:bindingDecisions.length,sourceFiles:files.length,blockedPending:operations.filter(row=>row.qualifications.domainAudit.startsWith('未核实')).length,noProductWrites:true}))
