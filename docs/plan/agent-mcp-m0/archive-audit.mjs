// 仅生成本目录的审阅材料；不注册工具、不连接服务、不执行领域命令。
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { stripTypeScriptTypes } from 'node:module'
import { createHash } from 'node:crypto'

const directory = dirname(fileURLToPath(import.meta.url))
const root = resolve(directory, '../../..')
const main = 'c768e1e3db297d8b91b53dd68b60e723a8a40e7d'
const read = path => readFileSync(resolve(root, path), 'utf8')
const git = args => execFileSync('git', args, { cwd: root, windowsHide: true })
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const save = (path, value) => writeFileSync(resolve(directory, path), JSON.stringify(value, null, 2) + '\n', 'utf8')
const startedAt = new Date().toISOString()
if (git(['rev-parse', 'HEAD']).toString().trim() !== main) throw Error('生成只允许在记录的来源head执行')
const url = source => 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64')
const bindingsUrl = url(read('packages/contracts/src/route-policy-bindings.ts'))
const policyModule = await import(url(read('packages/contracts/src/route-policy.ts').replace("'./route-policy-bindings.js'", JSON.stringify(bindingsUrl))))
const contracts = read('packages/contracts/src/index.ts')
const featureDefinitions = [...contracts.slice(contracts.indexOf('export const featureDefinitions'), contracts.indexOf('export const releaseInfoResponseSchema')).matchAll(/key: '([^']+)', tier: '([^']+)'/g)]
const tiers = Object.fromEntries(featureDefinitions.map(match => [match[1], match[2]]))
const prefixes = [...contracts.slice(contracts.indexOf('const featureRoutePrefixes'), contracts.indexOf('export const featureForApiRoute')).matchAll(/\['([^']+)', '([^']+)'\]/g)].map(match => [match[1], match[2]])
const policies = policyModule.createRoutePolicyManifest(path => {
  const key = prefixes.find(([prefix]) => path.startsWith(prefix))?.[1]
  return key ? { key, tier: tiers[key] } : undefined
})
const parseOpenApi = "import yaml,json; d=yaml.safe_load(open('OPENAPI.yaml',encoding='utf8')); print(json.dumps([dict(operationId=o['operationId'],method=m.upper(),path=p,parameters=v.get('parameters',[])+o.get('parameters',[]),requestBody=o.get('requestBody'),responses=o.get('responses',{})) for p,v in d['paths'].items() for m,o in v.items() if m in ['get','post','put','patch','delete'] and 'operationId' in o],ensure_ascii=False))"
const openApi = JSON.parse(execFileSync('python', ['-c', parseOpenApi], { cwd: root, windowsHide: true, encoding: 'utf8' }))
const input = read('docs/plan/backend-agent-mcp-priority/operation-index.md')
const sourceRows = new Map(input.split('\n').filter(line => /^\| `[^`]+`<br>/.test(line)).map((line, index) => {
  const columns = line.trim().slice(1, -1).split(' | ').map(value => value.trim())
  return [columns[0].match(/`([^`]+)`/)[1], { columns, original: line.trim() }]
}))
const mcp = read('apps/mcp/src/index.ts')
const runner = read('apps/agent-runner/src/workmesh-tools.ts')
const registry = [...mcp.matchAll(/server\.register(Tool|Resource)\('([^']+)'/g)].map(match => ({ kind: match[1] === 'Tool' ? 'tool' : 'resource', name: match[2], line: mcp.slice(0, match.index).split('\n').length }))
const runnerBindings = [...runner.matchAll(/add\('([^']+)', '([^']+)'/g)].map(match => ({ name: match[1], operationId: match[2], line: runner.slice(0, match.index).split('\n').length }))
runnerBindings.push({ name: 'workmesh_complete_session', operationId: 'completeAgentSession', line: runner.slice(0, runner.indexOf("name: 'workmesh_complete_session'")).split('\n').length })
const planningWrites = new Set(['createProject','updateProject','createWorkItem','updateWorkItem','createProjectMilestone','updateMilestone','deleteMilestone','createWorkItemRelation','deleteWorkItemRelation'])
const internal = new Set(['listWorkbenchRunnerAssignments','listAgentWorkbenchTurns','claimWorkbenchTurn','getWorkbenchAttemptCredential','startWorkbenchAttempt','getWorkbenchAttemptStatus','settleWorkbenchAttempt','exchangeAgentSessionToken','refreshAgentSessionToken','redeemAgentConnection','redeemAgentEnrollment','live','ready','health','getInstallStatus','resetInstall','installWorkspace','login','receiveGitHubWebhook','getWorkMeshAgentWellKnown'])
const humanCorrection = new Set(['createComment','updateComment'])
const discrepancy = new Set([...humanCorrection, ...planningWrites, 'deleteProject','deleteWorkItem','requestProviderAction','runLoopNow','getInitiativeRollup'])
const aliases = { getServerInfo: 'get_server_info', getDeploymentFeatures: 'get_server_features', getAgentCapabilityManifest: 'get_agent_capabilities', getAgentSession: 'get_agent_session', getAgentSessionContext: 'get_session_context', getAgentPlan: 'get_session_plan', getWorkspaceGuidance: 'get_workspace_guidance', getTeamGuidance: 'get_team_guidance', getProjectGuidance: 'get_project_guidance', getRepositoryContext: 'get_repository_context' }
const cases = ['M0-DISCOVERY','M0-ROLE','M0-STATE','M0-IDEMPOTENCY','M0-REVISION','M0-TRANSACTION','M0-REPLAY','M0-CONCURRENCY','M0-RECOVERY']
const bindings = policyModule.mcpPolicyBindings
const operations = policies.map(policy => {
  const original = sourceRows.get(policy.operationId)
  const api = openApi.find(entry => entry.operationId === policy.operationId)
  if (!original || !api || api.method !== policy.method || api.path !== policy.path) throw Error('来源清单或路径差异: ' + policy.operationId)
  const human = policy.authentication === 'human_session' || humanCorrection.has(policy.operationId)
  const isInternal = internal.has(policy.operationId) || policy.actorKinds.includes('service')
  const classifications = [human ? 'Human保留' : isInternal ? 'adapter内部' : 'Agent可适配']
  if (policy.feature.key) classifications.push('部署可选')
  if (discrepancy.has(policy.operationId)) classifications.push('领域差异待核')
  const mcpBindings = Object.entries(bindings).filter(([, binding]) => binding.operationId === policy.operationId).map(([name]) => {
    const [kind, bindingName] = name.split(':')
    const registered = registry.find(entry => entry.name === bindingName && entry.kind === kind)
    return { name, registered: Boolean(registered), source: registered ? 'apps/mcp/src/index.ts:' + registered.line : null, roleDecision: human ? 'Agent不列出；保留旧schema调用返回FORBIDDEN' : isInternal ? '保留接入或执行器内部用途；不作为模型通用管理工具' : '按凭据、模式、真实角色和状态过滤；目标资格调用时再检查' }
  })
  let futureBatch = 'M0披露；现有适配回归'
  if (!mcpBindings.length && !aliases[policy.operationId] && !human && !isInternal) futureBatch = /provider|repository|pull-request|artifact-upload|delivery-artifact/.test(policy.path) ? 'M3' : /cycles|initiative|automation|loops|usage|templates|advanced-view|health/.test(policy.path) ? 'M4' : /agent-sessions|lease|approval/.test(policy.path) ? 'M1' : 'M2'
  if (policy.operationId === 'getInitiativeRollup') futureBatch = 'M4后端修复；M0明确Agent不支持'
  if (['acknowledgeAgentSessionStop','renewLease','releaseLease'].includes(policy.operationId)) futureBatch = 'M1专用清理与Lease补齐；M0保持既有SDK/REST'
  if (['createChildAgentSession','createReviewDelegation'].includes(policy.operationId)) futureBatch = 'M2子Session/reviewer；M0仅校正发现'
  const reasons = []
  if (humanCorrection.has(policy.operationId)) reasons.push('server.ts现行handler仅Human；policy声明含Agent需校正；不改变领域权限')
  if (planningWrites.has(policy.operationId)) reasons.push('commands.teamAccess或delivery.authorizeTeamMutation要求Team协调资格；E的work:write不足，不对Pi广告')
  if (['deleteProject','deleteWorkItem'].includes(policy.operationId)) reasons.push('#53称Coordination破坏动作拒绝；本轮未定位同名拒绝分支，列领域差异待核并先不广告，须服务端调用证据，不假定获准')
  if (policy.operationId === 'requestProviderAction') reasons.push('route要求repo:write_branch；domain open_pull_request还要求repo:open_pr；按kind表达联合要求，不移除现行门禁')
  if (policy.operationId === 'runLoopNow') reasons.push('automation:manage不是全部前提；admitLoopRun仍检查模板能力、Team授权、scope、状态、预算、并发及overlap；暂不补工具')
  if (policy.operationId === 'getInitiativeRollup') reasons.push('#53独审已定位Human membership过滤与Agent Session scope不一致；未修前不能声称Agent可用')
  if (!reasons.length) reasons.push('按现行声明和#53原始定位记录；静态入口存在不等于领域资格已通过，不在本轮执行产品调用')
  return { operationId: policy.operationId, rest: { method: policy.method, path: policy.path }, classification: classifications,
    currentPolicy: policy, agentDiscoveryDecision: { C: human || isInternal ? '不作为Agent通用工具发现' : 'requires_target_check；按Coordination/exact Session bridge适用性筛选', E: human || isInternal || planningWrites.has(policy.operationId) ? '不广告该角色的通用调用资格' : 'requires_target_check；仅精确委派范围', H: policy.actorKinds.includes('human') || humanCorrection.has(policy.operationId) ? '保留现行Human资格；不提供Human cookie给Agent' : '非通用Human调用；按现行认证合同', liveEligibility: '本轮未求值；不是授权证明' },
    mcpBindings, resourceToolAlias: aliases[policy.operationId] ?? null, runnerNamedAdapters: runnerBindings.filter(entry => entry.operationId === policy.operationId).map(entry => ({ ...entry, source: 'apps/agent-runner/src/workmesh-tools.ts:' + entry.line, eligible: '未运行；按角色与状态再次筛选' })),
    sdkStaticEvidence: original.columns[3], originalDecision: original.columns[4], prerequisites: policy.agent,
    notes: reasons, implementationBoundary: futureBatch, acceptanceCases: cases,
    applicability: Object.fromEntries(cases.map(caseId => {
      const mutation = policy.method !== 'GET' && policy.idempotency === 'required'
      if (caseId === 'M0-IDEMPOTENCY' && !mutation) return [caseId, { status: '不适用新增写幂等', reason: '本operation为读取/现行无写key；仅检查无新业务事实' }]
      if (caseId === 'M0-REVISION' && policy.revision !== 'if_match') return [caseId, { status: '不适用If-Match', reason: '现行operation没有revision要求，不人为添加写门禁' }]
      if (caseId === 'M0-TRANSACTION') return [caseId, { status: mutation ? '代表既有下游写运行' : '读取身份解析静态及代表运行', reason: mutation ? 'M0没有新command；代表写注入失败验证原错误和回滚，非277条各新增事务测试' : '无新command事务；区分Coordination派生、Human-only早拒绝和独立拒绝审计' }]
      return [caseId, { status: '逐条静态映射＋代表链运行', reason: human ? 'Human保留资格不扩张；验证拒绝/兼容及原消费者合同，不新增Agent适配' : isInternal ? '内部用途不作为模型工具；验证必要接入合同及不误广告' : '静态全集必验；现有binding/只读alias纳入M0真实代表链；缺适配项只披露后续归属' }]
    })),
    verificationStatus: '待产品实现与真实调用；当前仅文档静态核验',
    source: { head: main, approvedIndex: 'docs/plan/backend-agent-mcp-priority/operation-index.md', originalRow: original.original, routePolicy: 'packages/contracts/src/route-policy.ts', api: 'OPENAPI.yaml' }, openApiContract: api }
})
const sets = [policies, openApi, [...sourceRows.keys()].map(operationId => ({ operationId }))].map(entries => new Set(entries.map(entry => entry.operationId)))
if (sets.some(set => set.size !== operations.length || operations.some(entry => !set.has(entry.operationId)))) throw Error('全集集合不同或有重复')
const composite = { apply_project_import: ['listTeams','listWorkflowStates','createProject','createProjectMilestone','createWorkItem','createWorkItemRelation'], prepare_project_import: [], get_workmesh_context: ['getAgentCapabilityManifest','getCurrentAgentConnectionIdentity','listTeams','listWorkflowStates','getServerInfo','getDeploymentFeatures'], resolve_identifier: ['listTeams','listProjects','listWorkflowStates','listWorkItems','getWorkItem','listProjectMilestones'] }
save('operation-decisions.json', { sourceHead: main, generatedAt: new Date().toISOString(), status: '可审静态决策；非产品验收', operationCount: operations.length, completeness: 'OpenAPI、route-policy、#53索引双向集合一致', compositeBindings: composite, operations })
const md = ['# M0逐操作决策索引', '', '基准、生成来源及验证边界见 [sources.md](sources.md)。完整参数、返回、原始索引行、具名实现和逐操作决策见 [operation-decisions.json](operation-decisions.json)。以下没有产品运行通过结论。', '', '| operationId / REST | 分类 | C / E发现决定 | MCP / Runner | 归属 / 例外 |', '| --- | --- | --- | --- | --- |']
for (const operation of operations) md.push('| `' + operation.operationId + '`<br>`' + operation.rest.method + ' ' + operation.rest.path + '` | ' + operation.classification.join('；') + ' | ' + operation.agentDiscoveryDecision.C + '<br>' + operation.agentDiscoveryDecision.E + ' | ' + (operation.mcpBindings.map(binding => '`' + binding.name + '`').join('<br>') || '无现有binding') + '<br>Runner：' + (operation.runnerNamedAdapters.map(adapter => '`' + adapter.name + '`').join('；') || '无具名工具；bootstrap内部读取另见合同') + ' | ' + operation.implementationBoundary + '<br>' + operation.notes.join('；') + ' |')
writeFileSync(resolve(directory, 'operation-index.md'), md.join('\n') + '\n', 'utf8')
const sourcePaths = ['AGENTS.md','CONTEXT.md','AGENT_PROTOCOL.md','OPENAPI.yaml','SCHEMA.sql','package.json','pnpm-lock.yaml','vitest.config.ts','vitest.integration.config.ts','scripts/ci-policy.mjs','packages/contracts/src/index.ts','packages/contracts/src/route-policy.ts','packages/contracts/src/route-policy-bindings.ts','apps/api/src/client-profile.ts','apps/api/src/authz/authorize.ts','apps/api/src/server.ts','apps/api/src/commands.ts','apps/api/src/delivery/routes.ts','apps/api/src/operations/routes.ts','packages/db/src/stage4.ts','apps/mcp/src/index.ts','apps/mcp/src/http.ts','apps/mcp/src/stdio.ts','apps/mcp/src/coordination-product.ts','packages/agent-sdk/src/index.ts','apps/agent-runner/src/workmesh-tools.ts','apps/agent-runner/src/run-session.ts','packages/conformance/src/drivers.ts','packages/conformance/src/cli.ts','packages/conformance/src/reference-fixture.ts', ...['README','batches-and-acceptance','branch-separation','coverage-matrix','operation-index','review','sources'].map(name => 'docs/plan/backend-agent-mcp-priority/' + name + '.md'), ...['0012-mcp-domain-boundary','0028-declarative-route-policy-and-event-audience','0042-agent-client-profile-and-derived-capability-manifest','0067-governed-pi-workmesh-tools','0068-atomic-workbench-turn-session-completion'].map(name => 'docs/adr/' + name + '.md'), ...[...read('SCHEMA.sql').matchAll(/^\\ir (.+)$/gm)].map(match => match[1].trim())]
const evidence = sourcePaths.map(path => {
  const blob = git(['show', main + ':' + path])
  const worktree = readFileSync(resolve(root, path))
  const lf = bytes => bytes.toString('utf8').replaceAll('\r\n', '\n')
  return { path, gitBlob: { bytes: blob.length, sha256: sha256(blob), objectId: git(['rev-parse', main + ':' + path]).toString().trim() }, worktree: { bytes: worktree.length, sha256: sha256(worktree), crlf: (worktree.toString('utf8').match(/\r\n/g) ?? []).length }, mapping: blob.equals(worktree) ? '字节相同' : lf(blob) === lf(worktree) ? '仅CRLF/LF转换' : '其他差异：须复核' }
})
save('source-manifest.json', { sourceHead: main, observedAt: new Date().toISOString(), files: evidence })
save('generation.json', { startedAt, completedAt: new Date().toISOString(), sourceHead: main, node: process.version, python: execFileSync('python',['--version'],{encoding:'utf8',windowsHide:true}).trim(), pyyaml: execFileSync('python',['-c','import yaml; print(yaml.__version__)'],{encoding:'utf8',windowsHide:true}).trim(), readOnlyDomainEvaluation: true, sourceProvenance: 'node.stripTypeScriptTypes执行现行纯route-policy派生；PyYAML完整解析OpenAPI；#53表逐行保留', command: 'node docs/plan/agent-mcp-m0/archive-audit.mjs', count: operations.length, planDocId: 'K7ASX6igBDq85SckGcuui', planVersion: null, planBodySource: '本轮用户消息注入的authoritative saved copy；与todos截断前缀相符，不声称工具全文读回', planFiles: ['savedplan.md','implementation.md'].map(path => ({ path, bytes: statSync(resolve(directory,path)).size, sha256: sha256(readFileSync(resolve(directory,path))), filesystemWriteObservedAt: statSync(resolve(directory,path)).mtime.toISOString() })) })
console.log(JSON.stringify({ operations: operations.length, sourceFiles: evidence.length, noProductWrites: true, completedAt: new Date().toISOString() }))
