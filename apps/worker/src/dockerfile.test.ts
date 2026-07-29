import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type PackageManifest = {
  name?: string
  dependencies?: Record<string, string>
}

const readManifest = (url: URL): PackageManifest =>
  JSON.parse(readFileSync(url, 'utf8')) as PackageManifest

describe('worker image dependency closure', () => {
  it('copies every direct workspace dependency manifest before pnpm install', () => {
    const workerManifest = readManifest(
      new URL('../package.json', import.meta.url),
    )
    const packageRoot = new URL('../../../packages/', import.meta.url)
    const workspaceManifests = new Map(
      readdirSync(packageRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
          const relativePath = `packages/${entry.name}/package.json`
          const manifest = readManifest(
            new URL(relativePath, new URL('../../../', import.meta.url)),
          )
          return [manifest.name, relativePath] as const
        })
        .filter(
          (entry): entry is readonly [string, string] =>
            typeof entry[0] === 'string',
        ),
    )
    const dockerfile = readFileSync(
      new URL('../../../infra/docker/worker.Dockerfile', import.meta.url),
      'utf8',
    )
    const installOffset = dockerfile.indexOf('pnpm install --frozen-lockfile')
    expect(installOffset).toBeGreaterThan(0)
    const dependencyStage = dockerfile.slice(0, installOffset)

    const directWorkspaceManifests = Object.entries(
      workerManifest.dependencies ?? {},
    )
      .filter(([, specifier]) => specifier.startsWith('workspace:'))
      .map(([name]) => {
        const manifestPath = workspaceManifests.get(name)
        expect(manifestPath, `manifest path for ${name}`).toBeDefined()
        return manifestPath!
      })

    for (const manifestPath of directWorkspaceManifests)
      expect(dependencyStage, manifestPath).toContain(manifestPath)
  })
})
