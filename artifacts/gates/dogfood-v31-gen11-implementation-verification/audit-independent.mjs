import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const control = resolve('G:/Projects/MetronX/WorkMesh')
const baseRoot = resolve('G:/Projects/MetronX/WorkMesh-human-experience-v30')
const candidateRoot = resolve('G:/Projects/MetronX/WorkMesh-human-experience-v31')
const outputPath = resolve(control, 'artifacts/gates/dogfood-v31-gen11-implementation-verification/static-audit.json')
const sha = value => createHash('sha256').update(value).digest('hex')
const fileSha = path => sha(readFileSync(path))
const rel = (root, path) => relative(root, path).split(sep).join('/')
const excluded = new Set(['.git', 'node_modules', '.next', 'dist', '.turbo', 'coverage', 'reports', '.cache', '.tmp'])
function walk(root, skip = excluded) {
  const files = []
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git' || (entry.isDirectory() && skip.has(entry.name))) continue
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile() && !entry.name.endsWith('.log')) files.push({ path: rel(root, absolute), absolute })
    }
  }
  visit(root)
  return files.sort((left, right) => left.path.localeCompare(right.path, 'en'))
}
const canonical = files => sha(files.map(file => `${file.path}\t${fileSha(file.absolute)}\n`).join(''))
const base = walk(baseRoot)
const candidate = walk(candidateRoot)
const baseMap = new Map(base.map(file => [file.path, fileSha(file.absolute)]))
const candidateMap = new Map(candidate.map(file => [file.path, fileSha(file.absolute)]))
const changedPaths = [...new Set([...baseMap.keys(), ...candidateMap.keys()])]
  .filter(path => baseMap.get(path) !== candidateMap.get(path)).sort()
const expectedPaths = [
  'apps/mcp/src/index.test.ts',
  'apps/mcp/src/index.ts',
  'apps/web/app/agent-connections-panel.tsx',
  'apps/web/app/connect/page.tsx',
  'apps/web/app/lib/connection-diagnostics.test.ts',
  'apps/web/app/lib/connection-diagnostics.ts',
  'apps/web/app/lib/mcp-onboarding.test.ts',
  'apps/web/app/lib/mcp-onboarding.ts',
  'apps/web/app/styles.css',
  'apps/web/e2e/mcp-onboarding.spec.ts',
  'docs/agent-integration.md',
  'packages/contracts/src/client-profile-contract.test.ts',
]
const packagePaths = ['package.json', 'pnpm-lock.yaml', 'apps/web/package.json', 'apps/mcp/package.json', 'packages/contracts/package.json', 'packages/ui/package.json']
const all = walk(candidateRoot, new Set(['.git', 'node_modules']))
const build = all.filter(file => file.path === 'apps/web/.next/BUILD_ID' || /^apps\/web\/\.next\/(server|static)\//.test(file.path))
const chunks = all.filter(file => /^apps\/web\/\.next\/static\/chunks\/.*\.js$/.test(file.path))
const matches = needle => chunks.filter(file => readFileSync(file.absolute).includes(Buffer.from(needle))).map(file => file.path)
const productionOnboarding = [
  'apps/web/app/connect/page.tsx',
  'apps/web/app/agent-connections-panel.tsx',
  'apps/web/app/lib/mcp-onboarding.ts',
  'apps/mcp/src/index.ts',
].map(path => readFileSync(join(candidateRoot, path), 'utf8')).join('\n')
const result = {
  artifactVersion: 1,
  kind: 'DogfoodV31IndependentStaticAudit',
  observedAt: new Date().toISOString(),
  fixedInputs: {
    graph: fileSha(join(control, 'docs/workgraphs/workmesh-human-agent-experience-dogfood-v31-mcp-onboarding.yaml')),
    state: fileSha(join(control, 'docs/workgraphs/executions/workmesh-human-agent-experience-dogfood-run-031.yaml')),
    events: fileSha(join(control, 'docs/workgraphs/executions/workmesh-human-agent-experience-dogfood-run-031.events.jsonl')),
    contract: fileSha(join(control, 'artifacts/design/dogfood-v31-mcp-onboarding-contract.json')),
    report: fileSha(join(control, 'artifacts/implementation/dogfood-v31-mcp-onboarding-report.json')),
    implementationAudit: fileSha(join(control, 'artifacts/implementation/dogfood-v31-static-audit.json')),
  },
  source: {
    fileCount: candidate.length,
    canonicalSha256: canonical(candidate),
    changedPaths,
    exactExpectedPaths: JSON.stringify(changedPaths) === JSON.stringify(expectedPaths),
    gitMetadataPresent: existsSync(join(candidateRoot, '.git')),
  },
  build: {
    fileCount: build.length,
    canonicalSha256: canonical(build),
    buildId: readFileSync(join(candidateRoot, 'apps/web/.next/BUILD_ID'), 'utf8').trim(),
    preview34601Matches: matches('http://127.0.0.1:34601'),
    active3301Matches: matches('http://127.0.0.1:3301'),
    legacyLocalhostMatches: matches('http://localhost:3001'),
  },
  packageIdentity: Object.fromEntries(packagePaths.map(path => [path, fileSha(join(baseRoot, path)) === fileSha(join(candidateRoot, path))])),
  secretBoundary: {
    installationTokenReferencePresent: productionOnboarding.includes('WORKMESH_INSTALLATION_TOKEN'),
    pairingFragmentInterpolationInConfigAbsent: !productionOnboarding.includes('window.location.hash}`'),
    productionCredentialCanaryAbsent: !/wm_(?:live|secret|token)_[A-Za-z0-9_-]{8,}/.test(productionOnboarding),
    installationIdentitySeparationPresent: productionOnboarding.includes('Installation identity is not an Agent Session or Delegation.'),
  },
}
result.result = result.fixedInputs.graph === 'de2513a81bc48c1d99d862953b71f424cdd4a26534cbb99103dcc56264fa6b67'
  && result.fixedInputs.state === 'ada8cdbbde84e4b569489a51a67e6b488f6a3a270e37189101688147b18665b0'
  && result.fixedInputs.events === 'd543bf6d4cf17597726c54bffdec1cc3e7ff34422c9e870f640e2dc6bcb09f4a'
  && result.fixedInputs.contract === '108294489b0d4e2977d1bf3ccfcf9ca10a66138ac131b545112e0d9d97bd4b7b'
  && result.fixedInputs.report === 'f70e76297ad87003a279b2eedc1c1de8d3808b021e754606d55e14dd59a5f7e9'
  && result.fixedInputs.implementationAudit === 'ba2249b25faed903da8d31dabe3bd022a664fc48584efe39f8acdb391e36d5dc'
  && result.source.fileCount === 583
  && result.source.canonicalSha256 === '94f4a579484ffa52d1a3fce4014040cac6518247a10bfc838a3526aff30893c7'
  && result.source.exactExpectedPaths
  && !result.source.gitMetadataPresent
  && result.build.fileCount === 118
  && result.build.canonicalSha256 === '93dc6d1411c1279efed0f16ee97f14e8a51ab8bce774c086a979e006a04e85aa'
  && result.build.buildId === 'FFS43hLDELd0IEM12C3hR'
  && result.build.preview34601Matches.length === 5
  && result.build.active3301Matches.length === 0
  && result.build.legacyLocalhostMatches.length === 0
  && Object.values(result.packageIdentity).every(Boolean)
  && Object.values(result.secretBoundary).every(Boolean)
  ? 'PASS'
  : 'BLOCK'
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`)
if (result.result !== 'PASS') process.exitCode = 1
