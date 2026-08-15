import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const control = resolve('G:/Projects/MetronX/WorkMesh')
const candidateRoot = resolve('G:/Projects/MetronX/WorkMesh-human-experience-v31')
const evidenceRoot = resolve(control, 'artifacts/design/human-journey-attempt-31')
const sha = value => createHash('sha256').update(value).digest('hex')
const fileSha = path => sha(readFileSync(path))
const rel = (root, path) => relative(root, path).split(sep).join('/')
const excluded = new Set(['.git', 'node_modules', '.next', 'dist', '.turbo', 'coverage', 'reports', '.cache', '.tmp'])
const walk = (root, skip = excluded) => {
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
  return files.sort((a, b) => a.path.localeCompare(b.path, 'en'))
}
const canonical = files => sha(files.map(file => `${file.path}\t${fileSha(file.absolute)}\n`).join(''))
const source = walk(candidateRoot)
const all = walk(candidateRoot, new Set(['.git', 'node_modules']))
const build = all.filter(file => file.path === 'apps/web/.next/BUILD_ID' || /^apps\/web\/\.next\/(server|static)\//.test(file.path))
const acceptancePath = join(evidenceRoot, 'candidate-acceptance-attempt-2.json')
const acceptance = JSON.parse(readFileSync(acceptancePath, 'utf8'))
const refChecks = acceptance.evidence.map(ref => {
  const match = /^(.*)@sha256:([0-9a-f]{64})$/.exec(ref)
  if (!match) throw new Error(`unbound evidence ref: ${ref}`)
  const absolute = resolve(control, match[1])
  return { ref: match[1], exists: existsSync(absolute), expected: match[2], actual: existsSync(absolute) ? fileSha(absolute) : null }
})
const auditRows = readFileSync(join(evidenceRoot, 'candidate-request-audit-attempt-2.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse)
const methods = Object.fromEntries([...new Set(auditRows.map(row => row.method))].sort().map(method => [method, auditRows.filter(row => row.method === method).length]))
const runtime = JSON.parse(readFileSync(join(evidenceRoot, 'candidate-runtime-cleanup-attempt-2.json'), 'utf8'))
const browser = JSON.parse(readFileSync(join(evidenceRoot, 'candidate-browser-dom-attempt-2.json'), 'utf8'))
const agent = JSON.parse(readFileSync(join(evidenceRoot, 'candidate-agent-transcript-attempt-2.json'), 'utf8'))
const result = {
  result: 'PASS',
  acceptanceSha256: fileSha(acceptancePath),
  evidenceRefsExact: refChecks.every(item => item.exists && item.expected === item.actual),
  refChecks,
  candidate: {
    sourceFiles: source.length,
    sourceSha256: canonical(source),
    buildFiles: build.length,
    buildSha256: canonical(build),
    buildId: readFileSync(join(candidateRoot, 'apps/web/.next/BUILD_ID'), 'utf8').trim()
  },
  requestAudit: {
    rows: auditRows.length,
    methods,
    mutationCount: auditRows.filter(row => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(row.method)).length,
    persistedSecretHeaderValues: auditRows.filter(row => Object.keys(row).some(key => /authorizationValue|cookieValue|tokenValue/i.test(key))).length
  },
  browser: {
    result: browser.result,
    publicStates: browser.publicJourney.length,
    adminStates: browser.adminJourney.length,
    horizontalOverflow: browser.responsive.desktop.horizontalOverflow || browser.responsive.width375.horizontalOverflow || browser.responsive.width320.horizontalOverflow,
    finalizedExactlyOnce: browser.browser.finalizedExactlyOnce,
    callsAfterFinalize: browser.browser.callsAfterFinalize,
    credentialLikeDomTextPresent: browser.secretBoundary.credentialLikeDomTextPresent
  },
  agent: {
    result: agent.result,
    verifyConnection: agent.liveReadOnlyVerification.connectionVerified,
    sessionState: agent.liveReadOnlyVerification.sessionState,
    team: agent.liveReadOnlyVerification.team.key,
    fixtureRevoked: agent.boundedDisposableFixture.revoked,
    fixtureCleaned: agent.boundedDisposableFixture.cleaned,
    activeDataMutation: agent.boundedDisposableFixture.activeDataMutation,
    secretValueCount: agent.redaction.secretValueCount
  },
  runtime: {
    result: runtime.result,
    health: runtime.activeRuntime.health,
    activeBuildStatus: runtime.activeRuntime.activeBuildStatus,
    candidateBuildStatus: runtime.activeRuntime.candidateBuildStatus,
    previewResidue: runtime.preview.residue,
    gen11Revision: runtime.workmesh.revision,
    gen11Coordination: runtime.workmesh.coordinationLabel
  }
}

const failures = [
  result.acceptanceSha256 !== '82ac19416ff90e1ef8ee4aacddcfb69e66fa083c5910a98a28a8f583ba5ddabb',
  !result.evidenceRefsExact,
  result.candidate.sourceFiles !== 583,
  result.candidate.sourceSha256 !== 'dcbce0e8010f065482bff53208bf220192ae8f1ea2588964623470444a72f5a8',
  result.candidate.buildFiles !== 118,
  result.candidate.buildSha256 !== 'b1c614df34a603149ebe9a343190bc21d143fc4a305fd0ae845821db2a29ad05',
  result.candidate.buildId !== 'Yj0IS_0CtW-lStIuWIemm',
  result.requestAudit.rows !== 312,
  result.requestAudit.mutationCount !== 0,
  result.requestAudit.persistedSecretHeaderValues !== 0,
  result.browser.result !== 'PASS',
  result.browser.publicStates !== 6,
  result.browser.adminStates !== 10,
  result.browser.horizontalOverflow,
  !result.browser.finalizedExactlyOnce,
  result.browser.callsAfterFinalize !== 0,
  result.browser.credentialLikeDomTextPresent,
  result.agent.result !== 'PASS',
  !result.agent.verifyConnection,
  !result.agent.fixtureRevoked,
  !result.agent.fixtureCleaned,
  result.agent.activeDataMutation,
  result.agent.secretValueCount !== 0,
  result.runtime.result !== 'PASS',
  result.runtime.health !== '7/7',
  result.runtime.activeBuildStatus !== 200,
  result.runtime.candidateBuildStatus !== 404,
  result.runtime.previewResidue,
  result.runtime.gen11Revision !== 2,
  result.runtime.gen11Coordination !== 'coord:active'
]
if (failures.some(Boolean)) {
  result.result = 'BLOCK'
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  process.exitCode = 2
} else {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
