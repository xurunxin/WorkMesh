import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const nodeVersion = readFileSync(resolve(root, '.node-version'), 'utf8').trim()
const failures = []

const requireCondition = (condition, message) => {
  if (!condition) failures.push(message)
}
const occurrences = (pattern, value = workflow) => [...value.matchAll(pattern)].length

requireCondition(!workflow.includes('\t'), 'workflow must use spaces, not tabs')
requireCondition(
  workflow.split(/\r?\n/).every(line => line.trim() === '' || line.match(/^ */)[0].length % 2 === 0),
  'workflow indentation must use two-space increments',
)
requireCondition(!/[ \t]+$/m.test(workflow), 'workflow must not contain trailing whitespace')

requireCondition(/^name: CI$/m.test(workflow), 'workflow name must be CI')
requireCondition(/^on:\s*$/m.test(workflow), 'workflow must declare an on mapping')
requireCondition(/^  pull_request:\s*$/m.test(workflow), 'workflow must run for pull requests')
requireCondition(!/pull_request:\s*\n\s+branches:/m.test(workflow), 'pull requests must support every base branch')
requireCondition(/^  push:\s*\n    branches: \[main\]$/m.test(workflow), 'workflow must run for pushes to main')
requireCondition(/^  workflow_dispatch:\s*$/m.test(workflow), 'workflow must support manual dispatch')
requireCondition(!workflow.includes('pull_request_target'), 'pull_request_target is forbidden')

requireCondition(
  /^permissions:\s*\n  contents: read$/m.test(workflow),
  'top-level permissions must be exactly contents: read',
)
requireCondition(
  !/^\s+[A-Za-z-]+:\s*write\s*$/m.test(workflow),
  'write permissions are forbidden',
)
requireCondition(
  /^concurrency:\s*\n  group: .+github\.event_name.+github\.event\.pull_request\.number.+github\.run_id.+\n  cancel-in-progress: .+github\.event_name == 'pull_request'/m.test(workflow),
  'concurrency must be pull-request scoped and cancel only pull-request runs',
)

const forbiddenMutationPatterns = [
  [/\b(?:npm|pnpm|yarn)\s+publish\b/i, 'package publication'],
  [/\b(?:npm|pnpm|yarn)\s+(?:version|pack)\b/i, 'package mutation'],
  [/\bdocker\s+(?:buildx\s+)?push\b/i, 'container publication'],
  [/\bgit\s+(?:push|tag)\b/i, 'Git history or tag mutation'],
  [/\bgh\s+release\b/i, 'GitHub release mutation'],
  [/\bpackages:\s*write\b/i, 'package write permission'],
  [/\bcontinue-on-error\s*:/i, 'continue-on-error'],
  [/\b(?:retry|max-attempts)\s*:/i, 'automatic retry'],
]
for (const [pattern, label] of forbiddenMutationPatterns)
  requireCondition(!pattern.test(workflow), `${label} is forbidden in foundational CI`)

const expectedActions = new Map([
  ['actions/checkout', '11d5960a326750d5838078e36cf38b85af677262'],
  ['actions/setup-node', '49933ea5288caeca8642d1e84afbd3f7d6820020'],
  ['actions/upload-artifact', 'ea165f8d65b6e75b540449e92b4886f43607fa02'],
])
const uses = [...workflow.matchAll(/^\s*uses:\s*([^@\s]+)@([^\s]+)\s*$/gm)]
requireCondition(uses.length > 0, 'workflow must use pinned actions')
for (const [, action, revision] of uses) {
  requireCondition(/^[0-9a-f]{40}$/.test(revision), `${action} must use a full 40-character SHA`)
  requireCondition(expectedActions.has(action), `${action} is not an approved foundational CI action`)
  requireCondition(expectedActions.get(action) === revision, `${action} does not use the reviewed SHA`)
}
requireCondition(
  occurrences(/^\s*uses:\s*/gm) === uses.length,
  'every uses entry must have an explicit immutable revision',
)

