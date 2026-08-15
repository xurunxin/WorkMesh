import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const controlRoot = resolve('G:/Projects/MetronX/WorkMesh')
const sourceRoot = resolve('G:/Projects/MetronX/WorkMesh-human-experience-v30')
const exclusions = new Set(['.git', 'node_modules', '.next', 'dist', 'coverage', 'reports', '.turbo', '.cache', '.tmp'])
const sha256 = value => createHash('sha256').update(value).digest('hex')
const fileSha256 = path => sha256(readFileSync(path))
const rel = (root, path) => relative(root, path).split(sep).join('/')

function walk(root, excluded = new Set()) {
  const files = []
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && excluded.has(entry.name)) continue
      if (entry.isFile() && entry.name.endsWith('.log')) continue
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile()) files.push({ absolute, path: rel(root, absolute) })
    }
  }
  visit(root)
  return files.sort((a, b) => a.path.localeCompare(b.path, 'en'))
}

function snapshot(root, filter, excluded = new Set()) {
  const files = walk(root, excluded).filter(filter).map(file => ({ ...file, sha256: fileSha256(file.absolute) }))
  return {
    fileCount: files.length,
    canonicalSha256: sha256(files.map(file => `${file.path}\t${file.sha256}\n`).join('')),
    files,
  }
}

