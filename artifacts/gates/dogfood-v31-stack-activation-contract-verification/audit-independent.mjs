import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, lstatSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { execFileSync } from 'node:child_process'

const root = resolve('G:/Projects/MetronX/WorkMesh')
const candidateRoot = resolve('G:/Projects/MetronX/WorkMesh-human-experience-v31')
const activeRoot = resolve('G:/Projects/MetronX/WorkMesh-human-experience-v30')
const sha = value => createHash('sha256').update(value).digest('hex')
const fileSha = path => sha(readFileSync(path))
const rel = path => relative(root, path).split(sep).join('/')
const expected = {
  graph: '4e7ac2e073c0d4229dea85e8f0cde6c080a5f14e467b2d0a24cd3e7e4c958a78',
  state: '2f3166cc1802c34fcd9a6692a989e4384ada9fae9801875a2e03ed5b508c20df',
  events: '47668671e3c8f7b8f3d980ab88fdb02dd37cf22fee3d718cfe3d8bcb651e4000',
  contract: 'b0d9619ea0ee08ff360bbeb4b8369fec29f6bf8eb39c914eaeff83b2c580f42a'
}
const paths = {
  graph: join(root, 'docs/workgraphs/workmesh-human-agent-experience-dogfood-v31-mcp-onboarding.yaml'),
  state: join(root, 'docs/workgraphs/executions/workmesh-human-agent-experience-dogfood-run-031.yaml'),
  events: join(root, 'docs/workgraphs/executions/workmesh-human-agent-experience-dogfood-run-031.events.jsonl'),
  contract: join(root, 'artifacts/runtime/dogfood-v31-stack-activation-contract.json')
}
const fixed = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, fileSha(path)]))
if (Object.entries(expected).some(([key, value]) => fixed[key] !== value)) throw new Error('DOGFOOD_V31_FIXED_INPUT_DRIFT')

const stateText = readFileSync(paths.state, 'utf8')
if (!/^  sequence: 32$/m.test(stateText) || !/verify-v31-stack-activation-contract: \{status: claimed, attempt: 1/.test(stateText)) throw new Error('DOGFOOD_V31_STATE_INVALID')
const events = readFileSync(paths.events, 'utf8').trimEnd().split(/\r?\n/).map(line => JSON.parse(line))
if (events.length !== 32 || events.some((event, index) => event.sequence !== index + 1) || events.at(-1).event_id !== 'dogfood-run-031-000032') throw new Error('DOGFOOD_V31_EVENT_CONTINUITY')

const contract = JSON.parse(readFileSync(paths.contract, 'utf8'))
if (contract.kind !== 'DogfoodV31StackActivationContract' || contract.selectorBinding !== 'v31-stack-activation-v1') throw new Error('DOGFOOD_V31_CONTRACT_SHAPE')
const boundScripts = Object.values(contract.scripts).map(binding => ({ path: binding.path, expected: binding.sha256, actual: fileSha(join(root, binding.path)) }))
if (boundScripts.some(binding => binding.actual !== binding.expected)) throw new Error('DOGFOOD_V31_SCRIPT_BINDING')

const candidate = JSON.parse(execFileSync('node.exe', [join(root, contract.scripts.candidateVerifier.path)], { cwd: root, encoding: 'utf8' }))
if (candidate.result !== 'PASS' || candidate.source.canonicalSha256 !== contract.candidate.source.canonicalSha256 || candidate.build.canonicalSha256 !== contract.candidate.build.canonicalSha256 || candidate.standalone.preparedCanonicalSha256 !== contract.candidate.prepared.canonicalSha256) throw new Error('DOGFOOD_V31_CANDIDATE_SELECTOR')

const evidenceRoot = join(root, 'artifacts/gates/dogfood-v31-stack-activation-contract-verification/independent')
const evidenceNames = ['ast-audit.json', 'contract-probe.json', 'stage-dry-run.json', 'preflight.json', 'rollback-preflight.json', 'runtime-invariance.json']
const evidence = evidenceNames.map(name => {
  const path = join(evidenceRoot, name)
  const value = JSON.parse(readFileSync(path, 'utf8'))
  if (value.result !== 'PASS') throw new Error(`DOGFOOD_V31_EVIDENCE_RESULT:${name}`)
  return { path: rel(path), sha256: fileSha(path) }
})

const migrationRows = migrationRoot => {
  const rows = []
  const visit = dir => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      const stat = lstatSync(path)
      if (stat.isDirectory()) visit(path)
      else if (stat.isFile()) rows.push(`${relative(migrationRoot, path).split(sep).join('/')}\t${fileSha(path)}\n`)
    }
  }
  visit(migrationRoot)
  return rows.sort().join('')
}
const activeMigrations = migrationRows(join(activeRoot, 'packages/db/migrations'))
const candidateMigrations = migrationRows(join(candidateRoot, 'packages/db/migrations'))
if (activeMigrations !== candidateMigrations) throw new Error('DOGFOOD_V31_MIGRATION_TREE_DRIFT')

const future = Object.values(contract.futureArtifacts).filter(path => existsSync(path))
const preparedExists = existsSync(contract.candidate.prepared.root)
if (future.length !== 0 || preparedExists) throw new Error('DOGFOOD_V31_FUTURE_OR_PREPARED_PRESENT')

process.stdout.write(`${JSON.stringify({
  artifactVersion: 1,
  kind: 'DogfoodV31StackActivationContractIndependentAudit',
  result: 'PASS',
  fixed,
  stateSequence: 32,
  eventRows: events.length,
  boundScripts: `${boundScripts.length}/${boundScripts.length}`,
  candidate: `${candidate.source.fileCount}/${candidate.source.canonicalSha256} + ${candidate.build.fileCount}/${candidate.build.canonicalSha256}/${candidate.build.buildId}`,
  preparedPrediction: `${candidate.standalone.fileCount}/${candidate.standalone.preparedCanonicalSha256}`,
  evidence,
  migrationTreeEquivalent: true,
  futureArtifactsPresent: future,
  preparedRootPresent: preparedExists,
  securityScan: false
}, null, 2)}\n`)