const jobsStart = workflow.split(/\r?\n/).findIndex(line => line === 'jobs:')
requireCondition(jobsStart >= 0, 'workflow must declare jobs')
const lines = workflow.split(/\r?\n/)
const jobStarts = []
for (let index = jobsStart + 1; index < lines.length; index += 1) {
  const match = lines[index].match(/^  ([a-z0-9][a-z0-9-]*):\s*$/)
  if (match) jobStarts.push({ id: match[1], index })
}
const jobSections = new Map(jobStarts.map((job, index) => [
  job.id,
  lines.slice(job.index, jobStarts[index + 1]?.index ?? lines.length).join('\n'),
]))
const parseSteps = section => {
  const sectionLines = section.split('\n')
  const stepStarts = []
  for (let index = 0; index < sectionLines.length; index += 1) {
    const match = sectionLines[index].match(/^      - name:\s*(.+?)\s*$/)
    if (match) stepStarts.push({ name: match[1], index })
  }
  return stepStarts.map((step, index) => ({
    name: step.name,
    section: sectionLines.slice(step.index, stepStarts[index + 1]?.index ?? sectionLines.length).join('\n'),
  }))
}
const stepValue = (step, key, indentation) =>
  step.section.match(new RegExp(`^\\s{${indentation}}${key}:\\s*(.*?)\\s*$`, 'm'))?.[1]
const uploadAction = 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'
const uploadStepsByJob = new Map([...jobSections].map(([jobId, section]) => [
  jobId,
  parseSteps(section)
    .filter(step => stepValue(step, 'uses', 8) === uploadAction)
    .map(step => ({
      ...step,
      condition: stepValue(step, 'if', 8),
      artifact: stepValue(step, 'name', 10),
      path: stepValue(step, 'path', 10),
      missingFiles: stepValue(step, 'if-no-files-found', 10),
      retentionDays: stepValue(step, 'retention-days', 10),
    })),
]))
const requiredJobs = [
  'source-gates',
  'db-integration',
  'api-integration',
  'worker-integration',
  'e2e',
  'agent-smoke',
  'required-ci',
]
requireCondition(
  JSON.stringify([...jobSections.keys()].sort()) === JSON.stringify([...requiredJobs].sort()),
  `workflow job IDs must be exactly: ${requiredJobs.join(', ')}`,
)

const rawArtifacts = new Map([
  ['source-gates', 'source-gates-raw-${{ github.run_id }}-${{ github.run_attempt }}'],
  ['db-integration', 'db-integration-raw-${{ github.run_id }}-${{ github.run_attempt }}'],
  ['api-integration', 'api-integration-raw-${{ github.run_id }}-${{ github.run_attempt }}'],
  ['worker-integration', 'worker-integration-raw-${{ github.run_id }}-${{ github.run_attempt }}'],
  ['e2e', 'e2e-raw-${{ github.run_id }}-${{ github.run_attempt }}'],
  ['agent-smoke', 'agent-smoke-raw-${{ github.run_id }}-${{ github.run_attempt }}'],
  ['required-ci', 'required-ci-raw-${{ github.run_id }}-${{ github.run_attempt }}'],
])
for (const jobId of requiredJobs) {
  const section = jobSections.get(jobId) ?? ''
  requireCondition(/^\s{4}timeout-minutes:\s*\d+\s*$/m.test(section), `${jobId} needs a timeout`)
  requireCondition(section.includes('ci-logs'), `${jobId} must upload raw logs`)
  requireCondition(
    section.includes('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'),
    `${jobId} must use the reviewed upload-artifact action`,
  )
  requireCondition(section.includes('retention-days: 14'), `${jobId} logs must be retained for 14 days`)

  const expectedArtifact = rawArtifacts.get(jobId)
  const rawUploads = (uploadStepsByJob.get(jobId) ?? [])
    .filter(step => step.artifact === expectedArtifact)
  requireCondition(
    rawUploads.length === 1,
    `${jobId}/${expectedArtifact} must have exactly one upload step`,
  )
  const rawUpload = rawUploads[0]
  if (rawUpload) {
    requireCondition(
      rawUpload.condition === '${{ always() }}',
      `${jobId}/${expectedArtifact} must run with always()`,
    )
    requireCondition(rawUpload.path === 'ci-logs', `${jobId}/${expectedArtifact} must upload ci-logs`)
    requireCondition(
      rawUpload.missingFiles === 'error',
      `${jobId}/${expectedArtifact} must fail when raw logs are missing`,
    )
    requireCondition(rawUpload.retentionDays === '14', `${jobId}/${expectedArtifact} must be retained for 14 days`)
  }
}

