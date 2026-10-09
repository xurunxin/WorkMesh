import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { parse } from 'yaml'
import { routePolicyManifest } from '../packages/contracts/src/index.js'

const root = resolve(import.meta.dirname, '..')
const directory = resolve(root, 'docs/plan/agent-mcp-m1')
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')
type PlanOperation = { operationId: string; proposed: Record<string, unknown>; nineClassApplicability: Record<string, string> }
const frozen = JSON.parse(source('docs/plan/agent-mcp-m1/operation-decisions.json')) as { operations: PlanOperation[] }
const openapi = parse(source('OPENAPI.yaml')) as { paths: Record<string, Record<string, Record<string, unknown>>>; components: Record<string, unknown> }
const sdk = source('packages/agent-sdk/src/index.ts')
const mcp = source('apps/mcp/src/index.ts') + source('apps/mcp/src/discovery.ts')
const runner = source('apps/agent-runner/src/workmesh-tools.ts')
const covered = new Set(['listAgentSessions', 'getAgentSession', 'getAgentSessionContext', 'listAgentPlanVersions', 'listApprovals', 'getApproval',
  'listLeases', 'heartbeatLease', 'renewLease', 'releaseLease', 'listRecoveryItems', 'getRecoveryItem', 'completeAgentSession',
  'acknowledgeAgentSessionStop', 'publishAgentPlan', 'requestApproval', 'consumeApproval', 'acquireLease', 'getAgentSessionExecutionResult'])
const human = new Set(['signalAgentSession', 'retryAgentSession', 'decideApproval', 'forceReleaseLease', 'queueWorkbenchTurn', 'followupWorkbenchTurn', 'promptAgentSession'])
const internal = new Set(['settleWorkbenchAttempt', 'listWorkbenchRunnerAssignments', 'listAgentWorkbenchTurns', 'claimWorkbenchTurn',
  'getWorkbenchAttemptCredential', 'startWorkbenchAttempt', 'getWorkbenchAttemptStatus', 'exchangeAgentSessionToken', 'refreshAgentSessionToken'])
