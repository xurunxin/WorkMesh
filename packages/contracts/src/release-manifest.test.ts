import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createReleaseManifest } from '../../../scripts/create-release-manifest.mjs'
import { featureDefinitions, releaseMetadata } from './index.js'

const temporaryDirectories: string[] = []
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('release artifact manifest', () => {
  it('binds all four immutable image digests to the exact candidate source', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'workmesh-release-manifest-'))
    temporaryDirectories.push(directory)
    const tag = 'v1.0.0-rc.7'
    const sourceSha = 'a'.repeat(40)
    for (const [index, service] of ['api', 'mcp', 'web', 'worker'].entries()) {
      const imageDirectory = path.join(directory, service)
      await mkdir(imageDirectory)
      await writeFile(path.join(imageDirectory, 'image.json'), JSON.stringify({
        service,
        sourceSha,
        candidateTag: tag,
        image: `ghcr.io/xurunxin/workmesh-${service}`,
        digest: `sha256:${String(index + 1).repeat(64)}`,
        webApiUrl: service === 'web' ? 'https://workmesh.example/api' : null,
        provenanceUrl: `https://github.example/attestations/${service}/provenance`,
        sbomAttestationUrl: `https://github.example/attestations/${service}/sbom`,
      }))
    }

    const manifest = await createReleaseManifest({
      root: path.resolve(import.meta.dirname, '../../..'),
      tag,
      sourceSha,
      imagesDirectory: directory,
      runUrl: 'https://github.com/xurunxin/WorkMesh/actions/runs/123',
      generatedAt: '2026-08-03T00:00:00.000Z',
    })

    expect(manifest.versions).toEqual(releaseMetadata)
    expect(manifest.featureFlags).toEqual(featureDefinitions.map(feature => ({
      key: feature.key,
      tier: feature.tier,
      defaultEnabled: false,
    })))
    expect(Object.keys(manifest.images as object)).toEqual(['api', 'mcp', 'web', 'worker'])
    expect(manifest.promotion).toEqual({
      targetTag: 'v1.0.0',
      rebuildAllowed: false,
      requiredDigestEquality: true,
    })
  })

  it('rejects drift and incomplete image sets', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'workmesh-release-manifest-invalid-'))
    temporaryDirectories.push(directory)
    await expect(createReleaseManifest({
      root: path.resolve(import.meta.dirname, '../../..'),
      tag: 'v1.0.0-rc.1',
      sourceSha: 'b'.repeat(40),
      imagesDirectory: directory,
      runUrl: 'https://github.com/xurunxin/WorkMesh/actions/runs/456',
    })).rejects.toThrow('Exactly four image records are required')
  })
})