const source = snapshot(sourceRoot, () => true, exclusions)
const build = snapshot(sourceRoot, file => /^apps\/web\/\.next\/(server|static)\//.test(file.path) || file.path === 'apps/web/.next/BUILD_ID', new Set(['.git', 'node_modules']))
const chunks = build.files.filter(file => /^apps\/web\/\.next\/static\/chunks\/.*\.js$/.test(file.path))
const countNeedle = needle => chunks.filter(file => readFileSync(file.absolute).includes(Buffer.from(needle))).length
const contractPath = join(controlRoot, 'artifacts/design/dogfood-v31-mcp-onboarding-contract.json')
const baselinePath = join(controlRoot, 'artifacts/runtime/dogfood-v31-gen11-baseline.json')
const contract = JSON.parse(readFileSync(contractPath, 'utf8'))
const targetChecks = contract.writeTargets.map(target => ({
  ...target,
  exists: existsSync(join(sourceRoot, target.path)),
}))
const expectedAbsentAdds = new Set([
  'apps/web/app/lib/mcp-onboarding.ts',
  'apps/web/app/lib/mcp-onboarding.test.ts',
  'apps/web/e2e/mcp-onboarding.spec.ts',
])
const fixedInputs = {
  graph: fileSha256(join(controlRoot, 'docs/workgraphs/workmesh-human-agent-experience-dogfood-v31-mcp-onboarding.yaml')),
  state: fileSha256(join(controlRoot, 'docs/workgraphs/executions/workmesh-human-agent-experience-dogfood-run-031.yaml')),
  events: fileSha256(join(controlRoot, 'docs/workgraphs/executions/workmesh-human-agent-experience-dogfood-run-031.events.jsonl')),
  baseline: fileSha256(baselinePath),
  contract: fileSha256(contractPath),
}
const packagePaths = ['package.json', 'pnpm-lock.yaml', 'apps/web/package.json', 'apps/mcp/package.json', 'packages/contracts/package.json', 'packages/ui/package.json']
const packageHashes = Object.fromEntries(packagePaths.map(path => [path, fileSha256(join(sourceRoot, path))]))
const sourceText = {
  wellKnown: readFileSync(join(sourceRoot, 'apps/api/src/agent-connections.ts'), 'utf8'),
  contracts: readFileSync(join(sourceRoot, 'packages/contracts/src/index.ts'), 'utf8'),
  mcp: readFileSync(join(sourceRoot, 'apps/mcp/src/index.ts'), 'utf8'),
  diagnostics: readFileSync(join(sourceRoot, 'apps/web/app/lib/connection-diagnostics.ts'), 'utf8'),
}
const assertions = {
  graphExact: fixedInputs.graph === 'de2513a81bc48c1d99d862953b71f424cdd4a26534cbb99103dcc56264fa6b67',
  baselineExact: fixedInputs.baseline === '320c19247117ebac8ea5ab3ad904034be010e49dd50f3a66385259b0376ba8dd',
  contractExact: fixedInputs.contract === '108294489b0d4e2977d1bf3ccfcf9ca10a66138ac131b545112e0d9d97bd4b7b',
  sourceExact: source.fileCount === 580 && source.canonicalSha256 === '15445387c5cff0e70a66940608b1dbbbc8ac6ae4b84a22eaf2a614fa78051f2d',
  buildExact: build.fileCount === 118 && build.canonicalSha256 === '9ec68786ed724b27052a06b4107ac33489daa12f3db56ad91fa43fbea0246231' && readFileSync(join(sourceRoot, 'apps/web/.next/BUILD_ID'), 'utf8').trim() === 'V-SFnsKVQ5xpM6FrzLW5l',
  originExact: countNeedle('http://127.0.0.1:34601') === 5 && countNeedle('http://127.0.0.1:3301') === 0 && countNeedle('http://localhost:3001') === 0,
  packageExact: packageHashes['package.json'] === '63867ac84160a992340381db9407c540f4fcb7d2aaaefb8f1f451c597603caf6' && packageHashes['pnpm-lock.yaml'] === 'c1617d9c0e4ae23cb11d3d84db4682bbb8c1f9b7368bca1a7a2bb6e932b6a6e2' && packageHashes['apps/web/package.json'] === '4451a5443267b46dcf2b675c4e23584a76cc2e50ecfea5aba873ddd2fe7a7598' && packageHashes['apps/mcp/package.json'] === '0e983adcc2b3e9767387a5f99acc6f5a5ea661059ac83415df12b4239b3255c6' && packageHashes['packages/contracts/package.json'] === '1fbc71fa9a23ebbd037e9df7d4fb0d64edbf7d6d72313cad02476186f231fb98' && packageHashes['packages/ui/package.json'] === '3aa6b0d695a953108a1a0beabd19968bbf0b9bf11a8dadc3fcac85ec673986a6',
  targetsExact: targetChecks.length === 15 && targetChecks.every(target => expectedAbsentAdds.has(target.path) ? !target.exists && target.decision === 'add' : target.exists),
  clientTypesExact: sourceText.contracts.includes("['codex', 'opencode', 'pi', 'generic_mcp'] as const"),
  discoveryExact: sourceText.wellKnown.includes("app.get('/.well-known/workmesh-agent'") && sourceText.wellKnown.includes("supportedClients: ['codex', 'opencode', 'pi', 'generic_mcp']") && sourceText.wellKnown.includes('mcpUrl: mcpUrl(webOrigin)') && sourceText.wellKnown.includes('skill,'),
  releaseProfileAvailable: sourceText.contracts.includes("preferredClientProfileVersion: '1.0'") && sourceText.contracts.includes("{ method: 'GET', path: '/api/v1/info', authenticated: false }"),
  mcpBootstrapToolsPresent: sourceText.mcp.includes("registerTool('verify_connection'") && sourceText.mcp.includes("registerTool('get_workmesh_context'") && sourceText.mcp.includes("registerTool('get_current_identity'"),
  currentDiagnosticsBounded: sourceText.diagnostics.includes("'pairing_expired'") && sourceText.diagnostics.includes("'team_scope_unavailable'") && sourceText.diagnostics.includes('safeConnectionFacts'),
  noScopeExpansion: contract.generatedOrConditionalTargets.packageOrLockMutationAllowed === false && contract.generatedOrConditionalTargets.migrationAllowed === false && contract.generatedOrConditionalTargets.apiRouteAdditionAllowed === false && contract.generatedOrConditionalTargets.mcpBusinessPolicyAllowed === false,
  secretsBounded: contract.secretPolicy.secretClasses.length === 9 && contract.secretPolicy.forbiddenSinks.length === 9 && contract.mutations.securityScan === false,
}

const result = { fixedInputs, source: { fileCount: source.fileCount, canonicalSha256: source.canonicalSha256 }, build: { fileCount: build.fileCount, canonicalSha256: build.canonicalSha256, buildId: readFileSync(join(sourceRoot, 'apps/web/.next/BUILD_ID'), 'utf8').trim(), preview34601Matches: countNeedle('http://127.0.0.1:34601'), active3301Matches: countNeedle('http://127.0.0.1:3301'), legacyLocalhost3001Matches: countNeedle('http://localhost:3001') }, packageHashes, targetChecks, assertions, result: Object.values(assertions).every(Boolean) ? 'PASS' : 'BLOCK' }
if (result.result !== 'PASS') throw new Error(`DOGFOOD_V31_STATIC_AUDIT_FAILED:${JSON.stringify(assertions)}`)
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
