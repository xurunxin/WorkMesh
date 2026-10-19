import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// 仅隔离函数测量；没有真实凭据、数据库、HTTP或产品验收结论。
assert.equal(process.version, 'v22.19.0')
assert.equal(process.arch, 'arm64')
const executableSha256 = createHash('sha256').update(readFileSync(process.execPath)).digest('hex')
assert.equal(executableSha256, 'da2abd2c48f19561e35478d51583b068ab410f888a09f363bd131ab611392cb7')
const root = path.resolve(process.argv[2])
const require = createRequire(path.join(root, 'package.json'))
const began = performance.now()
const contractsEntry = require.resolve('@workmesh/contracts')
const { createAgentCapabilityManifest, qualifyAgentCapabilityManifest, featureKeySchema } = await import(pathToFileURL(contractsEntry))
const importMilliseconds = performance.now() - began
// 与受测guest脚本相同的显式feature覆盖，其余取同源默认值。
const featureOverrides = { WORKMESH_BETA_COORDINATION_MCP: 'true', WORKMESH_BETA_GITEA: 'true' }
// 与loadFeatureConfig对这两个合法字符串输入的结果等价，未添加角色包之外的依赖。
const features = Object.fromEntries(featureKeySchema.options.map(key => [key, featureOverrides[key] === 'true']))
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const input = {
  actorId: id(1), sessionId: id(2), sessionState: 'executing', sessionRevision: 1,
  effectiveCapabilities: ['work:read'],
  capabilityScope: { workspaceId: id(3), teamIds: [id(4)], projectIds: [], workItemIds: [],
    repositoryIds: [], capabilities: ['work:read'] },
  supportedProtocols: ['mcp'], pushConfigured: false, features,
}
const facts = { identity: { actorId: id(1), sessionId: id(2), credentialMode: 'coordination_connection',
  sessionKind: 'coordination', delegationRole: 'coordinator', delegationScopeType: 'team' },
features, workItemId: null, projectId: null }
const measure = operation => {
  const start = performance.now(), cpu = process.cpuUsage()
  const value = operation()
  return { value, timing: { elapsedMilliseconds: performance.now() - start, cpu: process.cpuUsage(cpu) } }
}
const runs = []
for (let iteration = 0; iteration < 3; iteration++) {
  const manifest = measure(() => createAgentCapabilityManifest(input))
  const qualified = measure(() => qualifyAgentCapabilityManifest(manifest.value, facts))
  const serialized = measure(() => JSON.stringify(qualified.value))
  assert.deepEqual(qualified.value.agent.effectiveCapabilities, ['work:read'])
  assert.equal(qualified.value.discovery.identity.delegationRole, 'coordinator')
  runs.push({ iteration, manifest: manifest.timing, qualified: qualified.timing, serialize: serialized.timing,
    bytes: Buffer.byteLength(serialized.value), operationCount: qualified.value.discovery.operations.length,
    responseSha256: createHash('sha256').update(serialized.value).digest('hex') })
}
console.log(JSON.stringify({ mode: 'api-manifest-pure-cost', fullProductAcceptance: false,
  executableSha256, importMilliseconds, runs, features, featureOverrides,
  inputFacts: { capabilities: input.effectiveCapabilities, supportedProtocols: input.supportedProtocols,
    sessionState: input.sessionState, sessionRevision: 1, identity: facts.identity,
    substituteUuids: true, exactReceivedGuestResponse: false },
  databaseQueries: 0, httpRequests: 0, authenticationExecuted: false }))
