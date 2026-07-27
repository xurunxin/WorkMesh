import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isMap, parseDocument } from 'yaml'
import { routePolicyManifest } from '../packages/contracts/src/index.ts'

const root = resolve(import.meta.dirname, '..')
const openapiPath = resolve(root, 'OPENAPI.yaml')
const matrixPath = resolve(root, 'docs/route-policy-matrix.md')
const check = process.argv.includes('--check')

const original = await readFile(openapiPath, 'utf8')
// Strip previously generated fields before parsing so the generator can repair
// legacy output whose flow/block indentation was invalid.
const sourceWithoutGeneratedExtensions = original
  .replace(/\{[ \t]+(?=x-workmesh-policy-id:)/g, '{')
  .replace(/^[ \t]*x-workmesh-policy-id:.*\r?\n/gm, '')
  .replace(/^[ \t]*x-workmesh-actor-kinds:.*\r?\n/gm, '')
  .replace(/^[ \t]*x-workmesh-feature-key:.*\r?\n/gm, '')
  .replace(/^[ \t]*x-workmesh-feature-tier:.*\r?\n/gm, '')
  .replace(/^[ \t]*x-workmesh-auth-rate-limit:.*\r?\n/gm, '')
  .replace(/x-workmesh-policy-id: [^,}]+,[ \t]*/g, '')
  .replace(/x-workmesh-actor-kinds: \[[^\]]*],[ \t]*/g, '')
  .replace(/x-workmesh-feature-key: [^,}]+,[ \t]*/g, '')
  .replace(/x-workmesh-feature-tier: [^,}]+,[ \t]*/g, '')
  .replace(/x-workmesh-auth-rate-limit: [^,}]+,[ \t]*/g, '')
  .replace(/^[ \t]{6,}security: \[(?:[ \t]*\{[ \t]*[A-Za-z][A-Za-z0-9]*:[ \t]*\[\][ \t]*\}[ \t]*,?)*[ \t]*\],?[ \t]*\r?\n/gm, '')
  .replace(/security: \[(?:[ \t]*\{[ \t]*[A-Za-z][A-Za-z0-9]*:[ \t]*\[\][ \t]*\}[ \t]*,?)*[ \t]*\],[ \t]*/g, '')
const openapiDocument = parseDocument(sourceWithoutGeneratedExtensions, {
  keepSourceTokens: true,
  prettyErrors: true,
})
if (openapiDocument.errors.length > 0) {
  throw new Error(`OPENAPI.yaml is invalid:\n${openapiDocument.errors.join('\n')}`)
}
let openapi = sourceWithoutGeneratedExtensions

const securityFor = (
  authentication: (typeof routePolicyManifest)[number]['authentication'],
): string => {
  switch (authentication) {
    case 'public':
      return '[]'
    case 'bootstrap':
      return '[{ BootstrapToken: [] }]'
    case 'human_session':
      return '[{ SessionCookie: [] }]'
    case 'agent_session':
      return '[{ AgentSessionToken: [] }]'
    case 'human_or_agent_session':
      return '[{ SessionCookie: [] }, { AgentSessionToken: [] }]'
    case 'installation_target':
      return '[{ AgentInstallationToken: [] }]'
    case 'provider_signature':
      return '[{ GitHubWebhookSignature: [] }]'
  }
}