const playwrightArtifact = 'e2e-playwright-${{ github.run_id }}-${{ github.run_attempt }}'
const playwrightUploads = (uploadStepsByJob.get('e2e') ?? [])
  .filter(step => step.artifact === playwrightArtifact)
requireCondition(
  playwrightUploads.length === 1,
  `e2e/${playwrightArtifact} must have exactly one upload step`,
)
const playwrightUpload = playwrightUploads[0]
if (playwrightUpload) {
  requireCondition(
    playwrightUpload.condition === '${{ always() }}',
    `e2e/${playwrightArtifact} must run with always()`,
  )
  requireCondition(
    playwrightUpload.path === '|' &&
      playwrightUpload.section.includes('            playwright-report') &&
      playwrightUpload.section.includes('            test-results'),
    `e2e/${playwrightArtifact} must upload playwright-report and test-results`,
  )
  requireCondition(
    playwrightUpload.missingFiles === 'error',
    `e2e/${playwrightArtifact} must fail when Playwright evidence is missing`,
  )
  requireCondition(playwrightUpload.retentionDays === '14', `e2e/${playwrightArtifact} must be retained for 14 days`)
}

for (const [jobId, uploads] of uploadStepsByJob) {
  for (const upload of uploads) {
    const failureOnlyServiceLogs =
      upload.condition === '${{ failure() }}' &&
      upload.section.includes('ci-logs/services')
    if (failureOnlyServiceLogs)
      requireCondition(
        upload.missingFiles === 'ignore' || upload.missingFiles === 'error',
        `${jobId}/${upload.artifact ?? upload.name} failure-only service logs may use ignore or error`,
      )
  }
}

const executableJobs = requiredJobs.filter(job => job !== 'required-ci')
for (const jobId of executableJobs) {
  const section = jobSections.get(jobId) ?? ''
  requireCondition(
    section.includes('actions/checkout@11d5960a326750d5838078e36cf38b85af677262'),
    `${jobId} must check out the source`,
  )
  requireCondition(section.includes('persist-credentials: false'), `${jobId} must disable persisted credentials`)
  requireCondition(section.includes('node-version-file: .node-version'), `${jobId} must use .node-version`)
  requireCondition(section.includes('cache: pnpm'), `${jobId} must cache only the pnpm store`)
  requireCondition(section.includes('pnpm install --frozen-lockfile'), `${jobId} must use the frozen lockfile`)
}
requireCondition(
  occurrences(/persist-credentials:\s*false/g) === occurrences(/actions\/checkout@/g),
  'every checkout must disable persisted credentials',
)
requireCondition(!/(?:node_modules|\.next|dist\/\*\*)\s*$/m.test(workflow), 'build or install outputs must not be cached or uploaded')

const source = jobSections.get('source-gates') ?? ''
for (const command of [
  'pnpm ci:validate',
  'pnpm lint',
  'pnpm typecheck',
  'pnpm --filter @workmesh/contracts test',
  'pnpm build',
  'pnpm test',
  'docker compose config',
  'git diff --exit-code',
  'git diff --cached --exit-code',
])
  requireCondition(source.includes(command), `source-gates must run ${command}`)
requireCondition(!source.includes('format:check'), 'format:check is deferred beyond Issue #10A')

for (const jobId of ['db-integration', 'api-integration', 'worker-integration', 'e2e', 'agent-smoke'])
  requireCondition(
    (jobSections.get(jobId) ?? '').includes('needs: source-gates'),
    `${jobId} must depend on source-gates`,
  )
requireCondition((jobSections.get('db-integration') ?? '').includes('pnpm test:integration:db'), 'db integration command is missing')
requireCondition((jobSections.get('api-integration') ?? '').includes('pnpm test:integration:api'), 'API integration command is missing')
requireCondition((jobSections.get('worker-integration') ?? '').includes('pnpm test:integration:worker'), 'worker integration command is missing')
requireCondition(!(jobSections.get('worker-integration') ?? '').includes('redis:'), 'worker integration must not provision Redis')
requireCondition((jobSections.get('e2e') ?? '').includes('playwright install --with-deps chromium'), 'E2E must install Chromium only')
requireCondition((jobSections.get('e2e') ?? '').includes('playwright-report'), 'E2E must upload playwright-report')
requireCondition((jobSections.get('e2e') ?? '').includes('test-results'), 'E2E must upload test-results')
requireCondition((jobSections.get('agent-smoke') ?? '').includes('pnpm smoke:agents'), 'agent smoke command is missing')
requireCondition(
  (jobSections.get('agent-smoke') ?? '').includes('Construction and protocol smoke'),
  'agent smoke must be labelled as construction/protocol evidence',
)

