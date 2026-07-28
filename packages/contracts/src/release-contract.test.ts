import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { featureDefinitions, releaseMetadata } from './index.js'

const readRoot = (path: string): string =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')

describe('1.0 release contract documentation', () => {
  it('keeps OpenAPI, protocol, README, and environment flags aligned', () => {
    const openapi = readRoot('OPENAPI.yaml')
    const protocol = readRoot('AGENT_PROTOCOL.md')
    const readme = readRoot('README.md')
    const environment = readRoot('.env.example')
    const versionPolicy = readRoot('docs/VERSION_POLICY.md')
    const releasePolicy = readRoot('docs/V1_RELEASE_POLICY.md')

    expect(openapi).toContain(`version: "${releaseMetadata.restApiVersion}"`)
    expect(openapi).toContain(`serverVersion: { const: "${releaseMetadata.serverVersion}" }`)
    expect(protocol).toContain(`Agent Protocol ${releaseMetadata.agentProtocolVersion}`)
    expect(readme).toMatch(
      new RegExp(`MCP server\\s+\`${releaseMetadata.mcpVersion.replaceAll('.', '\\.')}\``),
    )
    for (const feature of featureDefinitions) {
      expect(openapi).toContain(feature.key)
      expect(environment).toContain(`${feature.key}=false`)
      expect(feature.defaultEnabled).toBe(false)
      expect(feature.runtimeDependencies.length).toBeGreaterThan(0)
      expect(versionPolicy).toContain(feature.key)
    }
    for (const path of [
      '/api/v1/provider-connections',
      '/api/v1/repositories',
      '/api/v1/repositories/{id}/context',
      '/api/v1/provider-actions',
      '/api/v1/pull-requests/{id}/reviews',
      '/api/v1/pull-requests/{id}/merge',
      '/api/v1/pull-requests/{id}/checks/{checkId}/retry',
      '/api/v1/projects/{id}/delivery',
    ]) {
      const section = openapi.split(`  ${path}:`)[1]?.split(/\n  \/api\/v1\//)[0] ?? ''
      expect(section, `${path} must declare authorization and dynamic feature denial`).toContain(
        '#/components/responses/ForbiddenOrFeatureDisabled',
      )
    }
    const githubWebhook = openapi
      .split('  /api/v1/provider-webhooks/{connectionId}/github:')[1]
      ?.split(/\n  \/api\/v1\//)[0] ?? ''
    expect(githubWebhook).toContain('#/components/responses/ProviderSignatureInvalid')
    expect(githubWebhook).not.toContain('#/components/responses/FeatureDisabled')
    expect(githubWebhook).not.toContain('#/components/responses/ForbiddenOrFeatureDisabled')
    const combinedForbidden = openapi
      .split('    ForbiddenOrFeatureDisabled:')[1]
      ?.split(/\n    [A-Za-z]/)[0] ?? ''
    expect(combinedForbidden).toContain('authorization')
    expect(combinedForbidden).toContain('FEATURE_DISABLED')
    const providerSignatureInvalid = openapi
      .split('    ProviderSignatureInvalid:')[1]
      ?.split(/\n    [A-Za-z]/)[0] ?? ''
    expect(providerSignatureInvalid).toContain('PROVIDER_SIGNATURE_INVALID')
    expect(versionPolicy).toContain('Stable boundary (Issue #1)')
    expect(versionPolicy).toContain('Beta boundary (Issue #2)')
    expect(versionPolicy).toContain('Experimental boundary (Issue #3)')
    expect(versionPolicy).toContain('existing REST 1.0 paths and fields')
    expect(versionPolicy).toContain('requires a new API version or path')
    expect(versionPolicy).toContain('parallel-compatibility window')
    expect(releasePolicy).toContain('v1.0.0-rc.N')
    expect(releasePolicy).toContain('same Git commit')
    expect(releasePolicy).toContain('same immutable')
  })
})