const rows = frozen.operations.map(operation => {
  const policy = routePolicyManifest.find(value => value.operationId === operation.operationId)
  if (!policy) throw new Error(`Missing actual route policy: ${operation.operationId}`)
  const transport = openapi.paths[policy.path]?.[policy.method.toLowerCase()]
  if (transport?.operationId !== operation.operationId) throw new Error(`Missing actual OpenAPI binding: ${operation.operationId}`)
  const sdkName = String(operation.proposed.sdk)
  const mcpName = String(operation.proposed.mcp)
  const runnerName = String(operation.proposed.runner)
  const declared = {
    sdk: /^[A-Za-z]+$/.test(sdkName) ? new RegExp(`\\b${sdkName}(?:<[^\\n]*>)?\\(`).test(sdk) : null,
    mcp: /^[a-z_]+$/.test(mcpName) ? mcp.includes(`"${mcpName}"`) || mcp.includes(`'${mcpName}'`) : null,
    runner: /^workmesh_[a-z_]+$/.test(runnerName) ? runner.includes(runnerName) : null,
  }
  if (Object.values(declared).includes(false)) throw new Error(`Adapter symbol missing: ${operation.operationId} ${JSON.stringify(declared)}`)
  const evidence = covered.has(operation.operationId)
    ? ['packages/conformance/src/execution-recovery.conformance.test.ts', 'packages/agent-sdk/src/execution-adapters.test.ts', 'apps/mcp/src/execution-adapters.test.ts']
    : internal.has(operation.operationId) ? ['apps/api/integration/workbench-runner.integration.test.ts', 'packages/conformance/src/execution-recovery.conformance.test.ts']
    : human.has(operation.operationId) ? ['apps/api/integration/stage1.integration.test.ts', 'apps/api/integration/stage2-collaboration.integration.test.ts', 'apps/api/integration/execution-waits.integration.test.ts']
    : ['apps/api/integration/stage1.integration.test.ts', 'apps/api/integration/stage2-collaboration.integration.test.ts', 'packages/conformance/src/mcp-coverage.conformance.test.ts']
  return { operationId: operation.operationId, rest: { method: policy.method, path: policy.path },
    transport, policy, adapters: { sdk: sdkName, mcp: mcpName, runner: runnerName, declared },
    controlledDomainRules: operation.proposed.domainRules, controlledAuthorization: operation.proposed.authorization,
    nineClassApplicability: operation.nineClassApplicability,
    evidence: { files: evidence, run: 'integration-stable / unit-reservation-fixed；原日志及输入指纹见 product-evidence/check-index.json',
      kind: covered.has(operation.operationId) ? 'M1 真实客户端代表路径与适配单元；不冒每个 role/state/scope 笛卡尔积均实测'
        : human.has(operation.operationId) ? '保留原 Human 路径，REST 回归与等待/控制代表场景；不新授 Agent 权限'
        : internal.has(operation.operationId) ? '受控 Runner 实际生命周期与 API 回归；不交模型控制或安装凭据'
        : '既有 REST/M0 回归；不冒本批逐操作独立的全门禁测试',
      gateCoverage: '按 product-closure-matrix.md 的具名实际场景判断；本文件的源码存在与合同对齐不是运行通过证据' } }
})
if (rows.length !== 43 || new Set(rows.map(row => row.operationId)).size !== 43) throw new Error('M1 operation inventory changed')
writeFileSync(resolve(directory, 'product-operation-matrix.json'), JSON.stringify({
  scope: '本卡43操作产品映射；不覆盖UI/F/TA新域，不以工具数量计验收',
  source: { openapiSha256: createHash('sha256').update(readFileSync(resolve(root, 'OPENAPI.yaml'))).digest('hex'),
    schema: '当前 OPENAPI components 原件随本文件保存，$ref 使用同一快照',
    policy: '从当前 routePolicyManifest 实际执行生成，GET 新身份仍由受限查询 helper 实核 live 门禁' },
  components: openapi.components, operations: rows,
}, null, 2) + '\n')
const lines = ['# M1 产品逐操作映射', '',
  '43 条均绑定当前 REST/Zod/policy 与具名消费者。参数、响应、角色/状态/capability/scope/feature、批准/Lease/If-Match/key 的精确结构见 [JSON](product-operation-matrix.json)；该 JSON 保存当前 OpenAPI components，不能拿规划快照冒当前合同。', '',
  '普通读取与写入沿现行 active E 门禁；GET 确認由受限 C/安装或 Human 身份重验原事务来源。Human 控制、批准决定和 force release 保留。Runner 模型不持安装凭据，stopAck/确认、wait settlement/monitor/claim 为受控生命周期。HTTP MCP 不跨请求缓存 E；停止后 C 不能 refresh E 来 stopAck。', '',
  '| operationId / REST | SDK / MCP / Runner | 证据范围 |', '| --- | --- | --- |']
for (const row of rows) lines.push(`| ${row.operationId}<br>${row.rest.method} ${row.rest.path} | ${row.adapters.sdk}<br>${row.adapters.mcp}<br>${row.adapters.runner} | ${row.evidence.kind} |`)
lines.push('', '等待合同增加的 sessionWait、executionWaits opt-in、continuation 引用是相关既有 operation 的字段增量。默认不开自动等待生产，旧消费者不领取续 Turn；Worker 部署开关只启用已授权能力，不授予权限。结果确认、等待恢复以及零写入统计各自分开，见 [九类矩阵](product-closure-matrix.md)。')
writeFileSync(resolve(directory, 'product-operation-matrix.md'), lines.join('\n') + '\n')
console.log(JSON.stringify({ operations: rows.length, binding: 'current OpenAPI + executed routePolicyManifest', runtimeClaim: false }))
