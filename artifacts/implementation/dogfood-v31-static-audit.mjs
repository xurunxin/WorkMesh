import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { gzipSync } from 'node:zlib'

const [baseArg, candidateArg, outputArg] = process.argv.slice(2)
if (!outputArg) throw new Error('expected base, candidate and output paths')
const baseRoot = resolve(baseArg)
const candidateRoot = resolve(candidateArg)
const outputPath = resolve(outputArg)
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
const allowedExact = new Set([
  'apps/web/app/connect/page.tsx',
  'apps/web/app/agent-connections-panel.tsx',
  'apps/web/app/lib/connection-diagnostics.ts',
  'apps/web/app/lib/connection-diagnostics.test.ts',
  'apps/web/app/lib/mcp-onboarding.ts',
  'apps/web/app/lib/mcp-onboarding.test.ts',
  'apps/web/app/styles.css',
  'apps/web/e2e/connection-diagnostics.spec.ts',
  'apps/web/e2e/mcp-onboarding.spec.ts',
  'apps/mcp/src/index.ts',
  'apps/mcp/src/index.test.ts',
  'packages/contracts/src/workmesh-skill-manifest.ts',
  'packages/contracts/src/client-profile-contract.test.ts',
  'docs/agent-integration.md',
  'packages/ui/MIGRATION.md',
])
const authorizedDeltaOnly = changedPaths.every(path => allowedExact.has(path))

function buildFacts(root) {
  const all = walk(root, new Set(['.git', 'node_modules']))
  const build = all.filter(file => file.path === 'apps/web/.next/BUILD_ID' || /^apps\/web\/\.next\/(server|static)\//.test(file.path))
  const chunks = all.filter(file => /^apps\/web\/\.next\/static\/chunks\/.*\.js$/.test(file.path))
  const originMatches = needle => chunks.filter(file => readFileSync(file.absolute).includes(Buffer.from(needle))).map(file => file.path)
  const manifest = JSON.parse(readFileSync(join(root, 'apps/web/.next/app-build-manifest.json'), 'utf8'))
  const gzipFor = paths => paths.filter(path => /\.(?:js|css)$/.test(path)).reduce((sum, path) => sum + gzipSync(readFileSync(join(root, 'apps/web/.next', path))).length, 0)
  return {
    fileCount: build.length,
    canonicalSha256: canonical(build),
    buildId: readFileSync(join(root, 'apps/web/.next/BUILD_ID'), 'utf8').trim(),
    preview34601Matches: originMatches('http://127.0.0.1:34601'),
    active3301Matches: originMatches('http://127.0.0.1:3301'),
    legacyLocalhostMatches: originMatches('http://localhost:3001'),
    sharedGzipBytes: gzipFor(manifest.pages['/layout'] ?? []),
    connectRouteGzipBytes: gzipFor(manifest.pages['/connect/page'] ?? []),
    agentsRouteGzipBytes: gzipFor(manifest.pages['/agents/page'] ?? []),
  }
}

const baseBuild = buildFacts(baseRoot)
const candidateBuild = buildFacts(candidateRoot)
const bundle = {
  sharedDeltaBytes: candidateBuild.sharedGzipBytes - baseBuild.sharedGzipBytes,
  connectRouteDeltaBytes: candidateBuild.connectRouteGzipBytes - baseBuild.connectRouteGzipBytes,
  agentsRouteDeltaBytes: candidateBuild.agentsRouteGzipBytes - baseBuild.agentsRouteGzipBytes,
  sharedBudgetBytes: 40_960,
  routeBudgetBytes: 73_728,
}
bundle.withinBudget = bundle.sharedDeltaBytes <= bundle.sharedBudgetBytes
  && bundle.connectRouteDeltaBytes <= bundle.routeBudgetBytes
  && bundle.agentsRouteDeltaBytes <= bundle.routeBudgetBytes

const packagePaths = ['package.json', 'pnpm-lock.yaml', 'apps/web/package.json', 'apps/mcp/package.json', 'packages/contracts/package.json', 'packages/ui/package.json']
const packageHashes = Object.fromEntries(packagePaths.map(path => [path, fileSha(join(candidateRoot, path))]))
const packageIdentity = packagePaths.every(path => fileSha(join(baseRoot, path)) === packageHashes[path])
const result = {
  artifactVersion: 1,
  kind: 'DogfoodV31StaticAudit',
  observedAt: new Date().toISOString(),
  source: {
    baseFileCount: base.length,
    candidateFileCount: candidate.length,
    baseCanonicalSha256: canonical(base),
    candidateCanonicalSha256: canonical(candidate),
    changedPaths,
    authorizedDeltaOnly,
    candidateGitMetadataPresent: existsSync(join(candidateRoot, '.git')),
  },
  build: { base: baseBuild, candidate: candidateBuild },
  bundle,
  packageHashes,
  packageIdentity,
}
result.result = authorizedDeltaOnly
  && !result.source.candidateGitMetadataPresent
  && packageIdentity
  && bundle.withinBudget
  && candidateBuild.preview34601Matches.length > 0
  && candidateBuild.active3301Matches.length === 0
  && candidateBuild.legacyLocalhostMatches.length === 0
  ? 'PASS'
  : 'BLOCK'
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`)
if (result.result !== 'PASS') process.exitCode = 1
