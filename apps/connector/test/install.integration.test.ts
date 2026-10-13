import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir, mkdtemp, readdir, readlink, lstat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeAll, describe, expect, it } from 'vitest'

const execute = promisify(execFile)
const distribution = process.env.WORKMESH_CONNECTOR_ARTIFACTS
let root: string, prefix: string, archive: string, manifest: string
const upgradeDistribution = process.env.WORKMESH_CONNECTOR_UPGRADE_ARTIFACTS
const installer = (extra: string[] = []) => execute('sh', [join(distribution!, 'install.sh'), '--archive', archive,
  '--manifest', manifest, '--prefix', prefix, ...extra], { timeout: 120_000 })
describe('已构建 SEA 离线安装、完整性与保留边界', () => {
  beforeAll(async () => {
    if (process.platform !== 'linux' || !distribution) throw new Error('Native Linux release artifacts required; no skip')
    root = await mkdtemp(join(tmpdir(), 'workmesh-connector-install-'))
    prefix = join(root, 'prefix'); manifest = resolve(distribution, 'manifest.json')
    const m = JSON.parse(await readFile(manifest, 'utf8')) as { archive: { name: string } }
    archive = resolve(distribution, m.archive.name)
  })
  it('dry-run 不创建安装目录或锁，真实安装启动 SEA 并保持精确源码', async () => {
    expect((await installer(['--dry-run'])).stdout).toBe('INSTALL_VALIDATED\n')
    expect(await readdir(root)).toEqual([])
    expect((await installer()).stdout).toBe('INSTALL_COMPLETE\n')
    const result = await execute(join(prefix, 'bin/workmesh-connector'), ['--version'])
    const metadata = JSON.parse(result.stdout) as { sourceCommit: string; connectorVersion: string }
    const expected = JSON.parse(await readFile(manifest, 'utf8')) as typeof metadata
    expect(metadata.sourceCommit).toBe(expected.sourceCommit); expect(metadata.connectorVersion).toBe(expected.connectorVersion)
    expect((await lstat(join(prefix, 'bin/workmesh-connector'))).isSymbolicLink()).toBe(true)
    expect((await installer()).stdout).toBe('INSTALL_COMPLETE\n')
  })
  it('损坏归档拒绝，旧入口和独立配置标记保持', async () => {
    const before = await readlink(join(prefix, 'lib/workmesh-connector/current'))
    const configRoot = join(root, 'independent-config'); await mkdir(configRoot, { mode: 0o700 })
    const marker = randomUUID(); await writeFile(join(configRoot, 'marker'), marker, { mode: 0o600 })
    const corrupt = join(root, 'corrupt.tar.gz'), bytes = await readFile(archive)
    bytes[Math.floor(bytes.length / 2)]! ^= 1; await writeFile(corrupt, bytes, { mode: 0o600 })
    await expect(execute('sh', [join(distribution!, 'install.sh'), '--archive', corrupt, '--manifest', manifest, '--prefix', prefix]))
      .rejects.toMatchObject({ stderr: 'INSTALL_ARCHIVE_HASH\n' })
    expect(await readlink(join(prefix, 'lib/workmesh-connector/current'))).toBe(before)
    expect(await readFile(join(configRoot, 'marker'), 'utf8')).toBe(marker)
  })
  it('真实第二版本原子升级，再回退原版本', async () => {
    if (!upgradeDistribution) throw new Error('Second version artifacts required; no skip')
    const original = await readlink(join(prefix, 'lib/workmesh-connector/current'))
    const upgradeManifest = resolve(upgradeDistribution, 'manifest.json')
    const m = JSON.parse(await readFile(upgradeManifest, 'utf8')) as { archive: { name: string }; connectorVersion: string }
    await execute('sh', [join(upgradeDistribution, 'install.sh'), '--archive', resolve(upgradeDistribution, m.archive.name),
      '--manifest', upgradeManifest, '--prefix', prefix], { timeout: 120_000 })
    const metadata = JSON.parse((await execute(join(prefix, 'bin/workmesh-connector'), ['--version'])).stdout) as { connectorVersion: string }
    expect(metadata.connectorVersion).toBe(m.connectorVersion)
    expect(await readlink(join(prefix, 'lib/workmesh-connector/current'))).not.toBe(original)
    await execute('sh', [join(upgradeDistribution, 'install.sh'), '--rollback', '--prefix', prefix], { timeout: 120_000 })
    expect(await readlink(join(prefix, 'lib/workmesh-connector/current'))).toBe(original)
  })
  it('卸载只移除程序，独立配置保持', async () => {
    expect((await execute('sh', [join(prefix, 'lib/workmesh-connector/current/uninstall.sh'), '--prefix', prefix])).stdout)
      .toBe('INSTALL_REMOVED_CONFIG_AND_SECRETS_RETAINED\n')
    await expect(lstat(join(prefix, 'bin/workmesh-connector'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readFile(join(root, 'independent-config/marker'), 'utf8')).length).toBe(36)
  })
})
