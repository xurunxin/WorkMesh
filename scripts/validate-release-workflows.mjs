import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDocument } from 'yaml'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = path => readFileSync(resolve(root, path), 'utf8')
const candidate = read('.github/workflows/release-candidate.yml')
const promotion = read('.github/workflows/promote-ga.yml')
const releasePolicy = read('docs/V1_RELEASE_POLICY.md')
const releaseNotes = read('docs/releases/v1.0.0.md')
const failures = []

const requireCondition = (condition, message) => {
  if (!condition) failures.push(message)
}

const parseWorkflow = (name, source) => {
  const document = parseDocument(source, { prettyErrors: true })
  requireCondition(document.errors.length === 0, `${name} must be valid YAML`)
  requireCondition(!source.includes('\t'), `${name} must use spaces, not tabs`)
  requireCondition(!/[ \t]+$/m.test(source), `${name} must not contain trailing whitespace`)
  const uses = [...source.matchAll(/^\s*uses:\s*([^@\s]+)@([^\s]+)\s*$/gm)]
  const localUses = [...source.matchAll(/^\s*uses:\s*\.\/[^\s]+\s*$/gm)]
  requireCondition(uses.length > 0, `${name} must use pinned actions`)
  requireCondition(
    uses.length + localUses.length === [...source.matchAll(/^\s*uses:\s*/gm)].length,
    `${name} must pin every action reference`,
  )
  for (const [, action, revision] of uses)
    requireCondition(/^[0-9a-f]{40}$/.test(revision), `${name}: ${action} must use a full SHA`)
  return document.toJS()
}

const candidateWorkflow = parseWorkflow('release-candidate', candidate)
parseWorkflow('promote-ga', promotion)

const ghcrCredentialExpression = 'secrets.GHCR_PUBLISH_TOKEN || secrets.GITHUB_TOKEN'

for (const jobName of ['source-security', 'production-runtime-smoke', 'publish-candidate-record']) {
  const steps = candidateWorkflow?.jobs?.[jobName]?.steps ?? []
  const activationIndex = steps.findIndex(
    step =>
      step?.name === 'Activate exact pnpm' &&
      typeof step.run === 'string' &&
      step.run.includes('corepack prepare pnpm@9.15.4 --activate'),
  )
  const cacheIndex = steps.findIndex(
    step =>
      typeof step?.uses === 'string' &&
      step.uses.startsWith('actions/setup-node@') &&
      step.with?.cache === 'pnpm',
  )
  requireCondition(
    activationIndex >= 0 && cacheIndex > activationIndex,
    `${jobName} must activate exact pnpm before restoring the pnpm cache`,
  )
}

for (const value of [
  "tags: ['v1.0.0-rc.*']",
  'uses: ./.github/workflows/ci.yml',
  'packages: write',
  'id-token: write',
  'attestations: write',
  'environment: stable-release',
  'pnpm audit --audit-level high',
  "scanners: 'vuln,misconfig'",
  "scanners: 'secret'",
  "severity: 'HIGH,CRITICAL'",
  "exit-code: '1'",
  'infra/docker/${{ matrix.service }}.production.Dockerfile',
  'cosign sign --yes',
  'cosign sign-blob --yes',
  'actions/attest-build-provenance@',
  'actions/attest-sbom@',
  'release-manifest.json',
  'failure-probe',
  'production-runtime-smoke:',
  'Production readiness and graceful restart',
  'release-config-preflight:',
  'Validate protected release configuration',
  'RELEASE_WEB_ORIGIN: ${{ vars.WORKMESH_RELEASE_WEB_ORIGIN }}',
  'WEB_ORIGIN=$RELEASE_WEB_ORIGIN',
  'restart --timeout 35 api worker mcp',
  'restart-count-zero',
  ghcrCredentialExpression,
]) requireCondition(candidate.includes(value), `release-candidate must contain ${value}`)

requireCondition(
  !candidate.includes('WEB_ORIGIN=https://workmesh.example'),
  'release-candidate must not use a placeholder Web origin for production smoke',
)

requireCondition(
  candidate.split(ghcrCredentialExpression).length - 1 === 4,
  'release-candidate must use the GHCR credential for two logins and two registry attestations',
)

const validationIndex = candidate.indexOf('validate-candidate:')
const reusableCiIndex = candidate.indexOf('required-ci:')
const releaseConfigIndex = candidate.indexOf('release-config-preflight:')
const imageIndex = candidate.indexOf('build-scan-publish-images:')
requireCondition(validationIndex >= 0 && validationIndex < reusableCiIndex, 'candidate validation must precede CI')
requireCondition(
  reusableCiIndex >= 0 && reusableCiIndex < releaseConfigIndex && releaseConfigIndex < imageIndex,
  'required CI and protected release configuration must precede image publication',
)
const runtimeSmokeIndex = candidate.indexOf('production-runtime-smoke:')
const candidateRecordIndex = candidate.indexOf('publish-candidate-record:')
requireCondition(
  imageIndex >= 0 && imageIndex < runtimeSmokeIndex && runtimeSmokeIndex < candidateRecordIndex,
  'production runtime smoke must run after image publication and before the candidate record',
)
requireCondition(
  /release-config-preflight:[\s\S]+needs:\s*\[validate-candidate, required-ci, source-security\]/m.test(candidate),
  'protected release configuration must require both CI and source security',
)
requireCondition(
  /build-scan-publish-images:[\s\S]+needs:\s*\[validate-candidate, release-config-preflight\]/m.test(candidate),
  'image publication must require protected release configuration',
)
requireCondition(
  candidate.includes("$EVENT_NAME\" == 'workflow_dispatch' && \"$FAILURE_PROBE\" == 'true'"),
  'failure probe must be explicit and dispatch-only',
)

for (const forbidden of [
  /docker\s+(?:build\b|buildx\s+build\b)/i,
  /pnpm\s+(?:install|build)/i,
  /npm\s+(?:install|ci|run\s+build)/i,
]) requireCondition(!forbidden.test(promotion), `GA promotion must not rebuild: ${forbidden}`)

for (const value of [
  'environment: stable-release',
  'candidate_tag',
  'v1.0.0',
  'release-manifest.json',
  'cosign verify',
  'cosign verify-blob',
  'docker pull',
  'docker push',
  'PROMOTION_DIGEST_MISMATCH',
  'same immutable image digests',
  ghcrCredentialExpression,
]) requireCondition(promotion.includes(value), `promote-ga must contain ${value}`)

requireCondition(
  promotion.split(ghcrCredentialExpression).length - 1 === 1,
  'promote-ga must use the GHCR credential for its registry login',
)

requireCondition(releasePolicy.includes('High finding prevents promotion'), 'release policy must block High findings')
requireCondition(releasePolicy.includes('does not rebuild'), 'release policy must forbid GA rebuilds')
requireCondition(releaseNotes.includes('Known limitations'), 'release notes must name known limitations')
requireCondition(releaseNotes.includes('Unsupported upgrade paths'), 'release notes must name unsupported upgrades')

if (failures.length > 0) {
  console.error('Release workflow validation failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Release workflow validation passed.')