const postgresImage = 'postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777'
const minioImage = 'minio/minio:RELEASE.2025-04-22T22-12-26Z@sha256:a1ea29fa28355559ef137d71fc570e508a214ec84ff8083e39bc5428980b015e'
const mcImage = 'minio/mc:RELEASE.2025-04-16T18-13-26Z@sha256:aead63c77f9db9107f1696fb08ecb0faeda23729cde94b0f663edf4fe09728e3'
requireCondition(occurrences(new RegExp(postgresImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) === 4, 'four isolated jobs must use the reviewed PostgreSQL image')
const api = jobSections.get('api-integration') ?? ''
requireCondition(api.includes(minioImage), 'API integration must use the reviewed MinIO image')
requireCondition(api.includes(mcImage), 'API integration must initialize MinIO with the reviewed mc image')
requireCondition(
  api.includes('http://127.0.0.1:9000/minio/health/ready'),
  'API integration must wait for MinIO readiness before bucket initialization',
)
requireCondition(
  !api.includes('/minio/health/live'),
  'API integration must not use MinIO liveness as its bucket-initialization gate',
)
for (const database of [
  'workmesh_db_integration_test',
  'workmesh_api_integration_test',
  'workmesh_worker_integration_test',
  'workmesh_e2e_test',
])
  requireCondition(workflow.includes(database), `missing isolated database ${database}`)
for (const jobId of ['db-integration', 'api-integration', 'worker-integration', 'e2e']) {
  const section = jobSections.get(jobId) ?? ''
  requireCondition(section.includes("${{ failure() }}"), `${jobId} must capture service logs on failure`)
  requireCondition(section.includes('docker logs'), `${jobId} must capture raw service logs`)
}

const required = jobSections.get('required-ci') ?? ''
const needs = required.match(/needs:\s*\[([^\]]+)\]/)?.[1]
  ?.split(',')
  .map(value => value.trim())
  .filter(Boolean) ?? []
const expectedNeeds = requiredJobs.filter(job => job !== 'required-ci')
requireCondition(
  JSON.stringify([...needs].sort()) === JSON.stringify([...expectedNeeds].sort()),
  'required-ci must need source-gates and every constituent job',
)
requireCondition(required.includes('if: ${{ always() }}'), 'required-ci must aggregate with always()')
requireCondition(required.includes("result !== 'success'"), 'required-ci must fail unless every dependency succeeds')
requireCondition(required.includes('node-version: 22.15.0'), 'required-ci must pin its Node runtime')

requireCondition(packageJson.packageManager === 'pnpm@9.15.4', 'packageManager must be pnpm@9.15.4')
requireCondition(nodeVersion === '22.15.0', 'Node must be pinned to 22.15.0')
requireCondition(
  occurrences(/corepack prepare pnpm@9\.15\.4 --activate/g) === executableJobs.length,
  'every executable job must activate pnpm@9.15.4 with Corepack',
)
const expectedIntegrationScripts = {
  'test:integration': 'pnpm test:integration:db && pnpm test:integration:api && pnpm test:integration:worker',
  'test:integration:db': 'node scripts/require-integration-env.mjs && pnpm --filter @workmesh/db test:reset && pnpm --filter @workmesh/db test:integration',
  'test:integration:api': 'node scripts/require-integration-env.mjs && pnpm --filter @workmesh/db test:reset && pnpm --filter @workmesh/api test:integration',
  'test:integration:worker': 'node scripts/require-integration-env.mjs && pnpm --filter @workmesh/db test:reset && pnpm --filter @workmesh/worker test:integration',
}
for (const [name, command] of Object.entries(expectedIntegrationScripts))
  requireCondition(packageJson.scripts?.[name] === command, `${name} must preserve the reviewed reset and execution order`)

if (failures.length > 0) {
  console.error('[ci:validate] CI policy validation failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`[ci:validate] OK: ${requiredJobs.length} jobs, ${uses.length} immutable action references, Node ${nodeVersion}, ${packageJson.packageManager}`)
}
