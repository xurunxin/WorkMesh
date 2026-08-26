import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

type SupportManifest = {
  integrations: Array<{
    issueState: string
    availability: string
    authoritativeSchema: boolean
    apiRoutes: boolean
    persistence: boolean
  }>
  browserPolicy: Record<string, boolean>
}

const manifest = JSON.parse(readFileSync(
  resolve(process.cwd(), '../../docs/acceptance/human-control-plane-optional-integrations.json'),
  'utf8',
)) as SupportManifest

describe('optional Human Control Plane integration boundary', () => {
  it('records every unshipped owning domain without claiming enabled behavior', () => {
    expect(manifest.integrations).toHaveLength(4)
    expect(manifest.integrations.every(integration =>
      integration.issueState === 'open'
      && integration.availability === 'unavailable'
      && !integration.authoritativeSchema
      && !integration.apiRoutes
      && !integration.persistence,
    )).toBe(true)
  })

  it('forbids browser-manufactured Graph and autonomy authority', () => {
    expect(manifest.browserPolicy).toMatchObject({
      manufactureRoutes: false,
      manufactureCounts: false,
      manufactureRecommendations: false,
      manufactureAutonomyMode: false,
      explicitAuthorizedInternalLinksOnly: true,
    })
  })
})