for (const policy of routePolicyManifest) {
  const operation = openapiDocument.getIn(
    ['paths', policy.path, policy.method.toLowerCase()],
    true,
  )
  if (!isMap(operation)) {
    throw new Error(`OpenAPI operation not found: ${policy.method} ${policy.path}`)
  }
  if (operation.get('operationId') !== policy.operationId) {
    throw new Error(
      `OpenAPI operationId mismatch for ${policy.method} ${policy.path}: `
      + `${String(operation.get('operationId'))} !== ${policy.operationId}`,
    )
  }

  const escapedPath = policy.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pathMatch = new RegExp(`^  ${escapedPath}:$`, 'm').exec(openapi)
  if (pathMatch?.index === undefined) {
    throw new Error(`OpenAPI path not found: ${policy.path}`)
  }
  const nextPathOffset = openapi.slice(pathMatch.index + 1).search(/^  \/[^\n]+:$/m)
  const end = nextPathOffset === -1
    ? openapi.length
    : pathMatch.index + 1 + nextPathOffset
  const block = openapi.slice(pathMatch.index, end)
  const methodPattern = new RegExp(`^    ${policy.method.toLowerCase()}:`, 'm')
  const methodMatch = methodPattern.exec(block)
  if (!methodMatch) {
    throw new Error(`OpenAPI method not found: ${policy.method} ${policy.path}`)
  }
  const methodStart = pathMatch.index + methodMatch.index
  const operationOffset = openapi.slice(methodStart, end)
    .search(new RegExp(`operationId:\\s*${policy.operationId}(?:[, }\\r\\n]|$)`))
  if (operationOffset === -1) {
    throw new Error(`OpenAPI operationId not found: ${policy.operationId}`)
  }
  const operationStart = methodStart + operationOffset
  const opening = openapi.indexOf('{', methodStart)
  const flow = opening !== -1 && opening < operationStart
  const featureKey = policy.feature.key ?? 'none'
  const security = securityFor(policy.authentication)
  const credentialRateLimit = policy.credentialRateLimit === 'shared_redis'
    ? 'x-workmesh-auth-rate-limit: shared_redis, '
    : ''
  if (flow) {
    const operationLineStart = openapi.lastIndexOf('\n', operationStart) + 1
    const sameLine = openapi.lastIndexOf('\n', opening) === operationLineStart - 1
    if (sameLine) {
      const extension =
        `{ x-workmesh-policy-id: ${policy.policyId}, `
        + `x-workmesh-actor-kinds: [${policy.actorKinds.join(', ')}], `
        + `x-workmesh-feature-key: ${featureKey}, `
        + `x-workmesh-feature-tier: ${policy.feature.tier}, `
        + credentialRateLimit
        + `security: ${security}, `
      openapi = openapi.slice(0, opening) + extension + openapi.slice(opening + 1)
    } else {
      const indentation = openapi.slice(operationLineStart, operationStart)
      const extension =
        `\n${indentation}x-workmesh-policy-id: ${policy.policyId},`
        + `\n${indentation}x-workmesh-actor-kinds: [${policy.actorKinds.join(', ')}],`
        + `\n${indentation}x-workmesh-feature-key: ${featureKey},`
        + `\n${indentation}x-workmesh-feature-tier: ${policy.feature.tier},`
        + (credentialRateLimit ? `\n${indentation}${credentialRateLimit.trimEnd()}` : '')
        + `\n${indentation}security: ${security},`
      openapi = openapi.slice(0, opening + 1)
        + extension
        + openapi.slice(opening + 1)
    }
  } else {
    const operationLineStart = openapi.lastIndexOf('\n', operationStart) + 1
    const operationLine = openapi.slice(
      operationLineStart,
      openapi.indexOf('\n', operationLineStart),
    )
    const indentation = operationLine.match(/^\s*/)?.[0] ?? ''
    const extension =
      `${indentation}x-workmesh-policy-id: ${policy.policyId}\n`
      + `${indentation}x-workmesh-actor-kinds: [${policy.actorKinds.join(', ')}]\n`
      + `${indentation}x-workmesh-feature-key: ${featureKey}\n`
      + `${indentation}x-workmesh-feature-tier: ${policy.feature.tier}\n`
      + (credentialRateLimit ? `${indentation}${credentialRateLimit.slice(0, -2)}\n` : '')
      + `${indentation}security: ${security}\n`
    openapi = openapi.slice(0, operationLineStart)
      + extension
      + openapi.slice(operationLineStart)
  }
}

const rows = routePolicyManifest.map(policy => {
  const actors = policy.actorKinds.length
    ? policy.actorKinds.join(', ')
    : policy.authentication === 'bootstrap'
      ? 'bootstrap'
      : 'public'
  const capabilities = policy.agent.capabilities.length
    ? policy.agent.capabilities.join(', ')
    : '-'
  return `| \`${policy.method}\` | \`${policy.path}\` | \`${policy.operationId}\` | \`${policy.policyId}\` | ${actors} | \`${policy.authentication}\` | \`${policy.resourceResolverId}\` | ${capabilities} | ${policy.feature.tier}${policy.feature.key ? ` (\`${policy.feature.key}\`)` : ''} |`
})
const matrix = `# Route policy matrix

Generated by \`scripts/generate-route-policy-artifacts.mts\`. Do not edit by hand.

| Method | Route | Operation | Policy | Actors | Authentication | Resource resolver | Agent capabilities | Feature |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}
`

if (check) {
  const existingMatrix = await readFile(matrixPath, 'utf8')
  if (openapi !== original) throw new Error('OPENAPI.yaml route policy extensions are stale')
  if (existingMatrix !== matrix) throw new Error('docs/route-policy-matrix.md is stale')
} else {
  await writeFile(openapiPath, openapi, 'utf8')
  await writeFile(matrixPath, matrix, 'utf8')
}
